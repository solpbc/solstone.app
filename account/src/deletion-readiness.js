import { framedHmacSha256Base64Url, randomBase64Url, timingSafeEqual } from './crypto.js';
import {
  bearerFor,
  bindingFor,
  DELETION_SERVICES,
  hmacKeyFor,
  readinessDomainFor,
  READY_PATH,
  RETAINED_KEY_VERSIONS,
} from './deletion-services.js';

export const TOTAL_READINESS_TIMEOUT_MS = 5000;

export async function checkDeletionReadiness(env, { timeoutMs = TOTAL_READINESS_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('readiness_timeout')), timeoutMs);

  try {
    const timeoutPromise = new Promise((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error('readiness_timeout')),
        { once: true }
      );
    });

    const checks = DELETION_SERVICES.map((service) => checkServiceReadiness(env, service, controller.signal));
    const results = await Promise.race([
      Promise.all(checks),
      timeoutPromise,
    ]);

    const failed = results.find((result) => !result.ok);
    if (failed) return { ok: false, error: failed.error, service: failed.service };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'readiness_check_failed' };
  } finally {
    clearTimeout(timer);
  }
}

async function checkServiceReadiness(env, service, signal) {
  if (signal?.aborted) {
    return { ok: false, service, error: 'readiness_timeout' };
  }

  const binding = bindingFor(env, service);
  const bearer = bearerFor(env, service);
  if (!binding || !bearer) {
    return { ok: false, service, error: 'service_unconfigured' };
  }

  const keyV1 = hmacKeyFor(env, service, 1);
  const keyV2 = hmacKeyFor(env, service, 2);
  if (!keyV1 || !keyV2) {
    return { ok: false, service, error: 'missing_hmac_secret' };
  }

  const nonce = randomBase64Url(32);
  if (nonce.length !== 43) {
    return { ok: false, service, error: 'invalid_nonce_length' };
  }

  try {
    const response = await binding.fetch(`https://${service}.internal${READY_PATH}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'X-Owner-Purge-Nonce': nonce,
      },
      redirect: 'manual',
      signal,
    });

    if (response.status !== 204) {
      return { ok: false, service, error: `invalid_status_${response.status}` };
    }

    const bodyText = await response.text();
    if (bodyText !== '') {
      return { ok: false, service, error: 'non_empty_body' };
    }

    const cacheControl = response.headers.get('cache-control');
    if (cacheControl !== 'no-store' || cacheControl.includes(',')) {
      return { ok: false, service, error: 'invalid_cache_control' };
    }

    const readinessVersion = response.headers.get('x-owner-purge-readiness-version');
    if (readinessVersion !== '1' || readinessVersion.includes(',')) {
      return { ok: false, service, error: 'invalid_readiness_version' };
    }

    const proofV1 = response.headers.get('x-owner-purge-readiness-proof-v1');
    if (!proofV1 || proofV1.includes(',')) {
      return { ok: false, service, error: 'missing_or_duplicate_proof_v1' };
    }

    const proofV2 = response.headers.get('x-owner-purge-readiness-proof-v2');
    if (!proofV2 || proofV2.includes(',')) {
      return { ok: false, service, error: 'missing_or_duplicate_proof_v2' };
    }

    const domain = readinessDomainFor(service);
    const expectedProofV1 = await framedHmacSha256Base64Url(keyV1, domain, nonce);
    if (!timingSafeEqual(proofV1, expectedProofV1)) {
      return { ok: false, service, error: 'proof_v1_verification_failed' };
    }

    const expectedProofV2 = await framedHmacSha256Base64Url(keyV2, domain, nonce);
    if (!timingSafeEqual(proofV2, expectedProofV2)) {
      return { ok: false, service, error: 'proof_v2_verification_failed' };
    }

    return { ok: true, service };
  } catch (error) {
    return { ok: false, service, error: error?.message || 'service_fetch_error' };
  }
}
