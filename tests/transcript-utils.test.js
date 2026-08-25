const assert = require("node:assert/strict");
const test = require("node:test");
const { formatTime, mergeTranscript, overlapScore } = require("../content/transcript-utils.js");

test("merges bilingual cues by time overlap", () => {
  const rows = mergeTranscript(
    [{ start: 0, end: 2, text: "Good morning" }, { start: 2, end: 4, text: "Welcome back" }],
    [{ start: 0.1, end: 2.1, text: "早上好" }, { start: 2.1, end: 4.2, text: "欢迎回来" }]
  );
  assert.deepEqual(rows.map(({ english, chinese }) => ({ english, chinese })), [
    { english: "Good morning", chinese: "早上好" },
    { english: "Welcome back", chinese: "欢迎回来" }
  ]);
});

test("falls back to a single language transcript", () => {
  const rows = mergeTranscript([], [{ start: 5, end: 7, text: "只有中文" }]);
  assert.equal(rows[0].chinese, "只有中文");
  assert.equal(rows[0].english, "");
});

test("formats time and computes overlap", () => {
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3661), "1:01:01");
  assert.equal(overlapScore({ start: 1, end: 3 }, { start: 2, end: 4 }), 1);
});
