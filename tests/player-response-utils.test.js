const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildNativeTranslationTrack,
  extractAssignedJson,
  getPageVideoId,
  selectPlayerResponse
} = require("../content/player-response-utils.js");

function playerResponse(videoId) {
  return { videoDetails: { videoId } };
}

test("extracts the current inline player response", () => {
  const source = 'var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abcdefghijk"},"nested":{"copy":"a } brace"}};';
  const response = extractAssignedJson(source, "ytInitialPlayerResponse");

  assert.equal(response.videoDetails.videoId, "abcdefghijk");
  assert.equal(response.nested.copy, "a } brace");
});

test("reads watch, Shorts and live video ids from YouTube URLs", () => {
  assert.equal(getPageVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(getPageVideoId("https://www.youtube.com/shorts/12345678901"), "12345678901");
  assert.equal(getPageVideoId("https://www.youtube.com/live/ZYXWVUTSRQP"), "ZYXWVUTSRQP");
  assert.equal(getPageVideoId("https://www.youtube.com/"), "");
});

test("rejects a stale response after YouTube in-site navigation", () => {
  const staleGlobal = playerResponse("oldvideo001");
  const currentInline = playerResponse("newvideo002");
  const selected = selectPlayerResponse([null, currentInline, staleGlobal], "newvideo002");

  assert.equal(selected, currentInline);
  assert.equal(selectPlayerResponse([staleGlobal], "newvideo002"), null);
});

test("builds the native YouTube simplified Chinese track request", () => {
  const response = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ languageCode: "en", kind: "asr", vssId: "a.en", isTranslatable: true }],
        translationLanguages: [{ languageCode: "zh-Hans", languageName: { simpleText: "Chinese (Simplified)" } }]
      }
    }
  };

  assert.deepEqual(buildNativeTranslationTrack(response), {
    languageCode: "en",
    translationLanguage: {
      languageCode: "zh-Hans",
      languageName: { simpleText: "Chinese (Simplified)" }
    },
    kind: "asr",
    vssId: "a.en"
  });
});
