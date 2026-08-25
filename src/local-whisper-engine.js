import { env, pipeline } from "@huggingface/transformers";
import { decodeFloat32Base64 } from "./audio-message-codec.mjs";

const WHISPER_MODEL = "onnx-community/whisper-tiny";
const WHISPER_REVISION = "ff4177021cc41f7db950912b73ea4fdf7d01d8e7";
const TRANSLATION_MODEL = "Xenova/opus-mt-en-zh";
const TRANSLATION_REVISION = "046f55aec303cdee3e0318604406d4df20f1e8ea";
const MAX_AUDIO_SAMPLES = 16_000 * 12;
const MAX_PENDING_TASKS = 2;
const TRANSLATION_BATCH_SIZE = 24;
const FALLBACK_DURATION = 0.25;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.useWasmCache = true;
env.backends.onnx.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL("background/ort-wasm-simd-threaded.mjs"),
  wasm: chrome.runtime.getURL("background/ort-wasm-simd-threaded.wasm")
};

let transcriberPromise = null;
let translatorPromise = null;

function send(port, message) {
  try { port.postMessage(message); } catch { /* The content page may have closed. */ }
}

function report(port, context, status, extra = {}) {
  send(port, {
    type: "YTDS_LOCAL_STATUS",
    videoId: context.videoId,
    sessionId: context.sessionId,
    status,
    ...extra
  });
}

function progressCallback(port, context, stage) {
  let lastProgress = -1;
  return (info = {}) => {
    const progress = Number(info.progress);
    if (!Number.isFinite(progress) || progress < lastProgress + 4) return;
    lastProgress = progress;
    report(port, context, "loading", {
      stage,
      progress: Math.max(0, Math.min(100, progress)),
      file: info.file || ""
    });
  };
}

async function getTranscriber(port, context) {
  if (!transcriberPromise) {
    report(port, context, "loading", { stage: "whisper" });
    transcriberPromise = pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      revision: WHISPER_REVISION,
      device: "wasm",
      dtype: "q8",
      progress_callback: progressCallback(port, context, "whisper")
    }).catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

async function getTranslator(port, context) {
  if (!translatorPromise) {
    report(port, context, "loading", { stage: "translation" });
    translatorPromise = pipeline("translation", TRANSLATION_MODEL, {
      revision: TRANSLATION_REVISION,
      device: "wasm",
      dtype: "q8",
      progress_callback: progressCallback(port, context, "translation")
    }).catch((error) => {
      translatorPromise = null;
      throw error;
    });
  }
  return translatorPromise;
}

function normalizeChunks(chunks, offset) {
  const source = Array.isArray(chunks) ? chunks : [];
  return source.map((chunk, index) => {
    const bounds = Array.isArray(chunk?.timestamp)
      ? chunk.timestamp
      : [chunk?.start, chunk?.end];
    const startValue = Number(bounds[0]);
    if (!Number.isFinite(startValue)) return null;
    const text = String(chunk?.text || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const start = Math.max(0, startValue + offset);
    const endValue = Number(bounds[1]);
    const end = Number.isFinite(endValue) && endValue > startValue
      ? Math.max(start, endValue + offset)
      : start + FALLBACK_DURATION;
    return { start, end, text, index };
  }).filter(Boolean).sort((left, right) => left.start - right.start || left.index - right.index).reduce((result, cue) => {
    const next = { start: cue.start, end: cue.end, text: cue.text };
    const previous = result.at(-1);
    if (previous && previous.end > next.start) previous.end = next.start;
    if (!previous || next.end > next.start) result.push(next);
    return result;
  }, []);
}

async function translateCues(port, context, cues) {
  if (!cues.length) return [];
  const translator = await getTranslator(port, context);
  const output = await translator(cues.map((cue) => cue.text), { max_new_tokens: 96 });
  const translations = Array.isArray(output) ? output : [output];
  return cues.map((cue, index) => ({
    ...cue,
    chinese: String(translations[index]?.translation_text || "").trim()
  }));
}

async function processAudio(port, context, message, isActive) {
  const audio = decodeFloat32Base64(message.audioBase64);
  if (!audio?.length || audio.length > MAX_AUDIO_SAMPLES) {
    report(port, context, "error", { error: "本地音频片段长度无效" });
    return;
  }
  report(port, context, "transcribing");
  const transcriber = await getTranscriber(port, context);
  const output = await transcriber(audio, {
    task: "translate",
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5
  });
  if (!isActive()) return;
  const english = normalizeChunks(output?.chunks, Number(message.startTime) || 0);
  if (!english.length) return;
  send(port, {
    type: "YTDS_LOCAL_RESULT",
    videoId: context.videoId,
    sessionId: context.sessionId,
    complete: false,
    cues: english.map((cue) => ({ ...cue, chinese: "" }))
  });
  try {
    report(port, context, "translating");
    const bilingual = await translateCues(port, context, english);
    if (!isActive()) return;
    send(port, {
      type: "YTDS_LOCAL_RESULT",
      videoId: context.videoId,
      sessionId: context.sessionId,
      complete: true,
      cues: bilingual
    });
    report(port, context, "ready");
  } catch (error) {
    report(port, context, "partial", { error: `中文翻译暂不可用：${error.message || "未知错误"}` });
  }
}

async function processTextTranslation(port, context, cues, isActive) {
  const source = (Array.isArray(cues) ? cues : []).filter((cue) => cue.text).slice(0, 20_000);
  if (!source.length) return;
  report(port, context, "translating");
  for (let offset = 0; offset < source.length; offset += TRANSLATION_BATCH_SIZE) {
    if (!isActive()) return;
    const bilingual = await translateCues(port, context, source.slice(offset, offset + TRANSLATION_BATCH_SIZE));
    if (!isActive()) return;
    send(port, {
      type: "YTDS_LOCAL_RESULT",
      videoId: context.videoId,
      sessionId: context.sessionId,
      complete: true,
      sessionComplete: offset + TRANSLATION_BATCH_SIZE >= source.length,
      cues: bilingual
    });
  }
  report(port, context, "ready");
}

const clientStates = new Map();

function clientKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function createClient(packet) {
  return {
    postMessage(message) {
      chrome.runtime.sendMessage({
        target: "ytds-service-worker",
        tabId: packet.tabId,
        frameId: packet.frameId,
        message
      }).catch(() => {});
    }
  };
}

function closeTabClients(tabId) {
  for (const [key, state] of clientStates) {
    if (state.tabId !== tabId) continue;
    state.closed = true;
    clientStates.delete(key);
  }
}

chrome.runtime.onMessage.addListener((packet) => {
  if (packet?.target !== "ytds-offscreen" || !Number.isInteger(packet.tabId)) return;
  if (packet.closeTab) {
    closeTabClients(packet.tabId);
    return;
  }
  const frameId = Number.isInteger(packet.frameId) ? packet.frameId : 0;
  const key = clientKey(packet.tabId, frameId);
  let state = clientStates.get(key);
  if (!state) {
    state = {
      tabId: packet.tabId,
      active: null,
      queue: Promise.resolve(),
      pendingTasks: 0,
      closed: false
    };
    clientStates.set(key, state);
  }
  const port = createClient({ tabId: packet.tabId, frameId });
  const message = packet.message;
  if (!message?.type) return;
  if (message.type === "YTDS_LOCAL_START") {
    state.active = { videoId: String(message.videoId || ""), sessionId: String(message.sessionId || "") };
    report(port, state.active, "idle");
    return;
  }
  if (message.type === "YTDS_LOCAL_STOP") {
    if (state.active?.sessionId === String(message.sessionId || "")) state.active = null;
    return;
  }
  if (message.type !== "YTDS_LOCAL_AUDIO" && message.type !== "YTDS_LOCAL_TRANSLATE") return;
  const context = { videoId: String(message.videoId || ""), sessionId: String(message.sessionId || "") };
  if (!context.videoId || !context.sessionId || state.active?.sessionId !== context.sessionId) return;
  if (state.pendingTasks >= MAX_PENDING_TASKS) return;
  state.pendingTasks += 1;
  state.queue = state.queue.then(async () => {
    state.pendingTasks -= 1;
    if (state.closed || state.active?.sessionId !== context.sessionId) return;
    const isActive = () => !state.closed && state.active?.sessionId === context.sessionId;
    try {
      if (message.type === "YTDS_LOCAL_TRANSLATE") {
        await processTextTranslation(port, context, message.cues, isActive);
      } else {
        await processAudio(port, context, message, isActive);
      }
    } catch (error) {
      report(port, context, "error", { error: error.message || "本地识别失败" });
    }
  });
});
