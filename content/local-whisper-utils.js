(() => {
  const FALLBACK_DURATION = 0.25;
  const STATUS_LABELS = Object.freeze({
    idle: "待机",
    loading: "加载中",
    recording: "录音中",
    transcribing: "转写中",
    ready: "就绪",
    error: "出错",
    stopped: "已停止"
  });

  function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readBounds(chunk) {
    const bounds = Array.isArray(chunk?.timestamp)
      ? chunk.timestamp
      : Array.isArray(chunk?.offsets)
        ? chunk.offsets
        : [chunk?.start, chunk?.end];
    return { start: bounds[0], end: bounds[1] };
  }

  function normalizeWhisperChunks(chunks, options = {}) {
    const offset = toFiniteNumber(options.offset) ?? 0;
    const fallbackDuration = Math.max(0.05, toFiniteNumber(options.fallbackDuration) ?? FALLBACK_DURATION);
    const normalized = (Array.isArray(chunks) ? chunks : []).map((chunk, index) => {
      const text = String(chunk?.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) return null;
      const bounds = readBounds(chunk);
      const rawStart = toFiniteNumber(bounds.start);
      if (rawStart === null) return null;
      const start = Math.max(0, rawStart + offset);
      const rawEnd = toFiniteNumber(bounds.end);
      const end = rawEnd !== null && rawEnd > rawStart
        ? Math.max(start, rawEnd + offset)
        : start + fallbackDuration;
      return { start, end, text, index };
    }).filter(Boolean).sort((left, right) => left.start - right.start || left.index - right.index);

    const result = [];
    for (const cue of normalized) {
      const next = { start: cue.start, end: cue.end, text: cue.text };
      const previous = result.at(-1);
      if (previous && previous.end > next.start) {
        previous.end = next.start;
        if (previous.end <= previous.start) result.pop();
      }
      result.push(next);
    }
    return result;
  }

  function getLocalWhisperStatusLabel(status) {
    return STATUS_LABELS[status] || "本地识别";
  }

  function encodeFloat32Base64(samples) {
    if (!(samples instanceof Float32Array)) throw new TypeError("Expected Float32Array audio samples");
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  const api = { normalizeWhisperChunks, getLocalWhisperStatusLabel, encodeFloat32Base64 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.YTDSLocalWhisperUtils = api;
})();
