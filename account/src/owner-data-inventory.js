import { t } from '../../i18n/account.mjs';

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

// A table's `description` is owner-facing copy: the download prints it for each class and the
// data transparency page uses it as the section label. Edit it as product copy (voice-checked).
const TABLES = [
  table('accounts', 'account_primary_key', 'direct_owner_purge', 'exportable', [
    exported('id', 'identity', t('account.transparency.stableidentifier'), 'account_id'),
    omitted('primary_email_id', t('account.transparency.internalrelationkey')),
    omitted('passkey_user_handle', t('account.transparency.authenticationmaterial')),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_signin_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    omitted('test_identity', t('account.transparency.operatormarkerforsolpbctestsign')),
  ], { deletionOrder: 230, description: t('account.transparency.yoursolstoneservicessignin') }),
  table('account_emails', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('id'), omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('address_encrypted', 'decrypt_email', t('account.transparency.encryptedatrest'), 'address'),
    omitted('address_lower_hash', t('account.transparency.lookuphash')),
    exported('is_primary', 'sqlite_boolean', t('account.transparency.boolean')),
    exported('verified_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    omitted('verification_code_hash', t('account.transparency.authenticationmaterial')),
    omitted('verification_expires_at', t('account.transparency.transientverificationstate'), 'transient_deletion'),
    omitted('verification_attempts', t('account.transparency.transientverificationstate'), 'transient_deletion'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 220, description: t('account.transparency.emailaddressesattachedyoursignin') }),
  table('sessions', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('id_hash', t('account.transparency.sessionauthenticationhash')), omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('expires_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_active_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('revoked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_ip_encrypted', 'decrypt_truncate_ip', t('account.transparency.encryptedatrestshortenedfordisplay'), 'network_address'),
    exported('last_user_agent', 'ua_label', t('account.transparency.deviceandbrowserlabel'), 'device'),
    exported('operator_label', 'identity', t('account.transparency.operatorsessionlabel'), 'operator_label'),
  ], { deletionOrder: 60, description: t('account.transparency.signinsessionsincludingrevokedsessions') }),
  table('rate_buckets', 'derived_rate_key', 'derived_key_purge', 'transient_auth_rate', [
    omitted('key', t('account.transparency.derivedratelimitkey')), omitted('count', t('account.transparency.transientratestate'), 'transient_deletion'),
    omitted('window_start', t('account.transparency.transientratestate'), 'transient_deletion'),
  ], { description: t('account.transparency.transientratelimits') }),
  table('otp_tokens', 'verified_email_derived', 'derived_key_purge', 'transient_auth_rate', [
    omitted('email_lower_hash', t('account.transparency.emaillookuphash')),
    omitted('code_hash', t('account.transparency.authenticationmaterial')), omitted('expires_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('attempts', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('consumed', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('started_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
  ], { description: t('account.transparency.transientemailsignincodes') }),
  table('passkey_credentials', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('credential_id', t('account.transparency.authenticationcredentialidentifier')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('public_key', t('account.transparency.authenticationmaterial')), omitted('counter', t('account.transparency.authenticationreplaystate')),
    omitted('aaguid', t('account.transparency.authenticatorfingerprint')), omitted('transports', t('account.transparency.authenticationtransportmetadata')),
    omitted('backup_eligible', t('account.transparency.authenticationcapabilitymetadata')), omitted('backup_state', t('account.transparency.authenticationcapabilitymetadata')),
    exported('device_type'),
    exported('friendly_name', 'passkey_label', t('account.transparency.nameyougavethispasskeyorits'), 'name'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_used_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('revoked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 80, description: t('account.transparency.passkeysincludingrevokedpasskeys') }),
  table('passkey_challenges', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('challenge', t('account.transparency.authenticationchallenge')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('purpose', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('created_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('expires_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('used_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
  ], { deletionOrder: 70, description: t('account.transparency.transientpasskeychallenges') }),
  table('account_dispatch_tokens', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('token_hash', t('account.transparency.authenticationhash')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('created_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('revoked_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
  ], { deletionOrder: 50, description: t('account.transparency.transientdevicedispatchtokens') }),
  table('service_handoffs', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('handoff_hash', t('account.transparency.authenticationhash')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('service', t('account.transparency.transienthandoffstate'), 'transient_deletion'), omitted('payload_encrypted', t('account.transparency.encryptedhandoffcredential')),
    omitted('created_at', t('account.transparency.transienthandoffstate'), 'transient_deletion'), omitted('expires_at', t('account.transparency.transienthandoffstate'), 'transient_deletion'),
    omitted('consumed_at', t('account.transparency.transienthandoffstate'), 'transient_deletion'),
  ], { deletionOrder: 40, description: t('account.transparency.transientservicehandoffs') }),
  table('scout_applications', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('status'), exported('use_case'),
    exported('data_acked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('applied_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('approved_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('revoked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('updated_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 200, description: t('account.transparency.yourscoutapplication') }),
  table('scout_lifecycle_events', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('correlation_id'), omitted('account_id', t('account.transparency.internalownerrelation')), exported('sequence'),
    exported('action'), exported('from_status'), exported('to_status'), exported('actor_kind'),
    omitted('actor_principal', t('account.transparency.operatorserviceorinternalowneridentifier'), 'non_owner_identity'),
    exported('reason_code'), exported('occurred_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 190, description: t('account.transparency.historyyourscoutstatus') }),
  table('enable_scout_codes', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('code_hash', t('account.transparency.authenticationhash')), omitted('nonce_hash', t('account.transparency.authenticationhash')),
    omitted('account_id', t('account.transparency.internalownerrelation')), omitted('created_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('expires_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'), omitted('consumed_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
    omitted('ip_hash', t('account.transparency.networkaddresshash')),
  ], { deletionOrder: 210, description: t('account.transparency.retiredtransientscoutenablecodes') }),
  table('entitlements', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('service'), exported('status'),
    exported('current_period_end', 'epoch_s_to_iso', t('account.transparency.secondssinceunixepoch')), exported('source'),
    exported('source_ref'), exported('cancel_at_period_end'),
    exported('enabled_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('updated_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 170, description: t('account.transparency.yourservicesandtheirstatus') }),
  table('renewal_notices', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('kind'),
    exported('service'),
    exported('renewal_at', 'identity', t('account.transparency.secondssinceunixepochorsentinel0')),
    exported('content_key'),
    exported('subject'),
    exported('body'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 175, description: t('account.transparency.renewalnoticessentyou') }),
  table('subscription_withdrawals', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('subscription_ref', 'identity', t('account.transparency.stripesubscriptionreference')),
    omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('service'),
    exported('purchased_at', 'epoch_s_to_iso', t('account.transparency.secondssinceunixepoch')),
    exported('submitted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('completed_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('acknowledged_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('failure_alerted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('stuck_alerted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 176, description: t('account.transparency.subscriptionsyouwithdrewfromwithin14days') }),
  table('subscription_start_requests', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('checkout_session_ref', 'identity', t('account.transparency.stripecheckoutreference')),
    omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('service'),
    exported('requested_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('subscription_ref', 'identity', t('account.transparency.stripesubscriptionreference')),
  ], { deletionOrder: 177, description: t('account.transparency.whenyouaskedforservicestartright') }),
  table('subscription_cancellations', 'account_id', 'direct_owner_purge', 'exportable', [
    exported('subscription_ref', 'identity', t('account.transparency.stripesubscriptionreference')),
    exported('issued_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    omitted('account_id', t('account.transparency.internalownerrelation')),
    exported('service'),
    exported('cause', 'sqlite_boolean', t('account.transparency.whetheritwasacancelforaseriousreason')),
    exported('ends_today', 'sqlite_boolean', t('account.transparency.whetheritendedthesubscriptionthedayitwasmade')),
    exported('ends_at', 'epoch_s_to_iso', t('account.transparency.secondssinceunixepoch')),
    exported('at_period_end', 'sqlite_boolean', t('account.transparency.whetheritendsattheendofthepaidperiod')),
    exported('refund_invoice_ref', 'identity', t('account.transparency.stripeinvoicereference')),
    exported('refund_amount', 'identity', t('account.transparency.centstaxincluded')),
    exported('refund_months', 'identity', t('account.transparency.wholemonthsrefunded')),
    exported('window_at', 'epoch_s_to_iso', t('account.transparency.secondssinceunixepoch')),
    exported('submitted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('refunded_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('completed_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('acknowledged_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('failure_alerted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('stuck_alerted_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 178, description: t('account.transparency.cancellationsyoudeclared') }),
  table('stripe_customers', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('stripe_customer_id', 'identity', t('account.transparency.stripecustomerreference')),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 180, description: t('account.transparency.yourcustomerreferenceatstripeourpayment') }),
  table('spl_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_seen_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 150, description: t('account.transparency.journalsconnectedprivatenetwork') }),
  table('mcp_bridge_hostname_ledger', 'globally_identifier_free', 'deliberately_retained', 'retained_only', [
    retained('label', t('account.transparency.permanenthostnamereservationwithnoaccountjoin')),
    retained('created_at', t('account.transparency.reservationcreationtimeremainswithpermanentlabel')),
  ], {
    description: t('account.transparency.hostnamereservationskeptafterdeletionsoan'),
    retainedMechanics: {
      account_join: false,
      owner_bindings_table: 'mcp_bridge_bindings',
      deletion_treatment: 'direct_owner_purge',
    },
  }),
  table('subscription_created_claims', 'globally_identifier_free', 'deliberately_retained', 'retained_only', [
    retained('claim_key', t('account.transparency.peppereddigestthatsuppressesduplicatesend')),
    retained('created_at', t('account.transparency.millisecondsclaimnotanexpiry')),
  ], {
    description: t('account.transparency.atmostonceclaimsforidentityfree'),
  }),
  table('solstone_me_dns_capacity_alerts', 'globally_identifier_free', 'deliberately_retained', 'retained_only', [
    retained('slot', t('account.transparency.singlecapacityslotwithnoaccountid')),
    retained('alerted_at', t('account.transparency.timestamplastcapacityalertwithnoaccount')),
  ], {
    description: t('account.transparency.atmostoncealertsforsolstoneme'),
  }),
  table('mcp_bridge_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'), exported('label'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('acme_account_uri', 'identity'),
    exported('acme_account_pinned_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('acme_account_replaced_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    omitted('dns_lease_generation', t('account.transparency.transientdnsleasestate')),
    omitted('dns_lease_expires_at', t('account.transparency.transientdnsleasestate')),
    omitted('dns_verification_state', t('account.transparency.operationaldnsverificationstate')),
    omitted('dns_verified_at', t('account.transparency.operationaldnsverificationstate')),
    omitted('dns_verified_uri', t('account.transparency.operationaldnsverificationstate')),
    omitted('dns_verified_addresses', t('account.transparency.operationaldnsverificationstate')),
  ], { deletionOrder: 160, description: t('account.transparency.solstonemeaddressheldforeachjournal') }),
  table('spb_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_seen_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    omitted('token_hash', t('account.transparency.brokerauthenticationhash')),
    exported('lapsed_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 130, description: t('account.transparency.journalsconnectedencryptedbackup') }),
  table('spb_retired_tokens', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('token_hash', t('account.transparency.retiredbrokerauthenticationhash')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('instance_id', t('account.transparency.retiredauthenticationcoordinate')), omitted('retired_at', t('account.transparency.transientauthenticationstate'), 'transient_deletion'),
  ], { deletionOrder: 100, description: t('account.transparency.retiredbackupauthenticationtokens') }),
  table('account_deletions', 'operation_id', 'terminal_sanitizing_operation', 'deletion_machinery', [
    retained('operation_id', t('account.transparency.retaineddeletionoperationidentifier')), omitted('account_id', t('account.transparency.clearedatcompletion'), 'transient_deletion'),
    retained('phase', t('account.transparency.retainedterminaldeletiondisposition')), retained('requested_at', t('account.transparency.retaineddeletionrequesttime')),
    retained('frozen_at', t('account.transparency.retainedfreezetime')), retained('cancellation_deadline_at', t('account.transparency.retainedcancellationboundary')),
    retained('next_attempt_at', t('account.transparency.retainedlastschedulingcoordinate')), retained('attempt_count', t('account.transparency.retainedattemptcount')),
    omitted('lease_token', t('account.transparency.clearedatcompletion'), 'transient_deletion'), omitted('lease_expires_at', t('account.transparency.clearedatcompletion'), 'transient_deletion'),
    omitted('snapshot_encrypted', t('account.transparency.clearedatcompletion'), 'transient_deletion'), omitted('snapshot_digest', t('account.transparency.clearedatcompletion'), 'transient_deletion'),
    retained('backup_safe_after', t('account.transparency.retainedbackupsafetyobservation')), retained('backup_empty_verified_at', t('account.transparency.retainedbackupemptyobservation')),
    omitted('status_token_hash', t('account.transparency.clearedatcompletion'), 'transient_deletion'), retained('completed_at', t('account.transparency.retainedcompletiontime')),
    retained('cancelled_at', t('account.transparency.retainedcancellationtime')), retained('last_error_code', t('account.transparency.retainedlastboundederrorcategory')),
    retained('last_error_at', t('account.transparency.retainedlasterrortime')), retained('stripe_purge_state', t('account.transparency.retainedbillingdeletiondisposition')),
    retained('stripe_purge_attempted_at', t('account.transparency.retainedbillingdeletionattempttime')),
  ], {
    description: t('account.transparency.completeddeletionrecordkeptwithoutanautomatic'),
    retainedMechanics: { has_expires_at: false, phase_on_complete: 'complete' },
  }),
  table('account_deletion_proofs', 'account_id', 'direct_owner_purge', 'deletion_machinery', [
    omitted('token_hash', t('account.transparency.proofauthenticationhash')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('session_id_hash', t('account.transparency.sessionauthenticationhash')), omitted('purpose', t('account.transparency.transientproofstate'), 'transient_deletion'),
    omitted('method', t('account.transparency.transientproofstate'), 'transient_deletion'), omitted('issued_at', t('account.transparency.transientproofstate'), 'transient_deletion'),
    omitted('expires_at', t('account.transparency.transientproofstate'), 'transient_deletion'), omitted('verified', t('account.transparency.transientproofstate'), 'transient_deletion'),
    omitted('consumed', t('account.transparency.transientproofstate'), 'transient_deletion'), omitted('attempt_count', t('account.transparency.transientproofstate'), 'transient_deletion'),
    omitted('otp_code_hash', t('account.transparency.proofauthenticationhash')), omitted('passkey_challenge', t('account.transparency.proofauthenticationchallenge')),
  ], { deletionOrder: 20, description: t('account.transparency.transientdeletionexportandcredentialchangeproofs') }),
  table('account_deletion_service_ops', 'operation_id', 'transient_cleanup', 'deletion_machinery', [
    omitted('id', t('account.transparency.deletionmachinery'), 'transient_deletion'), omitted('operation_id', t('account.transparency.deletionmachinery'), 'transient_deletion'),
    omitted('service', t('account.transparency.deletionmachinery'), 'transient_deletion'), omitted('service_operation_id', t('account.transparency.deletionmachinery'), 'transient_deletion'),
    omitted('request_digest', t('account.transparency.deletionintegritydigest')), omitted('key_version', t('account.transparency.deletionmachinery'), 'transient_deletion'),
    omitted('envelope_issued_at', t('account.transparency.deletionmachinery'), 'transient_deletion'), omitted('state', t('account.transparency.deletionmachinery'), 'transient_deletion'),
    omitted('envelope_expires_at', t('account.transparency.deletionmachinery'), 'transient_deletion'), omitted('next_attempt_at', t('account.transparency.deletionmachinery'), 'transient_deletion'),
    omitted('attempt_count', t('account.transparency.deletionmachinery'), 'transient_deletion'),
  ], { description: t('account.transparency.transientpeerdeletionoperations') }),
  table('spb_mint_reservations', 'account_id', 'direct_owner_purge', 'transient_auth_rate', [
    omitted('id', t('account.transparency.brokerreservationidentifier')), omitted('account_id', t('account.transparency.internalownerrelation')),
    omitted('instance_id', t('account.transparency.brokerreservationcoordinate')), omitted('scope', t('account.transparency.brokerauthorizationscope')),
    omitted('reserved_expires_at', t('account.transparency.transientbrokerstate'), 'transient_deletion'), omitted('state', t('account.transparency.transientbrokerstate'), 'transient_deletion'),
    omitted('created_at', t('account.transparency.transientbrokerstate'), 'transient_deletion'),
  ], { deletionOrder: 30, description: t('account.transparency.transientbackupcredentialreservations') }),
  table('account_deletion_completions', 'status_token', 'deliberately_retained', 'retained_only', [
    retained('token_hash', t('account.transparency.identifierfreecompletionverifier')), retained('state', t('account.transparency.terminalcompletionstate')),
    retained('completed_at', t('account.transparency.completiontime')), retained('expires_at', t('account.transparency.minimumconfirmedrelaysupportenvelopeexpiry')),
  ], {
    description: t('account.transparency.identifierfreedeletionreceiptkeptonlyuntil'),
    retainedMechanics: {
      expires_at_rule: 'min_relay_support_envelope_expires_at',
      sweep: 'delete_where_expires_at_lte_now',
    },
  }),
  table('spp_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'), omitted('token_hash', t('account.transparency.brokerauthenticationhash')),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_seen_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('consent_acked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')), exported('consent_disclosure_version'),
  ], { deletionOrder: 140, description: t('account.transparency.journalsconnectedconfidentialprocessingandwhenyou') }),
  table('sme_bindings', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'),
    exported('created_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('last_seen_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
    exported('consent_acked_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')), exported('consent_disclosure_version'),
    exported('journal_update_refused_at', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch')),
  ], { deletionOrder: 155, description: t('account.transparency.journalsconnectedsolstonemeandwhenyou') }),
  table('spb_mint_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'), omitted('prefix', t('account.transparency.brokerstoragecoordinate')),
    exported('scope'), exported('ttl', 'identity', 'seconds'), exported('outcome'),
    exported('ts', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch'), 'occurred_at'),
  ], { deletionOrder: 110, description: t('account.transparency.eachtimejournalaskedforbackupaccess') }),
  table('spp_mint_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'), exported('scope'), exported('outcome'),
    exported('ts', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch'), 'occurred_at'),
  ], { deletionOrder: 120, description: t('account.transparency.eachtimejournalaskedforconfidentialprocessing') }),
  table('spb_sweep_audit', 'account_id', 'direct_owner_purge', 'exportable', [
    omitted('account_id', t('account.transparency.internalownerrelation')), exported('instance_id'), omitted('prefix', t('account.transparency.brokerstoragecoordinate')),
    exported('objects_deleted'), exported('multipart_aborted'),
    exported('ts', 'epoch_ms_to_iso', t('account.transparency.millisecondssinceunixepoch'), 'occurred_at'),
  ], { deletionOrder: 125, description: t('account.transparency.backupsdeletedafterencryptedbackupended') }),
];

export const RATE_BUCKET_FAMILIES = deepFreeze([
  { scope: 'signin_email', association: 'verified_email_derived', deletion: 'derived_key_purge' },
  { scope: 'signin_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'add_email_per_day', association: 'account_id', deletion: 'derived_key_purge' },
  { scope: 'passkey_auth_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'passkey_register_ip', association: 'transient_unassociated', deletion: 'transient_cleanup' },
  { scope: 'passkey_register_account', association: 'account_id', deletion: 'derived_key_purge' },
  ...['delete_proof', 'export_proof', 'credential_change_proof'].flatMap((purpose) => ['otp', 'passkey'].flatMap((method) => [
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
