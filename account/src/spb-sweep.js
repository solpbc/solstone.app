import {
  deleteSpbBinding,
  insertSpbSweepAudit,
  selectDueLapsedBindings,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { mintScopedCredential } from './r2-credential.js';
import { drainMultipartUploads, drainObjects } from './spb-drain.js';
import { prefixFor } from './spb-broker.js';

export const LAPSE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function runSpbLapseSweep(env, ctx, nowMs = Date.now()) {
  if (env.SPB_SWEEP_ENABLED !== 'true') return;

  const startMs = Date.now();
  const bindings = await selectDueLapsedBindings(env.DB, nowMs - LAPSE_RETENTION_MS);
  let bindingsSwept = 0;
  let objectsDeleted = 0;
  let multipartAborted = 0;

  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    try {
      const accountId = binding.account_id;
      const instanceId = binding.instance_id;
      const prefix = prefixFor(accountId, instanceId);
      const cred = await mintScopedCredential(env, {
        prefix,
        scope: 'maintenance',
        nowSeconds: Math.floor(nowMs / 1000),
      });
      if (!cred) throw namedError('SpbSweepCredentialError', 'maintenance credential mint failed');

      const getRequestAuth = () => ({ credential: cred, nowMs });
      const bindingObjectsDeleted = await drainObjects(env, { prefix, getRequestAuth });
      const bindingMultipartAborted = await drainMultipartUploads(env, { prefix, getRequestAuth });

      await insertSpbSweepAudit(env.DB, {
        accountId,
        instanceId,
        prefix,
        objectsDeleted: bindingObjectsDeleted,
        multipartAborted: bindingMultipartAborted,
        ts: nowMs,
      });
      await deleteSpbBinding(env.DB, { accountId, instanceId });

      bindingsSwept += 1;
      objectsDeleted += bindingObjectsDeleted;
      multipartAborted += bindingMultipartAborted;
    } catch (err) {
      console.error(JSON.stringify({
        event: 'spb_lapse_sweep_failed',
        binding_index: i,
        error_type: err?.name || 'Error',
      }));
    }
  }

  console.warn(JSON.stringify({
    event: 'spb_lapse_sweep',
    bindings_swept: bindingsSwept,
    objects_deleted: objectsDeleted,
    multipart_aborted: multipartAborted,
    duration_ms: Date.now() - startMs,
    ts: Date.now(),
  }));
  emitSecurityEvent(env, ctx, {
    type: 'spb_lapse_sweep',
    tier: 'T4',
    bindings_swept: bindingsSwept,
    objects_deleted: objectsDeleted,
    multipart_aborted: multipartAborted,
  });
}

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}
