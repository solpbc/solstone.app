import { exportSPKI, generateKeyPair } from 'jose';
import { deriveJournalIdFromSpki } from '../src/crypto.js';

const encoder = new TextEncoder();

export async function generateReachKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicKeyPem = await exportSPKI(publicKey);
  return {
    publicKeyPem,
    privateKey,
    instanceId: await deriveJournalIdFromSpki(spkiPemToBytes(publicKeyPem)),
  };
}

export async function mintHomeReachAssertion({
  instanceId,
  privateKey,
  header = {},
  claims = {},
  signingKey,
}) {
  const now = Math.floor(Date.now() / 1000);
  const fullHeader = { alg: 'ES256', typ: 'home-reach', ...header };
  const fullClaims = {
    iss: `home:${instanceId}`,
    aud: 'solstone-reach',
    scope: 'push.relay.enroll',
    instance_id: instanceId,
    iat: now,
    exp: now + 240,
    ...claims,
  };
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(fullHeader)))}.${base64UrlEncode(encoder.encode(JSON.stringify(fullClaims)))}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey || privateKey,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function spkiPemToBytes(pem) {
  const b64 = pem
    .replace('-----BEGIN PUBLIC KEY-----\n', '')
    .replace('\n-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
