import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { PACKAGE_FILES } from "./package-files.mjs";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const versionPattern = /^\d+\.\d+\.\d+$/;

if (!versionPattern.test(packageJson.version)) {
  throw new Error(`package.json version must be numeric semver (found ${packageJson.version})`);
}
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${packageJson.version}`) {
  throw new Error(`tag ${process.env.GITHUB_REF_NAME} does not match package version ${packageJson.version}`);
}
if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3");
}
if (manifest.version !== packageJson.version) {
  throw new Error(`manifest.json version ${manifest.version} does not match package.json ${packageJson.version}`);
}

const missing = PACKAGE_FILES.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) {
  throw new Error(`refusing to package; missing release file(s): ${missing.join(", ")}`);
}

const outputDir = path.join(root, "dist");
const outputName = `youtube-dual-subtitles-v${packageJson.version}.zip`;
const outputZip = path.join(outputDir, outputName);
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-dual-subtitles-"));

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function writeZip(files) {
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const relativePath of files) {
    const name = Buffer.from(relativePath, "utf8");
    const data = fs.readFileSync(path.join(stagingRoot, relativePath));
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);
    localParts.push(localHeader, data);

    const centralHeader = Buffer.alloc(46 + name.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(outputZip, Buffer.concat([...localParts, centralDirectory, end]));
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(outputZip, { force: true });

  for (const relativePath of PACKAGE_FILES) {
    const sourcePath = path.join(root, relativePath);
    const targetPath = path.join(stagingRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }

  writeZip(PACKAGE_FILES);

  console.log(`created ${path.relative(root, outputZip)} (${PACKAGE_FILES.length} files)`);
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
