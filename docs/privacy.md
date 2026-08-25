# 隐私说明 / Privacy notice

生效版本：`2.0.0` 公开测试版
Effective version: `2.0.0` public beta

## 项目不收集什么 / What the project does not collect

YouTube 双字幕没有开发者自有服务器、账号、付费系统、许可证服务或遥测。项目维护者不会通过本扩展接收或保存用户的视频 URL、标题、视频 ID、观看记录、字幕正文、音频、设备 ID 或学习记录。

YouTube Dual Subtitles has no developer-operated server, account, payment system, license service, or telemetry. The maintainers do not receive or store users' video URLs, titles, video IDs, watch history, caption text, audio, device IDs, or study activity through this extension.

## 必要的外部请求 / Necessary external requests

- 扩展在 YouTube 页面上运行，并可能直接向 YouTube 请求当前视频可用的字幕或翻译轨道。这些请求由用户的浏览器发出，受 YouTube/Google 的条款与隐私规则约束。
- 用户主动开启“本地识别（实验性）”后，浏览器会从公开 Hugging Face 模型仓库下载固定模型文件并缓存到本机。模型下载请求受 Hugging Face 的条款与隐私规则约束。
- 本地识别捕获的短音频片段只在扩展的本地推理页面中处理，不上传到项目服务器或模型仓库，也不会写入扩展的持久存储。

- The extension runs on YouTube pages and may request available caption or translation tracks directly from YouTube. These browser-originated requests are subject to YouTube/Google terms and privacy practices.
- After the user explicitly enables “Local recognition (experimental),” the browser downloads pinned model files from public Hugging Face model repositories and caches them locally. Model-download requests are subject to Hugging Face terms and privacy practices.
- Short audio segments captured for local recognition are processed only in the extension's local inference page. They are not uploaded to the project server or model repository and are not written to persistent extension storage.

## 本地存储 / Local storage

扩展使用 Chrome `storage.sync` 保存启用状态、字幕语言、字号、背景、位置、原生字幕隐藏和本地识别开关等设置。模型文件由浏览器缓存。删除扩展通常会删除扩展设置；浏览器缓存的具体清理行为由 Chrome 决定。

The extension uses Chrome `storage.sync` for preferences such as enabled state, caption languages, size, background, position, native-caption hiding, and the local-recognition toggle. Model files are held in browser-managed cache. Removing the extension normally removes extension settings; Chrome controls the exact cache-cleanup behavior.

## 权限 / Permissions

- `storage`：保存用户设置。
- `offscreen`：在隐藏的扩展页面中运行本地 ONNX/WASM 推理。
- `https://www.youtube.com/*`：读取当前页面字幕状态并显示字幕与学习侧栏。
- Hugging Face 域名权限：仅用于用户开启本地识别后下载公开模型文件。

- `storage`: saves user preferences.
- `offscreen`: runs local ONNX/WASM inference in a hidden extension page.
- `https://www.youtube.com/*`: reads caption state and renders captions and the study panel.
- Hugging Face host permissions: download public model files only after local recognition is enabled.

## 反馈 / Feedback

隐私问题可通过 GitHub Issues 提交。请勿在公开 Issue 中粘贴私人字幕、账号信息、Cookies、访问令牌或其他敏感数据。

Privacy questions can be submitted through GitHub Issues. Do not paste private captions, account details, cookies, access tokens, or other sensitive data into a public issue.
