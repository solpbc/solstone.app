import { cardinal, render } from './generated/esm/account/api.mjs';

const LOCALE = 'en-US';
const OPTIONS = { useIsolating: LOCALE !== 'en-US' };

export function t(id, values = {}) {
  return render(LOCALE, id, Object.entries(values).map(([name, value]) => [name, String(value)]), OPTIONS);
}

export function countText(id, { count }) {
  return render(LOCALE, id, [['count', cardinal(count)]], OPTIONS);
}

// These call sites replaced literal HTML text. Preserve its existing entity
// spellings and keep catalog text from forming tags or ending an attribute.
export function htmlText(id) {
  return t(id).replaceAll('<', '&lt;');
}

export function attrText(id) {
  return htmlText(id).replaceAll('"', '&quot;');
}

// Preserve the inline script's quote style and prevent a closing script tag.
export function scriptText(id, quote) {
  const encoded = JSON.stringify(t(id)).slice(1, -1).replaceAll('<', '\\u003c');
  return quote === '"'
    ? `"${encoded}"`
    : `'${encoded.replaceAll(/\\(.)|'/g, (part, escaped) => escaped === '"' ? '"' : part === "'" ? "\\'" : part)}'`;
}

// Terms paragraphs own their complete sentences. Only the tags supplied
// by the template can replace the numbered markers in the escaped text.
export function termsText(id, tags) {
  return t(id)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/\[(\d+)\]/g, (marker, index) => tags[Number(index) - 1] ?? marker);
}
