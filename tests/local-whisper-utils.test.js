const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilsPath = path.join(__dirname, "..", "content", "local-whisper-utils.js");
const {
  encodeFloat32Base64,
  getLocalWhisperStatusLabel,
  normalizeWhisperChunks
} = require(utilsPath);

test("normalizes timestamp, start/end, and offsets Whisper chunk shapes", () => {
  const cues = normalizeWhisperChunks([
    { timestamp: [2, 3], text: "third" },
    { start: 0, end: 1, text: "first" },
    { offsets: [1, 2], text: "second" }
  ]);

  assert.deepEqual(cues, [
    { start: 0, end: 1, text: "first" },
    { start: 1, end: 2, text: "second" },
    { start: 2, end: 3, text: "third" }
  ]);
});

test("drops empty text, clamps negative starts, and repairs unusable boundaries", () => {
  const cues = normalizeWhisperChunks([
    { start: 0, end: 1, text: "" },
    { start: 1, end: 2, text: "   " },
    { start: -2, end: 1, text: "clamped" },
    { start: 3, end: 2, text: "backwards" },
    { start: "not-a-number", end: 4, text: "invalid" }
  ]);

  assert.deepEqual(cues, [
    { start: 0, end: 1, text: "clamped" },
    { start: 3, end: 3.25, text: "backwards" }
  ]);
});

test("uses a deterministic small fallback when the end timestamp is null", () => {
  const input = [
    { timestamp: [5, null], text: "pending end" },
    { start: 7, end: undefined, text: "missing end" }
  ];
  const first = normalizeWhisperChunks(input);
  const second = normalizeWhisperChunks(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first, [
    { start: 5, end: 5.25, text: "pending end" },
    { start: 7, end: 7.25, text: "missing end" }
  ]);
});

test("repairs overlaps by clipping an earlier cue at the next cue start", () => {
  const cues = normalizeWhisperChunks([
    { start: 1, end: 4, text: "earlier" },
    { start: 3, end: 5, text: "later" }
  ]);

  assert.deepEqual(cues, [
    { start: 1, end: 3, text: "earlier" },
    { start: 3, end: 5, text: "later" }
  ]);
});

test("sorts cues by start time with repeatable output", () => {
  const input = [
    { start: 4, end: 5, text: "four" },
    { start: 0, end: 1, text: "zero" },
    { start: 2, end: 3, text: "two" }
  ];

  const first = normalizeWhisperChunks(input);
  const second = normalizeWhisperChunks(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((cue) => cue.text), ["zero", "two", "four"]);
});

test("returns concise Chinese labels for every supported local Whisper status", () => {
  const labels = {
    idle: "待机",
    loading: "加载中",
    recording: "录音中",
    transcribing: "转写中",
    ready: "就绪",
    error: "出错",
    stopped: "已停止"
  };

  for (const [status, label] of Object.entries(labels)) {
    assert.equal(getLocalWhisperStatusLabel(status), label);
  }
});

test("attaches the same API to the browser global", () => {
  const source = fs.readFileSync(utilsPath, "utf8");
  const browserGlobal = {};
  vm.runInNewContext(source, { globalThis: browserGlobal, btoa });

  assert.equal(typeof browserGlobal.YTDSLocalWhisperUtils.normalizeWhisperChunks, "function");
  assert.equal(typeof browserGlobal.YTDSLocalWhisperUtils.getLocalWhisperStatusLabel, "function");
  assert.equal(typeof browserGlobal.YTDSLocalWhisperUtils.encodeFloat32Base64, "function");
});

test("encodes Float32 audio as a JSON-safe base64 string", async () => {
  const input = new Float32Array([0, 0.25, -0.5, 1, -1]);
  const encoded = encodeFloat32Base64(input);
  const { decodeFloat32Base64 } = await import("../src/audio-message-codec.mjs");
  const decoded = decodeFloat32Base64(JSON.parse(JSON.stringify(encoded)));

  assert.equal(typeof encoded, "string");
  assert.deepEqual([...decoded], [...input]);
});
