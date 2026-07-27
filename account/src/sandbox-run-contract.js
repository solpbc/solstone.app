import { isCanonicalUuid, UUID_RE } from './sandbox-identifiers.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function valuesOf(value) {
  return Object.freeze(Object.values(value));
}

export const SANDBOX_CONTRACT_VERSION = 1;
export const SANDBOX_PROFILE = 'full';
export const SANDBOX_LEASE_TTL_MS = 3_600_000;
export const SANDBOX_BROKER_ENDPOINT = 'https://services.solstone.app';
export const SANDBOX_RUN_CONTRACT_MAX_BYTES = 65_536;

export const SANDBOX_CREATE_REQUEST_KEYS = Object.freeze([
  'contract_version',
  'instance_id',
  'profile',
  'run_id',
]);

export const SANDBOX_CLEANUP_TRIGGER = deepFreeze({
  POST_FAILURE: 'post_failure',
  DELETE: 'delete',
  SCHEDULED: 'scheduled',
});
export const SANDBOX_CLEANUP_TRIGGERS = valuesOf(SANDBOX_CLEANUP_TRIGGER);

export const SANDBOX_RUN_STATUS = deepFreeze({
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  CLEANUP_REQUIRED: 'cleanup_required',
  CLEANING: 'cleaning',
  EXPIRY_PENDING: 'expiry_pending',
  CLEANUP_FAILED: 'cleanup_failed',
  RELEASED: 'released',
});
export const SANDBOX_RUN_STATUSES = valuesOf(SANDBOX_RUN_STATUS);
export const SANDBOX_RECONCILIATION_STATUSES = Object.freeze([
  SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
  SANDBOX_RUN_STATUS.CLEANING,
  SANDBOX_RUN_STATUS.EXPIRY_PENDING,
  SANDBOX_RUN_STATUS.CLEANUP_FAILED,
]);
export const SANDBOX_CLEANUP_DISPOSITION_STATUSES = Object.freeze([
  SANDBOX_RUN_STATUS.EXPIRY_PENDING,
  SANDBOX_RUN_STATUS.CLEANUP_FAILED,
]);

export const SANDBOX_PROVISIONING_PHASE = deepFreeze({
  CREATED: 'created',
  DISPATCH_INTENT: 'dispatch_intent',
  DISPATCH_ACQUIRED: 'dispatch_acquired',
  SPL_INTENT: 'spl_intent',
  SPL_ACQUIRED: 'spl_acquired',
  SPB_INTENT: 'spb_intent',
  SPB_ACQUIRED: 'spb_acquired',
  SPP_INTENT: 'spp_intent',
  SPP_ACQUIRED: 'spp_acquired',
  ACTIVE: 'active',
});
export const SANDBOX_PROVISIONING_PHASES = valuesOf(SANDBOX_PROVISIONING_PHASE);

export const SANDBOX_CLEANUP_PHASE = deepFreeze({
  DENY_INTENT: 'deny_intent',
  DENIED: 'denied',
  RELAY_INTENT: 'relay_intent',
  RELAY_RETIRED: 'relay_retired',
  SPB_EXPIRY: 'spb_expiry',
  SPB_PURGE: 'spb_purge',
  VERIFY: 'verify',
  RELEASED: 'released',
});
export const SANDBOX_CLEANUP_PHASES = valuesOf(SANDBOX_CLEANUP_PHASE);
export const SANDBOX_CLEANUP_PHASE_PREDECESSOR = deepFreeze({
  [SANDBOX_CLEANUP_PHASE.DENY_INTENT]: null,
  [SANDBOX_CLEANUP_PHASE.DENIED]: SANDBOX_CLEANUP_PHASE.DENY_INTENT,
  [SANDBOX_CLEANUP_PHASE.RELAY_INTENT]: SANDBOX_CLEANUP_PHASE.DENIED,
  [SANDBOX_CLEANUP_PHASE.RELAY_RETIRED]: SANDBOX_CLEANUP_PHASE.RELAY_INTENT,
  [SANDBOX_CLEANUP_PHASE.SPB_EXPIRY]: SANDBOX_CLEANUP_PHASE.RELAY_RETIRED,
  [SANDBOX_CLEANUP_PHASE.SPB_PURGE]: SANDBOX_CLEANUP_PHASE.SPB_EXPIRY,
  [SANDBOX_CLEANUP_PHASE.VERIFY]: SANDBOX_CLEANUP_PHASE.SPB_PURGE,
});

export const SANDBOX_COMPONENT_STATE = deepFreeze({
  ACTIVE: 'active',
  DENY_PENDING: 'deny_pending',
  PURGE_PENDING: 'purge_pending',
  VERIFY_PENDING: 'verify_pending',
  RELEASED: 'released',
  CLEANUP_FAILED: 'cleanup_failed',
});
export const SANDBOX_COMPONENT_STATES = valuesOf(SANDBOX_COMPONENT_STATE);

export const SANDBOX_COMPONENT = deepFreeze({
  DISPATCH: 'dispatch',
  SPP: 'spp',
  SPB: 'spb',
  SPL_RELAY: 'spl_relay',
  SPL_BINDING: 'spl_binding',
});

export const SANDBOX_RESIDUAL_CODE = deepFreeze({
  LEASE_EXPIRED: 'lease_expired',
  ACCOUNT_MISSING: 'account_missing',
  DISPATCH_ISSUE_FAILED: 'dispatch_issue_failed',
  DISPATCH_RELEASE_FAILED: 'dispatch_release_failed',
  DISPATCH_OWNERSHIP_CONFLICT: 'dispatch_ownership_conflict',
  SPP_ISSUE_FAILED: 'spp_issue_failed',
  SPP_RELEASE_FAILED: 'spp_release_failed',
  SPP_OWNERSHIP_CONFLICT: 'spp_ownership_conflict',
  SPB_ISSUE_FAILED: 'spb_issue_failed',
  SPB_DENIAL_FAILED: 'spb_denial_failed',
  SPB_DENIAL_REQUIRED: 'spb_denial_required',
  SPB_CREDENTIAL_EXPIRY_PENDING: 'spb_credential_expiry_pending',
  SPB_CLEANUP_RETRYABLE: 'spb_cleanup_retryable',
  SPB_LIFECYCLE_ABSENT: 'spb_lifecycle_absent',
  SPB_OWNERSHIP_CONFLICT: 'spb_ownership_conflict',
  SPL_GRANT_FAILED: 'spl_grant_failed',
  RELAY_RETIRED_STATE: 'relay_retired_state',
  RELAY_INSTANCE_DO_CLEANUP: 'relay_instance_do_cleanup',
  RELAY_RK_DO_CLEANUP: 'relay_rk_do_cleanup',
  RELAY_DEVICE_REVOCATION: 'relay_device_revocation',
  RELAY_ENTITLEMENT_CLEAR: 'relay_entitlement_clear',
  RELAY_PENDING_GRANT_CLEAR: 'relay_pending_grant_clear',
  RELAY_RK_REGISTRY_CLEAR: 'relay_rk_registry_clear',
  RELAY_VERIFICATION: 'relay_verification',
  RELAY_FAILED: 'relay_failed',
  SPL_ISSUE_FAILED: 'spl_issue_failed',
  SPL_RELEASE_FAILED: 'spl_release_failed',
  SPL_OWNERSHIP_CONFLICT: 'spl_ownership_conflict',
  LEASE_EXPIRED_BEFORE_ACTIVATION: 'lease_expired_before_activation',
  ACTIVATION_CAS_LOST: 'activation_cas_lost',
});

export const SANDBOX_COMPONENT_RESIDUAL_CODES = deepFreeze({
  dispatch: [
    SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
    SANDBOX_RESIDUAL_CODE.DISPATCH_ISSUE_FAILED,
    SANDBOX_RESIDUAL_CODE.DISPATCH_RELEASE_FAILED,
    SANDBOX_RESIDUAL_CODE.DISPATCH_OWNERSHIP_CONFLICT,
  ],
  spp: [
    SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
    SANDBOX_RESIDUAL_CODE.SPP_ISSUE_FAILED,
    SANDBOX_RESIDUAL_CODE.SPP_RELEASE_FAILED,
    SANDBOX_RESIDUAL_CODE.SPP_OWNERSHIP_CONFLICT,
  ],
  spb: [
    SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
    SANDBOX_RESIDUAL_CODE.SPB_ISSUE_FAILED,
    SANDBOX_RESIDUAL_CODE.SPB_DENIAL_FAILED,
    SANDBOX_RESIDUAL_CODE.SPB_DENIAL_REQUIRED,
    SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
    SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
    SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
    SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT,
  ],
  spl_relay: [
    SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
    SANDBOX_RESIDUAL_CODE.SPL_GRANT_FAILED,
    SANDBOX_RESIDUAL_CODE.RELAY_RETIRED_STATE,
    SANDBOX_RESIDUAL_CODE.RELAY_INSTANCE_DO_CLEANUP,
    SANDBOX_RESIDUAL_CODE.RELAY_RK_DO_CLEANUP,
    SANDBOX_RESIDUAL_CODE.RELAY_DEVICE_REVOCATION,
    SANDBOX_RESIDUAL_CODE.RELAY_ENTITLEMENT_CLEAR,
    SANDBOX_RESIDUAL_CODE.RELAY_PENDING_GRANT_CLEAR,
    SANDBOX_RESIDUAL_CODE.RELAY_RK_REGISTRY_CLEAR,
    SANDBOX_RESIDUAL_CODE.RELAY_VERIFICATION,
    SANDBOX_RESIDUAL_CODE.RELAY_FAILED,
  ],
  spl_binding: [
    SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
    SANDBOX_RESIDUAL_CODE.SPL_ISSUE_FAILED,
    SANDBOX_RESIDUAL_CODE.SPL_RELEASE_FAILED,
    SANDBOX_RESIDUAL_CODE.SPL_OWNERSHIP_CONFLICT,
  ],
});
export const SANDBOX_CREATION_ONLY_RESIDUAL_CODES = Object.freeze([
  SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED_BEFORE_ACTIVATION,
  SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST,
]);
export const SANDBOX_LAST_RESIDUAL_CODES = Object.freeze([
  ...new Set(Object.values(SANDBOX_COMPONENT_RESIDUAL_CODES).flat()),
  ...SANDBOX_CREATION_ONLY_RESIDUAL_CODES,
]);

export const SANDBOX_COMPONENTS = deepFreeze([
  {
    name: SANDBOX_COMPONENT.DISPATCH,
    state_column: 'dispatch_state',
    residual_column: 'dispatch_residual_code',
    updated_at_column: 'dispatch_updated_at',
  },
  {
    name: SANDBOX_COMPONENT.SPP,
    state_column: 'spp_state',
    residual_column: 'spp_residual_code',
    updated_at_column: 'spp_updated_at',
  },
  {
    name: SANDBOX_COMPONENT.SPB,
    state_column: 'spb_state',
    residual_column: 'spb_residual_code',
    updated_at_column: 'spb_updated_at',
  },
  {
    name: SANDBOX_COMPONENT.SPL_RELAY,
    state_column: 'spl_relay_state',
    residual_column: 'spl_relay_residual_code',
    updated_at_column: 'spl_relay_updated_at',
  },
  {
    name: SANDBOX_COMPONENT.SPL_BINDING,
    state_column: 'spl_binding_state',
    residual_column: 'spl_binding_residual_code',
    updated_at_column: 'spl_binding_updated_at',
  },
]);
export const SANDBOX_COMPONENT_COLUMNS = deepFreeze(Object.fromEntries(
  SANDBOX_COMPONENTS.map((component) => [
    component.name,
    [component.state_column, component.residual_column, component.updated_at_column],
  ])
));

export const SANDBOX_RELAY_RESIDUALS = deepFreeze({
  retired_state: SANDBOX_RESIDUAL_CODE.RELAY_RETIRED_STATE,
  instance_do_cleanup: SANDBOX_RESIDUAL_CODE.RELAY_INSTANCE_DO_CLEANUP,
  rk_do_cleanup: SANDBOX_RESIDUAL_CODE.RELAY_RK_DO_CLEANUP,
  device_revocation: SANDBOX_RESIDUAL_CODE.RELAY_DEVICE_REVOCATION,
  entitlement_clear: SANDBOX_RESIDUAL_CODE.RELAY_ENTITLEMENT_CLEAR,
  pending_grant_clear: SANDBOX_RESIDUAL_CODE.RELAY_PENDING_GRANT_CLEAR,
  rk_registry_clear: SANDBOX_RESIDUAL_CODE.RELAY_RK_REGISTRY_CLEAR,
  verification: SANDBOX_RESIDUAL_CODE.RELAY_VERIFICATION,
});
export const SANDBOX_COMPONENT_FAILURE_RESIDUALS = deepFreeze({
  [SANDBOX_COMPONENT.DISPATCH]: SANDBOX_RESIDUAL_CODE.DISPATCH_RELEASE_FAILED,
  [SANDBOX_COMPONENT.SPP]: SANDBOX_RESIDUAL_CODE.SPP_RELEASE_FAILED,
  [SANDBOX_COMPONENT.SPB]: SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
  [SANDBOX_COMPONENT.SPL_RELAY]: SANDBOX_RESIDUAL_CODE.RELAY_FAILED,
  [SANDBOX_COMPONENT.SPL_BINDING]: SANDBOX_RESIDUAL_CODE.SPL_RELEASE_FAILED,
});
export const SANDBOX_COMPONENT_RELEASE_FAILURE_RESIDUALS = deepFreeze({
  [SANDBOX_COMPONENT.DISPATCH]: SANDBOX_RESIDUAL_CODE.DISPATCH_RELEASE_FAILED,
  [SANDBOX_COMPONENT.SPP]: SANDBOX_RESIDUAL_CODE.SPP_RELEASE_FAILED,
  [SANDBOX_COMPONENT.SPB]: SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
  [SANDBOX_COMPONENT.SPL_BINDING]: SANDBOX_RESIDUAL_CODE.SPL_RELEASE_FAILED,
});
export const SANDBOX_COMPONENT_OWNERSHIP_RESIDUALS = deepFreeze({
  [SANDBOX_COMPONENT.DISPATCH]: SANDBOX_RESIDUAL_CODE.DISPATCH_OWNERSHIP_CONFLICT,
  [SANDBOX_COMPONENT.SPP]: SANDBOX_RESIDUAL_CODE.SPP_OWNERSHIP_CONFLICT,
  [SANDBOX_COMPONENT.SPB]: SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT,
  [SANDBOX_COMPONENT.SPL_BINDING]: SANDBOX_RESIDUAL_CODE.SPL_OWNERSHIP_CONFLICT,
});
export const SANDBOX_SPB_CLEANUP_OUTCOME_RESIDUALS = deepFreeze({
  retryable: SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
  denial_required: SANDBOX_RESIDUAL_CODE.SPB_DENIAL_REQUIRED,
  absent: SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
  ownership_conflict: SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT,
});

export const SANDBOX_SPL_CAPABILITY_SERVICE = 'spl';
export const SANDBOX_SPL_CAPABILITY_STATE = 'approved';

export const SANDBOX_CREATE_RESPONSE_KEYS = Object.freeze([
  'run_id',
  'contract_version',
  'profile',
  'lease_expires_at',
  'capabilities',
]);
export const SANDBOX_CAPABILITIES_KEYS = Object.freeze(['scout', 'spl', 'spb', 'spp']);
export const SANDBOX_CAPABILITY_KEYS = deepFreeze({
  scout: ['google_api_key', 'dispatch_token', 'account_id', 'created_at'],
  spl: ['service', 'state', 'approved_at'],
  spb: ['broker_endpoint', 'account_id', 'instance_id', 'bucket', 'prefix', 'broker_token'],
  spp: ['endpoint_url', 'served_model_id', 'credential', 'account_id', 'created_at'],
});
export const SANDBOX_CREATE_RESPONSE_RELATIONSHIPS = deepFreeze({
  equal_fields: [
    [
      'capabilities.scout.account_id',
      'capabilities.spb.account_id',
      'capabilities.spp.account_id',
    ],
    [
      'capabilities.scout.created_at',
      'capabilities.spl.approved_at',
      'capabilities.spp.created_at',
    ],
  ],
  epoch_offset: {
    field: 'lease_expires_at',
    rfc3339_milliseconds_field: 'capabilities.scout.created_at',
    offset_ms: SANDBOX_LEASE_TTL_MS,
  },
  fixed_fields: {
    'capabilities.spb.broker_endpoint': SANDBOX_BROKER_ENDPOINT,
  },
  templates: {
    'capabilities.spb.prefix': 'users/{capabilities.spb.account_id}/{capabilities.spb.instance_id}/',
  },
});
export const SANDBOX_CREATE_OPERATION_IDENTITY = deepFreeze([
  { request_field: 'run_id', response_field: 'run_id' },
  { request_field: 'instance_id', response_field: 'capabilities.spb.instance_id' },
]);
export const SANDBOX_REPORT_KEYS = Object.freeze([
  'run_id',
  'contract_version',
  'profile',
  'status',
  'provisioning_phase',
  'cleanup_phase',
  'lease_expires_at',
  'lease_live',
  'retry_after_seconds',
  'components',
]);
export const SANDBOX_COMPONENT_REPORT_KEYS = Object.freeze([
  'component',
  'state',
  'residual_code',
  'updated_at',
]);

export const SANDBOX_ERROR = deepFreeze({
  INVALID_REQUEST: {
    status: 400,
    fields: ['error', 'code'],
    error: 'invalid sandbox run request',
    code: 'invalid_sandbox_run_request',
  },
  CONFLICT: {
    status: 409,
    fields: ['error', 'code', 'run_id'],
    error: 'sandbox run conflict',
    code: 'sandbox_run_conflict',
  },
  UNAVAILABLE: {
    status: 503,
    fields: ['error', 'code', 'run_id'],
    error: 'sandbox run unavailable',
    code: 'sandbox_run_unavailable',
  },
  CLEANUP_CONFLICT: {
    status: 409,
    fields: ['error', 'code', 'run_id'],
    error: 'sandbox run cleanup conflict',
    code: 'sandbox_run_cleanup_conflict',
  },
  CLEANUP_UNAVAILABLE: {
    status: 503,
    fields: ['error', 'code', 'run_id'],
    error: 'sandbox run cleanup unavailable',
    code: 'sandbox_run_cleanup_unavailable',
  },
  NOT_FOUND: {
    status: 404,
    fields: ['error', 'code', 'run_id'],
    error: 'sandbox run not found',
    code: 'sandbox_run_not_found',
  },
});

export const SANDBOX_OUTER_ADMIN_ENVELOPE = deepFreeze({
  ACCESS_REQUIRED: {
    status: 403,
    fields: ['error'],
    error: 'cloudflare access required',
  },
  NOT_FOUND: {
    status: 404,
    fields: ['error'],
    error: 'account not found',
  },
});

export const SANDBOX_ADMIN_SECURITY_HEADER_DESCRIPTORS = deepFreeze([
  { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { name: 'X-Frame-Options', value: 'DENY' },
  { name: 'X-Content-Type-Options', value: 'nosniff' },
  { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { name: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    name: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
  },
]);
export const SANDBOX_RESPONSE_HEADER_DESCRIPTORS = deepFreeze([
  ...SANDBOX_ADMIN_SECURITY_HEADER_DESCRIPTORS,
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Cache-Control', value: 'no-store' },
]);

export const SANDBOX_RUN_ROW_KEYS = deepFreeze([
  'run_id',
  'account_id',
  'instance_id',
  'contract_version',
  'profile',
  'status',
  'provisioning_phase',
  'cleanup_phase',
  'created_at',
  'lease_expires_at',
  'updated_at',
  'spb_retry_not_before',
  'completed_at',
  'last_residual_code',
  ...SANDBOX_COMPONENTS.flatMap((component) => [
    component.state_column,
    component.residual_column,
    component.updated_at_column,
  ]),
]);

const runStatusSet = new Set(SANDBOX_RUN_STATUSES);
const provisioningPhaseSet = new Set(SANDBOX_PROVISIONING_PHASES);
const cleanupPhaseSet = new Set(SANDBOX_CLEANUP_PHASES);
const componentStateSet = new Set(SANDBOX_COMPONENT_STATES);
const lastResidualSet = new Set(SANDBOX_LAST_RESIDUAL_CODES);
const componentResidualSets = Object.fromEntries(Object.entries(SANDBOX_COMPONENT_RESIDUAL_CODES)
  .map(([name, values]) => [name, new Set(values)]));

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys, ordered = true) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  const compared = ordered ? actual : [...actual].sort();
  const expected = ordered ? keys : [...keys].sort();
  return compared.every((key, index) => key === expected[index]);
}

function isNonEmptyTrimmedString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isAbsoluteHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function valueAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function matchesSandboxRunCreateRelationships(value) {
  const rules = SANDBOX_CREATE_RESPONSE_RELATIONSHIPS;
  if (!rules.equal_fields.every((paths) => {
    const [expected, ...others] = paths.map((path) => valueAtPath(value, path));
    return others.every((candidate) => candidate === expected);
  })) return false;

  const epochRule = rules.epoch_offset;
  if (valueAtPath(value, epochRule.field)
    !== Date.parse(valueAtPath(value, epochRule.rfc3339_milliseconds_field)) + epochRule.offset_ms) {
    return false;
  }
  if (!Object.entries(rules.fixed_fields)
    .every(([path, expected]) => valueAtPath(value, path) === expected)) return false;
  return Object.entries(rules.templates).every(([path, template]) => {
    const expected = template.replace(/\{([^}]+)\}/g, (_match, sourcePath) => (
      String(valueAtPath(value, sourcePath))
    ));
    return valueAtPath(value, path) === expected;
  });
}

function isRfc3339Milliseconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function orderedObject(keys, values) {
  if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length) {
    throw new TypeError('invalid ordered object values');
  }
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

export function sandboxRunErrorBody(descriptor, runId) {
  const values = [descriptor.error, descriptor.code];
  if (descriptor.fields.includes('run_id')) values.push(runId);
  return orderedObject(descriptor.fields, values);
}

export function isSandboxRunCreateInput(value) {
  return hasExactKeys(value, SANDBOX_CREATE_REQUEST_KEYS, false)
    && value.contract_version === SANDBOX_CONTRACT_VERSION
    && value.profile === SANDBOX_PROFILE
    && isCanonicalUuid(value.run_id)
    && isCanonicalUuid(value.instance_id);
}

export function isSandboxRunConfiguration(value) {
  return isRecord(value)
    && isNonEmptyTrimmedString(value.R2_BUCKET)
    && isAbsoluteHttpsUrl(value.SPP_ENGINE_ENDPOINT)
    && isNonEmptyTrimmedString(value.SPP_ENGINE_MODEL);
}

export function isSandboxRunLeaseLive(run, nowMs) {
  return run?.status === SANDBOX_RUN_STATUS.ACTIVE && nowMs < run.lease_expires_at;
}

function componentRelationshipValid(name, state, residual) {
  if (residual !== null && !componentResidualSets[name].has(residual)) return false;
  if (name === SANDBOX_COMPONENT.SPB) {
    if (state === SANDBOX_COMPONENT_STATE.PURGE_PENDING) {
      return residual === null || residual === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING;
    }
    if (state === SANDBOX_COMPONENT_STATE.CLEANUP_FAILED) {
      return residual !== null && residual !== SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING;
    }
    return residual === null;
  }
  return state === SANDBOX_COMPONENT_STATE.CLEANUP_FAILED ? residual !== null : residual === null;
}

export function isSandboxRunRow(row, { runId, accountId } = {}) {
  if (!hasExactKeys(row, SANDBOX_RUN_ROW_KEYS, false)) return false;
  if (!isCanonicalUuid(row.run_id) || !isCanonicalUuid(row.account_id) || !isCanonicalUuid(row.instance_id)) {
    return false;
  }
  if ((runId !== undefined && row.run_id !== runId) || (accountId !== undefined && row.account_id !== accountId)) {
    return false;
  }
  if (row.contract_version !== SANDBOX_CONTRACT_VERSION || row.profile !== SANDBOX_PROFILE) return false;
  if (!runStatusSet.has(row.status) || !provisioningPhaseSet.has(row.provisioning_phase)) return false;
  if (row.cleanup_phase !== null && !cleanupPhaseSet.has(row.cleanup_phase)) return false;
  if (!Number.isSafeInteger(row.created_at)
    || !Number.isSafeInteger(row.lease_expires_at)
    || !Number.isSafeInteger(row.updated_at)
    || row.lease_expires_at !== row.created_at + SANDBOX_LEASE_TTL_MS
    || (row.spb_retry_not_before !== null && !Number.isSafeInteger(row.spb_retry_not_before))
    || (row.completed_at !== null && !Number.isSafeInteger(row.completed_at))
    || (row.last_residual_code !== null && !lastResidualSet.has(row.last_residual_code))) {
    return false;
  }
  for (const component of SANDBOX_COMPONENTS) {
    const state = row[component.state_column];
    const residual = row[component.residual_column];
    if (!componentStateSet.has(state)
      || !Number.isSafeInteger(row[component.updated_at_column])
      || !componentRelationshipValid(component.name, state, residual)) {
      return false;
    }
  }
  const released = row.status === SANDBOX_RUN_STATUS.RELEASED;
  if (released !== (row.cleanup_phase === SANDBOX_CLEANUP_PHASE.RELEASED)) return false;
  if (released !== Number.isSafeInteger(row.completed_at)) return false;
  if (released && !SANDBOX_COMPONENTS.every((component) => (
    row[component.state_column] === SANDBOX_COMPONENT_STATE.RELEASED
  ))) return false;
  if (row.status === SANDBOX_RUN_STATUS.ACTIVE
    && row.provisioning_phase !== SANDBOX_PROVISIONING_PHASE.ACTIVE) return false;
  if (row.status === SANDBOX_RUN_STATUS.PROVISIONING
    && row.provisioning_phase === SANDBOX_PROVISIONING_PHASE.ACTIVE) return false;
  if ((row.status === SANDBOX_RUN_STATUS.PROVISIONING || row.status === SANDBOX_RUN_STATUS.ACTIVE)
    && row.cleanup_phase !== null) return false;
  if (SANDBOX_RECONCILIATION_STATUSES.includes(row.status) && row.cleanup_phase === null) return false;
  if (row.status === SANDBOX_RUN_STATUS.ACTIVE && !SANDBOX_COMPONENTS.every((component) => (
    row[component.state_column] === SANDBOX_COMPONENT_STATE.ACTIVE
  ))) return false;
  if (row.status === SANDBOX_RUN_STATUS.PROVISIONING && !SANDBOX_COMPONENTS.every((component) => (
    row[component.state_column] === SANDBOX_COMPONENT_STATE.DENY_PENDING
  ))) return false;
  return true;
}

export function renderSandboxRunReport(row, nowMs) {
  const leaseLive = isSandboxRunLeaseLive(row, nowMs);
  const retryAfter = row.status === SANDBOX_RUN_STATUS.EXPIRY_PENDING
    && Number.isSafeInteger(row.spb_retry_not_before)
    ? Math.max(1, Math.ceil((row.spb_retry_not_before - nowMs) / 1000))
    : null;
  return orderedObject(SANDBOX_REPORT_KEYS, [
    row.run_id,
    row.contract_version,
    row.profile,
    row.status,
    row.provisioning_phase,
    row.cleanup_phase,
    row.lease_expires_at,
    leaseLive,
    retryAfter,
    SANDBOX_COMPONENTS.map((component) => {
      const storedState = row[component.state_column];
      const expiredActive = storedState === SANDBOX_COMPONENT_STATE.ACTIVE && !leaseLive;
      return orderedObject(SANDBOX_COMPONENT_REPORT_KEYS, [
        component.name,
        expiredActive ? SANDBOX_COMPONENT_STATE.DENY_PENDING : storedState,
        expiredActive ? SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED : row[component.residual_column],
        row[component.updated_at_column],
      ]);
    }),
  ]);
}

export function isSandboxRunComponentReport(component, descriptor) {
  if (!hasExactKeys(component, SANDBOX_COMPONENT_REPORT_KEYS)) return false;
  if (component.component !== descriptor.name || !componentStateSet.has(component.state)) return false;
  if (!Number.isSafeInteger(component.updated_at)) return false;
  if (isExpiredActiveComponentReport(component)) return true;
  return componentRelationshipValid(descriptor.name, component.state, component.residual_code);
}

function isExpiredActiveComponentReport(component) {
  return component.state === SANDBOX_COMPONENT_STATE.DENY_PENDING
    && component.residual_code === SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED;
}

export function isSandboxRunReport(report, { row, nowMs } = {}) {
  if (!hasExactKeys(report, SANDBOX_REPORT_KEYS)
    || !isCanonicalUuid(report.run_id)
    || report.contract_version !== SANDBOX_CONTRACT_VERSION
    || report.profile !== SANDBOX_PROFILE
    || !runStatusSet.has(report.status)
    || !provisioningPhaseSet.has(report.provisioning_phase)
    || (report.cleanup_phase !== null && !cleanupPhaseSet.has(report.cleanup_phase))
    || !Number.isSafeInteger(report.lease_expires_at)
    || typeof report.lease_live !== 'boolean'
    || (report.retry_after_seconds !== null
      && (!Number.isSafeInteger(report.retry_after_seconds) || report.retry_after_seconds < 1))
    || !Array.isArray(report.components)
    || report.components.length !== SANDBOX_COMPONENTS.length) {
    return false;
  }
  if (!report.components.every((component, index) => (
    isSandboxRunComponentReport(component, SANDBOX_COMPONENTS[index])
  ))) {
    return false;
  }
  if (report.components.some(isExpiredActiveComponentReport)
    && (report.status !== SANDBOX_RUN_STATUS.ACTIVE || report.lease_live)) return false;
  if (report.lease_live && report.status !== SANDBOX_RUN_STATUS.ACTIVE) return false;
  if (report.status === SANDBOX_RUN_STATUS.ACTIVE
    && report.provisioning_phase !== SANDBOX_PROVISIONING_PHASE.ACTIVE) return false;
  if (report.status === SANDBOX_RUN_STATUS.PROVISIONING
    && report.provisioning_phase === SANDBOX_PROVISIONING_PHASE.ACTIVE) return false;
  if ((report.status === SANDBOX_RUN_STATUS.PROVISIONING || report.status === SANDBOX_RUN_STATUS.ACTIVE)
    && report.cleanup_phase !== null) return false;
  if (SANDBOX_RECONCILIATION_STATUSES.includes(report.status) && report.cleanup_phase === null) return false;
  if ((report.status === SANDBOX_RUN_STATUS.RELEASED)
    !== (report.cleanup_phase === SANDBOX_CLEANUP_PHASE.RELEASED)) return false;
  if (report.status === SANDBOX_RUN_STATUS.ACTIVE) {
    const expectedState = report.lease_live
      ? SANDBOX_COMPONENT_STATE.ACTIVE
      : SANDBOX_COMPONENT_STATE.DENY_PENDING;
    const expectedResidual = report.lease_live ? null : SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED;
    if (!report.components.every((component) => (
      component.state === expectedState && component.residual_code === expectedResidual
    ))) return false;
  }
  if (report.status === SANDBOX_RUN_STATUS.EXPIRY_PENDING) {
    if (!isSandboxRunExpiryOnlyReport(report)) return false;
  } else if (report.retry_after_seconds !== null) {
    return false;
  }
  if (report.status === SANDBOX_RUN_STATUS.RELEASED
    && !report.components.every((component) => component.state === SANDBOX_COMPONENT_STATE.RELEASED)) {
    return false;
  }
  if (row !== undefined || nowMs !== undefined) {
    if (!isSandboxRunRow(row) || !Number.isSafeInteger(nowMs)) return false;
    return JSON.stringify(report) === JSON.stringify(renderSandboxRunReport(row, nowMs));
  }
  return true;
}

export function isSandboxRunExpiryOnlyReport(report) {
  if (!isRecord(report) || !Array.isArray(report.components)) return false;
  const components = Object.fromEntries(report.components.map((component) => [component.component, component]));
  return report.status === SANDBOX_RUN_STATUS.EXPIRY_PENDING
    && Number.isSafeInteger(report.retry_after_seconds)
    && components.dispatch?.state === SANDBOX_COMPONENT_STATE.RELEASED
    && components.spp?.state === SANDBOX_COMPONENT_STATE.RELEASED
    && components.spb?.state === SANDBOX_COMPONENT_STATE.PURGE_PENDING
    && components.spb?.residual_code === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING
    && components.spl_relay?.state === SANDBOX_COMPONENT_STATE.RELEASED
    && components.spl_binding?.state === SANDBOX_COMPONENT_STATE.RELEASED;
}

export function hasSandboxRunOwnershipConflict(report) {
  return Array.isArray(report?.components)
    && report.components.some((component) => (
      typeof component.residual_code === 'string'
      && component.residual_code.endsWith('_ownership_conflict')
    ));
}

export function isSandboxRunCapability(capability, name) {
  if (!SANDBOX_CAPABILITIES_KEYS.includes(name)) return false;
  if (!hasExactKeys(capability, SANDBOX_CAPABILITY_KEYS[name])) return false;
  if (name === 'scout') {
    return isNonEmptyTrimmedString(capability.google_api_key)
      && isNonEmptyTrimmedString(capability.dispatch_token)
      && isCanonicalUuid(capability.account_id)
      && isRfc3339Milliseconds(capability.created_at);
  }
  if (name === 'spl') {
    return capability.service === SANDBOX_SPL_CAPABILITY_SERVICE
      && capability.state === SANDBOX_SPL_CAPABILITY_STATE
      && isRfc3339Milliseconds(capability.approved_at);
  }
  if (name === 'spb') {
    return isAbsoluteHttpsUrl(capability.broker_endpoint)
      && isCanonicalUuid(capability.account_id)
      && isCanonicalUuid(capability.instance_id)
      && isNonEmptyTrimmedString(capability.bucket)
      && typeof capability.prefix === 'string'
      && capability.prefix.length > 0
      && isNonEmptyTrimmedString(capability.broker_token);
  }
  return isAbsoluteHttpsUrl(capability.endpoint_url)
    && isNonEmptyTrimmedString(capability.served_model_id)
    && isNonEmptyTrimmedString(capability.credential)
    && isCanonicalUuid(capability.account_id)
    && isRfc3339Milliseconds(capability.created_at);
}

export function isSandboxRunCreateResponse(value) {
  if (!hasExactKeys(value, SANDBOX_CREATE_RESPONSE_KEYS)
    || !isCanonicalUuid(value.run_id)
    || value.contract_version !== SANDBOX_CONTRACT_VERSION
    || value.profile !== SANDBOX_PROFILE
    || !Number.isSafeInteger(value.lease_expires_at)
    || !hasExactKeys(value.capabilities, SANDBOX_CAPABILITIES_KEYS)) {
    return false;
  }
  if (!SANDBOX_CAPABILITIES_KEYS.every((name) => isSandboxRunCapability(value.capabilities[name], name))) {
    return false;
  }
  return matchesSandboxRunCreateRelationships(value);
}

export function isSandboxRunErrorBody(value, descriptor, runId) {
  if (!hasExactKeys(value, descriptor?.fields || [])) return false;
  if (value.error !== descriptor.error || value.code !== descriptor.code) return false;
  return descriptor.fields.includes('run_id') ? value.run_id === runId : true;
}

export function isSandboxOuterAdminEnvelope(value, descriptor) {
  return hasExactKeys(value, descriptor?.fields || []) && value.error === descriptor.error;
}

function field(name, type, options = {}) {
  return { name, type, required: true, ...options };
}

function fields(keys, overrides = {}) {
  return keys.map((name) => field(name, overrides[name]?.type || 'string', overrides[name] || {}));
}

function capabilityFieldOptions(fieldName) {
  const options = {
    type: fieldName.endsWith('_at') ? 'rfc3339-milliseconds' : 'string',
    sensitive: ['google_api_key', 'dispatch_token', 'broker_token', 'credential'].includes(fieldName),
  };
  if (fieldName === 'account_id' || fieldName === 'instance_id') options.type = 'uuid';
  if (fieldName === 'broker_endpoint' || fieldName === 'endpoint_url') options.type = 'absolute-https-url';
  if (fieldName === 'service') options.fixed = SANDBOX_SPL_CAPABILITY_SERVICE;
  if (fieldName === 'state') options.fixed = SANDBOX_SPL_CAPABILITY_STATE;
  if (['google_api_key', 'dispatch_token', 'bucket', 'broker_token', 'served_model_id', 'credential']
    .includes(fieldName)) {
    options.nonempty = true;
    options.trimmed = true;
  }
  if (fieldName === 'prefix') options.nonempty = true;
  return options;
}

const capabilityDescriptors = Object.fromEntries(SANDBOX_CAPABILITIES_KEYS.map((name) => [
  name,
  {
    fields: fields(SANDBOX_CAPABILITY_KEYS[name], Object.fromEntries(
      SANDBOX_CAPABILITY_KEYS[name].map((fieldName) => [fieldName, capabilityFieldOptions(fieldName)])
    )),
  },
]));

export const SANDBOX_RUN_CONTRACT = deepFreeze({
  generated_by: 'account/scripts/generate-sandbox-run-contract.mjs',
  source: 'account/src/sandbox-run-contract.js',
  contract_version: SANDBOX_CONTRACT_VERSION,
  profile: SANDBOX_PROFILE,
  lease: {
    duration_ms: SANDBOX_LEASE_TTL_MS,
    live_when: 'status-active-and-now-before-expiry',
  },
  identifier_format: {
    type: 'string',
    pattern: UUID_RE.source,
    case_insensitive: UUID_RE.flags.includes('i'),
    normalization: 'none',
  },
  vocabularies: {
    run_statuses: SANDBOX_RUN_STATUSES,
    provisioning_phases: SANDBOX_PROVISIONING_PHASES,
    cleanup_phases: SANDBOX_CLEANUP_PHASES,
    component_states: SANDBOX_COMPONENT_STATES,
    component_residual_codes: SANDBOX_COMPONENT_RESIDUAL_CODES,
    last_residual_codes: SANDBOX_LAST_RESIDUAL_CODES,
  },
  components: SANDBOX_COMPONENTS.map((component) => ({
    name: component.name,
    report_fields: fields(SANDBOX_COMPONENT_REPORT_KEYS, {
      component: { type: 'component-name' },
      state: { type: 'component-state' },
      residual_code: { type: 'component-residual', nullable: true },
      updated_at: { type: 'integer-epoch-milliseconds', safe_integer: true },
    }),
  })),
  requests: {
    create: {
      fields: fields(SANDBOX_CREATE_REQUEST_KEYS, {
        contract_version: { type: 'integer', fixed: SANDBOX_CONTRACT_VERSION },
        instance_id: { type: 'uuid' },
        profile: { type: 'string', fixed: SANDBOX_PROFILE },
        run_id: { type: 'uuid' },
      }),
    },
  },
  responses: {
    create: {
      status: 201,
      fields: fields(SANDBOX_CREATE_RESPONSE_KEYS, {
        run_id: { type: 'uuid' },
        contract_version: { type: 'integer', fixed: SANDBOX_CONTRACT_VERSION },
        profile: { type: 'string', fixed: SANDBOX_PROFILE },
        lease_expires_at: { type: 'integer-epoch-milliseconds', safe_integer: true },
        capabilities: { type: 'capability-object' },
      }),
      capabilities: capabilityDescriptors,
      relationships: SANDBOX_CREATE_RESPONSE_RELATIONSHIPS,
    },
    report: {
      statuses: [200, 202],
      fields: fields(SANDBOX_REPORT_KEYS, {
        run_id: { type: 'uuid' },
        contract_version: { type: 'integer', fixed: SANDBOX_CONTRACT_VERSION },
        profile: { type: 'string', fixed: SANDBOX_PROFILE },
        status: { type: 'run-status' },
        provisioning_phase: { type: 'provisioning-phase' },
        cleanup_phase: { type: 'cleanup-phase', nullable: true },
        lease_expires_at: { type: 'integer-epoch-milliseconds', safe_integer: true },
        lease_live: { type: 'boolean' },
        retry_after_seconds: {
          type: 'integer-seconds',
          nullable: true,
          safe_integer: true,
          minimum: 1,
          maximum: null,
        },
        components: { type: 'ordered-component-array' },
      }),
    },
  },
  report_rules: {
    lease_live: {
      true_iff: {
        status: SANDBOX_RUN_STATUS.ACTIVE,
        now_epoch_milliseconds: { less_than_field: 'lease_expires_at' },
      },
    },
    expired_active_component_projection: {
      when: {
        stored_run_status: SANDBOX_RUN_STATUS.ACTIVE,
        stored_component_state: SANDBOX_COMPONENT_STATE.ACTIVE,
        lease_live: false,
      },
      report: {
        state: SANDBOX_COMPONENT_STATE.DENY_PENDING,
        residual_code: SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
      },
      mutates_storage: false,
    },
    delete_accepted_expiry_only: {
      response_status: 202,
      report_status: SANDBOX_RUN_STATUS.EXPIRY_PENDING,
      retry_after_seconds: { type: 'positive-safe-integer', maximum: null },
      retry_after_header: { name: 'Retry-After', decimal_equals_field: 'retry_after_seconds' },
      components: {
        dispatch: { state: SANDBOX_COMPONENT_STATE.RELEASED, residual_code: null },
        spp: { state: SANDBOX_COMPONENT_STATE.RELEASED, residual_code: null },
        spb: {
          state: SANDBOX_COMPONENT_STATE.PURGE_PENDING,
          residual_code: SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
        },
        spl_relay: { state: SANDBOX_COMPONENT_STATE.RELEASED, residual_code: null },
        spl_binding: { state: SANDBOX_COMPONENT_STATE.RELEASED, residual_code: null },
      },
    },
  },
  errors: {
    sandbox: Object.fromEntries(Object.entries(SANDBOX_ERROR).map(([name, descriptor]) => [
      name.toLowerCase(),
      {
        status: descriptor.status,
        body: fields(descriptor.fields, Object.fromEntries(descriptor.fields.map((fieldName) => [
          fieldName,
          fieldName === 'run_id'
            ? { type: 'uuid' }
            : { type: 'string', fixed: descriptor[fieldName] },
        ]))),
      },
    ])),
    outer_admin: Object.fromEntries(Object.entries(SANDBOX_OUTER_ADMIN_ENVELOPE)
      .map(([name, descriptor]) => [
        name.toLowerCase(),
        {
          status: descriptor.status,
          body: fields(descriptor.fields, {
            error: { type: 'string', fixed: descriptor.error },
          }),
        },
      ])),
  },
  headers: {
    success_and_sandbox_errors: SANDBOX_RESPONSE_HEADER_DESCRIPTORS,
    delete_accepted_addition: { name: 'Retry-After', type: 'decimal-integer-seconds' },
  },
  routes: {
    contract: { method: 'GET', path: '/admin/sandbox-runs/contract', query: 'must-be-empty', status: 200 },
    collection: { method: 'POST', path: '/admin/sandbox-runs' },
    member: { methods: ['GET', 'DELETE'], path: '/admin/sandbox-runs/{run_id}' },
    head: { behavior: 'global-get-mirror-with-empty-body' },
  },
  operations: {
    common_access: {
      required_before_route_resolution: true,
      failure: 'errors.outer_admin.access_required',
    },
    contract_get: {
      method: 'GET',
      path: '/admin/sandbox-runs/contract',
      query: 'must-be-empty',
      success: { status: 200, body: 'this-artifact' },
      non_exact_route: 'errors.outer_admin.not_found',
    },
    create: {
      method: 'POST',
      path: '/admin/sandbox-runs',
      success: { status: 201, body: 'responses.create' },
      response_identity: SANDBOX_CREATE_OPERATION_IDENTITY,
      errors: {
        invalid_request: 'errors.sandbox.invalid_request',
        conflict: 'errors.sandbox.conflict',
        unavailable: 'errors.sandbox.unavailable',
      },
    },
    report_get: {
      method: 'GET',
      path: '/admin/sandbox-runs/{run_id}',
      success: { status: 200, body: 'responses.report' },
      absent: 'errors.sandbox.not_found',
      unavailable: 'errors.sandbox.unavailable',
    },
    cleanup_delete: {
      method: 'DELETE',
      path: '/admin/sandbox-runs/{run_id}',
      success: {
        released: { status: 200, body: 'responses.report' },
        expiry_only: { status: 202, body: 'responses.report' },
      },
      absent: 'errors.outer_admin.not_found',
      errors: {
        initial_unavailable: 'errors.sandbox.unavailable',
        conflict: 'errors.sandbox.cleanup_conflict',
        cleanup_unavailable: 'errors.sandbox.cleanup_unavailable',
      },
    },
    head: { behavior: 'global-get-mirror-with-empty-body' },
  },
});

export function serializeSandboxRunContract(contract = SANDBOX_RUN_CONTRACT) {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

export const SANDBOX_RUN_CONTRACT_JSON = serializeSandboxRunContract();
