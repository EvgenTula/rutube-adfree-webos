import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readRepositoryCommit } from "../scripts/git-metadata.js";

const commit = "1234567890abcdef1234567890abcdef12345678";

test("repository commit reader handles loose, packed, and linked-worktree refs", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "rutube-git-metadata-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  const looseProject = join(temporaryRoot, "loose");
  mkdirSync(join(looseProject, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(looseProject, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(looseProject, ".git", "refs", "heads", "main"), `${commit}\n`);
  assert.equal(readRepositoryCommit(looseProject), commit);

  const packedProject = join(temporaryRoot, "packed");
  mkdirSync(join(packedProject, ".git"), { recursive: true });
  writeFileSync(join(packedProject, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(packedProject, ".git", "packed-refs"), `${commit} refs/heads/main\n`);
  assert.equal(readRepositoryCommit(packedProject), commit);

  const linkedProject = join(temporaryRoot, "linked");
  const commonDir = join(temporaryRoot, "common.git");
  const worktreeDir = join(commonDir, "worktrees", "linked");
  mkdirSync(worktreeDir, { recursive: true });
  mkdirSync(linkedProject, { recursive: true });
  writeFileSync(join(linkedProject, ".git"), `gitdir: ${worktreeDir}\n`);
  writeFileSync(join(worktreeDir, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(worktreeDir, "commondir"), "../..\n");
  writeFileSync(join(commonDir, "packed-refs"), `${commit} refs/heads/main\n`);
  assert.equal(readRepositoryCommit(linkedProject), commit);
});
