# Third-party notices

The experimental local-recognition bundle includes JavaScript from these open-source packages:

- [`@huggingface/transformers`](https://github.com/huggingface/transformers.js): Apache License 2.0. Its license text is installed at `node_modules/@huggingface/transformers/LICENSE` during development.
- [`onnxruntime-web`](https://github.com/microsoft/onnxruntime): MIT License. Copyright and license notices from the bundled distribution are retained in the generated JavaScript bundle.
- The generated bundle may include transitive dependencies from the packages above. Their license notices remain the responsibility of the corresponding package distributions.

The extension does not commit model weights. At runtime, the browser downloads the selected quantized models from their public model repositories and caches them locally:

- [`onnx-community/whisper-tiny`](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7)
- [`Xenova/opus-mt-en-zh`](https://huggingface.co/Xenova/opus-mt-en-zh/tree/046f55aec303cdee3e0318604406d4df20f1e8ea)

Model cards and repository terms apply to those weights. This project does not claim ownership of the models or their training data.

This notice is included in both the source repository and the distributed extension ZIP. License comments emitted by the upstream packages and build tool are retained in `offscreen/engine.js`.
