import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function readTrimmed(path) {
  return readFileSync(path, "utf8").trim();
}

function commonGitDirectory(gitDir) {
  const marker = join(gitDir, "commondir");
  return existsSync(marker) ? resolve(gitDir, readTrimmed(marker)) : gitDir;
}

/** Read the full HEAD commit without spawning Git; returns null outside a repository. */
export function readRepositoryCommit(projectRoot) {
  let gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) return null;
  if (statSync(gitDir).isFile()) {
    const marker = readTrimmed(gitDir);
    if (!marker.startsWith("gitdir: ")) return null;
    gitDir = resolve(projectRoot, marker.slice("gitdir: ".length));
  }

  const headPath = join(gitDir, "HEAD");
  if (!existsSync(headPath)) return null;
  const head = readTrimmed(headPath);
  if (/^[0-9a-f]{40}$/i.test(head)) return head;
  if (!head.startsWith("ref: ")) return null;

  const ref = head.slice("ref: ".length);
  const commonDir = commonGitDirectory(gitDir);
  for (const base of gitDir === commonDir ? [gitDir] : [gitDir, commonDir]) {
    const looseRef = join(base, ...ref.split("/"));
    if (existsSync(looseRef)) return readTrimmed(looseRef);
  }

  const packedRefs = join(commonDir, "packed-refs");
  if (!existsSync(packedRefs)) return null;
  const match = readFileSync(packedRefs, "utf8")
    .split(/\r?\n/)
    .find((line) => line.endsWith(` ${ref}`));
  return match ? match.split(" ", 1)[0] : null;
}
