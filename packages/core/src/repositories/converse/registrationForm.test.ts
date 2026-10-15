// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../contracts/errors';
import { buildRemoveIq, buildSubmitIq, errorOf, parseRegistrationReply } from './registrationForm';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').documentElement;
/** A result IQ whose query holds `inner`; `siblings` go next to the query, as XEP-0231 data does. */
const query = (inner: string, siblings = '') =>
  parse(
    `<iq xmlns="jabber:client" type="result" id="r1"><query xmlns="jabber:iq:register">${inner}</query>${siblings}</iq>`,
  );
const failure = (run: () => unknown) => {
  try {
    run();
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : String(error);
  }
};
const CAPTCHA_FORM = `<x xmlns="jabber:x:data" type="form">
  <field var="FORM_TYPE" type="hidden"><value>urn:xmpp:captcha</value></field>
  <field var="challenge" type="hidden"><value>F3A6292C</value></field>
  <field var="ocr" label="Enter the text you see">
    <media xmlns="urn:xmpp:media-element"><uri type="image/png">cid:sha1+abc@bob.xmpp.org</uri></media>
  </field>
</x>`;
const bob = (base64: string, type = 'image/png') =>
  `<data xmlns="urn:xmpp:bob" cid="sha1+abc@bob.xmpp.org" type="${type}" max-age="0">${base64}</data>`;
const LEGACY = { form: { domain: 'd', fields: [] }, xdata: false, defaults: {} };

describe('parseRegistrationReply', () => {
  it('reads legacy fields, instructions and types', () => {
    const { form, xdata, defaults } = parseRegistrationReply(
      query(
        '<instructions> Choose a username. </instructions><username/><password/><email/><registered/><x xmlns="jabber:x:oob"><url>https://x</url></x><name/>',
      ),
      'example.org',
    );
    expect(xdata).toBe(false);
    expect(defaults).toEqual({});
    expect(form.domain).toBe('example.org');
    expect(form.instructions).toBe('Choose a username.');
    expect(form.fields).toEqual([
      { name: 'username', label: 'username', type: 'text', required: true },
      { name: 'password', label: 'password', type: 'password', required: true },
      { name: 'email', label: 'email', type: 'email', required: true },
      { name: 'name', label: 'name', type: 'text', required: true },
    ]);
    expect(form.captchaImageDataUrl).toBeUndefined();
  });

  it('rejects a reply without a registration query', () => {
    expect(failure(() => parseRegistrationReply(parse('<iq type="result"/>'), 'd'))).toBe(
      'RegistrationUnsupported',
    );
  });

  it('prefers an x:data form, mapping types, labels, required and hidden defaults', () => {
    const { form, xdata, defaults } = parseRegistrationReply(
      query(`<instructions>legacy</instructions><username/><password/>
        <x xmlns="jabber:x:data" type="form">
          <instructions>Pick a name</instructions>
          <field var="FORM_TYPE" type="hidden"><value>jabber:iq:register</value></field>
          <field var="username" type="text-single" label="Username"><required/></field>
          <field var="password" type="text-private" label="Password"><required/></field>
          <field var="email" label="E-mail"/>
          <field var="tos" type="boolean" label="Agree"/>
          <field type="fixed"><value>Welcome</value></field>
        </x>`),
      'example.org',
    );
    expect(xdata).toBe(true);
    expect(defaults).toEqual({ FORM_TYPE: 'jabber:iq:register' });
    expect(form.instructions).toBe('Pick a name');
    expect(form.fields).toEqual([
      { name: 'FORM_TYPE', label: 'FORM_TYPE', type: 'hidden', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'email', label: 'E-mail', type: 'email', required: false },
    ]);
  });

  it('refuses a required field of a type it cannot render, drops an optional one', () => {
    const form = (required: string) =>
      query(`<x xmlns="jabber:x:data" type="form">
        <field var="username" type="text-single"><required/></field>
        <field var="tos" type="boolean" label="Agree">${required}</field>
        <field var="lang" type="list-single"><option><value>en</value></option></field>
      </x>`);
    expect(failure(() => parseRegistrationReply(form('<required/>'), 'd'))).toBe(
      'RegistrationUnsupported',
    );
    expect(parseRegistrationReply(form(''), 'd').form.fields.map((f) => f.name)).toEqual([
      'username',
    ]);
  });

  it('extracts a XEP-0158 CAPTCHA image from bob data next to the query (XEP-0231 placement)', () => {
    const { form } = parseRegistrationReply(
      query(CAPTCHA_FORM, bob('iVBORw0K\n        Ggo=')),
      'example.org',
    );
    expect(form.captchaField).toBe('ocr');
    expect(form.captchaImageDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(form.fields.map((f) => f.name)).toEqual(['FORM_TYPE', 'challenge', 'ocr']);
  });

  it('also finds bob data inside the query', () => {
    const { form } = parseRegistrationReply(query(CAPTCHA_FORM + bob('iVBORw0KGgo=')), 'd');
    expect(form.captchaImageDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('leaves the CAPTCHA image out when the bob data is not a plausible image', () => {
    const without = (siblings: string) =>
      parseRegistrationReply(query(CAPTCHA_FORM, siblings), 'd').form;
    expect(without('')).not.toHaveProperty('captchaImageDataUrl');
    expect(without(bob('iVBORw0KGgo=', 'text/html'))).not.toHaveProperty('captchaImageDataUrl');
    expect(without(bob('not base64 &lt;script&gt;'))).not.toHaveProperty('captchaImageDataUrl');
    expect(without(bob('A'.repeat(400 * 1024)))).not.toHaveProperty('captchaImageDataUrl');
    expect(without(bob('iVBORw0KGgo=', 'image/jpeg')).captchaImageDataUrl).toBe(
      'data:image/jpeg;base64,iVBORw0KGgo=',
    );
  });
});

describe('buildSubmitIq', () => {
  it('answers a legacy form with one child per value, escaped', () => {
    const iq = buildSubmitIq('id1', LEGACY, {
      username: 'bob',
      password: 'p<&"\'>w',
      'bad name': 'x',
    });
    expect(iq.getAttribute('type')).toBe('set');
    expect(iq.getAttribute('id')).toBe('id1');
    expect(iq.getAttribute('xmlns')).toBe('jabber:client');
    const q = iq.firstElementChild;
    expect(q?.namespaceURI).toBe('jabber:iq:register');
    expect(Array.from(q?.children ?? []).map((c) => [c.localName, c.textContent])).toEqual([
      ['username', 'bob'],
      ['password', 'p<&"\'>w'],
    ]);
  });

  it('refuses values with characters XML cannot carry', () => {
    expect(failure(() => buildSubmitIq('id', LEGACY, { password: 'a\u0000b' }))).toBe(
      'RegistrationRejected',
    );
    expect(failure(() => buildSubmitIq('id', LEGACY, { password: 'a\u001fb' }))).toBe(
      'RegistrationRejected',
    );
    expect(failure(() => buildSubmitIq('id', LEGACY, { password: 'tab\tok é' }))).toBe('no error');
  });

  it('answers an x:data form with a submit echoing hidden fields and skipping empty optional ones', () => {
    const iq = buildSubmitIq(
      'id2',
      {
        form: {
          domain: 'd',
          fields: [
            { name: 'FORM_TYPE', label: '', type: 'hidden', required: true },
            { name: 'username', label: '', type: 'text', required: true },
            { name: 'email', label: '', type: 'email', required: false },
            { name: 'nick', label: '', type: 'text', required: false },
          ],
        },
        xdata: true,
        defaults: { FORM_TYPE: 'jabber:iq:register' },
      },
      { username: 'bob', nick: 'B' },
    );
    const x = iq.getElementsByTagNameNS('jabber:x:data', 'x')[0];
    expect(x?.getAttribute('type')).toBe('submit');
    const fields = Array.from(x?.children ?? []).map((f) => [f.getAttribute('var'), f.textContent]);
    expect(fields).toEqual([
      ['FORM_TYPE', 'jabber:iq:register'],
      ['username', 'bob'],
      ['nick', 'B'],
    ]);
  });
});

describe('buildRemoveIq and errorOf', () => {
  it('builds the removal and reads error conditions with their text', () => {
    const remove = buildRemoveIq('r1');
    expect(
      remove.getElementsByTagNameNS('jabber:iq:register', 'query')[0]?.firstElementChild?.localName,
    ).toBe('remove');
    const error = parse(
      `<iq type="error"><error type="cancel"><conflict xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/><text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">taken</text></error></iq>`,
    );
    expect(errorOf(error)).toEqual({ condition: 'conflict', text: 'taken' });
    expect(errorOf(parse('<iq type="error"/>'))).toEqual({ condition: 'unknown', text: '' });
  });
});
