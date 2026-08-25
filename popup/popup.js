(() => {
  const DEFAULTS = {
    enabled: true,
    showChinese: true,
    showEnglish: true,
    fontSize: 34,
    backgroundOpacity: 68,
    position: "bottom",
    hideNative: true,
    localRecognition: false
  };
  const statusElement = document.getElementById("connection-status");
  const statusCopy = statusElement.querySelector("span:last-child");
  const statusLabels = {
    connecting: "正在连接",
    loading: "正在读取字幕",
    ready: "双字幕已就绪",
    partial: "部分字幕已就绪",
    "no-captions": "当前视频无字幕",
    error: "字幕读取失败",
    transcribing: "本地识别中",
    translating: "本地翻译中",
    recording: "捕获音频中",
    unavailable: "请打开 YouTube 视频",
    opening: "正在打开学习侧栏",
    panelUnavailable: "学习侧栏尚未准备好，请刷新页面"
  };

  const LEGACY_AUTH_KEYS = [
    "scDeviceId",
    "scEntitlement",
    "scEntitlementToken",
    "scEntitlementPublicJwk",
    "scEntitlementUpdatedAt"
  ];

  function updateOutput(input) {
    const output = document.getElementById(`${input.id}-output`);
    if (!output) return;
    output.value = input.id === "fontSize" ? `${input.value} px` : `${input.value}%`;
  }

  function hydrate(settings) {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const value = settings[input.dataset.setting];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
      updateOutput(input);
    });
    const position = document.querySelector(`input[name="position"][value="${settings.position}"]`);
    if (position) position.checked = true;
  }

  function saveSetting(key, value) {
    chrome.storage.sync.set({ [key]: value });
  }

  function queryActiveTab() {
    return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab)));
  }

  function requestPanelToggle(tabId, attempt = 0) {
    chrome.tabs.sendMessage(tabId, { type: "SC_TOGGLE_PANEL" }, (response) => {
      const deliveryError = chrome.runtime.lastError;
      if (!deliveryError && response?.ok) {
        window.close();
        return;
      }
      if (attempt < 3) {
        statusElement.dataset.state = "";
        statusCopy.textContent = statusLabels.opening;
        window.setTimeout(() => requestPanelToggle(tabId, attempt + 1), 150 * (attempt + 1));
        return;
      }
      statusElement.dataset.state = "error";
      statusCopy.textContent = statusLabels.panelUnavailable;
    });
  }

  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      const value = input.type === "checkbox" ? input.checked : Number(input.value);
      updateOutput(input);
      saveSetting(input.dataset.setting, value);
    });
  });
  document.querySelectorAll('input[name="position"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) saveSetting("position", input.value);
    });
  });

  document.getElementById("open-panel").addEventListener("click", async () => {
    const tab = await queryActiveTab();
    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) {
      statusElement.dataset.state = "error";
      statusCopy.textContent = statusLabels.unavailable;
      return;
    }
    requestPanelToggle(tab.id);
  });

  chrome.storage.sync.get(DEFAULTS, hydrate);
  chrome.storage.local.remove(LEGACY_AUTH_KEYS);
  queryActiveTab().then((tab) => {
    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) {
      statusElement.dataset.state = "error";
      statusCopy.textContent = statusLabels.unavailable;
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "YTDS_GET_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusElement.dataset.state = "error";
        statusCopy.textContent = statusLabels.unavailable;
        return;
      }
      const state = response.status || "connecting";
      statusElement.dataset.state = state === "ready" ? "ready" : state === "error" ? "error" : "";
      let label = statusLabels[state] || statusLabels.connecting;
      if (state === "partial") {
        if (response.available?.chinese) label = "中文字幕已就绪";
        else if (response.available?.english) label = "英文字幕已就绪";
      }
      statusCopy.textContent = label;
    });
  });
})();
