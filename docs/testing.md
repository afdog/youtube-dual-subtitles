# 测试与 Chrome 验收 / Testing and Chrome acceptance

## 自动检查 / Automated checks

在仓库根目录运行：

Run these commands from the repository root:

```bash
npm test
npm run build:ai
npm run check
node --check scripts/package-extension.mjs
npm run package
npm run check:release
```

- `npm test` 使用 Node.js 内置测试运行器执行 `tests/` 中的单元测试。
- `npm run check` 验证公开包配置、Manifest V3 和发布白名单。
- `node --check` 只验证打包脚本语法。
- `npm run package` 生成带当前版本号的 ZIP，并打印文件路径。
- `npm run package` 会自动执行 Release ZIP 内容检查；也可以单独运行 `npm run check:release`。
- 在 macOS/Linux 使用 `unzip -t <打印出的 ZIP 路径>` 验证 ZIP；Windows 可用资源管理器或 7-Zip 检查。

- `npm test` runs the unit tests in `tests/` with Node.js's built-in test runner.
- `npm run check` validates the public package configuration, Manifest V3, and release allowlist.
- `node --check` checks only the package script syntax.
- `npm run package` creates and prints the path to a ZIP named with the current version.
- `npm run package` automatically checks the Release ZIP contents; `npm run check:release` can also be run separately.
- On macOS/Linux, use `unzip -t <printed ZIP path>` to verify it; on Windows, inspect it with Explorer or 7-Zip.

这些检查不等同于端到端成功。它们不能证明 Chrome 已成功加载扩展，也不能证明每个 YouTube 视频都能取得字幕。

These checks are not end-to-end success. They cannot prove that Chrome loaded the extension or that every YouTube video returns usable captions.

## 首次真实 Chrome 验收 / First real Chrome acceptance

目标支持范围是 macOS 和 Windows 上的桌面版 Google Chrome。两种系统都应分别完成真实浏览器验收；如果公开测试版发布时仍有系统、Chrome 版本或场景尚未验收，必须在发布说明中公开记录，不能用 Linux CI 的静态检查替代或暗示已完成。Edge、其他 Chromium 浏览器、Firefox 和 Safari 不在验收范围内。

The target support range is desktop Google Chrome on both macOS and Windows. Each operating system should receive a real-browser acceptance pass; if a public beta ships with an operating system, Chrome version, or scenario still unverified, the release notes must disclose it rather than treating Linux CI checks as a substitute or implying completion. Edge, other Chromium browsers, Firefox, and Safari are outside the acceptance scope.

1. 如果加载源码目录，先运行 `npm install` 和 `npm run build:ai`；发布 ZIP 可直接解压加载。在 macOS 或 Windows 的 Chrome 中打开 `chrome://extensions/`，加载源码目录或解压后的发布 ZIP 目录。
2. 确认扩展没有清单、脚本或权限错误，再打开一个有明确英文字幕的普通 YouTube 视频。
3. 确认双字幕层出现，并检查字号、位置、背景和单语回退。
4. 打开学习侧栏，确认文字记录出现；点击一条记录，确认播放器跳转到对应时间。
5. 开启单句循环和自动暂停，确认两项控制无需服务器或账号即可工作。
6. 在 YouTube 内切换到另一段视频，确认扩展不会继续显示上一段视频的字幕。
7. 在没有可用字幕或字幕请求失败的情况下，确认页面仍能使用 YouTube 原生字幕。
8. 重新加载扩展并刷新页面，确认设置和基本显示仍然可用。
9. 打开扩展弹窗，开启“无字幕时本地识别（实验性）”。首次使用应出现模型下载/加载状态；等待模型就绪后，在一个只有英文字幕或没有可用字幕的普通视频中确认本地双字幕和文字记录逐段出现。关闭开关后，确认本地捕获停止且原生字幕仍可用。

1. If loading the source directory, run `npm install` and `npm run build:ai` first; a release ZIP can be loaded after extraction. In Chrome on macOS or Windows, open `chrome://extensions/` and load the source directory or the extracted release ZIP directory.
2. Confirm there are no manifest, script, or permission errors, then open a normal YouTube video with clear English captions.
3. Confirm the bilingual layer appears and check size, position, background, and single-language fallback.
4. Open the study panel, confirm the transcript appears, and click a row to verify seeking to its timestamp.
5. Enable single-line looping and auto-pause; confirm both controls work without a server or account.
6. Navigate to another video within YouTube and confirm captions from the previous video do not remain.
7. When captions are unavailable or a caption request fails, confirm YouTube's native caption experience remains usable.
8. Reload the extension and refresh the page; confirm settings and basic rendering still work.
9. Open the extension popup and enable “Local recognition (experimental)”. The first use should show model download/loading state; after the model is ready, verify that local bilingual cues and transcript rows appear progressively on a normal video with only English captions or no usable captions. Disable the switch and confirm local capture stops while native captions remain usable.

测试版应持续补齐 macOS Chrome 和 Windows Chrome 的真实浏览器验收。自动化单元测试、语法检查和 ZIP 检查只是工程化门槛，不能证明所有视频、系统或硬件组合都可用。

The beta should continue expanding real-browser acceptance in Chrome on both macOS and Windows. Automated unit tests, syntax checks, and ZIP checks are engineering gates only; they do not prove compatibility with every video, operating system, or hardware combination.
