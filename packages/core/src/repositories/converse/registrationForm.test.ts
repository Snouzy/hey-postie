// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildRemoveIq, buildSubmitIq, errorOf, parseRegistrationQuery } from './registrationForm';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').documentElement;
const query = (inner: string) => parse(`<query xmlns="jabber:iq:register">${inner}</query>`);

describe('parseRegistrationQuery', () => {
  it('reads legacy fields, instructions and types', () => {
    const { form, xdata, defaults } = parseRegistrationQuery(
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

  it('prefers an x:data form, mapping types, labels, required and hidden defaults', () => {
    const { form, xdata, defaults } = parseRegistrationQuery(
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

  it('extracts a XEP-0158 CAPTCHA image from the bob data', () => {
    const { form } = parseRegistrationQuery(
      query(`<x xmlns="jabber:x:data" type="form">
          <field var="FORM_TYPE" type="hidden"><value>urn:xmpp:captcha</value></field>
          <field var="challenge" type="hidden"><value>F3A6292C</value></field>
          <field var="ocr" label="Enter the text you see">
            <media xmlns="urn:xmpp:media-element"><uri type="image/png">cid:sha1+abc@bob.xmpp.org</uri></media>
          </field>
        </x>
        <data xmlns="urn:xmpp:bob" cid="sha1+abc@bob.xmpp.org" type="image/png" max-age="0">iVBORw0K
        Ggo=</data>`),
      'example.org',
    );
    expect(form.captchaField).toBe('ocr');
    expect(form.captchaImageDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(form.fields.map((f) => f.name)).toEqual(['FORM_TYPE', 'challenge', 'ocr']);
  });
});

describe('buildSubmitIq', () => {
  it('answers a legacy form with one child per value, escaped', () => {
    const iq = buildSubmitIq(
      'id1',
      { form: { domain: 'd', fields: [] }, xdata: false, defaults: {} },
      { username: 'bob', password: 'p<&"\'>w', 'bad name': 'x' },
    );
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
