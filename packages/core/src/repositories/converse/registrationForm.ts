import { DomainError } from '../../contracts/errors';
import type { RegistrationField, RegistrationForm } from '../../contracts/types';

/**
 * The XML side of XEP-0077 (with XEP-0004 forms and XEP-0158 CAPTCHAs), as pure functions over
 * DOM elements so that they are unit-tested from XML strings. The connection flow is in
 * registration.ts.
 */

export const NS = {
  client: 'jabber:client',
  register: 'jabber:iq:register',
  registerFeature: 'http://jabber.org/features/iq-register',
  xdata: 'jabber:x:data',
  bob: 'urn:xmpp:bob',
  oob: 'jabber:x:oob',
};

const CAPTCHA_FIELD = 'ocr';
const CAPTCHA_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
/** Decoded size; a registration CAPTCHA is a few kB. */
const CAPTCHA_MAX_BYTES = 256 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Legacy children of `<query/>` that are not fields (XEP-0077 §3.1). */
const LEGACY_NON_FIELDS = new Set(['instructions', 'registered', 'x', 'key']);

export interface ParsedRegistration {
  form: RegistrationForm;
  /** The server sent an x:data form: `submit` answers with one (hidden fields included). */
  xdata: boolean;
  /** Values the server pre-filled (hidden fields such as `FORM_TYPE`, CAPTCHA challenge ids). */
  defaults: Record<string, string>;
}

/** Reads the result IQ: its `<query xmlns="jabber:iq:register"/>`, and bob data anywhere in it. */
export function parseRegistrationReply(reply: Element, domain: string): ParsedRegistration {
  const query = reply.getElementsByTagNameNS(NS.register, 'query')[0];
  if (!query) throw new DomainError('RegistrationUnsupported', 'RegistrationUnsupported: no form');
  const x = childrenNS(query, NS.xdata, 'x')[0];
  return x ? parseXData(reply, x, domain) : parseLegacy(query, domain);
}

function parseLegacy(query: Element, domain: string): ParsedRegistration {
  const fields: RegistrationField[] = [];
  let instructions: string | undefined;
  for (const child of Array.from(query.children)) {
    const name = child.localName.toLowerCase();
    if (name === 'instructions') instructions = child.textContent?.trim() || undefined;
    if (LEGACY_NON_FIELDS.has(name)) continue;
    fields.push({ name, label: name, type: legacyType(name), required: true });
  }
  return {
    form: { domain, ...(instructions ? { instructions } : {}), fields },
    xdata: false,
    defaults: {},
  };
}

function legacyType(name: string): RegistrationField['type'] {
  if (name === 'password') return 'password';
  if (name === 'email') return 'email';
  return 'text';
}

function parseXData(reply: Element, x: Element, domain: string): ParsedRegistration {
  const fields: RegistrationField[] = [];
  const defaults: Record<string, string> = {};
  let captcha: Pick<RegistrationForm, 'captchaImageDataUrl' | 'captchaField'> = {};
  for (const field of childrenNS(x, NS.xdata, 'field')) {
    const name = field.getAttribute('var');
    if (!name) continue;
    const required = childrenNS(field, NS.xdata, 'required').length > 0;
    const type = xdataType(field.getAttribute('type'), name);
    if (!type) {
      // A `boolean`, `list-*` or `jid-single` we cannot render: fine when optional, fatal otherwise.
      if (required) {
        throw new DomainError(
          'RegistrationUnsupported',
          `RegistrationUnsupported: required field of type ${field.getAttribute('type')}`,
        );
      }
      continue;
    }
    const value = childrenNS(field, NS.xdata, 'value')[0]?.textContent ?? '';
    if (value) defaults[name] = value;
    fields.push({
      name,
      label: field.getAttribute('label') || name,
      type,
      required: type === 'hidden' || required,
    });
    if (name === CAPTCHA_FIELD) captcha = captchaOf(reply, field);
  }
  const instructions = childrenNS(x, NS.xdata, 'instructions')[0]?.textContent?.trim();
  return {
    form: { domain, ...(instructions ? { instructions } : {}), fields, ...captcha },
    xdata: true,
    defaults,
  };
}

/** `fixed` is text to display, `boolean`/`list-*` are not registration inputs we render. */
function xdataType(type: string | null, name: string): RegistrationField['type'] | null {
  switch (type) {
    case 'hidden':
      return 'hidden';
    case 'text-private':
      return 'password';
    case 'text-single':
    case null:
    case '':
      return name === 'password' ? 'password' : name === 'email' ? 'email' : 'text';
    default:
      return null;
  }
}

/**
 * XEP-0158: the `ocr` field carries a `<media><uri>cid:...</uri></media>`; XEP-0231 lets the image
 * travel in the same stanza as a `<data xmlns="urn:xmpp:bob" cid="..." type="image/png">` child of
 * the IQ (or, as some servers do, of the query), so the whole reply is searched. Only a plausible
 * image becomes a data URL; an `http:` URI or anything else leaves the form without a CAPTCHA image.
 */
function captchaOf(
  reply: Element,
  field: Element,
): Pick<RegistrationForm, 'captchaImageDataUrl' | 'captchaField'> {
  const uri = field.getElementsByTagName('uri')[0]?.textContent?.trim() ?? '';
  const cid = uri.replace(/^cid:/, '');
  const all = Array.from(reply.getElementsByTagNameNS(NS.bob, 'data'));
  const data = all.find((d) => d.getAttribute('cid') === cid) ?? all[0];
  const type = data?.getAttribute('type') ?? '';
  const base64 = data?.textContent?.replace(/\s+/g, '') ?? '';
  const valid =
    CAPTCHA_TYPES.has(type) && BASE64.test(base64) && (base64.length * 3) / 4 <= CAPTCHA_MAX_BYTES;
  if (!valid) return {};
  return { captchaImageDataUrl: `data:${type};base64,${base64}`, captchaField: CAPTCHA_FIELD };
}

/**
 * The `<iq type="set"/>` that answers the form: an x:data `submit` echoing every field (the hidden
 * ones with their server value) when the server sent a form, legacy children otherwise.
 */
export function buildSubmitIq(
  id: string,
  parsed: ParsedRegistration,
  values: Record<string, string>,
): Element {
  if (Object.values(values).some(hasXmlIllegalChar)) {
    throw new DomainError('RegistrationRejected', 'RegistrationRejected: control character');
  }
  const body = parsed.xdata
    ? `<x xmlns="${NS.xdata}" type="submit">${xdataFields(parsed, values)}</x>`
    : legacyFields(values);
  return parseXml(
    `<iq xmlns="${NS.client}" type="set" id="${escapeXml(id)}"><query xmlns="${NS.register}">${body}</query></iq>`,
  );
}

function xdataFields(parsed: ParsedRegistration, values: Record<string, string>): string {
  return parsed.form.fields
    .map((field) => ({ field, value: values[field.name] ?? parsed.defaults[field.name] ?? '' }))
    .filter(({ field, value }) => value !== '' || field.required)
    .map(
      ({ field, value }) =>
        `<field var="${escapeXml(field.name)}"><value>${escapeXml(value)}</value></field>`,
    )
    .join('');
}

function legacyFields(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([name]) => /^[a-z][\w-]*$/i.test(name))
    .map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`)
    .join('');
}

/** The `<iq type="get"/>` asking for the form. */
export function buildFormRequestIq(id: string): Element {
  return parseXml(
    `<iq xmlns="${NS.client}" type="get" id="${escapeXml(id)}"><query xmlns="${NS.register}"/></iq>`,
  );
}

/** The `<iq type="set"/>` removing the signed-in account (XEP-0077 §3.2). */
export function buildRemoveIq(id: string): Element {
  return parseXml(
    `<iq xmlns="${NS.client}" type="set" id="${escapeXml(id)}"><query xmlns="${NS.register}"><remove/></query></iq>`,
  );
}

/** The error condition of an `<iq type="error"/>`, e.g. `conflict`, and the server's text. */
export function errorOf(stanza: Element): { condition: string; text: string } {
  const error = stanza.getElementsByTagName('error')[0];
  const children = error ? Array.from(error.children) : [];
  const condition = children.find((c) => c.localName !== 'text')?.localName ?? 'unknown';
  const text = children.find((c) => c.localName === 'text')?.textContent?.trim() ?? '';
  return { condition, text };
}

export function childrenNS(parent: Element, ns: string, localName: string): Element[] {
  return Array.from(parent.children).filter(
    (c) => c.localName === localName && c.namespaceURI === ns,
  );
}

function parseXml(xml: string): Element {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('registration: malformed stanza');
  }
  return document.documentElement;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Characters XML 1.0 cannot carry (RFC 6120 §11.1): they would corrupt or truncate the stanza. */
function hasXmlIllegalChar(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const control = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (control || code === 0xfffe || code === 0xffff) return true;
  }
  return false;
}
