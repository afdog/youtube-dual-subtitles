# 架构说明 / Architecture

## 运行时边界 / Runtime boundary

这是一个 Manifest V3 Chrome 扩展。原生字幕路径直接由 Chrome 加载页面脚本；本地识别实验路径由轻量 service worker 消息桥和隐藏的 offscreen document 组成。字幕数据来自 YouTube 页面和 YouTube 字幕请求，本地识别模型来自公开模型仓库，仓库本身不提供字幕服务。

This is a Manifest V3 Chrome extension. The native-caption path is loaded directly by Chrome, while experimental local recognition uses a lightweight service-worker bridge plus a hidden offscreen document. Caption data comes from YouTube pages and YouTube caption requests; local model files come from public model repositories; this repository does not provide a caption service.

## 数据流 / Data flow

1. YouTube 页面提供播放器状态、当前视频 ID 和可用字幕轨道。
2. `player-bridge.js` 观察并协助播放器相关请求，避免凭空构造不完整的字幕请求。
3. `caption-utils.js` 选择英文与简体中文轨道，解析 YouTube 返回的字幕事件。
4. `content.js` 按当前播放时间渲染双字幕，并处理页面内导航与回退。
5. `transcript-utils.js` 按时间重叠合并字幕，供学习辅助界面使用。
6. `popup/` 通过 Chrome 扩展 API 读取和保存显示设置。
7. 用户开启本地识别后，`content/local-whisper.js` 从当前 HTML5 播放器捕获短音频片段，解码为 16 kHz 单声道采样，并以 JSON 安全的 Base64 消息发送给轻量 service worker。
8. service worker 创建隐藏的 `offscreen/engine.html`；该页面运行打包后的 Transformers.js/ONNX WASM，在浏览器本地缓存 Whisper 与英译中模型，并把时间轴 cue 经消息桥回传给 `content/content.js`。

1. YouTube provides player state, the current video ID, and available caption tracks.
2. `player-bridge.js` observes and assists player-related requests instead of inventing incomplete caption requests.
3. `caption-utils.js` selects English and Simplified Chinese tracks and parses YouTube caption events.
4. `content.js` renders captions for the current playback time and handles in-page navigation and fallback.
5. `transcript-utils.js` merges cues by time overlap for the study-helper UI.
6. `popup/` uses Chrome extension APIs to read and save display settings.
7. When local recognition is enabled, `content/local-whisper.js` captures short audio segments from the current HTML5 player, decodes them to 16 kHz mono samples, and sends JSON-safe Base64 messages through the lightweight service worker.
8. A lightweight service worker creates `offscreen/engine.html`, where bundled Transformers.js/ONNX WASM runs in a document context; timestamped results return through the bridge and are merged by `content/content.js` with native captions.

## 可维护性 / Maintainability

纯数据变换集中在 `content/*-utils.js`，因此可以用 Node.js 内置测试运行器验证，不需要联网或启动浏览器。模型 bundle 由 `scripts/build-ai.mjs` 构建；与 YouTube 页面结构、播放器请求、音频捕获、模型下载和 DOM 交互相关的行为仍需真实 Chrome 验收。

Pure data transformations live in `content/*-utils.js`, so they can be checked with Node.js's built-in test runner without a network connection or browser. The model bundle is built by `scripts/build-ai.mjs`; behavior coupled to YouTube page structure, player requests, audio capture, model downloads, and the DOM still requires real Chrome acceptance.

## 约束 / Constraints

字幕可能缺失、延迟、被 YouTube 禁用或因页面变化而失效。扩展只在声明的 YouTube 页面范围内工作，不绕过访问限制，也不把无法取得的字幕伪装成成功。

本地识别增加了模型下载、缓存、音频解码、`offscreen` 权限和本地推理边界。它不把音频发送到项目服务器；模型仓库不可访问、播放器无法捕获、隐藏推理页面不可用或设备资源不足时，必须回退到原生字幕或明确报告失败。

Captions can be missing, delayed, disabled by YouTube, or broken by page changes. The extension works only within its declared YouTube page scope, does not bypass access restrictions, and does not represent unavailable captions as successful.

Local recognition adds model download, cache, audio decoding, the `offscreen` permission, and on-device inference boundaries. It does not send audio to a project server; if the model host is unavailable, capture fails, the hidden inference document is unavailable, or resources are insufficient, it must fall back to native captions or report failure clearly.
