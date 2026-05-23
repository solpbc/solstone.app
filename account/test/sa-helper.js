import { decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';

const keyPair = generateKeyPair('RS256', { extractable: true });

const { publicKey, privateKey } = await keyPair;
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = 'test-sa-key';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

export const SA_PUBLIC_KEY = publicKey;
export const SA_PRIVATE_KEY_PEM = await exportPKCS8(privateKey);
export const SA_PUBLIC_JWK = publicJwk;
export const SA_JSON_STRING = JSON.stringify({
  type: 'service_account',
  project_id: 'test-gcp-project',
  private_key_id: 'test-sa-key',
  private_key: SA_PRIVATE_KEY_PEM,
  client_email: 'test-sa@test-gcp-project.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.googleapis.com/token',
});

export function decodeSaJwtHeader(assertion) {
  return decodeProtectedHeader(assertion);
}

export function verifySaJwt(assertion, options) {
  return jwtVerify(assertion, SA_PUBLIC_KEY, options);
}
