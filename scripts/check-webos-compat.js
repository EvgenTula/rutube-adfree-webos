import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

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
  { extensions: [".js"], pattern: /\.(?:at|replaceAll|findLast|findLastIndex|toReversed|toSorted|toSpliced|isWellFormed|toWellFormed)\s*\(/g, name: "post-Chromium-79 instance API" },
  { extensions: [".js"], pattern: /\b(?:structuredClone|WeakRef|FinalizationRegistry|AggregateError|EyeDropper)\b/g, name: "post-Chromium-79 global API" },
  { extensions: [".js"], pattern: /\b(?:Object\.hasOwn|Object\.groupBy|Map\.groupBy|Promise\.any|Promise\.withResolvers|Array\.fromAsync|URL\.canParse|crypto\.randomUUID|AbortSignal\.(?:any|timeout))\s*\(/g, name: "post-Chromium-79 static API" },
  { extensions: [".js"], pattern: /\bIntl\.(?:DisplayNames|Segmenter)\b/g, name: "post-Chromium-79 Intl API" },
  { extensions: [".js"], pattern: /\.(?:replaceChildren|requestVideoFrameCallback)\s*\(/g, name: "post-Chromium-79 DOM/media API" },
  { extensions: [".css"], pattern: /(^|[;{}\s])gap\s*:/gm, name: "CSS gap shorthand (unsafe for Chromium 79 flex layouts)" },
  { extensions: [".css"], pattern: /(^|[;{}\s])color-scheme\s*:/gm, name: "CSS color-scheme (not available in Chromium 79)" },
  { extensions: [".css"], pattern: /(^|[;{}\s])(?:aspect-ratio|inset(?:-block|-inline)?|content-visibility|contain-intrinsic-size|scrollbar-gutter|accent-color|container-type|container-name|text-wrap)\s*:/gm, name: "post-Chromium-79 CSS property" },
  { extensions: [".css"], pattern: /:focus-visible\b|:(?:has|is|where)\s*\(/gm, name: "post-Chromium-79 CSS selector" },
  { extensions: [".css"], pattern: /@(?:container|layer|property)\b|\bcolor-mix\s*\(|\bsubgrid\b|\b(?:dvh|dvw|svh|svw|lvh|lvw)\b/gm, name: "post-Chromium-79 CSS feature" },
];

const findings = [];
for (const path of filesBelow(sourceRoot)) {
  const extension = path.slice(path.lastIndexOf("."));
  const source = readFileSync(path, "utf8");
  if (extension === ".js") {
    try {
      parse(source, { ecmaVersion: 2019, sourceType: "module" });
    } catch (error) {
      const line = error && error.loc && error.loc.line ? error.loc.line : 1;
      findings.push(`${relative(projectRoot, path)}:${line}: syntax newer than the ES2019 ceiling`);
    }
  }
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
