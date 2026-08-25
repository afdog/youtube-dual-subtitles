(() => {
  const {
    buildNativeTranslationTrack,
    extractAssignedJson,
    getPageVideoId,
    selectPlayerResponse
  } = globalThis.YTDSPlayerUtils;
  const EVENT_NAME = "ytds:caption-tracks";
  const PLAYER_ENDPOINT = "/youtubei/v1/player";
  const TIMED_TEXT_ENDPOINT = "/api/timedtext";
  const PLAYER_REQUEST = Symbol("ytdsPlayerRequest");
  const CAPTION_REQUEST = Symbol("ytdsCaptionRequest");
  const parsedInlineScripts = new WeakSet();
  const inlineResponsesByVideoId = new Map();
  const requestedFallbackVideos = new Set();
  let lastPayloadKey = "";
  let lastPlayerResponse = null;

  function readText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.simpleText === "string") return value.simpleText;
    if (Array.isArray(value.runs)) {
      return value.runs.map((run) => run.text || "").join("");
    }
    return "";
  }

  function scanInlinePlayerResponse(expectedVideoId) {
    let latestResponse = null;
    for (const script of document.scripts) {
      if (parsedInlineScripts.has(script)) continue;
      const source = script.textContent || "";
      if (!source.includes("ytInitialPlayerResponse")) continue;
      const response = extractAssignedJson(source, "ytInitialPlayerResponse");
      const videoId = response?.videoDetails?.videoId;
      if (!videoId) continue;
      parsedInlineScripts.add(script);
      inlineResponsesByVideoId.set(videoId, response);
      latestResponse = response;
    }
    return expectedVideoId
      ? inlineResponsesByVideoId.get(expectedVideoId) || null
      : latestResponse;
  }

  function getPlayerResponse() {
    const expectedVideoId = getPageVideoId(window.location.href);
    const player = document.getElementById("movie_player");
    let playerResponse = null;
    try {
      const response = player?.getPlayerResponse?.();
      if (response?.videoDetails?.videoId) playerResponse = response;
    } catch {
      // The player can be between SPA navigation states.
    }

    const inlineResponse = scanInlinePlayerResponse(expectedVideoId);
    const response = selectPlayerResponse([
      playerResponse,
      inlineResponse,
      window.ytInitialPlayerResponse,
      lastPlayerResponse
    ], expectedVideoId);
    if (response) lastPlayerResponse = response;
    return response;
  }

  function publishTracks(response = getPlayerResponse()) {
    const pageVideoId = getPageVideoId(window.location.href);
    const responseVideoId = response?.videoDetails?.videoId || "";
    const usableResponse = !pageVideoId || responseVideoId === pageVideoId ? response : null;
    const videoId = usableResponse?.videoDetails?.videoId || pageVideoId;
    if (!videoId) return;

    const renderer = usableResponse?.captions?.playerCaptionsTracklistRenderer;
    const tracks = (renderer?.captionTracks || []).map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode || "",
      name: readText(track.name),
      kind: track.kind || "",
      isTranslatable: Boolean(track.isTranslatable)
    })).filter((track) => track.baseUrl);

    const payload = { videoId, tracks };
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPayloadKey) return;
    lastPayloadKey = payloadKey;

    document.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: payloadKey
    }));
  }

  function capturePlayerResponse(response) {
    const videoId = response?.videoDetails?.videoId;
    const pageVideoId = getPageVideoId(window.location.href);
    if (!videoId || (pageVideoId && videoId !== pageVideoId)) return;
    lastPlayerResponse = response;
    publishTracks(response);
  }

  function publishObservedCaption(url, body) {
    if (!body) return;
    document.dispatchEvent(new CustomEvent("ytds:observed-caption", {
      detail: JSON.stringify({ url: String(url), body })
    }));
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = async function ytdsFetch(...args) {
      const response = await nativeFetch.apply(this, args);
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (String(requestUrl || "").includes(PLAYER_ENDPOINT)) {
        response.clone().json().then(capturePlayerResponse).catch(() => {});
      } else if (String(requestUrl || "").includes(TIMED_TEXT_ENDPOINT)) {
        response.clone().text().then((body) => publishObservedCaption(requestUrl, body)).catch(() => {});
      }
      return response;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function ytdsOpen(method, url, ...rest) {
    this[PLAYER_REQUEST] = String(url || "").includes(PLAYER_ENDPOINT);
    this[CAPTION_REQUEST] = String(url || "").includes(TIMED_TEXT_ENDPOINT) ? String(url) : "";
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function ytdsSend(...args) {
    if (this[PLAYER_REQUEST] || this[CAPTION_REQUEST]) {
      this.addEventListener("load", () => {
        try {
          if (this[CAPTION_REQUEST]) {
            const body = typeof this.response === "string" ? this.response : this.responseText;
            publishObservedCaption(this[CAPTION_REQUEST], body);
            return;
          }
          const response = this.responseType === "json"
            ? this.response
            : JSON.parse(this.responseText);
          capturePlayerResponse(response);
        } catch {
          // Ignore non-JSON or inaccessible responses.
        }
      }, { once: true });
    }
    return nativeSend.apply(this, args);
  };

  function scheduleTrackPublish() {
    lastPayloadKey = "";
    if (lastPlayerResponse?.videoDetails?.videoId !== getPageVideoId(window.location.href)) {
      lastPlayerResponse = null;
    }
    for (const delay of [50, 250, 1000]) window.setTimeout(publishTracks, delay);
  }

  document.addEventListener("yt-navigate-finish", scheduleTrackPublish);
  document.addEventListener("yt-page-data-updated", scheduleTrackPublish);

  document.addEventListener("ytds:request-tracks", () => {
    scheduleTrackPublish();
  });

  document.addEventListener("ytds:fetch-caption", async (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
      const url = new URL(request.url);
      const allowedHost = url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com");
      if (!allowedHost || url.pathname !== "/api/timedtext") throw new Error("Caption URL is not allowed");

      const response = await fetch(url.toString(), { credentials: "include" });
      const body = await response.text();
      document.dispatchEvent(new CustomEvent("ytds:caption-response", {
        detail: JSON.stringify({
          requestId: request.requestId,
          ok: response.ok,
          status: response.status,
          body
        })
      }));
    } catch (error) {
      document.dispatchEvent(new CustomEvent("ytds:caption-response", {
        detail: JSON.stringify({
          requestId: request?.requestId || "",
          ok: false,
          status: 0,
          error: error.message
        })
      }));
    }
  });

  document.addEventListener("ytds:activate-native-captions", () => {
    const player = document.getElementById("movie_player");
    try {
      player?.loadModule?.("captions");
      player?.setOption?.("captions", "track", { languageCode: "en" });
    } catch {
      // Fall through to the visible CC control.
    }

    const button = document.querySelector(".ytp-subtitles-button");
    if (button && button.getAttribute("aria-pressed") !== "true") button.click();
  });

  document.addEventListener("ytds:activate-native-translation", (event) => {
    let request = {};
    try {
      request = JSON.parse(event.detail || "{}");
    } catch {
      // Defaults below still request simplified Chinese.
    }

    const player = document.getElementById("movie_player");
    const targetLanguage = request.targetLanguage || "zh-Hans";
    const sourceLanguage = request.sourceLanguage || "en";
    const track = buildNativeTranslationTrack(getPlayerResponse(), targetLanguage, sourceLanguage);
    if (!track) return;

    try {
      player?.loadModule?.("captions");
      player?.setOption?.("captions", "track", track);
    } catch {
      return;
    }

    const button = document.querySelector(".ytp-subtitles-button");
    if (button && button.getAttribute("aria-pressed") !== "true") button.click();
  });

  document.addEventListener("ytds:request-fallback-tracks", async (event) => {
    const videoId = String(event.detail || "");
    if (!/^[\w-]{11}$/.test(videoId) || requestedFallbackVideos.has(videoId)) return;
    requestedFallbackVideos.add(videoId);

    const clientVersion = "21.26.364";
    const clientUserAgent = `com.google.android.youtube/${clientVersion} (Linux; U; Android 11) gzip`;
    try {
      const response = await fetch("/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": "3",
          "X-YouTube-Client-Version": clientVersion
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion,
              androidSdkVersion: 30,
              userAgent: clientUserAgent,
              osName: "Android",
              osVersion: "11",
              hl: "en"
            }
          },
          videoId
        })
      });
      if (response.ok) capturePlayerResponse(await response.json());
    } catch {
      // The page and native-caption fallbacks remain available.
    }
  });

  window.addEventListener("load", scheduleTrackPublish, { once: true });
  scheduleTrackPublish();
})();
