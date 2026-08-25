const OFFSCREEN_DOCUMENT_PATH = "offscreen/engine.html";
let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length) return;
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["WORKERS"],
      justification: "Run bundled local Whisper and translation inference outside the extension service worker."
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }
  await creatingOffscreenDocument;
}

function sendEngineError(tabId, frameId, source, error) {
  return chrome.tabs.sendMessage(tabId, {
    type: "YTDS_LOCAL_ENGINE_MESSAGE",
    message: {
      type: "YTDS_LOCAL_STATUS",
      videoId: String(source?.videoId || ""),
      sessionId: String(source?.sessionId || ""),
      status: "error",
      error: error?.message || "无法启动本地识别引擎"
    }
  }, { frameId }).catch(() => {});
}

chrome.runtime.onMessage.addListener((packet, sender, sendResponse) => {
  if (packet?.type === "YTDS_LOCAL_BRIDGE" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    const frameId = sender.frameId ?? 0;
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({
        target: "ytds-offscreen",
        tabId,
        frameId,
        message: packet.message
      }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        void sendEngineError(tabId, frameId, packet.message, error);
        sendResponse({ ok: false, error: error?.message || "无法启动本地识别引擎" });
      });
    return true;
  }

  if (packet?.target === "ytds-service-worker" && Number.isInteger(packet.tabId)) {
    chrome.tabs.sendMessage(packet.tabId, {
      type: "YTDS_LOCAL_ENGINE_MESSAGE",
      message: packet.message
    }, { frameId: Number.isInteger(packet.frameId) ? packet.frameId : 0 }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  ensureOffscreenDocument()
    .then(() => chrome.runtime.sendMessage({ target: "ytds-offscreen", tabId, closeTab: true }))
    .catch(() => {});
});
