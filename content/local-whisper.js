(() => {
  const { encodeFloat32Base64 } = globalThis.YTDSLocalWhisperUtils;
  const SEGMENT_MILLISECONDS = 8000;
  const TARGET_SAMPLE_RATE = 16000;
  let enabled = false;
  let currentVideoId = "";
  let sessionId = "";
  let stream = null;
  let recorder = null;
  let decodeAudioContext = null;
  let captureAudioContext = null;
  let captureSourceNode = null;
  let captureDestinationNode = null;
  let captureVideo = null;
  let captureRetryTimer = 0;
  let captureAttempts = 0;
  let segmentTimer = 0;
  let recordingStart = 0;
  let status = "idle";
  let lastError = "";
  let generation = 0;
  let translationKey = "";

  function sendStatus(nextStatus, error = "") {
    if (status === nextStatus && lastError === error) return;
    status = nextStatus;
    lastError = error;
    document.dispatchEvent(new CustomEvent("ytds:local-whisper-status", {
      detail: JSON.stringify({ status: nextStatus, error, videoId: currentVideoId, sessionId })
    }));
  }

  function sendEngineMessage(message) {
    chrome.runtime.sendMessage({ type: "YTDS_LOCAL_BRIDGE", message }, (response) => {
      const deliveryError = chrome.runtime.lastError;
      if (!deliveryError && response?.ok !== false) return;
      sendStatus("error", response?.error || deliveryError?.message || "无法连接本地识别引擎");
    });
  }

  function sendTranslation(cues) {
    const compactCues = cues.map((cue) => ({
      start: Number(cue?.start),
      end: Number(cue?.end),
      text: String(cue?.text || "").trim()
    })).filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text);
    if (!compactCues.length) return;
    const nextKey = JSON.stringify(compactCues);
    if (nextKey === translationKey) return;
    try {
      sendEngineMessage({
        type: "YTDS_LOCAL_TRANSLATE",
        videoId: currentVideoId,
        sessionId,
        cues: compactCues
      });
      translationKey = nextKey;
      sendStatus("translating");
    } catch (error) {
      sendStatus("error", error.message || "无法发送本地翻译任务");
    }
  }

  function chooseMimeType() {
    return [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
  }

  function resampleChannel(channel, sourceRate, targetRate) {
    if (sourceRate === targetRate) return new Float32Array(channel);
    const length = Math.max(1, Math.round(channel.length * targetRate / sourceRate));
    const output = new Float32Array(length);
    const ratio = sourceRate / targetRate;
    for (let index = 0; index < length; index += 1) {
      const sourcePosition = index * ratio;
      const left = Math.floor(sourcePosition);
      const right = Math.min(channel.length - 1, left + 1);
      const weight = sourcePosition - left;
      output[index] = (channel[left] || 0) * (1 - weight) + (channel[right] || 0) * weight;
    }
    return output;
  }

  function downmixAndResample(buffer) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      for (let index = 0; index < length; index += 1) mono[index] += channel[index] / channels;
    }
    return resampleChannel(mono, buffer.sampleRate, TARGET_SAMPLE_RATE);
  }

  async function decodeAndSend(blob, startTime, expectedGeneration) {
    if (!blob.size || expectedGeneration !== generation || !enabled) return;
    try {
      decodeAudioContext ||= new AudioContext();
      const buffer = await decodeAudioContext.decodeAudioData(await blob.arrayBuffer());
      if (expectedGeneration !== generation || !enabled) return;
      const audio = downmixAndResample(buffer);
      if (!audio.length) return;
      sendEngineMessage({
        type: "YTDS_LOCAL_AUDIO",
        videoId: currentVideoId,
        sessionId,
        startTime,
        sampleRate: TARGET_SAMPLE_RATE,
        audioBase64: encodeFloat32Base64(audio)
      });
      sendStatus("transcribing");
    } catch (error) {
      if (expectedGeneration === generation) sendStatus("error", "无法解码 YouTube 音频：" + (error.message || "未知错误"));
    }
  }

  function clearTimer() {
    if (!segmentTimer) return;
    window.clearTimeout(segmentTimer);
    segmentTimer = 0;
  }

  function clearCaptureRetry() {
    if (!captureRetryTimer) return;
    window.clearTimeout(captureRetryTimer);
    captureRetryTimer = 0;
  }

  function stopRecorder({ keepSession = true } = {}) {
    clearTimer();
    clearCaptureRetry();
    const activeRecorder = recorder;
    recorder = null;
    if (activeRecorder && activeRecorder.state !== "inactive") {
      activeRecorder.stop();
    }
    if (stream && !keepSession) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
  }

  function scheduleStop(expectedGeneration) {
    clearTimer();
    segmentTimer = window.setTimeout(() => {
      segmentTimer = 0;
      if (expectedGeneration !== generation || !recorder || recorder.state === "inactive") return;
      recorder.stop();
    }, SEGMENT_MILLISECONDS);
  }

  function startRecorder(video, expectedGeneration) {
    if (expectedGeneration !== generation || !enabled || video.paused || !stream) return;
    if (recorder && recorder.state !== "inactive") return;
    const mimeType = chooseMimeType();
    if (!mimeType) {
      sendStatus("error", "当前 Chrome 不支持本地音频录制格式");
      return;
    }
    recordingStart = Number(video.currentTime) || 0;
    let recorderInstance;
    try {
      recorderInstance = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      recorder = recorderInstance;
    } catch (error) {
      sendStatus("error", error.message || "无法启动本地音频录制");
      return;
    }
    recorderInstance.addEventListener("start", () => {
      if (expectedGeneration === generation) {
        sendStatus("recording");
        scheduleStop(expectedGeneration);
      }
    }, { once: true });
    recorderInstance.addEventListener("dataavailable", (event) => {
      void decodeAndSend(event.data, recordingStart, expectedGeneration);
    }, { once: true });
    recorderInstance.addEventListener("stop", () => {
      if (recorder === recorderInstance) recorder = null;
      if (expectedGeneration === generation && enabled && !video.paused) startRecorder(video, expectedGeneration);
    }, { once: true });
    try {
      recorderInstance.start();
    } catch (error) {
      if (recorder === recorderInstance) recorder = null;
      sendStatus("error", error.message || "无法启动本地音频录制");
    }
  }

  function findVideo() {
    return document.querySelector("#movie_player video");
  }

  function createWebAudioCapture(video) {
    try {
      if (captureVideo && captureVideo !== video) {
        void captureAudioContext?.close().catch(() => {});
        captureAudioContext = null;
        captureSourceNode = null;
        captureDestinationNode = null;
        captureVideo = null;
      }
      if (!captureAudioContext) captureAudioContext = new AudioContext();
      if (!captureSourceNode) {
        captureSourceNode = captureAudioContext.createMediaElementSource(video);
        captureDestinationNode = captureAudioContext.createMediaStreamDestination();
        captureSourceNode.connect(captureAudioContext.destination);
        captureSourceNode.connect(captureDestinationNode);
        captureVideo = video;
      }
      if (captureAudioContext.state === "suspended") void captureAudioContext.resume();
      return captureDestinationNode?.stream || null;
    } catch {
      return null;
    }
  }

  function retryAudioCapture(videoId) {
    if (captureRetryTimer) return;
    captureRetryTimer = window.setTimeout(() => {
      captureRetryTimer = 0;
      startSession(videoId);
    }, 750);
  }

  function startSession(videoId) {
    if (!enabled || !videoId || videoId !== currentVideoId) return;
    if (captureRetryTimer) return;
    const video = findVideo();
    if (!video) return;
    const captureStream = video.captureStream || video.mozCaptureStream;
    if (typeof captureStream !== "function") {
      sendStatus("error", "当前 Chrome 无法从 YouTube 播放器捕获音频");
      return;
    }
    if (!stream) {
      try {
        let capturedStream = captureStream.call(video);
        let audioTracks = capturedStream.getAudioTracks();
        for (const track of capturedStream.getVideoTracks()) track.stop();
        if (!audioTracks.length) {
          for (const track of capturedStream.getTracks()) track.stop();
          captureAttempts += 1;
          if (captureAttempts <= 6) {
            sendStatus("loading");
            retryAudioCapture(videoId);
            return;
          }
          capturedStream = createWebAudioCapture(video);
          audioTracks = capturedStream?.getAudioTracks() || [];
          if (!audioTracks.length) {
            sendStatus("error", "当前视频没有可捕获的音频轨道");
            return;
          }
        }
        stream = new MediaStream(audioTracks);
        captureAttempts = 0;
      } catch (error) {
        sendStatus("error", error.message || "无法捕获 YouTube 播放器音频");
        return;
      }
    }
    if (!stream.getAudioTracks().length) {
      sendStatus("error", "当前视频没有可捕获的音频轨道");
      return;
    }
    sendEngineMessage({ type: "YTDS_LOCAL_START", videoId, sessionId });
    startRecorder(video, generation);
  }

  function stopSession(message = "") {
    generation += 1;
    stopRecorder({ keepSession: false });
    if (currentVideoId && sessionId) {
      sendEngineMessage({ type: "YTDS_LOCAL_STOP", videoId: currentVideoId, sessionId });
    }
    if (decodeAudioContext) {
      void decodeAudioContext.close().catch(() => {});
      decodeAudioContext = null;
    }
    translationKey = "";
    if (message) sendStatus("stopped", message);
    else sendStatus("idle");
  }

  function updateState(detail) {
    let next;
    try { next = JSON.parse(detail || "{}"); } catch { return; }
    const nextVideoId = String(next.videoId || "");
    const nextEnabled = Boolean(next.enabled && next.needed && nextVideoId);
    const translationOnly = Boolean(next.translationOnly && Array.isArray(next.englishCues) && next.englishCues.length);
    const videoChanged = nextVideoId !== currentVideoId;
    if (videoChanged || (!nextEnabled && enabled)) stopSession("已停止本地识别");
    enabled = nextEnabled;
    currentVideoId = nextVideoId;
    if (!enabled) return;
    if (videoChanged || !sessionId) sessionId = `local-${Date.now()}-${generation}`;
    if (translationOnly) {
      generation += 1;
      stopRecorder();
      sendEngineMessage({ type: "YTDS_LOCAL_START", videoId: currentVideoId, sessionId });
      sendTranslation(next.englishCues);
      return;
    }
    const video = findVideo();
    if (video && !video.__ytdsLocalWhisperBound) {
      video.__ytdsLocalWhisperBound = true;
      video.addEventListener("play", () => startSession(currentVideoId));
      video.addEventListener("pause", () => {
        stopRecorder();
        sendStatus("idle");
      });
      video.addEventListener("seeking", () => {
        if (!enabled) return;
        generation += 1;
        stopRecorder();
        sendStatus("idle");
        if (!video.paused) window.setTimeout(() => startSession(currentVideoId), 0);
      });
    }
    if (video && !video.paused) startSession(currentVideoId);
    else sendStatus("idle");
  }

  document.addEventListener("ytds:local-whisper-state", (event) => updateState(event.detail));
  chrome.runtime.onMessage.addListener((packet) => {
    if (packet?.type !== "YTDS_LOCAL_ENGINE_MESSAGE") return;
    const message = packet.message;
    if (!message || message.sessionId !== sessionId || message.videoId !== currentVideoId) return;
    if (message.type === "YTDS_LOCAL_STATUS") sendStatus(message.status, message.error || "");
    if (message.type === "YTDS_LOCAL_RESULT") {
      document.dispatchEvent(new CustomEvent("ytds:local-whisper-result", {
        detail: JSON.stringify(message)
      }));
    }
  });
  document.addEventListener("yt-navigate-finish", () => {
    if (enabled) document.dispatchEvent(new CustomEvent("ytds:request-local-whisper-state"));
  });
  document.addEventListener("ytds:local-whisper-stop", () => stopSession("已停止本地识别"));
  window.addEventListener("pagehide", () => {
    stopSession();
    void captureAudioContext?.close().catch(() => {});
  }, { once: true });
  document.dispatchEvent(new CustomEvent("ytds:request-local-whisper-state"));
})();
