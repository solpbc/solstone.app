export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireCanonicalUuids(...values) {
  if (values.some((value) => !isCanonicalUuid(value))) {
    throw new TypeError('invalid sandbox ownership identifier');
  }
}
