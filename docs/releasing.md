# 发布流程 / Release process

## 发布内容 / Release contents

发布 ZIP 先由 `scripts/build-ai.mjs` 生成本地推理服务工作线程和 ONNX Runtime 文件，再由 `scripts/package-extension.mjs` 通过显式文件白名单生成。它只应包含 macOS 与 Windows 上的 Chrome 运行时所需的 MIT `LICENSE`、`THIRD_PARTY_NOTICES.md`、清单、字幕/学习脚本、本地推理 bundle、ONNX Runtime、`popup/` 和 `icons/`；模型权重按每位用户独立下载，不会包含在 ZIP 中。不会包含测试、文档、`node_modules/`、Git 元数据或其他本地构建目录。

The release ZIP first builds the lightweight service-worker bridge, offscreen local-inference engine, and ONNX Runtime files with `scripts/build-ai.mjs`, then uses `scripts/package-extension.mjs` with an explicit file allowlist. It should contain the MIT `LICENSE`, `THIRD_PARTY_NOTICES.md`, manifest, caption/study scripts, offscreen engine, ONNX Runtime files, `popup/`, and `icons/` needed by Chrome on macOS and Windows. Model weights are downloaded separately by each user and are not placed in the ZIP; tests, documentation, `node_modules/`, Git metadata, and other local build directories are excluded.

## GitHub Actions / GitHub Actions

每次 PR 和 push 都运行测试与清单检查。推送与 `package.json` 版本一致的 `v<version>` 标签（本次为 `v2.0.0`）时，工作流会在通过检查后生成适用于 macOS 与 Windows Chrome 的 ZIP，运行 `unzip -t`，再使用 GitHub 提供的 token 创建或更新 GitHub Release 并上传 ZIP。CI 使用 Linux runner 进行无浏览器工程化检查，不宣称完成 macOS 或 Windows Chrome 验收。

Every pull request and push runs the tests and manifest checks. When a `v<version>` tag matching `package.json` (this release: `v2.0.0`) is pushed, the workflow generates a ZIP for Chrome on macOS and Windows, runs `unzip -t`, then uses the GitHub-provided token to create or update the GitHub Release and upload the ZIP. The CI uses a Linux runner for browser-free engineering checks and does not claim macOS or Windows Chrome acceptance.

## 维护者清单 / Maintainer checklist

- [ ] `package.json` 与发布目标版本一致。
- [ ] 在构建机上运行 `npm ci`，确保 `package-lock.json` 与依赖一致。
- [ ] `manifest.json` 是合法的 Manifest V3 清单，且所有声明的本地入口都存在。
- [ ] `npm run build:ai` 成功，且生成的 bundle 不依赖远程 CDN JavaScript。
- [ ] `npm test`、`npm run check` 和 `node --check scripts/package-extension.mjs` 通过。
- [ ] `npm run package` 成功，内置的 `npm run check:release` 和 `unzip -t` 都通过。
- [ ] 记录 macOS Chrome 和 Windows Chrome 的真实验收范围；测试版未覆盖的系统、版本和场景必须在 Release 中披露。
- [ ] 检查 ZIP 内容，确认没有测试、文档、依赖目录、Git 文件或敏感数据。

- [ ] `package.json` matches the release target version.
- [ ] Run `npm ci` on the build machine so `package-lock.json` and dependencies agree.
- [ ] `manifest.json` is valid Manifest V3 and every declared local entry exists.
- [ ] `npm run build:ai` succeeds and the generated bundle does not execute JavaScript from a remote CDN.
- [ ] `npm test`, `npm run check`, and `node --check scripts/package-extension.mjs` pass.
- [ ] `npm run package` succeeds, and both its built-in `npm run check:release` and `unzip -t` pass.
- [ ] Record real acceptance coverage for Chrome on macOS and Windows; disclose any beta system, version, or scenario not yet covered in the Release.
- [ ] Inspect the ZIP and confirm it contains no tests, docs, dependency directories, Git files, or sensitive data.
