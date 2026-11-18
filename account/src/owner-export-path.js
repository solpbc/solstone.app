import { t } from '../../i18n/account.mjs';

export function isOwnerExportPath(pathname) {
  return pathname === '/account/export' || pathname.startsWith('/account/export/');
}

export function ownerExportNotFound() {
  return new Response(t('account.ownerexportpath.notfound'), {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
