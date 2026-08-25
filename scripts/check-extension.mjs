import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PACKAGE_FILES } from "./package-files.mjs";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const packageJson = readJson("package.json");
const manifest = readJson("manifest.json");
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
  throw new Error(`missing release file(s): ${missing.join(", ")}`);
}

const declaredFiles = new Set([
  "manifest.json",
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.icons ? Object.values(manifest.icons) : []),
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? [])
].filter(Boolean));
const allowlistedFiles = new Set(PACKAGE_FILES);
const undeclared = [...declaredFiles].filter((relativePath) => !allowlistedFiles.has(relativePath));
if (undeclared.length) {
  throw new Error(`manifest file(s) missing from release allowlist: ${undeclared.join(", ")}`);
}

console.log(`check passed: Manifest V3, version ${packageJson.version}, ${PACKAGE_FILES.length} allowlisted files`);
