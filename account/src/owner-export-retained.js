import { t } from '../../i18n/account.mjs';

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
      description: t('account.ownerexportretained.yourjournalcontentsstayinyourjournal'),
    },
    {
      code: 'operated_backup_bytes',
      local_export: 'included_binding_metadata',
      description: t('account.ownerexportretained.encryptedbackupcontentsarenotreadablehere'),
    },
    {
      code: 'stripe_side_records',
      local_export: 'included_customer_reference',
      description: t('account.ownerexportretained.yourreceiptsandpastchargesareheld'),
    },
    {
      code: 'anonymous_no_email_support',
      local_export: 'not_in_local_collection',
      description: t('account.ownerexportretained.supportrequestssentwithoutanemailaddress'),
    },
  ];
}
