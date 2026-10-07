import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GIT_STATUS_ARGS, sourceDirtyFromStatus } from "./package-provenance-lib.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(projectRoot, "artifacts");
const appInfo = JSON.parse(readFileSync(join(projectRoot, "src", "appinfo.json"), "utf8"));
const buildInfo = JSON.parse(readFileSync(join(projectRoot, "dist", "build-info.json"), "utf8"));
const cliPackage = JSON.parse(readFileSync(join(projectRoot, "node_modules", "@webos-tools", "cli", "package.json"), "utf8"));
const expectedPrefix = `${appInfo.id}_${appInfo.version}_`;

const packages = readdirSync(artifactDir)
  .filter((name) => name.startsWith(expectedPrefix) && name.endsWith(".ipk"))
  .map((name) => ({ name, modified: statSync(join(artifactDir, name)).mtimeMs }))
  .sort((left, right) => right.modified - left.modified);

if (packages.length === 0) {
  throw new Error(`No package matching ${expectedPrefix}*.ipk was found in artifacts`);
}

const packagePath = join(artifactDir, packages[0].name);
const packageBytes = readFileSync(packagePath);

function gitOutput(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (_error) {
    return fallback;
  }
}

function repositoryCommit() {
  let gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) return buildInfo.commit || "unknown";
  if (statSync(gitDir).isFile()) {
    const marker = readFileSync(gitDir, "utf8").trim();
    if (!marker.startsWith("gitdir: ")) return buildInfo.commit || "unknown";
    gitDir = resolve(projectRoot, marker.slice("gitdir: ".length));
  }
  const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  if (/^[0-9a-f]{40}$/i.test(head)) return head;
  if (!head.startsWith("ref: ")) return buildInfo.commit || "unknown";
  const ref = head.slice("ref: ".length);
  const looseRef = join(gitDir, ...ref.split("/"));
  if (existsSync(looseRef)) return readFileSync(looseRef, "utf8").trim();
  const packedRefs = join(gitDir, "packed-refs");
  if (existsSync(packedRefs)) {
    const match = readFileSync(packedRefs, "utf8")
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${ref}`));
    if (match) return match.split(" ", 1)[0];
  }
  return buildInfo.commit || "unknown";
}

const sourceCommit = gitOutput(["rev-parse", "HEAD"], repositoryCommit());
const worktreeStatus = gitOutput(GIT_STATUS_ARGS, null);
const sourceDirty = sourceDirtyFromStatus(worktreeStatus);
const provenance = {
  schemaVersion: 1,
  package: basename(packagePath),
  applicationId: appInfo.id,
  applicationVersion: appInfo.version,
  sourceCommit,
  sourceDirty,
  sourceDirtyNote: sourceDirty === null ? "git status was unavailable; verify the worktree separately" : null,
  buildInfo,
  packagingMode: process.argv.indexOf("--debug") === -1 ? "release" : "debug-no-minify",
  packagingTool: {
    name: "@webos-tools/cli",
    version: cliPackage.version,
    executable: "ares-package",
  },
  nodeVersion: process.version,
  sizeBytes: packageBytes.length,
  sha256: createHash("sha256").update(packageBytes).digest("hex"),
};

if (buildInfo.commit !== "unknown" && !sourceCommit.startsWith(buildInfo.commit)) {
  throw new Error(`Package build-info commit ${buildInfo.commit} does not match ${sourceCommit}`);
}

const provenancePath = `${packagePath}.provenance.json`;
writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
console.log(`Wrote package provenance to ${provenancePath}`);
