import { OWNER_DATA_INVENTORY } from './owner-data-inventory.js';

export function ownerExportRetainedMechanics() {
  return Object.fromEntries(OWNER_DATA_INVENTORY
    .filter((entry) => entry.retainedMechanics)
    .map((entry) => {
      const retainedColumns = entry.columns.filter((column) => column.treatment === 'retained_only').map(({ name }) => name);
      const clearedColumns = entry.columns.filter((column) => column.treatment === 'transient_deletion').map(({ name }) => name);
      return [entry.name, {
        ...(entry.name === 'account_deletions' ? {
          retained_columns: retainedColumns,
          cleared_at_completion: clearedColumns,
        } : { columns: retainedColumns }),
        ...entry.retainedMechanics,
        description: entry.description,
      }];
    }));
}

export function ownerExportNotIncluded() {
  return [
    {
      code: 'journal_files',
      local_export: 'not_in_local_collection',
      description: 'your journal contents stay in your journal and are not held with this services sign-in',
    },
    {
      code: 'operated_backup_bytes',
      local_export: 'included_binding_metadata',
      description: 'encrypted backup contents are not readable here; this file includes the backup bindings held with your sign-in',
    },
    {
      code: 'stripe_side_records',
      local_export: 'included_customer_reference',
      description: 'billing records held by Stripe are not included; this file includes the Stripe customer reference held with your sign-in',
    },
    {
      code: 'anonymous_no_email_support',
      local_export: 'not_in_local_collection',
      description: 'support requests sent without an email address cannot be connected to this sign-in',
    },
  ];
}
