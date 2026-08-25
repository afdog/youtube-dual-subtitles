const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildCaptionUrl,
  buildCaptionUrls,
  chooseCaptionTracks,
  createPendingCaptionStore,
  findCue,
  parseCaptionResponse
} = require("../content/caption-utils.js");

test("chooses direct English and translates it to Chinese", () => {
  const englishTrack = {
    baseUrl: "https://www.youtube.com/api/timedtext?v=video&lang=en",
    languageCode: "en",
    isTranslatable: true
  };
  const selection = chooseCaptionTracks([englishTrack]);

  assert.equal(selection.english.track, englishTrack);
  assert.equal(selection.english.translateTo, null);
  assert.equal(selection.chinese.track, englishTrack);
  assert.equal(selection.chinese.translateTo, "zh-Hans");
});

test("prefers direct Chinese captions when available", () => {
  const englishTrack = { baseUrl: "https://example.com/en", languageCode: "en", isTranslatable: true };
  const chineseTrack = { baseUrl: "https://example.com/zh", languageCode: "zh-Hans", isTranslatable: true };
  const selection = chooseCaptionTracks([englishTrack, chineseTrack]);

  assert.equal(selection.chinese.track, chineseTrack);
  assert.equal(selection.chinese.translateTo, null);
});

test("keeps alternate English tracks as fallbacks", () => {
  const manual = { baseUrl: "https://example.com/manual", languageCode: "en", isTranslatable: true };
  const automatic = { baseUrl: "https://example.com/asr", languageCode: "en", kind: "asr", isTranslatable: true };
  const selection = chooseCaptionTracks([manual, automatic]);

  assert.equal(selection.english.track, manual);
  assert.equal(selection.english.alternatives.length, 1);
  assert.equal(selection.english.alternatives[0].track, automatic);
  assert.equal(selection.chinese.alternatives[0].track, automatic);
  assert.equal(selection.chinese.alternatives[0].translateTo, "zh-Hans");
});

test("builds JSON3 translated caption URL", () => {
  const url = buildCaptionUrl({
    track: { baseUrl: "https://www.youtube.com/api/timedtext?v=video&lang=en" },
    translateTo: "zh-Hans"
  });
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("fmt"), "json3");
  assert.equal(parsed.searchParams.get("tlang"), "zh-Hans");
});

test("builds only the supported Chinese target in two response formats", () => {
  const urls = buildCaptionUrls({
    track: { baseUrl: "https://www.youtube.com/api/timedtext?v=video&lang=en" },
    translateTo: "zh-Hans"
  }).map((url) => new URL(url));

  assert.equal(urls.length, 2);
  assert.deepEqual([...new Set(urls.map((url) => url.searchParams.get("tlang")))], ["zh-Hans"]);
  assert.deepEqual(urls.slice(0, 2).map((url) => url.searchParams.get("fmt")), ["json3", null]);
});

test("parses JSON3 events and finds active cue", () => {
  const cues = parseCaptionResponse({
    events: [
      { tStartMs: 1000, dDurationMs: 1500, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
      { tStartMs: 3000, dDurationMs: 1000, segs: [{ utf8: "Next line" }] }
    ]
  });

  assert.deepEqual(cues[0], { start: 1, end: 2.5, text: "Hello world" });
  assert.equal(findCue(cues, 2)?.text, "Hello world");
  assert.equal(findCue(cues, 2.8), null);
  assert.equal(findCue(cues, 3.2)?.text, "Next line");
});

test("replays an early observed caption after the video becomes current", () => {
  const store = createPendingCaptionStore(2);
  const observed = { url: "https://www.youtube.com/api/timedtext?v=abcdefghijk&pot=token", body: "captions" };

  store.put("abcdefghijk", observed);
  assert.equal(store.take("abcdefghijk"), observed);
  assert.equal(store.take("abcdefghijk"), null);
});

test("bounds pending observed captions during long browsing sessions", () => {
  const store = createPendingCaptionStore(2);

  store.put("video000001", { body: "first" });
  store.put("video000002", { body: "second" });
  store.put("video000003", { body: "third" });

  assert.equal(store.size(), 2);
  assert.equal(store.take("video000001"), null);
  assert.equal(store.take("video000003").body, "third");
});
