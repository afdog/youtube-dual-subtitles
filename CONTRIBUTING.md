# 贡献指南 / Contributing

感谢你愿意改进 YouTube 双字幕。请先阅读 README，确认变更属于 Chrome-only 扩展的公开范围。

Thank you for improving YouTube Dual Subtitles. Read the README first and keep changes within the public scope of this Chrome-only extension.

## 提交前 / Before you submit

请使用 Node.js 20 或更高版本，并运行：

Use Node.js 20 or newer and run:

```bash
npm test
npm run check
node --check scripts/package-extension.mjs
```

如果变更涉及发布文件，再运行 `npm run package`，并对命令输出的版本化 ZIP 运行 `unzip -t <printed-zip-path>`（Windows 可用资源管理器或 7-Zip 检查）。浏览器相关变更还需要按 [docs/testing.md](docs/testing.md) 完成一次 Chrome 实机验收。

For release-related changes, also run `npm run package` and verify the versioned ZIP printed by the command with `unzip -t <printed-zip-path>` (or Explorer/7-Zip on Windows). Browser-facing changes need a Chrome acceptance pass as described in [docs/testing.md](docs/testing.md).

## 代码范围 / Code boundaries

- 保持 Manifest V3 和 Chrome-only 支持范围。
- 不引入账号、遥测、自有服务器或与本地模型能力无关的运行时依赖；模型代码必须打包进扩展，不能从远程 CDN 执行代码。
- 不把 `tests/`、`docs/`、`node_modules/` 或本地构建产物放入发布 ZIP。
- 不绕过 YouTube 的字幕、权限或访问限制。
- 优先补充针对纯函数和确定性行为的测试；不要把静态测试描述成端到端成功。

- Keep the Manifest V3 and Chrome-only support scope.
- Do not add accounts, telemetry, an owned server, or runtime dependencies unrelated to local model execution; model code must be bundled into the extension rather than executed from a remote CDN.
- Keep `tests/`, `docs/`, `node_modules/`, and local build output out of release ZIPs.
- Do not bypass YouTube caption, permission, or access restrictions.
- Prefer focused tests for pure functions and deterministic behavior; do not describe static checks as end-to-end success.

## Pull requests / 拉取请求

请在 PR 中说明目的、影响的文件、测试命令和任何未完成的浏览器验收。小而聚焦的变更更容易审阅。不要提交密钥、个人数据、视频字幕导出或本地构建目录。

In a PR, describe the goal, touched files, test commands, and any browser acceptance still outstanding. Small, focused changes are easier to review. Do not submit secrets, personal data, exported video captions, or local build directories.

本项目按 MIT 条款发布，详见根目录的 [LICENSE](LICENSE)。

This project is distributed under the MIT terms in the root [LICENSE](LICENSE).
