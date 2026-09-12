import { ownerExportNotIncluded, ownerExportRetainedMechanics } from './owner-export-retained.js';

export const SUPPORT_CLOSED_EXPLANATION = {
  code: 'content_removed',
  description: 'content and messages for closed requests are removed to protect your privacy',
};

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
      ...(localComplete ? {} : { reason: local?.error || 'failed' }),
    },
    relay: {
      complete: relayComplete,
      ...(relayComplete ? {} : { reason: relay?.accounting?.[0]?.reason || 'incomplete' }),
    },
    support: {
      complete: supportComplete,
      ...(supportComplete ? {} : { reason: support?.reason || 'incomplete' }),
    },
  };

  const localSection = {
    classes: local?.classes || [],
    completeness: local?.completeness || { complete: false, class_count: 0, record_count: 0 },
  };

  const relaySection = {
    instances: relay?.instances || [],
    accounting: relay?.accounting || [],
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
