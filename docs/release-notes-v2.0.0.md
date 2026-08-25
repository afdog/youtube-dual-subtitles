# YouTube 双字幕 2.0.0（公开测试版）

这是面向 macOS 与 Windows 桌面版 Chrome 的首个开源公开测试版。所有学习功能免费开放，无账号、付费、许可证、授权服务器或项目遥测。

## 包含功能

- 中英双字幕、单语回退和原生字幕保护
- 字号、位置、背景和原生字幕隐藏设置
- 双语文字记录、点击跳转、单句循环和自动暂停
- 可选的浏览器本地英文识别与英译中实验回退
- MIT 许可证和完整源码

## 测试版限制

**字幕来源说明：**如果视频本身同时提供可用的英文和简体中文字幕，扩展可以直接组合并正常显示，这是最稳定的使用场景。如果视频没有同时提供两种字幕，用户可开启“本地识别（实验性）”，由浏览器尝试本地语音识别和机器翻译补全。此路径无法保证字幕成功显示，也无法保证识别和翻译准确性。

本版本不承诺在 100% 的 YouTube 视频上成功显示双字幕。结果受 YouTube 字幕与翻译可用性、页面变化、视频类型、模型下载、播放器音频捕获以及设备性能影响。直播、Shorts、受访问限制内容和嵌入式播放器可能不可用。

扩展重新加载或 YouTube 页面内切换后，字幕或学习侧栏偶尔可能暂时失效。请先完整刷新视频页面；必要时再刷新一次。

本地识别需由每台设备首次单独下载公开模型，可能较慢并占用较多内存。识别和翻译结果可能有误，不应替代专业翻译或无障碍字幕。

## 安装

1. 下载下方 `youtube-dual-subtitles-v2.0.0.zip`。
2. 解压 ZIP。
3. 在 Chrome 打开 `chrome://extensions/` 并开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择解压后的目录。
5. 打开或完整刷新 YouTube 视频页面。

详细说明、隐私边界和问题反馈格式见仓库 README。

---

This is the first open-source public beta for desktop Chrome on macOS and Windows. It includes bilingual captions, display controls, transcript seeking, sentence looping, auto-pause, and an optional browser-local Whisper/translation fallback. All features are free; there are no accounts, payments, licenses, developer-operated authorization servers, or project telemetry.

**Caption-source notice:** Videos that already provide usable English and Simplified Chinese caption tracks can be combined and displayed directly; this is the most reliable path. When both tracks are not available, users can enable “Local recognition (experimental)” so the browser attempts local speech recognition and machine translation. This fallback does not guarantee that captions will appear or that recognition and translation will be accurate.

This release does **not** guarantee bilingual captions on 100% of YouTube videos. YouTube caption availability, page changes, video type, model downloads, player audio capture, and device resources can all affect the result. If captions or the study panel temporarily stop responding after navigation or an extension reload, fully refresh the video page and, if needed, refresh once more.
