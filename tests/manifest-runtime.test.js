const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const runtimeFiles = [
  "content/local-whisper-utils.js",
  "content/local-whisper.js",
  "content/caption-utils.js",
  "content/content.js",
  "content/learning-panel.js",
  "content/player-bridge.js",
  "content/player-response-utils.js",
  "content/transcript-utils.js",
  "popup/popup.html",
  "popup/popup.js",
  "popup/popup.css"
];

function runtimeSource() {
  return runtimeFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
}

test("manifest is a standalone YouTube dual-subtitles 2.0.0 extension", () => {
  assert.equal(manifest.name, "YouTube 双字幕");
  assert.equal(manifest.version, "2.0.0");
  assert.match(manifest.description, /YouTube/);
  assert.deepEqual(manifest.permissions, ["storage", "offscreen"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://www.youtube.com/*",
    "https://huggingface.co/*",
    "https://*.huggingface.co/*",
    "https://*.hf.co/*"
  ]);
  assert.equal(
    manifest.content_security_policy.extension_pages,
    "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  );
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(fs.existsSync(path.join(root, "offscreen", "engine.html")), true);
  assert.deepEqual(manifest.content_scripts[1].js.at(-1), "content/local-whisper.js");
});

test("local recognition is opt-in and does not require microphone or tab capture permissions", () => {
  const localCapture = fs.readFileSync(path.join(root, "content/local-whisper.js"), "utf8");
  const engine = fs.readFileSync(path.join(root, "src/local-whisper-engine.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "src/local-whisper-service-worker.js"), "utf8");

  assert.equal(manifest.permissions.includes("microphone"), false);
  assert.equal(manifest.permissions.includes("tabCapture"), false);
  assert.equal(manifest.permissions.includes("offscreen"), true);
  assert.match(localCapture, /captureStream/);
  assert.doesNotMatch(localCapture, /getUserMedia|tabCapture/);
  assert.match(localCapture, /new MediaStream\(audioTracks\)/);
  assert.match(localCapture, /status === nextStatus && lastError === error/);
  assert.match(engine, /onnx-community\/whisper-tiny/);
  assert.match(engine, /Xenova\/opus-mt-en-zh/);
  assert.match(engine, /allowLocalModels = false/);
  assert.match(engine, /useBrowserCache = true/);
  assert.match(engine, /revision: WHISPER_REVISION/);
  assert.match(engine, /revision: TRANSLATION_REVISION/);
  assert.match(engine, /dtype: "q8"/);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.devDependencies["@huggingface/transformers"], "3.7.3");
  assert.match(localCapture, /translationOnly/);
  assert.match(localCapture, /YTDS_LOCAL_TRANSLATE/);
  assert.match(engine, /TRANSLATION_BATCH_SIZE/);
  assert.match(engine, /sessionComplete/);
  assert.match(serviceWorker, /chrome\.offscreen\.createDocument/);
  assert.match(serviceWorker, /reasons: \["WORKERS"\]/);
  assert.doesNotMatch(serviceWorker, /@huggingface|pipeline\(|onnx/);
});

test("commercial messages and service references are absent from runtime", () => {
  const source = runtimeSource();
  const withoutLegacyCleanup = source.replace(
    /sc(?:DeviceId|Entitlement|EntitlementToken|EntitlementPublicJwk|EntitlementUpdatedAt)/g,
    ""
  );

  const removedMessages = [
    ["SC", "GET_ENTITLEMENT"],
    ["SC", "START_TRIAL"],
    ["SC", "ACTIVATE_LICENSE"],
    ["SC", "REFRESH_LICENSE"],
    ["SC", "OPEN_SITE"]
  ].map(([scope, action]) => `${scope}_${action}`);
  for (const message of removedMessages) assert.doesNotMatch(source, new RegExp(message));
  assert.doesNotMatch(withoutLegacyCleanup, /license|entitlement|trial|refund|payment|validationMode|localhost|127\.0\.0\.1/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|importScripts\(/);
});

test("learning panel keeps transcript and controls ungated", () => {
  const panel = fs.readFileSync(path.join(root, "content/learning-panel.js"), "utf8");

  assert.match(panel, /function renderRows\(\)/);
  assert.match(panel, /function selectRow\(rowId\)/);
  assert.match(panel, /function toggleLoop\(\)/);
  assert.match(panel, /function toggleAutoPause\(\)/);
  assert.match(panel, /id="transcript"/);
  assert.match(panel, /id="sc-loop"/);
  assert.match(panel, /id="sc-pause"/);
  assert.doesNotMatch(panel, /isPro|entitlement|renderGate/);
});

test("legacy authorization storage is removed without creating a device id", () => {
  const content = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "popup/popup.js"), "utf8");

  for (const source of [content, popup]) {
    assert.match(source, /chrome\.storage\.local\.remove\(LEGACY_AUTH_KEYS\)/);
    for (const key of [
      "scDeviceId",
      "scEntitlement",
      "scEntitlementToken",
      "scEntitlementPublicJwk",
      "scEntitlementUpdatedAt"
    ]) assert.match(source, new RegExp(`"${key}"`));
    assert.doesNotMatch(source, /crypto\.randomUUID/);
  }
});

test("runtime messages retain panel toggle, status, and transcript paths", () => {
  const source = runtimeSource();

  assert.match(source, /SC_TOGGLE_PANEL/);
  assert.match(source, /requestPanelToggle/);
  assert.match(source, /setTimeout\(\(\) => requestPanelToggle/);
  assert.match(source, /YTDS_GET_STATUS/);
  assert.match(source, /SC_GET_TRANSCRIPT/);
  assert.match(source, /sc:transcript-update/);
  assert.match(source, /ytds:local-whisper-state/);
  assert.match(source, /ytds:local-whisper-result/);
});

test("release allowlist contains only Chrome runtime files", () => {
  const allowlist = fs.readFileSync(path.join(root, "scripts/package-files.mjs"), "utf8");

  assert.match(allowlist, /manifest\.json/);
  assert.match(allowlist, /LICENSE/);
  assert.match(allowlist, /content\/learning-panel\.js/);
  assert.match(allowlist, /background\/service-worker\.js/);
  assert.match(allowlist, /offscreen\/engine\.html/);
  assert.match(allowlist, /offscreen\/engine\.js/);
  assert.match(allowlist, /content\/local-whisper\.js/);
  assert.match(allowlist, /background\/ort-wasm-simd-threaded\.wasm/);
  assert.match(allowlist, /popup\/popup\.html/);
  assert.match(allowlist, /icons\/icon128\.png/);
  assert.doesNotMatch(allowlist, /tests\/|docs\/|node_modules|dist\/|\.git/);
});

test("release scripts validate the generated archive against the runtime allowlist", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const checker = fs.readFileSync(path.join(root, "scripts/check-release.mjs"), "utf8");

  assert.match(packageJson.scripts.package, /check:release/);
  assert.match(checker, /PACKAGE_FILES/);
  assert.match(checker, /manifest_version !== 3/);
  assert.match(checker, /uncompressedSize/);
});
