export const NONCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const NONCE_LENGTH_CHARS = 52;
export const NONCE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{52}$/;

export const HANDOFF_TTL_MS = 5 * 60 * 1000;
export const MAX_USE_CASE_LEN = 2000;

export const PUSH_PLATFORM_ALLOWLIST = ['ios', 'macos'];
export const DEVICE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{32,256}$/;
export const BUNDLE_ID_REGEX = /^[a-zA-Z0-9.-]{1,128}$/;
export const INSTANCE_ID_REGEX = /^[0-9a-fA-F-]{10,64}$/;
