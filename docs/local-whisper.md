# 本地 Whisper 实验说明 / Local Whisper experimental notes

## 状态 / Status

本页记录浏览器本地 Whisper 功能的当前实验实现和边界。它已经接入扩展的字幕层，但仍需要在 macOS Chrome 和 Windows Chrome 中分别完成真实验收，不能把静态测试当成所有视频都成功。

This page documents the current implementation and boundaries for an experimental browser-local Whisper mode. It is connected to the extension's caption layer, but it still requires separate real acceptance in Chrome on macOS and Windows; static checks do not mean every video will succeed.

## 实验范围 / Experimental scope

本模式从用户在弹窗中明确开启后开始工作。如果 YouTube 已提供英文 cue 但没有中文 cue，扩展直接把英文 cue 分批发送到本地英译中模型；只有没有可用文字字幕时，才从当前 YouTube HTML5 播放器捕获短音频片段，在隐藏的扩展 offscreen document 中运行浏览器本地 Whisper，再用本地英译中模型生成中文 cue，最后转换为现有的 `{ start, end, text }` 时间轴。Whisper 转写本身不是中文翻译；当前实现使用独立的 `Xenova/opus-mt-en-zh` 模型补充中文，也不承诺适用于每个视频。

After the user explicitly enables it in the popup, this mode first translates existing English cues in batches when they are available. Only when no usable text captions exist does it capture short audio segments from the current YouTube HTML5 player, run browser-local Whisper in a hidden extension offscreen document, and use a separate local `Xenova/opus-mt-en-zh` model to generate Chinese cues before converting them to the existing `{ start, end, text }` timeline shape. Whisper transcription itself is not Chinese translation, and this mode does not promise coverage for every video.

The native YouTube-caption path remains the fallback and must continue to work independently. Enabling or failing to initialize local Whisper must not remove, replace, or falsify native captions.

本地 Whisper 失败、模型不可用、视频无法采集音频或视频本身没有合适内容时，原生字幕路径仍是回退路径。实验模式不应把转写结果冒充 YouTube 原生字幕，也不应改变现有原生字幕请求和解析契约。

## 数据、模型和首次运行成本 / Data, model, and first-run cost

模型文件可能需要在首次使用时由浏览器下载，并在浏览器可用的本地缓存中保存，以便后续使用。首次运行可能产生明显的下载量、等待时间、CPU/GPU 占用、内存压力和电量消耗；模型更新或清除浏览器缓存后，这些成本可能再次出现。

The model may need to be downloaded on first use and stored in browser-local cache for later runs. The first run can involve substantial download size, startup latency, CPU/GPU work, memory pressure, and battery use. These costs can recur after a model update or browser-cache removal.

为避开 ONNX Runtime 1.25/1.26 对量化 Whisper 和 Marian 模型的已知会话创建回归，构建依赖锁定在 Transformers.js 3.7.3（ONNX Runtime Web 1.22）并继续使用 Q8 模型。升级该依赖前必须重新完成两种模型的真实 Chrome 验收。

To avoid the ONNX Runtime 1.25/1.26 session-creation regression affecting quantized Whisper and Marian models, the build pins Transformers.js 3.7.3 (ONNX Runtime Web 1.22) and keeps Q8 models. Any dependency upgrade requires renewed real-Chrome acceptance for both models.

在本项目的设计边界内，音频只在用户浏览器内参与本地推理，不发送到本项目自有服务器；本项目也不建立账号系统或遥测来收集音频、转写文本或使用记录。模型下载本身仍可能访问模型提供方或浏览器缓存所需的网络资源，不能将“本地推理”理解成完全离线或完全没有网络请求。

Within this project boundary, audio is processed for local inference inside the user's browser and is not sent to a project-owned server. The project does not add an account system or telemetry to collect audio, transcript text, or usage history. Model download may still contact a model provider or other network resource required by the browser cache; “local inference” must not be read as a promise of fully offline operation or zero network traffic.

## 权限与隐私限制 / Permission and privacy limitations

实际实现优先使用 HTML5 播放器的 `captureStream()`，音轨尚未就绪时会短暂重试，再以 Web Audio 媒体源作为备用；只把音频轨道交给 `MediaRecorder`。扩展新增 `offscreen` 权限以在隐藏扩展页面中运行 ONNX WASM，但不使用麦克风权限或 `tabCapture` 权限。只有用户开启本地识别后才会尝试捕获音频；短音频只用于当前推理，不写入项目服务器或扩展持久存储。已有英文 cue 时不需要捕获音频。

The implementation prefers the HTML5 player's `captureStream()`, briefly retries while audio tracks initialize, and falls back to a Web Audio media source; only audio tracks go to `MediaRecorder`. It adds the `offscreen` permission so ONNX WASM can run in a hidden extension page, but no microphone or `tabCapture` permission. Capture starts only after opt-in; short audio is used for current inference and is not written to a project server or persistent extension storage. Existing English cues are translated without audio capture.

模型权重不会打进源码仓库或 Release ZIP。每位用户第一次启用时，自己的浏览器从固定版本的公开 Hugging Face 模型仓库下载量化模型并用 Transformers.js/Cache API 缓存；因此所有安装者都有同一套代码，但每台设备都要独立承担首次下载、磁盘、内存、CPU 和等待成本。模型仓库不可访问时，本地识别无法初始化。

The model weights are not included in the source repository or Release ZIP. Each user's browser downloads the pinned quantized model revisions from the public Hugging Face repositories on first enable and caches them through the Transformers.js/Cache API. Every installation therefore has the same code, but each device pays its own first-run download, disk, memory, CPU, and latency cost. Local recognition cannot initialize when the model host is unreachable.

目标浏览器仍是 macOS 和 Windows 上的桌面版 Chrome。浏览器版本、硬件、模型大小、视频类型、页面权限和资源压力都会影响结果；移动端、其他浏览器和嵌入式播放器不在本实验的承诺范围内。

The target browser remains desktop Chrome on macOS and Windows. Browser version, hardware, model size, video type, page permissions, and resource pressure can affect the result. Mobile browsers, other browsers, and embedded players are outside this experiment's commitment.

## 纯函数契约 / Pure-function contract

计划中的 `content/local-whisper-utils.js` 通过 CommonJS 和浏览器全局同时提供工具：Node 中使用 `module.exports`，浏览器中使用 `globalThis.YTDSLocalWhisperUtils`。测试不联网，也不下载模型。

The planned `content/local-whisper-utils.js` exposes the utilities through both CommonJS and a browser global: `module.exports` in Node and `globalThis.YTDSLocalWhisperUtils` in the browser. The tests are offline and do not download a model.

`normalizeWhisperChunks(chunks, options?)` 的当前测试契约如下：

The current test contract for `normalizeWhisperChunks(chunks, options?)` is:

- 接受 `{ timestamp: [start, end], text }`、`{ start, end, text }` 和 `{ offsets: [start, end], text }` 三种常见形状；时间单位为秒。
- Accept `{ timestamp: [start, end], text }`, `{ start, end, text }`, and `{ offsets: [start, end], text }`; timestamps are in seconds.
- 丢弃空字符串和只含空白的文本，并返回 `{ start: number, end: number, text: string }`。
- Drop empty and whitespace-only text and return `{ start: number, end: number, text: string }`.
- 将负起点钳制到 `0`；非有限或无法解释的起点不产生 cue。
- Clamp negative starts to `0`; a non-finite or otherwise unusable start produces no cue.
- `end` 为 `null`、`undefined`、非有限值或不大于 `start` 时，使用 `0.25` 秒的小回退时长。
- Use a small `0.25`-second fallback duration when `end` is `null`, `undefined`, non-finite, or not greater than `start`.
- 按 `start` 升序稳定排序，并以确定性规则修复重叠：较早 cue 在下一个 cue 开始处结束。
- Sort by ascending `start` stably and repair overlaps deterministically by ending an earlier cue at the next cue's start.

`getLocalWhisperStatusLabel(status)` 只负责简短的中文状态文案：`idle`/待机、`loading`/加载中、`recording`/录音中、`transcribing`/转写中、`ready`/就绪、`error`/出错、`stopped`/已停止。未知状态的显示和错误细节由主 UI 契约另行决定。

`getLocalWhisperStatusLabel(status)` only supplies concise Chinese UI labels: `idle`/待机, `loading`/加载中, `recording`/录音中, `transcribing`/转写中, `ready`/就绪, `error`/出错, and `stopped`/已停止. Handling of unknown statuses and detailed errors belongs to the main UI contract.

如主实现不需要本地 cue 合并，`mergeLocalCues(primary, secondary)` 不在本片中增加额外行为承诺；只有实际接入需要时才应补充它的测试和说明。

If the main implementation does not need local cue merging, this slice makes no additional behavioral promise for `mergeLocalCues(primary, secondary)`; tests and documentation should be added only if the integration requires it.

## TODO：继续验收与改进 / TODO: further acceptance and improvements

- 明确并验收 Chrome 权限提示、缓存清除、模型失败、长视频、直播、无音频和资源不足等边界。
- Define and accept Chrome permission prompts, cache clearing, model failure, long videos, live streams, missing audio, and resource-pressure boundaries.
- 改进暂停、拖动、倍速和 YouTube SPA 切换时的音频片段去重与时间轴衔接。
- Improve deduplication and timeline continuity across pause, seeking, playback-rate changes, and YouTube SPA navigation.
- 评估更小或更快的翻译模型、更多源语言和可选 WebGPU 后端。
- Evaluate smaller or faster translation models, more source languages, and an optional WebGPU backend.
- 在 macOS Chrome 和 Windows Chrome 中完成真实浏览器验收；离线单元测试不能替代这一步。
- Complete real-browser acceptance in Chrome on macOS and Windows; offline unit tests do not replace it.
