import { render } from './generated/esm/website/api.mjs';
import { CATALOGS } from './generated/esm/website/catalogs.mjs';

const SOURCE_LOCALE = 'en-US';
const PACKAGED = Object.keys(CATALOGS);

function resolveActiveLocale() {
  const requested = typeof process !== 'undefined' ? process.env?.SOLSTONE_LOCALE : undefined;
  if (requested) {
    const lower = requested.trim().toLowerCase();
    const exact = PACKAGED.find((loc) => loc.toLowerCase() === lower);
    if (exact) return exact;
    const primary = lower.split('-')[0];
    const byPrimary = PACKAGED.find((loc) => loc.toLowerCase().split('-')[0] === primary);
    if (byPrimary) return byPrimary;
  }
  const nonSource = PACKAGED.filter((loc) => loc !== SOURCE_LOCALE);
  if (nonSource.length === 1) return nonSource[0];
  return SOURCE_LOCALE;
}

const locale = resolveActiveLocale();

export function websiteLocale() {
  return locale;
}

export function websiteHtmlLang() {
  return locale === SOURCE_LOCALE ? 'en' : locale;
}

export function websiteText(id, values = {}) {
  return render(locale, id, Object.entries(values).map(([name, value]) => [name, String(value)]), {
    useIsolating: false,
  });
}

export function websiteTemplate(source, message = websiteText) {
  let rendered = source.replace(/\[\[i18n:([a-z0-9.-]+)\]\]/g, (_, id) => (
    websiteTemplate(message(id), message)
  ));
  if (locale !== SOURCE_LOCALE && rendered.includes('<html lang="en">')) {
    rendered = rendered.replace('<html lang="en">', `<html lang="${websiteHtmlLang()}">`);
  }
  return rendered;
}
