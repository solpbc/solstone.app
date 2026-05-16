// AES-GCM encryption: stored as base64(iv || ciphertext_with_tag), 12-byte random IV.
// hashWithPepper: sha256(utf8(value) || utf8(pepper)), base64url-encoded.
// ENCRYPTION_SECRET: base64 encoding of 32 random bytes. HMAC_PEPPER: utf8 string.

const REJECT_THRESHOLD = 4_294_000_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function encryptEmail(plaintext, env) {
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return base64Encode(combined);
}

export async function decryptEmail(b64, env) {
  const key = await importEncryptionKey(env);
  const combined = base64Decode(b64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return textDecoder.decode(plaintext);
}

export async function hashWithPepper(value, env) {
  const valueBytes = textEncoder.encode(value);
  const pepperBytes = textEncoder.encode(env.HMAC_PEPPER);
  const input = new Uint8Array(valueBytes.length + pepperBytes.length);
  input.set(valueBytes);
  input.set(pepperBytes, valueBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return base64UrlEncode(new Uint8Array(digest));
}

export function hashKey(scope, value, env) {
  return hashWithPepper(`${scope}:${value}`, env);
}

export function generateOtp() {
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= REJECT_THRESHOLD);
  return (value % 1_000_000).toString().padStart(6, '0');
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function normalizeCode(input) {
  return (input || '').replace(/\s+/g, '');
}

export function generateSessionToken() {
  return randomBase64Url(32);
}

async function importEncryptionKey(env) {
  const raw = base64Decode(env.ENCRYPTION_SECRET);
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_SECRET must decode to 32 bytes');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function randomBase64Url(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64UrlEncode(bytes);
}

function base64Encode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes) {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
