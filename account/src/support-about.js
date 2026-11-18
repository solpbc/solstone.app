import { t } from '../../i18n/account.mjs';

export function parseAbout(value) {
  if (value === undefined) return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false, message: t('account.supportabout.yourversionsmustbetextpasteblock') };
  const text = value.replace(/\r\n/g, '\n');
  return new TextEncoder().encode(text).byteLength <= 8192
    ? { ok: true, value: text }
    : { ok: false, value: text, message: t('account.supportforms.yourversionsaretoolongkeepthem') };
}
