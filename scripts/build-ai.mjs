import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";

const root = process.cwd();
const backgroundDir = path.join(root, "background");
const offscreenDir = path.join(root, "offscreen");
fs.mkdirSync(backgroundDir, { recursive: true });
fs.mkdirSync(offscreenDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/local-whisper-service-worker.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  outfile: path.join(backgroundDir, "service-worker.js"),
  legalComments: "eof",
  sourcemap: false
});

await build({
  entryPoints: [path.join(root, "src/local-whisper-engine.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  outfile: path.join(offscreenDir, "engine.js"),
  legalComments: "eof",
  sourcemap: false
});

for (const filename of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  fs.copyFileSync(
    path.join(root, "node_modules/onnxruntime-web/dist", filename),
    path.join(backgroundDir, filename)
  );
}

console.log("built service worker bridge, offscreen AI engine, and local ONNX Runtime WASM assets");
