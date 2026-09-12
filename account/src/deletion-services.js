export const DELETION_SERVICES = Object.freeze(['relay', 'support']);
export const RETAINED_KEY_VERSIONS = Object.freeze([1, 2]);
export const CURRENT_KEY_VERSION = 2;

export const PURGE_PATH = '/internal/deletion/purge';
export const CONFIRM_PATH = '/internal/deletion/purge/confirm';
export const READY_PATH = '/internal/deletion/purge/ready';

export function bindingFor(env, service) {
  if (service === 'relay') return env.RELAY || null;
  if (service === 'support') return env.SUPPORT_WORKER || null;
  return null;
}

export function bearerFor(env, service) {
  const bearer = service === 'relay'
    ? env.ACCOUNT_RELAY_PURGE_BEARER_TOKEN
    : env.ACCOUNT_SUPPORT_PURGE_BEARER_TOKEN;
  return typeof bearer === 'string' && bearer ? bearer : null;
}

export function hmacKeyFor(env, service, keyVersion) {
  const version = Number(keyVersion);
  if (!RETAINED_KEY_VERSIONS.includes(version)) return null;
  const prefix = service === 'relay' ? 'ACCOUNT_RELAY_PURGE_HMAC_KEY_V' : 'ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V';
  const key = env[`${prefix}${version}`];
  return typeof key === 'string' && key ? key : null;
}

export function readinessDomainFor(service) {
  return `solpbc-owner-purge-v1:${service}:readiness`;
}

export function domainFor(service, purpose) {
  return `solpbc-owner-purge-v1:${service}:${purpose}`;
}

export function validateDeletionServiceConfig(env) {
  for (const service of DELETION_SERVICES) {
    if (!bindingFor(env, service)) return false;
    if (!bearerFor(env, service)) return false;
    for (const version of RETAINED_KEY_VERSIONS) {
      if (!hmacKeyFor(env, service, version)) return false;
    }
  }
  return true;
}
