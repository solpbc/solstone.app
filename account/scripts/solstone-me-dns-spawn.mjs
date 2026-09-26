import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WRANGLER_BIN = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
const ACCOUNT_DIR = fileURLToPath(new URL('..', import.meta.url));
const MAX_BUFFER = 32 * 1024 * 1024;

export function spawnWranglerD1(sql) {
  return new Promise((resolve, reject) => {
    execFile(
      WRANGLER_BIN,
      ['d1', 'execute', 'account-portal', '--remote', '--json', '--command', sql],
      {
        cwd: ACCOUNT_DIR,
        maxBuffer: MAX_BUFFER,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}
