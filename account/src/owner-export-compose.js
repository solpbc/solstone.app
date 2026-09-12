import { ownerExportNotIncluded, ownerExportRetainedMechanics } from './owner-export-retained.js';

export const SUPPORT_CLOSED_EXPLANATION = {
  code: 'content_removed',
  description: 'after a request closes, only its identifier, dates, status, and content-removed marker remain',
};

const REASON_DESCRIPTIONS = Object.freeze({
  deadline: 'this section could not be reached in time',
  resource_limit: 'this section was too large to include safely in this download',
  unconfigured: 'this section is not connected right now',
  throw: 'this section could not be reached',
  redirect: 'this section returned an unexpected response',
  malformed_body: 'this section returned an unreadable response',
  duplicate_member: 'this section returned an unreadable response',
  invalid_envelope: 'this section returned an unreadable response',
  invalid_shape: 'this section returned an unreadable response',
  invalid_field: 'this section returned an unreadable response',
  mismatch: 'the returned record did not match the requested record',
  duplicate: 'this section returned conflicting records',
  cursor: 'closed support requests could not be read completely',
  over_limit: 'closed support requests could not be read completely',
  unstable: 'a support request changed while this download was prepared',
  decrypt: 'one or more verified email addresses could not be read',
  incomplete: 'this section could not be included completely',
  failed: 'this section could not be included',
});

function reasonDescription(code) {
  if (typeof code === 'string' && code.startsWith('http_')) return 'this section could not be reached';
  return REASON_DESCRIPTIONS[code] || 'this section could not be included completely';
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
          description: 'some private network or confidential processing details could not be included; see instance accounting',
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
