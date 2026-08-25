(function attachCaptionUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTDSUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function isEnglish(code = "") {
    return /^en(?:-|$)/i.test(code);
  }

  function isChinese(code = "") {
    return /^(?:zh|cmn|yue)(?:-|$)/i.test(code);
  }

  function chooseCaptionTracks(tracks) {
    const available = (tracks || []).filter((track) => track?.baseUrl);
    if (!available.length) return { english: null, chinese: null };

    const englishDirect = available.filter((track) => isEnglish(track.languageCode));
    const chineseDirect = available.filter((track) => isChinese(track.languageCode));
    const translatable = available.filter((track) => track.isTranslatable);
    const preferredTranslationSources = englishDirect.filter((track) => track.isTranslatable);
    const translationSources = (preferredTranslationSources.length ? preferredTranslationSources : translatable).slice(0, 3);

    function createSelection(candidates) {
      if (!candidates.length) return null;
      return { ...candidates[0], alternatives: candidates.slice(1) };
    }

    const englishCandidates = englishDirect.length
      ? [
          ...englishDirect.map((track) => ({ track, translateTo: null })),
          ...translatable
            .filter((track) => !isEnglish(track.languageCode))
            .slice(0, 1)
            .map((track) => ({ track, translateTo: "en" }))
        ]
      : translatable.slice(0, 3).map((track) => ({ track, translateTo: "en" }));

    const chineseCandidates = [
      ...chineseDirect.map((track) => ({ track, translateTo: null })),
      ...translationSources
        .filter((track) => !isChinese(track.languageCode))
        .map((track) => ({ track, translateTo: "zh-Hans" }))
    ];

    const english = createSelection(englishCandidates);
    const chinese = createSelection(chineseCandidates);

    return { english, chinese };
  }

  function buildCaptionUrls(selection) {
    if (!selection?.track?.baseUrl) return null;
    const targetLanguages = [selection.translateTo || null];

    return targetLanguages.flatMap((targetLanguage) => ["json3", null].map((format) => {
      const url = new URL(selection.track.baseUrl);
      if (format) url.searchParams.set("fmt", format);
      else url.searchParams.delete("fmt");
      if (targetLanguage) url.searchParams.set("tlang", targetLanguage);
      else url.searchParams.delete("tlang");
      return url.toString();
    }));
  }

  function buildCaptionUrl(selection) {
    return buildCaptionUrls(selection)?.[0] || null;
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u200b/g, "")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseCaptionResponse(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const textEvents = events.filter((event) => Array.isArray(event.segs));

    return textEvents.map((event, index) => {
      const startMs = Number(event.tStartMs || 0);
      const nextStartMs = Number(textEvents[index + 1]?.tStartMs || 0);
      const explicitDuration = Number(event.dDurationMs || 0);
      const inferredDuration = nextStartMs > startMs ? nextStartMs - startMs : 5000;
      const durationMs = explicitDuration || inferredDuration;
      const text = normalizeText(event.segs.map((segment) => segment.utf8 || "").join(""));

      return {
        start: startMs / 1000,
        end: (startMs + Math.max(durationMs, 250)) / 1000,
        text
      };
    }).filter((cue) => cue.text);
  }

  function findCue(cues, time) {
    if (!Array.isArray(cues) || !cues.length) return null;

    let low = 0;
    let high = cues.length - 1;
    let candidate = -1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (cues[middle].start <= time) {
        candidate = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    for (let index = candidate; index >= Math.max(0, candidate - 4); index -= 1) {
      const cue = cues[index];
      if (time >= cue.start && time < cue.end) return cue;
    }
    return null;
  }

  function createPendingCaptionStore(limit = 8) {
    const entries = new Map();
    const maximumSize = Math.max(1, Number(limit) || 1);

    return {
      put(videoId, observedCaption) {
        if (!videoId || !observedCaption) return;
        entries.delete(videoId);
        entries.set(videoId, observedCaption);
        while (entries.size > maximumSize) {
          entries.delete(entries.keys().next().value);
        }
      },
      take(videoId) {
        const observedCaption = entries.get(videoId) || null;
        entries.delete(videoId);
        return observedCaption;
      },
      size() {
        return entries.size;
      }
    };
  }

  return {
    buildCaptionUrl,
    buildCaptionUrls,
    chooseCaptionTracks,
    createPendingCaptionStore,
    findCue,
    isChinese,
    isEnglish,
    normalizeText,
    parseCaptionResponse
  };
});
