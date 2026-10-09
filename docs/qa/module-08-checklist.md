# Module 08 — Executed verification

Windows / Edge / Tauri WebView2, 2026-10-08. [Full delivery and limitations](../architecture/image-viewer.md).

| Check | Result |
| --- | --- |
| `pnpm test` | 347 tests / 20 files passed |
| `pnpm build` | TypeScript and production lazy bundles passed |
| Native Rust suite | 28 tests passed |
| Real generated JPEG 100 MP | Authorized native scaled output 1250 × 1250; ~1.2 s |
| Browser ordinary formats | PNG/JPEG/WebP/BMP/ICO/AVIF/TIFF passed |
| EXIF | All eight orientations verified using actual rendered quadrant pixels |
| Animation | GIF/WebP/APNG change frames, pause/resume, restore paused frames; finite GIF stops |
| SVG | Static vector preview; unsafe content removed; no external requests/dialogs; malformed Text fallback works |
| Large PNG | 4K/20 MP full decode; 100 MP/400 MP reduced 2000 × 2000 preview |
| HEIC | Synthetic and upstream real sample safely fall back; no codec download |
| Metadata | ICC unknown/declaration, CMYK, camera, GPS default collapse verified |
| Interaction | Zoom, rotation, background, pixel inspection, image/HEX clipboard and session restore passed |
| Lifecycle | Instrumented bitmap/URL/worker/decoder/VideoFrame counts all zero after closing workspace |
| Tauri | Actual WebView2 fixtures passed; native ungranted path rejected |

Detailed measured outputs: [browser JSON](module-08-browser-results.json), [Tauri JSON](module-08-tauri-results.json). Screenshots: [browser](module-08-browser.png), [Tauri](module-08-tauri.png).

Reproduce small fixtures with `python tests/fixtures/image/generate.py`; use `--large` for ignored 4K/20MP/100MP/400MP files. Browser QA uses `tests/module-08-browser-qa.cjs` with `PRISM_QA_URL`; Tauri QA uses `tests/module-08-tauri-qa.cjs` and WebView2 debug port 9223. Both accept `PRISM_PLAYWRIGHT` pointing to the installed Playwright package. Optional real HEIC sample was downloaded locally from [libheif example.heic](https://github.com/strukturag/libheif/blob/master/examples/example.heic) and is ignored, not shipped as an application dependency.

Known limits: native selected-file dialog rendering was not automated end to end; full process memory was not measured; HEIC codec is unavailable; large browser JPEG, unsupported reduced PNG variants, derived HEIF grids and unsupported TIFF layouts remain metadata-only. Reduced JPEG warns that embedded ICC transforms are not applied. See full report for exact budgets and codec restrictions.
