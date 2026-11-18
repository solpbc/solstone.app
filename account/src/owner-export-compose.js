import { t } from '../../i18n/account.mjs';

import { ownerExportNotIncluded, ownerExportRetainedMechanics } from './owner-export-retained.js';

export const SUPPORT_CLOSED_EXPLANATION = {
  code: 'content_removed',
  description: t('account.export.afterrequestclosesonlyitsidentifierdates'),
};

const REASON_DESCRIPTIONS = Object.freeze({
  deadline: t('account.export.thissectioncouldnotbereachedin'),
  resource_limit: t('account.export.thissectionwastoolargeincludesafely'),
  unconfigured: t('account.export.thissectionisnotconnectedrightnow'),
  throw: t('account.export.thissectioncouldnotbereached'),
  redirect: t('account.export.thissectionreturnedanunexpectedresponse'),
  malformed_body: t('account.export.thissectionreturnedanunreadableresponse'),
  duplicate_member: t('account.export.thissectionreturnedanunreadableresponse'),
  invalid_envelope: t('account.export.thissectionreturnedanunreadableresponse'),
  invalid_shape: t('account.export.thissectionreturnedanunreadableresponse'),
  invalid_field: t('account.export.thissectionreturnedanunreadableresponse'),
  mismatch: t('account.export.returnedrecorddidnotmatchrequestedrecord'),
  duplicate: t('account.export.thissectionreturnedconflictingrecords'),
  cursor: t('account.export.closedsupportrequestscouldnotberead'),
  over_limit: t('account.export.closedsupportrequestscouldnotberead'),
  unstable: t('account.export.supportrequestchangedwhilethisdownloadwas'),
  decrypt: t('account.export.oneormoreverifiedemailaddressescould'),
  incomplete: t('account.export.thissectioncouldnotbeincludedcompletely'),
  failed: t('account.export.thissectioncouldnotbeincluded'),
});

function reasonDescription(code) {
  if (typeof code === 'string' && code.startsWith('http_')) return t('account.export.thissectioncouldnotbereached');
  return REASON_DESCRIPTIONS[code] || t('account.export.thissectioncouldnotbeincludedcompletely');
}

function reason(code) {
  return { code, description: reasonDescription(code) };
}

export function composeOwnerExportDocument({
  generatedAtMs = Date.now(),
  local,
  relay,
  support,
}) {
  const localComplete = local?.ok === true;
  const relayComplete = relay?.complete === true;
  const supportComplete = support?.complete === true;
  const complete = localComplete && relayComplete && supportComplete;

  const legs = {
    local: {
      complete: localComplete,
      ...(localComplete ? {} : { reason: reason(local?.error || 'failed') }),
    },
    relay: {
      complete: relayComplete,
      ...(relayComplete ? {} : {
        reason: {
          codes: [...new Set((relay?.accounting || []).map((item) => item.reason).filter(Boolean))],
          description: t('account.export.someprivatenetworkorconfidentialprocessingdetails'),
        },
      }),
    },
    support: {
      complete: supportComplete,
      ...(supportComplete ? {} : { reason: reason(support?.reason || 'incomplete') }),
    },
  };

  const localSection = {
    classes: local?.classes || [],
    completeness: local?.completeness || { complete: false, class_count: 0, record_count: 0 },
  };

  const relaySection = {
    instances: relay?.instances || [],
    accounting: (relay?.accounting || []).map((item) => ({
      ...item,
      description: reasonDescription(item.reason),
    })),
  };

  const supportSection = {
    tickets: support?.tickets || [],
    tombstones: support?.tombstones || [],
    closed_explanation: SUPPORT_CLOSED_EXPLANATION,
  };

  return {
    format_version: 1,
    generated_at: new Date(generatedAtMs).toISOString(),
    complete,
    legs,
    local: localSection,
    relay: relaySection,
    support: supportSection,
    retained: ownerExportRetainedMechanics(),
    not_included: ownerExportNotIncluded(),
  };
}
