import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const sourceCommit = gitOutput(["rev-parse", "HEAD"], buildInfo.commit || "unknown");
const trackedChanges = gitOutput(["status", "--porcelain", "--untracked-files=no"], "unknown");
const provenance = {
  schemaVersion: 1,
  package: basename(packagePath),
  applicationId: appInfo.id,
  applicationVersion: appInfo.version,
  sourceCommit,
  sourceDirty: trackedChanges === "unknown" ? null : trackedChanges.length > 0,
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
