export const GIT_STATUS_ARGS = Object.freeze(["status", "--porcelain"]);

export function sourceDirtyFromStatus(status) {
  if (status === null) return null;
  return status.trim().length > 0;
}
