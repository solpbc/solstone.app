import { hashWithPepper } from './crypto.js';

const LIMITS = {
  v: [1, 1],
  daily: [1, 1_000_000_000_000],
  cooldown_ms: [1, 30_000],
  audio_per_second: [1, 1_000_000],
  max_inflight: [1, 32],
};

// Only the authorized journal binding enters this derivation. The existing
// configured pepper is stable across workers, deployments and credential mints.
// No serving usage travels back to this process.
export async function sppAuthorizationHeaders(binding, env) {
  if (typeof binding.instance_id !== 'string' || !binding.instance_id ||
      typeof env.HMAC_PEPPER !== 'string' || !env.HMAC_PEPPER) {
    throw new Error('Invalid authorization configuration');
  }
  const headers = {
    'X-Sol-SPP-Journal': await hashWithPepper(`spp-journal-v1:${binding.instance_id}`, env),
  };
  if (env.SPP_ALLOWANCE_ENABLED !== 'true') return headers;
  const raw = env.SPP_ALLOWANCE_POLICY;
  if (typeof raw !== 'string' || raw.length > 512) throw new Error('Invalid allowance configuration');
  let policy;
  try {
    policy = JSON.parse(raw);
  } catch {
    throw new Error('Invalid allowance configuration');
  }
  if (!policy || Array.isArray(policy) || typeof policy !== 'object' ||
      Object.keys(policy).length !== Object.keys(LIMITS).length) {
    throw new Error('Invalid allowance configuration');
  }
  for (const [key, [low, high]] of Object.entries(LIMITS)) {
    if (!Object.hasOwn(policy, key) || !Number.isSafeInteger(policy[key]) || policy[key] < low || policy[key] > high) {
      throw new Error('Invalid allowance configuration');
    }
  }
  headers['X-Sol-SPP-Allowance'] = JSON.stringify(policy);
  return headers;
}
