# Module 10 delivery / verification

Verified on 2026-10-08. Automated runtime checks exercise the real input → detection → registry → host → plugin path. They are not a claim of a separate human manual session or Office pixel equivalence.

## A. New files (absolute paths)

- `D:/Prism/src/viewer/plugins/office/OfficePackage.ts`: shared package/relationships/resources/metadata lifecycle.
- `D:/Prism/src/viewer/plugins/office/xml-stream.ts`: bounded, cancellable namespace-aware XML streaming.
- `D:/Prism/src/viewer/shared/virtual-grid.ts`: generic CSV/workbook windowing and sparse axes.
- `D:/Prism/src/viewer/plugins/spreadsheet/spreadsheet-model.ts`: sparse workbook, sheets, cells and saved formatting.
- `D:/Prism/src/viewer/plugins/spreadsheet/SpreadsheetViewer.tsx`: virtual grid, selection, copy, goto, search, tabs and inspection.
- `D:/Prism/src/viewer/plugins/spreadsheet/spreadsheet.plugin.tsx`: independent lazy spreadsheet plugin.
- `D:/Prism/src/viewer/plugins/presentation/presentation-model.ts`: static OOXML/ODF geometry and text/object inventory.
- `D:/Prism/src/viewer/plugins/presentation/PresentationViewer.tsx`: proportional stage, navigation, notes, virtual rail, search and focus.
- `D:/Prism/src/viewer/plugins/presentation/presentation.plugin.tsx`: independent lazy presentation plugin.
- `D:/Prism/src/viewer/plugins/office/module10.css`: theme-aware surfaces and bounded viewports.
- `D:/Prism/tests/generate-module-10.py`: deterministic local fixture generator.
- `D:/Prism/tests/module-10.test.ts`: 31 format/model/safety/cache tests.
- `D:/Prism/tests/module-10-runtime-qa.cjs`: browser / WebView2 runtime scenarios and measurements.
- `D:/Prism/src-tauri/tests/module10_detection.rs`: native detection and granted range reads for eight Office types.
- `D:/Prism/docs/architecture/spreadsheet-presentation-viewers.md`: design and explicit limits.
- `D:/Prism/tests/fixtures/spreadsheets/`, `D:/Prism/tests/fixtures/presentations/`: 42 generated fixtures; complete names/sizes in `D:/Prism/docs/qa/module-10-assets.json`.
- QA result JSON/logs/screenshots under `D:/Prism/docs/qa/module-10-*`.

## B. Modified files and reasons

- `D:/Prism/src/viewer/builtins.ts`: two lazy registrations; no shell extension switch.
- `D:/Prism/src/types/files.ts`, `D:/Prism/src/services/detection/rules.ts`, `D:/Prism/src/services/detection/browserDetector.ts`: additional Office types/MIME/container/legacy detection.
- `D:/Prism/src-tauri/src/detection/descriptor.rs`, `extension.rs`, `mod.rs`, `ooxml.rs`, and `D:/Prism/src-tauri/src/file_io/mod.rs`: matching native classification and bounded package inspection.
- `D:/Prism/src/viewer/plugins/csv/CsvGrid.tsx`: share generic virtualization helpers; CSV data model retained.
- `D:/Prism/src/viewer/plugins/office/package.ts`, `package.worker.ts`: optional family budget, same validated ZIP decoder; Module 09 default budget retained.
- `D:/Prism/src/viewer/plugins/office/office-model.ts`: reuse shared safe relationship/image layer; preserve its original 64-image capacity.
- `D:/Prism/package.json`, `D:/Prism/pnpm-lock.yaml`: pinned SSF and saxes dependencies.

## C. Dependencies / distribution

- `ssf 0.11.2`, Apache-2.0: established spreadsheet number/date formatting. It formats saved numeric values and does not evaluate cell formulas. Official project: https://github.com/SheetJS/ssf .
- `saxes 6.0.0`, ISC, with `xmlchars`: namespace-aware streaming XML. DTD declarations are rejected; application budgets and cancellation wrap the parser. Same JS implementation in Browser/WebView2.
- Existing `fflate`, SVG sanitizer and image metadata reader are reused. No second ZIP library, Office automation, remote document service, formula engine or downloaded fonts.
- Production output keeps both families lazy. Spreadsheet plugin is approximately 75 kB minified / 24 kB gzip; presentation approximately 20 kB / 8 kB gzip, plus shared package/CSS chunks. Exact final sizes: `D:/Prism/docs/qa/module-10-build.log`.

## D. Spreadsheet flow

Package safety → workbook metadata, names, styles, shared strings → active worksheet streaming → sparse cells and axis overrides → two-axis viewport → sheet/cell inspection. Other sheets load on demand. Supports XLSX/XLSM; ODS has a basic values/formulas/merges layout. XLS/XLSB explicitly use Limited Preview rather than claim BIFF decoding.

Visible tabs omit hidden/veryHidden sheets until More → Hidden sheets. Viewing never modifies hidden state. Cell/row/column selection, copy, keyboard navigation, Ctrl+G/address jump, current-sheet/workbook search including optional formulas are available. Internal hyperlinks switch/jump; external HTTP(S) requires confirmation. Merges crossing the viewport retain their anchor. Hidden rows/columns and saved frozen pane offsets are respected within bounded preview limits (100 frozen rows / 20 frozen columns).

Stored bold/italic/RGB fill/text, alignment, borders and SSF number formats are shown. Comments carry markers/author/text; charts are detectable objects with explicit static-preview placeholders and series information; images use the safe shared image path. No conditional formatting or pivot computation is attempted. Long text identifiers remain strings. Raw, display, type, formula, number format and comment remain separately inspectable.

## E. Presentation flow

Package safety → slide list/dimensions/theme → current slide + layout/master geometry → static shape/text/image/table stage → optional notes/inspection/virtual rail. PPTX/PPTM/PPSX/POTX and basic ODP supported; PPT is an honest limited preview. Previous/Next, page input, Home/End/PageUp/PageDown/arrows and internal slide links navigate. Search scans text and optional notes; results jump to slides. Fullscreen enters/exits, preserving the stage ratio.

Basic rectangles/ellipses/lines/arrows/freeform paths, text runs, raster/sanitized SVG, tables and static backgrounds are supported. Charts and SmartArt show explicit content/limitations; media and OLE show inert placeholders. Notes/comments and timing/transition metadata are inspectable. Fonts are local fallbacks only.

## F. Shared infrastructure

One existing ZIP validator/worker is used by all three Office families. OfficePackage centralizes relationship resolution, metadata, object inventory, image sanitization and URL release. CSV/workbook share generic viewport primitives without sharing document models. Viewer Core remains generic: no Sheet/Cell/Slide-specific fields or routing branches were added.

## G. Formula / macro / external-data policy

Cached results only; missing cache is explicit. Recalculation never occurs. Formula strings, DDE, external references and defined-name expressions are not passed to eval, JavaScript, a shell or any calculation engine. Shared-formula cells retain the stored result; absent derived expression is not invented. Macros are inventoried as Present / Execution Disabled by Prism. Connections, external workbook links and pivots are inventoried; refresh and pivot engines do not exist in this viewer.

## H. Performance strategy and measured results

Worksheet parsing streams instead of constructing a million-row DOM. Sparse axes/cells do not expand A1:XFD1048576. Cooperative chunk yields permit cancellation. Three parsed worksheets / 200k inactive cells, five parsed slides and 32 image URLs are bounded; cleanup releases package arrays, parsed cells/slides and URLs. The rail renders at most ten buttons and loads three near its viewport. Goto supports the last Excel row/column.

Measured first-content times and visible cell counts are in `D:/Prism/docs/qa/module-10-browser-results.json` and `D:/Prism/docs/qa/module-10-tauri-results.json`; the table below is generated from those results. Browser heap figures are sampled whole-context JS heap, not isolated workbook allocation or process peak memory. Reload/GC timing can retain previous allocations; do not interpret them as a leak proof.

<!-- measured-table -->

Actual samples: 10k, 100k and 1M stored rows; 1000 stored columns; two-cell extreme sparse extent; 50 sheets; 1000 slides. These are generated fixtures, not measurements of arbitrary customer workbooks. A fully dense 100k×1000 sheet is not claimed: the explicit two-million stored-cell budget rejects it. A separate huge style-table corpus, real encrypted Office file and all possible Office themes were not exhaustively benchmarked.

## I. Security

| Category | Behavior / verification |
|---|---|
| Macro / VBA | Inventory only; XLSM/PPTM fixtures; no macro interpreter. |
| OLE | Listed or visible disabled placeholder; embedded-media and macro fixtures contain inert binary markers. |
| XXE | DOM and streaming paths reject DTD/entity declarations; xxe.xlsx rejected, no file/network read. |
| ZIP Bomb | Central-directory sizes, compression ratios, total/entry limits precede bounded inflation; oversized fixture rejected. |
| Path traversal | Absolute/drive/backslash/parent entry names rejected; relationships cannot escape package root or cause disk writes. |
| Remote Resource | External relationships never fetched; linked image visibly blocked; both runtime logs show zero external requests. |
| External Data | Links/connections/pivots counted; never fetch or refresh. |
| Unsafe Link | HTTP(S) requires explicit confirmation; javascript/file/program actions do not execute. |
| SVG / Raster | Module 08 sanitizer / dimensions / pixel budgets reused; bounded blob URLs and cleanup. |
| Password / encryption | No decryption library: clear unsupported-encryption explanation; no fake password form or brute-force path. |

## J. Actual verification / limitations

419 frontend tests pass (24 suites); Rust 32 tests pass, including native Office-family detection and authorized range reads; production build passes. CSV regression and the existing 25 PDF/Office scenarios pass after preserving the Word image budget.

All 42 Module 10 files were actually opened in Edge Browser and Tauri WebView2. The required basic/formulas/formats/merged/freeze/charts/images/macros/large/sparse/ODS/legacy spreadsheet and basic/images/tables/charts/notes/links/macros/1000-slide/ODP/legacy presentation fixtures are included. Runtime checks verify values, missing formula cache, hidden-sheet access, far-edge/last-row jumps, search across 50 sheets, actual image decoding, chart/table content, slide links, notes search, virtual rail, fullscreen and ratio. No unexpected JS exceptions or remote requests. WebView2 UI runs use browser file selection; native filesystem classification/ranges are separately verified in Rust, not misreported as native picker UI runs.

Screenshots: `D:/Prism/docs/qa/module-10-browser-spreadsheet.png`, `module-10-browser-presentation.png`, `module-10-tauri-spreadsheet.png`, `module-10-tauri-presentation.png`. They were visually inspected for the grid, controls, dark/native surface and unclipped presentation stage.

This is a read-only static preview, with explicit fidelity limits. XLS/PPT are not decoded; encrypted Office decryption is unsupported. ODS/ODP currently provide basic structural previews rather than full style/master equivalence. Charts/SmartArt/embedded media are placeholders rather than Office renderings. Complex theme inheritance, advanced geometry, exact typography, conditional rules, dynamic pivots and calculated shared formula expansion are not claimed. Synthetic legacy/macro/OLE samples test routing/inertness, not a general corpus of genuine binary documents. Unsupported or oversized content is explained instead of silently invented.
