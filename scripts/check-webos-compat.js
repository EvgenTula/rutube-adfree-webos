import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(projectRoot, "src");

function filesBelow(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...filesBelow(path));
    else files.push(path);
  }
  return files;
}

const checks = [
  { extensions: [".js"], pattern: /\?\.(?![0-9])/g, name: "optional chaining" },
  { extensions: [".js"], pattern: /\?\?(?!=)/g, name: "nullish coalescing" },
  { extensions: [".js"], pattern: /(?:\|\||&&|\?\?)=/g, name: "logical assignment" },
  { extensions: [".js"], pattern: /\.(?:at|replaceAll)\s*\(/g, name: "post-Chromium-79 String/Array API" },
  { extensions: [".js"], pattern: /\b(?:structuredClone|WeakRef|FinalizationRegistry|AggregateError)\b/g, name: "post-Chromium-79 global API" },
  { extensions: [".js"], pattern: /\b(?:Object\.hasOwn|Promise\.any)\s*\(/g, name: "post-Chromium-79 static API" },
  { extensions: [".css"], pattern: /(^|[;{}\s])gap\s*:/gm, name: "CSS gap shorthand (unsafe for Chromium 79 flex layouts)" },
  { extensions: [".css"], pattern: /(^|[;{}\s])color-scheme\s*:/gm, name: "CSS color-scheme (not available in Chromium 79)" },
];

const findings = [];
for (const path of filesBelow(sourceRoot)) {
  const extension = path.slice(path.lastIndexOf("."));
  const source = readFileSync(path, "utf8");
  for (const check of checks) {
    if (check.extensions.indexOf(extension) === -1) continue;
    check.pattern.lastIndex = 0;
    let match = check.pattern.exec(source);
    while (match) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relative(projectRoot, path)}:${line}: ${check.name}`);
      match = check.pattern.exec(source);
    }
  }
}

if (findings.length > 0) {
  throw new Error(`webOS 6 / Chromium 79 compatibility check failed:\n${findings.join("\n")}`);
}

console.log("Checked shipped JavaScript and CSS for known Chromium 79 incompatibilities");
