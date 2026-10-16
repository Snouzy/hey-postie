// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Text from a peer is untrusted: control characters go, tabs and newlines stay. */
export function stripControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARACTERS, '');
}
