(() => {
  const { formatTime, mergeTranscript } = globalThis.SubtitleTranscriptUtils;
  const ICONS = {
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14m0-14a6 6 0 0 0-6-2H3v14h3a6 6 0 0 1 6 2m0-14a6 6 0 0 1 6-2h3v14h-3a6 6 0 0 0-6 2"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>',
    loop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14m8-14v14"/></svg>'
  };
  let host;
  let root;
  let panel;
  let transcriptList;
  let statusText;
  let loopButton;
  let pauseButton;
  let rows = [];
  let rawCues = { english: [], chinese: [] };
  let captionStatus = "connecting";
  let currentVideoId = "";
  let open = false;
  let loopEnabled = false;
  let autoPauseEnabled = false;
  let selectedRowId = "";
  let activeRowId = "";
  let lastAutoPausedRowId = "";
  let lastPlaybackTime = null;
  let playbackTimer = 0;

  function captionMessage() {
    if (rows.length) return `${rows.length} 条文字记录`;
    if (captionStatus === "loading" || captionStatus === "connecting") return "正在读取字幕";
    if (captionStatus === "no-captions") return "当前视频没有可用字幕";
    if (captionStatus === "error") return "字幕读取失败，可保留原生字幕观看";
    return "当前字幕暂不可用于文字记录";
  }

  function renderRows() {
    if (!transcriptList) return;
    if (!rows.length) {
      transcriptList.innerHTML = `<div class="empty"><strong>${captionMessage()}</strong><span>支持的普通视频会在字幕就绪后显示。</span></div>`;
      return;
    }
    transcriptList.innerHTML = rows.map((row) => `
      <button class="transcript-row" data-row-id="${row.id}" type="button" aria-label="跳转到 ${formatTime(row.start)}">
        <time>${formatTime(row.start)}</time>
        <span class="line-copy">
          ${row.english ? `<span class="en">${escapeHtml(row.english)}</span>` : ""}
          ${row.chinese ? `<span class="zh">${escapeHtml(row.chinese)}</span>` : ""}
        </span>
      </button>
    `).join("");
    transcriptList.querySelectorAll(".transcript-row").forEach((button) => {
      button.addEventListener("click", () => selectRow(button.dataset.rowId));
    });
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }

  function updateTranscript(detail) {
    const nextVideoId = detail?.videoId || "";
    if (nextVideoId && nextVideoId !== currentVideoId) {
      currentVideoId = nextVideoId;
      rawCues = { english: [], chinese: [] };
      rows = [];
      selectedRowId = "";
      activeRowId = "";
      lastAutoPausedRowId = "";
      lastPlaybackTime = null;
    }
    rawCues = detail?.cues || rawCues;
    captionStatus = detail?.status || captionStatus;
    rows = mergeTranscript(rawCues.english || [], rawCues.chinese || []);
    if (statusText) statusText.textContent = captionMessage();
    renderRows();
    schedulePlaybackTick();
  }

  function currentVideo() {
    return document.querySelector("#movie_player video");
  }

  function selectRow(rowId) {
    const row = rows.find((item) => item.id === rowId);
    const video = currentVideo();
    if (!row || !video) return;
    selectedRowId = rowId;
    lastAutoPausedRowId = "";
    lastPlaybackTime = row.start + 0.01;
    video.currentTime = Math.max(0, row.start + 0.01);
    video.play().catch(() => {});
    updateActiveRow(rowId, true);
  }

  function updateActiveRow(rowId, scroll = false) {
    if (activeRowId === rowId && !scroll) return;
    root.querySelector(`.transcript-row[data-row-id="${CSS.escape(activeRowId)}"]`)?.classList.remove("active");
    activeRowId = rowId;
    const element = root.querySelector(`.transcript-row[data-row-id="${CSS.escape(rowId)}"]`);
    element?.classList.add("active");
    if (scroll && element) element.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function activeRowAt(time) {
    let low = 0;
    let high = rows.length - 1;
    let candidate = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (rows[middle].start <= time) {
        candidate = rows[middle];
        low = middle + 1;
      } else high = middle - 1;
    }
    return candidate && time < candidate.end + 0.15 ? candidate : null;
  }

  function schedulePlaybackTick() {
    if (playbackTimer || (!open && !loopEnabled && !autoPauseEnabled)) return;
    playbackTimer = window.setTimeout(() => {
      playbackTimer = 0;
      playbackTick();
    }, 100);
  }

  function playbackTick() {
    const video = currentVideo();
    if (!video) {
      lastPlaybackTime = null;
    } else {
      if (lastPlaybackTime !== null && video.currentTime + 0.2 < lastPlaybackTime) {
        lastAutoPausedRowId = "";
      }
      lastPlaybackTime = video.currentTime;
    }
    if (video && rows.length && (open || loopEnabled || autoPauseEnabled)) {
      const row = activeRowAt(video.currentTime);
      if (row) {
        updateActiveRow(row.id);
        if (loopEnabled && selectedRowId === row.id && video.currentTime >= row.end - 0.08) {
          video.currentTime = row.start + 0.01;
          if (video.paused) video.play().catch(() => {});
        } else if (autoPauseEnabled && !video.paused && video.currentTime >= row.end - 0.12 && lastAutoPausedRowId !== row.id) {
          lastAutoPausedRowId = row.id;
          video.pause();
        }
      }
    }
    schedulePlaybackTick();
  }

  function setToggle(button, enabled) {
    button?.classList.toggle("selected", enabled);
    button?.setAttribute("aria-pressed", String(enabled));
  }

  function toggleLoop() {
    loopEnabled = !loopEnabled;
    if (loopEnabled && !selectedRowId) selectedRowId = activeRowId;
    setToggle(loopButton, loopEnabled);
    schedulePlaybackTick();
  }

  function toggleAutoPause() {
    autoPauseEnabled = !autoPauseEnabled;
    lastAutoPausedRowId = "";
    setToggle(pauseButton, autoPauseEnabled);
    schedulePlaybackTick();
  }

  function setOpen(nextOpen) {
    open = nextOpen;
    panel?.classList.toggle("open", open);
    host?.classList.toggle("panel-open", open);
    root.getElementById("sc-launcher")?.setAttribute("aria-expanded", String(open));
    if (open) {
      renderRows();
      schedulePlaybackTick();
    }
  }

  function moveForFullscreen() {
    const parent = document.fullscreenElement || document.body;
    if (host && host.parentElement !== parent) parent.append(host);
  }

  function createPanel() {
    if (host) return;
    host = document.createElement("div");
    host.id = "youtube-dual-subtitles-panel-host";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; color: #18201f; letter-spacing: 0; }
        * { box-sizing: border-box; }
        button { font: inherit; letter-spacing: 0; }
        svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #sc-launcher { position: fixed; right: 12px; top: 42%; width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.22); border-radius: 6px; background: #087f72; color: white; box-shadow: 0 8px 24px rgba(0,0,0,.24); cursor: pointer; pointer-events: auto; transition: right .22s ease, background .15s ease; }
        #sc-launcher:hover { background: #076d63; }
        :host(.panel-open) #sc-launcher { right: 388px; }
        #panel { position: fixed; top: 0; right: 0; width: min(376px, 94vw); height: 100vh; display: grid; grid-template-rows: auto auto minmax(0,1fr); background: #fff; border-left: 1px solid #dfe7e5; box-shadow: -14px 0 36px rgba(13,34,30,.15); transform: translateX(105%); transition: transform .22s ease; pointer-events: auto; }
        #panel.open { transform: translateX(0); }
        .panel-header { display: flex; align-items: flex-start; gap: 10px; padding: 16px 14px 13px 18px; border-bottom: 1px solid #e7eceb; }
        .panel-title { min-width: 0; flex: 1; }
        h2 { margin: 0; font-size: 16px; line-height: 1.35; font-weight: 720; }
        #status { display: block; margin-top: 3px; color: #697775; font-size: 11px; line-height: 1.4; }
        .icon-button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 5px; color: #53615f; background: transparent; cursor: pointer; }
        .icon-button:hover { background: #f0f5f4; color: #18201f; }
        .toolbar { display: flex; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #e7eceb; background: #fbfdfc; }
        .tool { min-width: 0; height: 34px; flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 0 10px; border: 1px solid #ccd8d5; border-radius: 5px; background: #fff; color: #33413f; font-size: 12px; font-weight: 650; cursor: pointer; }
        .tool:hover { border-color: #7fa9a2; }
        .tool.selected { border-color: #087f72; background: #eaf7f4; color: #06685e; }
        #transcript { min-height: 0; overflow: auto; padding: 6px 0 22px; }
        .transcript-row { width: 100%; display: grid; grid-template-columns: 42px minmax(0,1fr); gap: 7px; padding: 11px 16px 11px 18px; border: 0; border-left: 3px solid transparent; background: #fff; color: inherit; text-align: left; cursor: pointer; }
        .transcript-row:hover { background: #f5f9f8; }
        .transcript-row.active { border-left-color: #087f72; background: #ecf7f5; }
        time { padding-top: 2px; color: #7a8886; font-size: 11px; font-variant-numeric: tabular-nums; }
        .line-copy { min-width: 0; display: grid; gap: 4px; }
        .en { color: #1b2423; font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
        .zh { color: #687572; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
        .empty { min-height: 55vh; display: grid; place-content: center; gap: 7px; padding: 30px; color: #53615f; text-align: center; }
        .empty strong { color: #263230; font-size: 14px; }
        .empty span { font-size: 12px; line-height: 1.6; }
        @media (max-width: 640px) {
          #panel { width: min(340px, 96vw); }
          :host(.panel-open) #sc-launcher { right: min(350px, 96vw); }
          #sc-launcher { top: 24%; }
        }
      </style>
      <button id="sc-launcher" type="button" title="打开学习侧栏" aria-label="打开学习侧栏" aria-expanded="false">${ICONS.book}</button>
      <aside id="panel" aria-label="YouTube 双字幕学习侧栏">
        <header class="panel-header">
          <div class="panel-title"><h2>双语文字记录</h2><span id="status">正在连接</span></div>
          <button class="icon-button" id="sc-close" type="button" title="关闭" aria-label="关闭学习侧栏">${ICONS.close}</button>
        </header>
        <div class="toolbar">
          <button class="tool" id="sc-loop" type="button" title="循环当前句" aria-pressed="false">${ICONS.loop}<span>单句循环</span></button>
          <button class="tool" id="sc-pause" type="button" title="每句结束自动暂停" aria-pressed="false">${ICONS.pause}<span>自动暂停</span></button>
        </div>
        <div id="transcript"></div>
      </aside>
    `;
    panel = root.getElementById("panel");
    transcriptList = root.getElementById("transcript");
    statusText = root.getElementById("status");
    loopButton = root.getElementById("sc-loop");
    pauseButton = root.getElementById("sc-pause");
    root.getElementById("sc-launcher").addEventListener("click", () => setOpen(!open));
    root.getElementById("sc-close").addEventListener("click", () => setOpen(false));
    loopButton.addEventListener("click", toggleLoop);
    pauseButton.addEventListener("click", toggleAutoPause);
    document.body.append(host);
    document.dispatchEvent(new CustomEvent("sc:request-transcript"));
  }

  document.addEventListener("sc:transcript-update", (event) => updateTranscript(event.detail));
  document.addEventListener("fullscreenchange", moveForFullscreen);
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (!(event.altKey && event.shiftKey)) return;
    if (event.code === "KeyL") {
      event.preventDefault();
      setOpen(!open);
    } else if (event.code === "KeyR") {
      event.preventDefault();
      toggleLoop();
    } else if (event.code === "KeyP") {
      event.preventDefault();
      toggleAutoPause();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SC_TOGGLE_PANEL") return;
    setOpen(!open);
    sendResponse({ ok: true });
  });
  const mount = () => {
    if (!document.body) {
      window.setTimeout(mount, 50);
      return;
    }
    createPanel();
  };
  mount();
})();
