# Module 02 — File Loading & Type Detection

Implementation complete; OS interaction and cross-platform acceptance remain with the tester. No Viewer has been added.

## Normal Files

- [x] TXT detected — Rust and browser unit tests.
- [x] MD detected — both pipelines and live browser file selection.
- [x] JSON detected — complete samples parsed, invalid/truncated samples flagged.
- [x] TS detected — extension and text evidence.
- [x] PNG detected — signature; live browser and observed real desktop selection.
- [x] PDF detected — signature; Rust, browser and live browser.
- [x] ZIP detected — bounded central-directory inspection.
- [x] XLSX detected — `[Content_Types].xml` and `xl/` names; no decompression.
- [x] SQLite, GIF, JPEG, WebP and SVG fixture coverage.

## Mismatch

- [x] PNG renamed to JPG is still detected as PNG — both loaders; live browser and real native descriptor observed.
- [x] Warning displayed — Inspector shows original extension and detected type separately.
- [x] ZIP renamed to PDF detected as ZIP — Rust integration fixture.
- [x] Corrupted PNG signature returns PNG with a warning, without claiming validity.

## Unknown

- [x] Unknown binary does not crash — `unknown`, `isBinary: true`.
- [x] Unknown text opens as text-like file — `text`, `isText: true`.
- [x] Empty file returns a text descriptor with size zero.

## Special Files

- [x] Dockerfile — text plus language hint.
- [x] README — text, no extension.
- [x] .env — text plus env hint, extension null.
- [x] .gitignore and Makefile rules.
- [x] No-extension file and shebang hint.
- [x] UTF-8, UTF-8 BOM, BOM-marked UTF-16 LE / BE.

## Large File

- [x] Large file detection uses bounded reads — 10MB, 100MB, 1GB and 20GB mock seekable sources; 65,536 bytes in every case.
- [x] Real 10MB file loaded with 65,536 detection bytes.
- [x] ZIP targeted-read limits tested, including hostile directory size/count.
- [x] Native filesystem work runs on blocking worker threads, not the UI thread.
- [ ] UI responsiveness under repeated real 1GB selections — tester stress check.
- [ ] Process memory measurement under repeated large selections — tester stress check. Input buffering is bounded by construction; RSS has not been profiled.

## Browser Mode

- [x] `pnpm dev` / equivalent `npm run dev` frontend still works.
- [x] Browser file selection detection works within browser limitations — 12 fixtures checked in real Edge.
- [x] Path remains null; Inspector explicitly labels Browser Preview Mode.
- [x] 1920 / 1440 / 1024 / 900px Inspector layouts have no horizontal overflow.
- [x] Browser page-error capture contains no errors.
- [x] Browser input and drop pipeline component tests.
- [ ] Real OS file drag into browser — tester check.

## Tauri Mode

- [x] Native debug compilation and launch passed on Windows.
- [x] Real selected file path works — observed native Inspector descriptor from a real selected file.
- [x] File size, modification / creation timestamps and bytes-read fields returned.
- [x] Arbitrary ungranted reads denied — Rust FileAccess tests.
- [x] Selected folder stays path-only; it grants no recursive read access.
- [x] Drag & Drop uses the same FileLoader — component boundary test; Rust emits paths after granting pinned handles.
- [ ] Real native OS Drag & Drop end-to-end — tester check.
- [ ] Native cancel, Open Folder and file-not-found flows — tester check.
- [ ] macOS native acceptance.
- [ ] Windows symlink retargeting acceptance. Unix-only automated symlink test is present but not run on this Windows host.

## Test results / evidence

- Frontend: 67 behavioral/unit/integration tests pass.
- Rust: 15 tests pass on Windows (Unix-only symlink test excluded).
- Strict TypeScript + Vite production build passes.
- [Browser results](./module-02-browser-results.json).
- [Browser mismatch screenshot](./screenshots/module-02-browser-mismatch.png).
- [Performance notes](./module-02-performance.md).

## Known bounds

- Text/binary and encoding classification describe the sample, not the entire file.
- Only UTF-8 and BOM-guided UTF-16 are identified; legacy encodings are left uncertain.
- JSON object/array and XML/SVG content validation applies only when the whole file fits in 64KB. Extension hints for larger or malformed data remain low-confidence with warnings.
- DTD-bearing XML is not content-validated; entities are never fetched or expanded.
- OOXML inspection is capped at 2,048 entries and 256KB of central-directory data. ZIP64, multi-disk, and oversized directories retain ZIP with a limit warning. No assertion that the package is fully valid is made.
- At most 32 files per drop. Native access retains at most 128 selected handles per session; reaching the cap clears previous grants, requiring reselection.
- Folder selection does not scan directories. DOCX/PPTX subtyping is deferred.

Do not begin Module 03 before acceptance.
