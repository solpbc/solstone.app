export function isSandboxRunLeaseLive(run, nowMs) {
  return run?.status === 'active' && nowMs < run.lease_expires_at;
}
