import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const outputDir = resolve("dist");
const appInfoPath = join(outputDir, "appinfo.json");
const buildInfoPath = join(outputDir, "build-info.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pngDimensions(path) {
  const data = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(data.subarray(0, 8).equals(signature), `${path} is not a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

assert(existsSync(appInfoPath), "dist/appinfo.json is missing; run the build first");
const appInfo = JSON.parse(readFileSync(appInfoPath, "utf8"));
assert(existsSync(buildInfoPath), "dist/build-info.json is missing");
const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));

for (const field of ["id", "title", "type", "main", "icon", "version"]) {
  assert(typeof appInfo[field] === "string" && appInfo[field], `appinfo.${field} is required`);
}

assert(appInfo.type === "web", "appinfo.type must be web");
assert(/^[a-z0-9][a-z0-9.-]+$/.test(appInfo.id), "appinfo.id has invalid characters");
assert(/^\d+\.\d+\.\d+$/.test(appInfo.version), "appinfo.version must have three parts");
assert(appInfo.title.length <= 20, "appinfo.title exceeds 20 characters");
assert(buildInfo.version === appInfo.version, "build-info version must match appinfo");
assert(
  typeof buildInfo.commit === "string" && buildInfo.commit && buildInfo.commit !== "development",
  "build-info commit must identify the source revision or be unknown",
);

for (const resource of [appInfo.main, appInfo.icon, appInfo.largeIcon, appInfo.splashBackground]) {
  const path = join(outputDir, resource);
  assert(existsSync(path) && statSync(path).isFile(), `missing app resource: ${resource}`);
}

for (const modulePath of [
  "js/rutube-http.js",
  "js/catalog.js",
  "js/hls.js",
  "js/playback-sources.js",
]) {
  assert(existsSync(join(outputDir, modulePath)), `missing application module: ${modulePath}`);
}

const imageRequirements = [
  ["small icon", appInfo.icon, 80, 80],
  ["large icon", appInfo.largeIcon, 130, 130],
  ["splash", appInfo.splashBackground, 1920, 1080],
];

for (const [name, resource, width, height] of imageRequirements) {
  const actual = pngDimensions(join(outputDir, resource));
  assert(actual.width === width && actual.height === height, `${name} must be ${width}x${height}`);
}

console.log(`Validated ${appInfo.id} ${appInfo.version} and required resources`);
