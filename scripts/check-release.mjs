import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PACKAGE_FILES } from "./package-files.mjs";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const zipPath = path.join(root, "dist", `youtube-dual-subtitles-v${packageJson.version}.zip`);

if (!fs.existsSync(zipPath)) throw new Error(`release ZIP not found: ${path.relative(root, zipPath)}`);

const archive = fs.readFileSync(zipPath);
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

function findEndOfCentralDirectory() {
  const minimum = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("release ZIP has no end-of-central-directory record");
}

function readLocalEntry(offset) {
  if (archive.readUInt32LE(offset) !== LOCAL_FILE_HEADER) throw new Error(`invalid local header at ${offset}`);
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const compressedSize = archive.readUInt32LE(offset + 18);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > archive.length) throw new Error(`truncated ZIP entry at ${offset}`);
  return {
    name: archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"),
    data: archive.subarray(dataStart, dataEnd)
  };
}

const endOffset = findEndOfCentralDirectory();
const entryCount = archive.readUInt16LE(endOffset + 10);
const centralSize = archive.readUInt32LE(endOffset + 12);
const centralOffset = archive.readUInt32LE(endOffset + 16);
if (centralOffset + centralSize > archive.length) throw new Error("release ZIP central directory is truncated");

const entries = [];
let cursor = centralOffset;
for (let index = 0; index < entryCount; index += 1) {
  if (archive.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER) throw new Error(`invalid central header at ${cursor}`);
  const nameLength = archive.readUInt16LE(cursor + 28);
  const extraLength = archive.readUInt16LE(cursor + 30);
  const commentLength = archive.readUInt16LE(cursor + 32);
  const compressionMethod = archive.readUInt16LE(cursor + 10);
  const compressedSize = archive.readUInt32LE(cursor + 20);
  const uncompressedSize = archive.readUInt32LE(cursor + 24);
  const localOffset = archive.readUInt32LE(cursor + 42);
  const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
  if (compressionMethod !== 0) throw new Error(`release entry is unexpectedly compressed: ${name}`);

  const local = readLocalEntry(localOffset);
  if (local.name !== name || local.data.length !== compressedSize || compressedSize !== uncompressedSize) {
    throw new Error(`release entry metadata mismatch: ${name}`);
  }
  entries.push({ name, data: local.data });
  cursor += 46 + nameLength + extraLength + commentLength;
}

const names = entries.map((entry) => entry.name);
if (JSON.stringify(names) !== JSON.stringify(PACKAGE_FILES)) {
  throw new Error(`release ZIP contents do not match the allowlist: ${names.join(", ")}`);
}

const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
const manifest = JSON.parse(manifestEntry.data.toString("utf8"));
if (manifest.manifest_version !== 3 || manifest.version !== packageJson.version) {
  throw new Error("release ZIP manifest does not match the package version or Manifest V3");
}

console.log(`release ZIP check passed: ${path.relative(root, zipPath)} (${entries.length} files)`);
