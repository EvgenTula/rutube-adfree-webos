import assert from "node:assert/strict";
import test from "node:test";

import { GIT_STATUS_ARGS, sourceDirtyFromStatus } from "../scripts/package-provenance-lib.js";

test("package provenance checks tracked and untracked worktree changes", () => {
  assert.deepEqual(GIT_STATUS_ARGS, ["status", "--porcelain"]);
  assert.equal(sourceDirtyFromStatus(""), false);
  assert.equal(sourceDirtyFromStatus(" M src/js/app.js\n"), true);
  assert.equal(sourceDirtyFromStatus("?? src/untracked-runtime.js\n"), true);
  assert.equal(sourceDirtyFromStatus(null), null);
});
