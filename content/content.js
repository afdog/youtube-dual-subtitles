(() => {
  const {
    buildCaptionUrls,
    chooseCaptionTracks,
    createPendingCaptionStore,
    findCue,
    isChinese,
    isEnglish,
    parseCaptionResponse
  } = globalThis.YTDSUtils;
  const { normalizeWhisperChunks } = globalThis.YTDSLocalWhisperUtils;
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
  const LEGACY_AUTH_KEYS = [
    "scDeviceId",
    "scEntitlement",
    "scEntitlementToken",
    "scEntitlementPublicJwk",
    "scEntitlementUpdatedAt"
  ];
  const POSITION_BOTTOM = {
    high: "18%",
    bottom: "10%",
    low: "4.5%"
  };

  let settings = { ...DEFAULTS };
  let currentVideoId = "";
  let currentTrackKey = "";
  let cues = { english: [], chinese: [] };
  let localCues = { english: [], chinese: [] };
  let localStatus = "idle";
  let localError = "";
  let localSessionComplete = false;
  let fetchController = null;
  let overlayHost = null;
  let overlayRoot = null;
  let chineseElement = null;
  let englishElement = null;
  let lastRenderKey = "";
  let status = "connecting";
  let captionRequestSequence = 0;
  let renderFramePending = false;
  const observedTranslationRequests = new Set();
  const pendingObservedCaptions = createPendingCaptionStore();

  chrome.storage.local.remove(LEGACY_AUTH_KEYS);

  function displayedCues() {
    return {
      english: cues.english.length ? cues.english : localCues.english,
      chinese: cues.chinese.length ? cues.chinese : localCues.chinese
    };
  }

  function localWhisperState() {
    const nativeBilingual = cues.english.length > 0 && cues.chinese.length > 0;
    const translationOnly = cues.english.length > 0 && cues.chinese.length === 0 && !localSessionComplete;
    return {
      enabled: Boolean(settings.enabled && settings.localRecognition),
      needed: !nativeBilingual && !localSessionComplete,
      translationOnly,
      englishCues: translationOnly ? cues.english : [],
      videoId: currentVideoId
    };
  }

  function requestLocalWhisperState() {
    document.dispatchEvent(new CustomEvent("ytds:local-whisper-state", {
      detail: JSON.stringify(localWhisperState())
    }));
  }

  function announceTranscript() {
    const available = displayedCues();
    document.dispatchEvent(new CustomEvent("sc:transcript-update", {
      detail: { cues: available, status, videoId: currentVideoId, localStatus, localError }
    }));
  }

  const nativeCaptionStyle = document.createElement("style");
  nativeCaptionStyle.id = "ytds-hide-native-captions";
  nativeCaptionStyle.textContent = [
    ".html5-video-player .caption-window { display: none !important; }",
    ".html5-video-player .ytp-caption-segment { display: none !important; }"
  ].join("\n");
  nativeCaptionStyle.disabled = true;
  (document.head || document.documentElement).append(nativeCaptionStyle);

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value)));
  }

  function applySettings() {
    if (!overlayHost) return;
    overlayHost.style.setProperty("--ytds-font-size", `${clamp(settings.fontSize, 18, 52)}px`);
    overlayHost.style.setProperty("--ytds-bg-opacity", String(clamp(settings.backgroundOpacity, 0, 90) / 100));
    overlayHost.style.setProperty("--ytds-bottom", POSITION_BOTTOM[settings.position] || POSITION_BOTTOM.bottom);
    updateNativeCaptionVisibility();
    lastRenderKey = "";
  }

  function updateNativeCaptionVisibility() {
    const available = displayedCues();
    const hasOverlayCaptions = available.english.length > 0 || available.chinese.length > 0;
    nativeCaptionStyle.disabled = !(settings.enabled && settings.hideNative && hasOverlayCaptions);
  }

  function updateCaptionStatus() {
    const available = displayedCues();
    const localBusy = settings.localRecognition && ["loading", "recording", "transcribing", "translating"].includes(localStatus);
    const nativeBilingual = cues.english.length && cues.chinese.length;
    if (nativeBilingual) status = "ready";
    else if (localBusy) status = localStatus;
    else if (available.english.length && available.chinese.length) status = localSessionComplete ? "ready" : "partial";
    else if (available.english.length || available.chinese.length) status = "partial";
    else if (localStatus === "error" && settings.localRecognition) status = "error";
    if (overlayHost) {
      overlayHost.dataset.status = status;
      overlayHost.dataset.localStatus = localStatus;
      overlayHost.dataset.localError = localError;
      overlayHost.dataset.localRecognition = String(Boolean(settings.localRecognition));
      overlayHost.dataset.videoId = currentVideoId;
    }
    updateNativeCaptionVisibility();
    announceTranscript();
    requestLocalWhisperState();
  }

  function mergeLocalCues(current, next) {
    const byStart = new Map(current.map((cue) => [Math.round(cue.start * 100) / 100, cue]));
    for (const cue of next) byStart.set(Math.round(cue.start * 100) / 100, cue);
    return [...byStart.values()].sort((left, right) => left.start - right.start);
  }

  function handleLocalWhisperStatus(event) {
    try {
      const detail = JSON.parse(event.detail || "{}");
      if (detail.videoId && detail.videoId !== currentVideoId) return;
      localStatus = detail.status || "idle";
      localError = detail.error || "";
      if (localStatus === "error" && localError) {
        console.warn("[YouTube 双字幕] 本地识别失败", localError);
      }
      updateCaptionStatus();
    } catch {
      // Ignore malformed local engine status messages.
    }
  }

  function handleLocalWhisperResult(event) {
    try {
      const detail = JSON.parse(event.detail || "{}");
      if (detail.videoId !== currentVideoId || !Array.isArray(detail.cues)) return;
      const english = normalizeWhisperChunks(detail.cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.text
      })));
      const chinese = normalizeWhisperChunks(detail.cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.chinese
      })));
      localCues = {
        english: mergeLocalCues(localCues.english, english),
        chinese: mergeLocalCues(localCues.chinese, chinese)
      };
      if (detail.sessionComplete === true) localSessionComplete = true;
      updateCaptionStatus();
    } catch {
      // Ignore malformed local engine results.
    }
  }

  function createOverlay() {
    const player = document.querySelector("#movie_player.html5-video-player");
    if (!player) return false;

    if (!overlayHost) {
      overlayHost = document.createElement("div");
      overlayHost.id = "ytds-overlay-host";
      overlayRoot = overlayHost.attachShadow({ mode: "open" });
      overlayRoot.innerHTML = `
        <style>
          :host {
            --ytds-font-size: 34px;
            --ytds-bg-opacity: .68;
            --ytds-bottom: 10%;
            position: absolute;
            inset: 0;
            z-index: 2147483646;
            pointer-events: none;
            font-family: Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
          }

          #captions {
            position: absolute;
            left: 50%;
            bottom: var(--ytds-bottom);
            width: min(92%, 1100px);
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            text-align: center;
          }

          .cue {
            box-sizing: border-box;
            max-width: 100%;
            margin: 0;
            padding: 3px 10px 4px;
            border-radius: 4px;
            background: rgba(0, 0, 0, var(--ytds-bg-opacity));
            color: #fff;
            font-weight: 500;
            line-height: 1.32;
            letter-spacing: 0;
            overflow-wrap: anywhere;
            text-shadow: 0 1px 2px rgba(0, 0, 0, .82);
          }

          #chinese { font-size: var(--ytds-font-size); }
          #english { font-size: calc(var(--ytds-font-size) * .72); color: #f1f1f1; }
          .cue:empty { display: none; }

          @media (max-width: 640px) {
            #captions { width: 94%; gap: 3px; }
            .cue { padding: 2px 7px 3px; }
          }
        </style>
        <div id="captions" aria-live="off">
          <p class="cue" id="chinese"></p>
          <p class="cue" id="english"></p>
        </div>
      `;
      chineseElement = overlayRoot.getElementById("chinese");
      englishElement = overlayRoot.getElementById("english");
    }

    if (overlayHost.parentElement !== player) player.append(overlayHost);
    applySettings();
    return true;
  }

  function parseXmlCaptions(source) {
    const documentNode = new DOMParser().parseFromString(source, "text/xml");
    return [...documentNode.querySelectorAll("text")].map((node) => {
      const start = Number(node.getAttribute("start") || 0);
      const duration = Number(node.getAttribute("dur") || 5);
      return { start, end: start + duration, text: node.textContent.trim() };
    }).filter((cue) => cue.text);
  }

  function parseCaptionSource(source) {
    try {
      return parseCaptionResponse(JSON.parse(source));
    } catch {
      return parseXmlCaptions(source);
    }
  }

  function fetchCaptionSource(url, signal) {
    return new Promise((resolve, reject) => {
      const requestId = `caption-${Date.now()}-${captionRequestSequence += 1}`;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Caption request timed out"));
      }, 15000);

      function cleanup() {
        window.clearTimeout(timeout);
        document.removeEventListener("ytds:caption-response", handleResponse);
        signal?.removeEventListener("abort", handleAbort);
      }

      function handleAbort() {
        cleanup();
        reject(new DOMException("Caption request aborted", "AbortError"));
      }

      function handleResponse(event) {
        let response;
        try {
          response = JSON.parse(event.detail);
        } catch {
          return;
        }
        if (response.requestId !== requestId) return;
        cleanup();
        if (!response.ok) {
          reject(new Error(response.error || `Caption request failed: ${response.status}`));
          return;
        }
        resolve(response.body || "");
      }

      document.addEventListener("ytds:caption-response", handleResponse);
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      document.dispatchEvent(new CustomEvent("ytds:fetch-caption", {
        detail: JSON.stringify({ requestId, url })
      }));
    });
  }

  async function fetchCaptions(selection, signal) {
    const candidates = [selection, ...(selection.alternatives || [])];
    let lastError = null;

    for (const candidate of candidates) {
      for (const url of buildCaptionUrls(candidate) || []) {
        try {
          const source = await fetchCaptionSource(url, signal);
          const parsed = parseCaptionSource(source);
          if (parsed.length) return parsed;
        } catch (error) {
          if (error.name === "AbortError") throw error;
          lastError = error;
        }
      }
    }
    if (lastError) throw lastError;
    return [];
  }

  function requestNativeCaptionFallback(videoId) {
    if (!settings.enabled) return;
    for (const delay of [0, 1500, 4000]) {
      window.setTimeout(() => {
        if (!settings.enabled || currentVideoId !== videoId || (cues.english.length && cues.chinese.length)) return;
        document.dispatchEvent(new CustomEvent("ytds:activate-native-captions"));
      }, delay);
    }
  }

  function requestNativeChineseTranslation(videoId) {
    if (!settings.enabled || !settings.showChinese) return;
    for (const delay of [0, 1200, 3500]) {
      window.setTimeout(() => {
        if (!settings.enabled || !settings.showChinese || currentVideoId !== videoId || cues.chinese.length) return;
        document.dispatchEvent(new CustomEvent("ytds:activate-native-translation", {
          detail: JSON.stringify({ sourceLanguage: "en", targetLanguage: "zh-Hans" })
        }));
      }, delay);
    }
  }

  async function requestObservedTranslation(sourceUrl, targetLanguage, videoId) {
    const requestKey = `${videoId}:${targetLanguage}`;
    if (observedTranslationRequests.has(requestKey)) return;
    observedTranslationRequests.add(requestKey);

    try {
      const parsed = await fetchCaptions({
        track: { baseUrl: sourceUrl },
        translateTo: targetLanguage,
        alternatives: []
      });
      if (!parsed.length || currentVideoId !== videoId) return;

      if (isEnglish(targetLanguage)) {
        cues.english = parsed;
        localSessionComplete = false;
      }
      else if (isChinese(targetLanguage)) cues.chinese = parsed;
      updateCaptionStatus();
    } catch {
      // The regular track candidates may still provide the missing language.
    }
  }

  function processObservedCaption(observed) {
    try {
      const url = new URL(observed.url);
      const videoId = url.searchParams.get("v") || currentVideoId;
      if (videoId !== currentVideoId) return false;

      const parsed = parseCaptionSource(observed.body || "");
      if (!parsed.length) return false;
      const languageCode = url.searchParams.get("tlang") || url.searchParams.get("lang") || "";
      if (isEnglish(languageCode)) {
        cues.english = parsed;
        localSessionComplete = false;
      }
      else if (isChinese(languageCode)) cues.chinese = parsed;
      updateCaptionStatus();

      if (!cues.english.length) requestObservedTranslation(url.toString(), "en", videoId);
      if (!cues.chinese.length) {
        requestObservedTranslation(url.toString(), "zh-Hans", videoId);
        requestNativeChineseTranslation(videoId);
      }
      return true;
    } catch {
      // Ignore malformed page requests.
      return false;
    }
  }

  function handleObservedCaption(event) {
    try {
      const observed = JSON.parse(event.detail);
      const url = new URL(observed.url);
      const videoId = url.searchParams.get("v") || "";
      if (!videoId) return;
      if (videoId !== currentVideoId) {
        pendingObservedCaptions.put(videoId, observed);
        return;
      }
      processObservedCaption(observed);
    } catch {
      // Ignore malformed page requests.
    }
  }

  async function loadTracks(payload) {
    const trackKey = JSON.stringify(payload || {});
    if (!payload?.videoId || trackKey === currentTrackKey) return;
    const isNewVideo = payload.videoId !== currentVideoId;
    currentTrackKey = trackKey;
    currentVideoId = payload.videoId;
    if (isNewVideo) {
      observedTranslationRequests.clear();
      cues = { english: [], chinese: [] };
      localCues = { english: [], chinese: [] };
      localStatus = "idle";
      localError = "";
      localSessionComplete = false;
    }
    status = "loading";
    lastRenderKey = "";
    updateNativeCaptionVisibility();
    if (isNewVideo) announceTranscript();

    const pendingObservedCaption = pendingObservedCaptions.take(currentVideoId);
    if (pendingObservedCaption) processObservedCaption(pendingObservedCaption);

    fetchController?.abort();
    const controller = new AbortController();
    fetchController = controller;
    const selections = chooseCaptionTracks(payload.tracks);
    if (!selections.english && !selections.chinese) {
      if (cues.english.length || cues.chinese.length) updateCaptionStatus();
      else {
        status = "no-captions";
        updateNativeCaptionVisibility();
        announceTranscript();
      }
      document.dispatchEvent(new CustomEvent("ytds:request-fallback-tracks", { detail: payload.videoId }));
      requestNativeCaptionFallback(payload.videoId);
      requestLocalWhisperState();
      return;
    }

    try {
      const [englishResult, chineseResult] = await Promise.allSettled([
        selections.english ? fetchCaptions(selections.english, controller.signal) : Promise.resolve([]),
        selections.chinese ? fetchCaptions(selections.chinese, controller.signal) : Promise.resolve([])
      ]);
      if (controller.signal.aborted || trackKey !== currentTrackKey) return;
      const english = englishResult.status === "fulfilled" ? englishResult.value : [];
      const chinese = chineseResult.status === "fulfilled" ? chineseResult.value : [];
      cues = {
        english: english.length ? english : cues.english,
        chinese: chinese.length ? chinese : cues.chinese
      };
      if (cues.english.length && !cues.chinese.length) localSessionComplete = false;

      if (cues.english.length && cues.chinese.length) status = "ready";
      else if (cues.english.length || cues.chinese.length) status = "partial";
      else if (englishResult.status === "rejected" || chineseResult.status === "rejected") status = "error";
      else status = "no-captions";
      updateNativeCaptionVisibility();
      if (status !== "ready") {
        document.dispatchEvent(new CustomEvent("ytds:request-fallback-tracks", { detail: payload.videoId }));
        requestNativeCaptionFallback(payload.videoId);
        if (cues.english.length && !cues.chinese.length) requestNativeChineseTranslation(payload.videoId);
      }
      announceTranscript();
      requestLocalWhisperState();
    } catch (error) {
      if (error.name === "AbortError") return;
      status = "error";
      updateNativeCaptionVisibility();
      console.warn("[YouTube 双字幕] 字幕加载失败", error);
      announceTranscript();
    }
  }

  function scheduleRenderFrame() {
    if (renderFramePending) return;
    renderFramePending = true;
    window.requestAnimationFrame(() => {
      renderFramePending = false;
      renderFrame();
    });
  }

  function renderFrame() {
    if (!createOverlay()) return;
    const video = document.querySelector("#movie_player video");
    const time = video?.currentTime || 0;
    const available = displayedCues();
    const chineseText = settings.enabled && settings.showChinese
      ? (findCue(available.chinese, time)?.text || "")
      : "";
    const englishText = settings.enabled && settings.showEnglish
      ? (findCue(available.english, time)?.text || "")
      : "";
    const renderKey = `${chineseText}\n${englishText}`;

    if (renderKey !== lastRenderKey && chineseElement && englishElement) {
      chineseElement.textContent = chineseText;
      englishElement.textContent = englishText;
      lastRenderKey = renderKey;
    }
    scheduleRenderFrame();
  }

  document.addEventListener("ytds:caption-tracks", (event) => {
    try {
      loadTracks(JSON.parse(event.detail));
      scheduleRenderFrame();
    } catch (error) {
      console.warn("[YouTube 双字幕] 无法读取字幕轨道", error);
    }
  });
  document.addEventListener("ytds:observed-caption", handleObservedCaption);
  document.addEventListener("ytds:local-whisper-status", handleLocalWhisperStatus);
  document.addEventListener("ytds:local-whisper-result", handleLocalWhisperResult);
  document.addEventListener("ytds:request-local-whisper-state", requestLocalWhisperState);
  document.addEventListener("sc:request-transcript", announceTranscript);
  document.dispatchEvent(new CustomEvent("ytds:request-tracks"));

  chrome.storage.sync.get(DEFAULTS, (saved) => {
    settings = { ...DEFAULTS, ...saved };
    applySettings();
    scheduleRenderFrame();
    // The first caption-track event can arrive before sync storage resolves.
    // Re-announce the state so local recognition starts when it was enabled.
    updateCaptionStatus();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = change.newValue;
    }
    applySettings();
    scheduleRenderFrame();
    updateCaptionStatus();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "YTDS_GET_STATUS") {
      sendResponse({
        status,
        videoId: currentVideoId,
        available: {
          english: displayedCues().english.length > 0,
          chinese: displayedCues().chinese.length > 0
        }
      });
    }
    if (message?.type === "SC_GET_TRANSCRIPT") {
      sendResponse({ status, videoId: currentVideoId, cues: displayedCues() });
    }
  });

  createOverlay();
  scheduleRenderFrame();
})();
