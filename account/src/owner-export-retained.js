export function ownerExportRetainedMechanics() {
  return {
    account_deletions: {
      retained_columns: [
        'operation_id',
        'phase',
        'requested_at',
        'frozen_at',
        'cancellation_deadline_at',
        'next_attempt_at',
        'attempt_count',
        'backup_safe_after',
        'backup_empty_verified_at',
        'completed_at',
        'cancelled_at',
        'last_error_code',
        'last_error_at',
        'stripe_purge_state',
        'stripe_purge_attempted_at',
      ],
      cleared_at_completion: [
        'account_id',
        'lease_token',
        'lease_expires_at',
        'snapshot_encrypted',
        'snapshot_digest',
        'status_token_hash',
      ],
      has_expires_at: false,
      phase_on_complete: 'complete',
      description: 'sanitized completed deletion record with no implemented expiry',
    },
    account_deletion_completions: {
      columns: ['token_hash', 'state', 'completed_at', 'expires_at'],
      expires_at_rule: 'min_relay_support_envelope_expires_at',
      sweep: 'delete_where_expires_at_lte_now',
      description: 'expiring identifier-free deletion completion verifier',
    },
    mcp_bridge_hostname_ledger: {
      columns: ['label', 'created_at'],
      account_join: false,
      owner_bindings_table: 'mcp_bridge_bindings',
      deletion_treatment: 'direct_owner_purge',
      description: 'permanent MCP hostname reservations',
    },
  };
}

export function ownerExportNotIncluded() {
  return [
    {
      code: 'journal_files',
      local_export: 'not_in_local_collection',
      description: 'journal file bytes are not in this account-portal collection',
    },
    {
      code: 'operated_backup_bytes',
      local_export: 'included_binding_metadata',
      description: 'R2 backup object bytes are not fetched; local export includes operated-backup bindings',
    },
    {
      code: 'stripe_side_records',
      local_export: 'included_customer_reference',
      description: 'Stripe API records are not fetched; local export includes local Stripe customer reference',
    },
    {
      code: 'anonymous_no_email_support',
      local_export: 'not_in_local_collection',
      description: 'anonymous no-email support submissions are not in this collector',
    },
  ];
}
