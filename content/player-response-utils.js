(function attachPlayerResponseUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTDSPlayerUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function extractAssignedJson(source, variableName) {
    const markerIndex = source.indexOf(variableName);
    const equalsIndex = markerIndex >= 0 ? source.indexOf("=", markerIndex) : -1;
    const start = equalsIndex >= 0 ? source.indexOf("{", equalsIndex) : -1;
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  function getPageVideoId(locationValue = "") {
    try {
      const url = new URL(locationValue, "https://www.youtube.com");
      const pathMatch = url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/);
      const videoId = url.searchParams.get("v") || pathMatch?.[1] || "";
      return /^[\w-]{11}$/.test(videoId) ? videoId : "";
    } catch {
      return "";
    }
  }

  function isResponseForVideo(response, expectedVideoId = "") {
    const videoId = response?.videoDetails?.videoId || "";
    return Boolean(videoId && (!expectedVideoId || videoId === expectedVideoId));
  }

  function selectPlayerResponse(candidates, expectedVideoId = "") {
    return (candidates || []).find((response) => isResponseForVideo(response, expectedVideoId)) || null;
  }

  function buildNativeTranslationTrack(response, targetLanguage = "zh-Hans", preferredSourceLanguage = "en") {
    const renderer = response?.captions?.playerCaptionsTracklistRenderer;
    const tracks = renderer?.captionTracks || [];
    const sourceTrack = tracks.find((track) => track.languageCode === preferredSourceLanguage)
      || tracks.find((track) => track.languageCode?.startsWith(`${preferredSourceLanguage}-`))
      || tracks.find((track) => track.isTranslatable)
      || null;
    if (!sourceTrack) return null;

    const translationLanguage = (renderer?.translationLanguages || [])
      .find((language) => language.languageCode === targetLanguage)
      || { languageCode: targetLanguage };
    const track = {
      languageCode: sourceTrack.languageCode,
      translationLanguage
    };
    for (const key of ["kind", "vssId", "name"]) {
      if (sourceTrack[key]) track[key] = sourceTrack[key];
    }
    return track;
  }

  return {
    buildNativeTranslationTrack,
    extractAssignedJson,
    getPageVideoId,
    isResponseForVideo,
    selectPlayerResponse
  };
});
