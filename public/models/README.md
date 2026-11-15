# Vendored on-device ML assets (no build step; re-copy after upgrading `@mediapipe/tasks-vision`)

- `hand_landmarker.task` (7.8 MB) — MediaPipe Hand Landmarker model bundle
  (palm detection + hand landmarks), matching the current object at
  [Google's official model bucket](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task).
  SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- `wasm/vision_wasm_internal.{js,wasm}` (~15 MB) — the matching
  `@mediapipe/tasks-vision` WebAssembly runtime, copied from that npm
  package's `wasm/` directory.

The `@mediapipe/tasks-vision` 1.2.3 runtime declares Apache-2.0 in its package
metadata; `LICENSE-Apache-2.0.txt` is provided for the bundled
JavaScript/WebAssembly runtime. This runtime license does not by itself
establish the model bundle's terms.

The official [MediaPipe Hand Tracking model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf)
states Apache-2.0 for the model family. The bundled task file matches Google's
official model-bucket object and its documented two-stage model family, but
the task bundle contains no separate license notice; the card-to-artifact
association is therefore indirect, not artifact-specific legal confirmation.
Keep this attribution with the bundle and verify redistribution terms before
reusing it.

The model runs entirely in the browser; no webcam frame ever leaves the
device. The runtime is served locally so hand tracking does not depend on a
third-party CDN at runtime.
