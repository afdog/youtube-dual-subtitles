(function attachTranscriptUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SubtitleTranscriptUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function overlapScore(left, right) {
    return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  }

  function bestMatch(cue, candidates, fromIndex = 0) {
    let best = null;
    let bestIndex = fromIndex;
    let bestScore = 0;
    const windowEnd = cue.end + 8;
    for (let index = Math.max(0, fromIndex - 2); index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate.start > windowEnd) break;
      const score = overlapScore(cue, candidate);
      if (score > bestScore) {
        best = candidate;
        bestIndex = index;
        bestScore = score;
      }
    }
    return { cue: best, index: bestIndex };
  }

  function mergeTranscript(english = [], chinese = []) {
    const primaryIsEnglish = english.length > 0;
    const primary = primaryIsEnglish ? english : chinese;
    const secondary = primaryIsEnglish ? chinese : english;
    let secondaryIndex = 0;

    return primary.map((cue, index) => {
      const match = bestMatch(cue, secondary, secondaryIndex);
      if (match.cue) secondaryIndex = match.index;
      const secondaryCue = match.cue;
      return {
        id: `${Math.round(cue.start * 1000)}-${index}`,
        start: cue.start,
        end: Math.max(cue.end, secondaryCue?.end || cue.end),
        english: primaryIsEnglish ? cue.text : (secondaryCue?.text || ""),
        chinese: primaryIsEnglish ? (secondaryCue?.text || "") : cue.text
      };
    });
  }

  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remaining = value % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
      : `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  return { bestMatch, formatTime, mergeTranscript, overlapScore };
});
