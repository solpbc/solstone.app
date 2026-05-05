// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// 6-digit OTP generation, peppered HMAC hashing, and equality-safe compare.
// Code plaintext never touches D1 or logs.

const OTP_TTL_MS = 10 * 60 * 1000;            // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
const REJECT_THRESHOLD = 4_294_000_000;        // 2^32 = 4_294_967_296; reject above to avoid modulo bias on % 1_000_000

export function generateOtp() {
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= REJECT_THRESHOLD);
  return (value % 1_000_000).toString().padStart(6, '0');
}

export function otpExpiresAtIso() {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

export async function hashCode(code, pepper) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(code));
  return base64(new Uint8Array(sig));
}

export async function hashKey(scope, value, pepper) {
  // Used for rate_buckets — domain-separates IP buckets from email buckets.
  return hashCode(`${scope}:${value}`, pepper);
}

// Constant-time string compare (both args same length expected).
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function normalizeCode(input) {
  return (input || '').replace(/\s+/g, '');
}

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
