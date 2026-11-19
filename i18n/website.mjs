import { render } from './generated/esm/website/api.mjs';

const locale = 'en-US';

export function websiteText(id, values = {}) {
  return render(locale, id, Object.entries(values).map(([name, value]) => [name, String(value)]), {
    useIsolating: false,
  });
}

export function websiteTemplate(source, message = websiteText) {
  return source.replace(/\[\[i18n:([a-z0-9.-]+)\]\]/g, (_, id) => (
    websiteTemplate(message(id), message)
  ));
}
