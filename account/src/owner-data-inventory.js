const ASSOCIATIONS = Object.freeze([
  'account_primary_key',
  'account_id',
  'verified_email_derived',
  'derived_rate_key',
  'operation_id',
  'status_token',
  'globally_identifier_free',
  'transient_unassociated',
]);

const DELETION_TREATMENTS = Object.freeze([
  'direct_owner_purge',
  'derived_key_purge',
  'terminal_sanitizing_operation',
  'deliberately_retained',
  'transient_cleanup',
]);

const EXPORT_TREATMENTS = Object.freeze([
  'exportable',
  'transient_auth_rate',
  'deletion_machinery',
  'retained_only',
  'unassociated',
]);

const COLUMN_TREATMENTS = Object.freeze([
  'exported',
  'secret_auth',
  'transient_deletion',
  'non_owner_identity',
  'retained_only',
]);

function exported(name, transform = 'identity', semantics = 'value', publicName = name) {
  return { name, treatment: 'exported', publicName, transform, semantics };
}

function omitted(name, reason, treatment = 'secret_auth') {
  return { name, treatment, reason };
}

function retained(name, reason) {
  return omitted(name, reason, 'retained_only');
}

function table(name, association, deletion, exportTreatment, columns, options = {}) {
  return {
    name,
    association,
    deletion,
    exportTreatment,
    description: options.description || name.replaceAll('_', ' '),
    deletionOrder: options.deletionOrder ?? null,
    retainedMechanics: options.retainedMechanics || null,
    columns,
  };
}

const TABLES = [
  table('accounts', 'account_primary_key', 'direct_owner_purge', 'exportable', [
    exported('id', 'identity', 'stable identifier', 'account_id'),
    omitted('primary_email_id', 'internal relation key'),
    omitted('passkey_user_handle', 'authentication material'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_signin_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 230, description: 'your solstone services sign-in' }),
  table('account_emails', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('id'), omitted('account_id', 'internal owner relation'),
    exported('address_encrypted', 'decrypt_email', 'encrypted at rest', 'address'),
    omitted('address_lower_hash', 'lookup hash'),
    exported('is_primary', 'sqlite_boolean', 'boolean'),
    exported('verified_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    omitted('verification_code_hash', 'authentication material'),
    omitted('verification_expires_at', 'transient verification state', 'transient_deletion'),
    omitted('verification_attempts', 'transient verification state', 'transient_deletion'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 220, description: 'email addresses attached to your sign-in' }),
  table('sessions', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('id_hash', 'session authentication hash'), omitted('account_id', 'internal owner relation'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('expires_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_active_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('revoked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_ip_encrypted', 'decrypt_truncate_ip', 'encrypted at rest; shortened for display', 'network_address'),
    exported('last_user_agent', 'ua_label', 'device and browser label', 'device'),
  ], { deletionOrder: 60, description: 'sign-in sessions, including revoked sessions' }),
  table('rate_buckets', 'derived_rate_key', 'derived_key_purge', 'transient_auth_rate', [
    omitted('key', 'derived rate-limit key'), omitted('count', 'transient rate state', 'transient_deletion'),
    omitted('window_start', 'transient rate state', 'transient_deletion'),
  ], { description: 'transient rate limits' }),
  table('otp_tokens', 'verified_email_derived', 'derived_key_purge', 'transient_auth_rate', [
    omitted('email_lower_hash', 'email lookup hash'), omitted('email_lower', 'transient sign-in input'),
    omitted('code_hash', 'authentication material'), omitted('expires_at', 'transient authentication state', 'transient_deletion'),
    omitted('attempts', 'transient authentication state', 'transient_deletion'),
    omitted('consumed', 'transient authentication state', 'transient_deletion'),
    omitted('started_at', 'transient authentication state', 'transient_deletion'),
  ], { description: 'transient email sign-in codes' }),
  table('passkey_credentials', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('credential_id', 'authentication credential identifier'), omitted('account_id', 'internal owner relation'),
    omitted('public_key', 'authentication material'), omitted('counter', 'authentication replay state'),
    omitted('aaguid', 'authenticator fingerprint'), omitted('transports', 'authentication transport metadata'),
    omitted('backup_eligible', 'authentication capability metadata'), omitted('backup_state', 'authentication capability metadata'),
    exported('device_type'), exported('friendly_name', 'identity', 'owner-assigned label', 'name'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_used_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('revoked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 80, description: 'passkeys, including revoked passkeys' }),
  table('passkey_challenges', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('challenge', 'authentication challenge'), omitted('account_id', 'internal owner relation'),
    omitted('purpose', 'transient authentication state', 'transient_deletion'),
    omitted('created_at', 'transient authentication state', 'transient_deletion'),
    omitted('expires_at', 'transient authentication state', 'transient_deletion'),
    omitted('used_at', 'transient authentication state', 'transient_deletion'),
  ], { deletionOrder: 70, description: 'transient passkey challenges' }),
  table('account_devices', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('device_id'), omitted('account_id', 'internal owner relation'), exported('platform'),
    omitted('push_token', 'notification authentication material'), omitted('push_token_env', 'notification routing secret context'),
    exported('bundle_id'), exported('device_label'), exported('app_version'),
    omitted('device_pubkey', 'reserved authentication material'), omitted('device_pubkey_alg', 'reserved authentication material'),
    exported('registered_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_seen_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('revoked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 90, description: 'devices registered for notifications' }),
  table('account_dispatch_tokens', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('token_hash', 'authentication hash'), omitted('account_id', 'internal owner relation'),
    omitted('created_at', 'transient authentication state', 'transient_deletion'),
    omitted('revoked_at', 'transient authentication state', 'transient_deletion'),
  ], { deletionOrder: 50, description: 'transient device dispatch tokens' }),
  table('service_handoffs', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('handoff_hash', 'authentication hash'), omitted('account_id', 'internal owner relation'),
    omitted('service', 'transient handoff state', 'transient_deletion'), omitted('payload_encrypted', 'encrypted handoff credential'),
    omitted('created_at', 'transient handoff state', 'transient_deletion'), omitted('expires_at', 'transient handoff state', 'transient_deletion'),
    omitted('consumed_at', 'transient handoff state', 'transient_deletion'),
  ], { deletionOrder: 40, description: 'transient service handoffs' }),
  table('scout_applications', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('status'), exported('use_case'),
    exported('data_acked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('applied_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('approved_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('revoked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('updated_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 200, description: 'your scout application' }),
  table('scout_lifecycle_events', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('correlation_id'), omitted('account_id', 'internal owner relation'), exported('sequence'),
    exported('action'), exported('from_status'), exported('to_status'), exported('actor_kind'),
    omitted('actor_principal', 'operator, service, or internal owner identifier', 'non_owner_identity'),
    exported('reason_code'), exported('occurred_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 190, description: 'scout application history' }),
  table('enable_scout_codes', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('code_hash', 'authentication hash'), omitted('nonce_hash', 'authentication hash'),
    omitted('account_id', 'internal owner relation'), omitted('created_at', 'transient authentication state', 'transient_deletion'),
    omitted('expires_at', 'transient authentication state', 'transient_deletion'), omitted('consumed_at', 'transient authentication state', 'transient_deletion'),
    omitted('ip_hash', 'network-address hash'),
  ], { deletionOrder: 210, description: 'retired transient scout enable codes' }),
  table('entitlements', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('service'), exported('status'),
    exported('current_period_end', 'epoch_s_to_iso', 'seconds since Unix epoch'), exported('source'),
    exported('source_ref'), exported('enabled_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('updated_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 170, description: 'service entitlements' }),
  table('stripe_customers', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('stripe_customer_id', 'identity', 'Stripe customer reference'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 180, description: 'local Stripe customer reference' }),
  table('spl_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_seen_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 150, description: 'private network instance bindings' }),
  table('mcp_bridge_hostname_ledger', 'globally_identifier_free', 'deliberately_retained', 'retained_only', [
    retained('label', 'permanent hostname reservation with no account join after deletion'),
    retained('created_at', 'reservation creation time remains with the permanent label'),
  ], {
    description: 'hostname reservations kept after deletion so an old address cannot be reassigned',
    retainedMechanics: {
      account_join: false,
      owner_bindings_table: 'mcp_bridge_bindings',
      deletion_treatment: 'direct_owner_purge',
    },
  }),
  table('mcp_bridge_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'), exported('label'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 160, description: 'live MCP hostname bindings' }),
  table('spb_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_seen_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    omitted('token_hash', 'broker authentication hash'),
    exported('lapsed_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
  ], { deletionOrder: 130, description: 'encrypted backup bindings' }),
  table('spb_retired_tokens', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('token_hash', 'retired broker authentication hash'), omitted('account_id', 'internal owner relation'),
    omitted('instance_id', 'retired authentication coordinate'), omitted('retired_at', 'transient authentication state', 'transient_deletion'),
  ], { deletionOrder: 100, description: 'retired backup authentication tokens' }),
  table('account_deletions', 'operation_id', 'terminal_sanitizing_operation', 'deletion_machinery', [
    retained('operation_id', 'retained deletion operation identifier'), omitted('account_id', 'cleared at completion', 'transient_deletion'),
    retained('phase', 'retained terminal deletion disposition'), retained('requested_at', 'retained deletion request time'),
    retained('frozen_at', 'retained freeze time'), retained('cancellation_deadline_at', 'retained cancellation boundary'),
    retained('next_attempt_at', 'retained last scheduling coordinate'), retained('attempt_count', 'retained attempt count'),
    omitted('lease_token', 'cleared at completion', 'transient_deletion'), omitted('lease_expires_at', 'cleared at completion', 'transient_deletion'),
    omitted('snapshot_encrypted', 'cleared at completion', 'transient_deletion'), omitted('snapshot_digest', 'cleared at completion', 'transient_deletion'),
    retained('backup_safe_after', 'retained backup safety observation'), retained('backup_empty_verified_at', 'retained backup-empty observation'),
    omitted('status_token_hash', 'cleared at completion', 'transient_deletion'), retained('completed_at', 'retained completion time'),
    retained('cancelled_at', 'retained cancellation time'), retained('last_error_code', 'retained last bounded error category'),
    retained('last_error_at', 'retained last error time'), retained('stripe_purge_state', 'retained billing deletion disposition'),
    retained('stripe_purge_attempted_at', 'retained billing deletion attempt time'),
  ], {
    description: 'completed deletion record kept without an automatic expiry after identifying and recovery fields are cleared',
    retainedMechanics: { has_expires_at: false, phase_on_complete: 'complete' },
  }),
  table('account_deletion_proofs', 'account_id', 'direct_owner_purge', 'deletion_machinery', [
    omitted('token_hash', 'proof authentication hash'), omitted('account_id', 'internal owner relation'),
    omitted('session_id_hash', 'session authentication hash'), omitted('purpose', 'transient proof state', 'transient_deletion'),
    omitted('method', 'transient proof state', 'transient_deletion'), omitted('issued_at', 'transient proof state', 'transient_deletion'),
    omitted('expires_at', 'transient proof state', 'transient_deletion'), omitted('verified', 'transient proof state', 'transient_deletion'),
    omitted('consumed', 'transient proof state', 'transient_deletion'), omitted('attempt_count', 'transient proof state', 'transient_deletion'),
    omitted('otp_code_hash', 'proof authentication hash'), omitted('passkey_challenge', 'proof authentication challenge'),
  ], { deletionOrder: 20, description: 'transient deletion and export proofs' }),
  table('account_deletion_service_ops', 'operation_id', 'transient_cleanup', 'deletion_machinery', [
    omitted('id', 'deletion machinery', 'transient_deletion'), omitted('operation_id', 'deletion machinery', 'transient_deletion'),
    omitted('service', 'deletion machinery', 'transient_deletion'), omitted('service_operation_id', 'deletion machinery', 'transient_deletion'),
    omitted('request_digest', 'deletion integrity digest'), omitted('key_version', 'deletion machinery', 'transient_deletion'),
    omitted('envelope_issued_at', 'deletion machinery', 'transient_deletion'), omitted('state', 'deletion machinery', 'transient_deletion'),
    omitted('envelope_expires_at', 'deletion machinery', 'transient_deletion'), omitted('next_attempt_at', 'deletion machinery', 'transient_deletion'),
    omitted('attempt_count', 'deletion machinery', 'transient_deletion'),
  ], { description: 'transient peer deletion operations' }),
  table('spb_mint_reservations', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('id', 'broker reservation identifier'), omitted('account_id', 'internal owner relation'),
    omitted('instance_id', 'broker reservation coordinate'), omitted('scope', 'broker authorization scope'),
    omitted('reserved_expires_at', 'transient broker state', 'transient_deletion'), omitted('state', 'transient broker state', 'transient_deletion'),
    omitted('created_at', 'transient broker state', 'transient_deletion'),
  ], { deletionOrder: 30, description: 'transient backup credential reservations' }),
  table('account_deletion_completions', 'status_token', 'deliberately_retained', 'retained_only', [
    retained('token_hash', 'identifier-free completion verifier'), retained('state', 'terminal completion state'),
    retained('completed_at', 'completion time'), retained('expires_at', 'minimum confirmed relay/support envelope expiry'),
  ], {
    description: 'identifier-free deletion receipt kept only until its recorded expiry',
    retainedMechanics: {
      expires_at_rule: 'min_relay_support_envelope_expires_at',
      sweep: 'delete_where_expires_at_lte_now',
    },
  }),
  table('spp_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'), omitted('token_hash', 'broker authentication hash'),
    exported('created_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('last_seen_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'),
    exported('consent_acked_at', 'epoch_ms_to_iso', 'milliseconds since Unix epoch'), exported('consent_disclosure_version'),
  ], { deletionOrder: 140, description: 'confidential processing bindings' }),
  table('spb_mint_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'), omitted('prefix', 'broker storage coordinate'),
    exported('scope'), exported('ttl', 'identity', 'seconds'), exported('outcome'),
    exported('ts', 'epoch_ms_to_iso', 'milliseconds since Unix epoch', 'occurred_at'),
  ], { deletionOrder: 110, description: 'encrypted backup credential history' }),
  table('spp_mint_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'), exported('scope'), exported('outcome'),
    exported('ts', 'epoch_ms_to_iso', 'milliseconds since Unix epoch', 'occurred_at'),
  ], { deletionOrder: 120, description: 'confidential processing authorization history' }),
  table('spb_sweep_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', 'internal owner relation'), exported('instance_id'), omitted('prefix', 'broker storage coordinate'),
    exported('objects_deleted'), exported('multipart_aborted'),
    exported('ts', 'epoch_ms_to_iso', 'milliseconds since Unix epoch', 'occurred_at'),
  ], { deletionOrder: 125, description: 'encrypted backup cleanup history' }),
];

export const RATE_BUCKET_FAMILIES = deepFreeze([
  { scope: 'signin_email', association: 'verified_email_derived', deletion: 'derived_key_purge' },
  { scope: 'signin_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'add_email_per_day', association: 'account_id', deletion: 'derived_key_purge' },
  { scope: 'passkey_auth_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'passkey_register_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'passkey_register_account', association: 'account_id', deletion: 'derived_key_purge' },
  ...['delete_proof', 'export_proof'].flatMap((purpose) => ['otp', 'passkey'].flatMap((method) => [
    { scope: `${purpose}_${method}_account`, association: 'account_id', deletion: 'derived_key_purge' },
    { scope: `${purpose}_${method}_ip`, association: 'transient_unassociated', deletion: 'transient_cleanup' },
  ])),
]);

export const OWNER_DATA_INVENTORY = deepFreeze(TABLES);
export const OWNER_DATA_ENUMS = deepFreeze({
  associations: ASSOCIATIONS,
  deletionTreatments: DELETION_TREATMENTS,
  exportTreatments: EXPORT_TREATMENTS,
  columnTreatments: COLUMN_TREATMENTS,
});

export function ownerDeletionPlan() {
  const direct = OWNER_DATA_INVENTORY
    .filter((entry) => entry.deletion === 'direct_owner_purge' && entry.deletionOrder != null)
    .sort((left, right) => left.deletionOrder - right.deletionOrder)
    .map((entry) => ({ kind: entry.association === 'account_primary_key' ? 'account_primary_key' : 'account_id', table: entry.name }));
  return Object.freeze([
    Object.freeze({ kind: 'operation_id', table: 'account_deletion_service_ops' }),
    ...direct.map(Object.freeze),
    Object.freeze({ kind: 'verified_email_derived', table: 'otp_tokens' }),
    Object.freeze({ kind: 'derived_rate_key', table: 'rate_buckets' }),
    Object.freeze({ kind: 'cancelled_deletions', table: 'account_deletions' }),
    Object.freeze({ kind: 'completion_insert', table: 'account_deletion_completions' }),
    Object.freeze({ kind: 'deletion_sanitize', table: 'account_deletions' }),
  ]);
}

export function rateBucketFamily(scope) {
  const family = RATE_BUCKET_FAMILIES.find((entry) => entry.scope === scope);
  if (!family) throw new Error(`unknown rate bucket family: ${scope}`);
  return family;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
