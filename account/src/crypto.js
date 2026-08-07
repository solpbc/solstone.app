// AES-GCM encryption: stored as base64(iv || ciphertext_with_tag), 12-byte random IV.
// hashWithPepper: sha256(utf8(value) || utf8(pepper)), base64url-encoded.
// ENCRYPTION_SECRET: base64 encoding of 32 random bytes. HMAC_PEPPER: utf8 string.

const REJECT_THRESHOLD = 4_294_000_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const SERVICE_HANDOFF_SALT = textEncoder.encode('service-handoff');
const SERVICE_HANDOFF_INFO = textEncoder.encode('service-handoff-pepper-v1');
const serviceHandoffPepperCache = new Map();

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

export async function hashWithPepper(value, env, pepperKey = 'HMAC_PEPPER') {
  const valueBytes = textEncoder.encode(value);
  const pepperBytes = textEncoder.encode(env[pepperKey]);
  const input = new Uint8Array(valueBytes.length + pepperBytes.length);
  input.set(valueBytes);
  input.set(pepperBytes, valueBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return base64UrlEncode(new Uint8Array(digest));
}

export function hashKey(scope, value, env) {
  return hashWithPepper(`${scope}:${value}`, env);
}

export async function deriveServiceHandoffPepper(env) {
  const ikm = env.DISPATCH_TOKEN_PEPPER || '';
  if (serviceHandoffPepperCache.has(ikm)) return new Uint8Array(serviceHandoffPepperCache.get(ikm));
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(ikm),
    'HKDF',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: SERVICE_HANDOFF_SALT,
      info: SERVICE_HANDOFF_INFO,
    },
    key,
    256
  );
  const pepper = new Uint8Array(bits);
  serviceHandoffPepperCache.set(ikm, pepper);
  return new Uint8Array(pepper);
}

export async function hashServiceHandoffNonce(nonce, env) {
  const pepper = await deriveServiceHandoffPepper(env);
  const key = await crypto.subtle.importKey(
    'raw',
    pepper,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(nonce));
  return hexEncode(new Uint8Array(signature));
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
  return (input || '').replace(/\D/g, '');
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

export function randomBase64Url(size) {
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

export function base64UrlEncode(bytes) {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value) {
  const pad = value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : value.length % 4 === 0 ? '' : null;
  if (pad == null) throw new Error('invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexEncode(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
