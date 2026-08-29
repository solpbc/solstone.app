import { describe, expect, it } from 'vitest';
import { deriveJournalIdFromSpki } from '../src/crypto.js';

const VECTORS = [
  ['3059301306072a8648ce3d020106082a8648ce3d03010703420004471c3e758c4904285bba7e53118ed0f524adeb0757d25bd2f8e7b0d76dfa714cdd520f7aca8a8b917acc37f51de8f0c9bbe3ad858382e702dc25a12d09f7a858', 'f30ed159-ef46-8e9c-913f-e49f0fe7d201'],
  ['3059301306072a8648ce3d020106082a8648ce3d030107034200047cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc4766997807775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1', '62bde3af-1ef4-8292-84db-1e5ac2c07e8b'],
  ['3059301306072a8648ce3d020106082a8648ce3d030107034200048e533b6fa0bf7b4625bb30667c01fb607ef9f8b8a80fef5b300628703187b2a373eb1dbde03318366d069f83a6f5900053c73633cb041b21c55e1a86c1f400b4', '75e46c0d-1c50-892b-98ff-4d174c135add'],
  ['3059301306072a8648ce3d020106082a8648ce3d03010703420004ea68d7b6fedf0b71878938d51d71f8729e0acb8c2c6df8b3d79e8a4b90949ee02a2744c972c9fce787014a964a8ea0c84d714feaa4de823fe85a224a4dd048fa', 'bb8f23b4-fd5e-8ca9-98c7-c1dfa927a840'],
];

describe('journal id derivation', () => {
  it.each(VECTORS)('derives %s as %s', async (spkiHex, expected) => {
    await expect(deriveJournalIdFromSpki(hexToBytes(spkiHex))).resolves.toBe(expected);
  });
});

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
