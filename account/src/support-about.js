export function parseAbout(value) {
  if (value === undefined) return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false, message: 'your versions must be text. paste the block from about.' };
  const text = value.replace(/\r\n/g, '\n');
  return new TextEncoder().encode(text).byteLength <= 8192
    ? { ok: true, value: text }
    : { ok: false, value: text, message: 'your versions are too long. keep them under 8192 bytes.' };
}
