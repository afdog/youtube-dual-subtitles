const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("popup constrains the document width instead of leaving a blank viewport", () => {
  const css = fs.readFileSync(path.join(root, "popup/popup.css"), "utf8");

  assert.match(css, /html\s*\{[^}]*width:\s*356px;/s);
  assert.match(css, /html\s*\{[^}]*min-width:\s*356px;/s);
  assert.match(css, /html\s*\{[^}]*max-width:\s*356px;/s);
  assert.match(css, /body\s*\{[^}]*max-height:\s*600px;/s);
  assert.match(css, /overflow-x:\s*hidden;/);
});

test("popup exposes only free learning tools and subtitle settings", () => {
  const html = fs.readFileSync(path.join(root, "popup/popup.html"), "utf8");

  assert.match(html, /class="learning-section"/);
  assert.match(html, /文字记录、点击跳转、单句循环和自动暂停/);
  assert.match(html, /id="open-panel"/);
  assert.match(html, /id="localRecognition"/);
  assert.match(html, /每台设备首次使用需下载模型/);
  assert.doesNotMatch(html, /Pro|许可证|支付|验证模式|license|entitlement|trial/i);
});
