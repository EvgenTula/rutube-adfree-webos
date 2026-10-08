import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { readRepositoryCommit } from "./git-metadata.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(projectRoot, "src");
const outputDir = join(projectRoot, "dist");

if (dirname(outputDir) !== projectRoot || !outputDir.endsWith("dist")) {
  throw new Error(`Refusing to replace unexpected output directory: ${outputDir}`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function createBrandPng(width, height, { splash = false } = {}) {
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);
  const logoSize = splash ? Math.round(Math.min(width, height) * 0.22) : Math.round(width * 0.72);
  const logoLeft = Math.round((width - logoSize) / 2);
  const logoTop = Math.round((height - logoSize) / 2);

  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const inLogo =
        x >= logoLeft &&
        x < logoLeft + logoSize &&
        y >= logoTop &&
        y < logoTop + logoSize;
      const localX = x - logoLeft;
      const localY = y - logoTop;
      const inPlay =
        inLogo &&
        localX > logoSize * 0.34 &&
        localX < logoSize * 0.76 &&
        Math.abs(localY - logoSize / 2) < (localX - logoSize * 0.28) * 0.7;

      const color = inPlay
        ? [255, 255, 255, 255]
        : inLogo
          ? [255, 54, 85, 255]
          : [23, 24, 32, 255];
      pixels.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function resolveCommit() {
  const suppliedCommit = process.env.APP_COMMIT?.trim();
  if (suppliedCommit && /^[0-9a-f]{7,40}$/i.test(suppliedCommit)) {
    return suppliedCommit;
  }
  const repositoryCommit = readRepositoryCommit(projectRoot);
  return repositoryCommit ? repositoryCommit.slice(0, 12) : "unknown";
}

rmSync(outputDir, { force: true, recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });
mkdirSync(join(outputDir, "assets"), { recursive: true });
const appInfo = JSON.parse(readFileSync(join(sourceDir, "appinfo.json"), "utf8"));
writeFileSync(
  join(outputDir, "build-info.json"),
  `${JSON.stringify({ version: appInfo.version, commit: resolveCommit() }, null, 2)}\n`,
);
writeFileSync(join(outputDir, "assets", "icon.png"), createBrandPng(80, 80));
writeFileSync(join(outputDir, "assets", "large-icon.png"), createBrandPng(130, 130));
writeFileSync(
  join(outputDir, "assets", "splash.png"),
  createBrandPng(1920, 1080, { splash: true }),
);

console.log(`Built webOS application in ${outputDir}`);
