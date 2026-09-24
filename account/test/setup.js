// workerd's node:process emits 'unhandledRejection' before a promise adopted by an
// un-awaited `return promise` gains its handler, then emits 'rejectionHandled' for it.
// Node only reports after the microtask queue drains, so Vitest's listener never sees
// that case there. Hold each report for a macrotask and pass on only the rejections
// still unhandled, re-emitting with this listener detached so Vitest's own reports it.
const realSetTimeout = globalThis.setTimeout;
const pending = new Map();

function onUnhandledRejection(reason, promise) {
  pending.set(promise, reason);
  realSetTimeout(() => {
    if (!pending.delete(promise)) return;
    process.off('unhandledRejection', onUnhandledRejection);
    try {
      process.emit('unhandledRejection', reason, promise);
    } finally {
      process.on('unhandledRejection', onUnhandledRejection);
    }
  }, 0);
}

if (!globalThis.__accountRejectionReconciler) {
  globalThis.__accountRejectionReconciler = true;
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('rejectionHandled', (promise) => pending.delete(promise));
}
