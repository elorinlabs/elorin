# Module 06 — CSV verification

Windows, 2026-10-08. See [architecture and complete added/modified file lists](../architecture/csv-viewer.md).

## Executed commands and results

| Command / check | Actual result |
| --- | --- |
| `python tests/fixtures/csv/generate.py --million` | Generated small fixtures, 100k × 22 columns and a local 1M × 22 columns fixture. |
| `npm test` | 14 files, 252 tests passed; 59 CSV tests cover parser/model/inference/statistics/query/grid/loading behavior alongside Modules 01–05 regressions. |
| `npm run build` | TypeScript and Vite production build passed, including a separate lazy CSV plugin and module worker. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 21 tests passed, including native TSV/TAB extension assertions. |
| `npm run tauri:dev` | Native compilation and Windows application launch passed. |
| `node tests/module-06-browser-qa.cjs` | Real Edge development browser checks passed. |
| Same script with `PRISM_QA_URL=http://127.0.0.1:1421` | Production preview checks passed; actual production CSV worker loaded. |
| `node tests/module-03-browser-qa.cjs` | Registry, text/binary fallback, session and bounded Source browser regressions passed. |
| `node tests/module-04-browser-qa.cjs` | Markdown reading/source/security/scroll regressions passed. |
| `node tests/module-05-browser-qa.cjs` | JSON precision/duplicate/path/search/virtualization regressions passed. |

Browser scripts use Playwright via an existing `PRISM_PLAYWRIGHT` environment path, or a normal Playwright installation. Playwright was not added to project dependencies. Commands ran in `D:\Prism`. An initial Rust test attempt encountered the already-running development EXE lock; stopping that development process and rerunning produced the reported 21 passing tests. Initial browser-script failures were repaired (development module cache during writes, and an incorrect theme-button locator); they are not reported as successful runs.

Evidence: [development results](module-06-browser-results.json), [production results](module-06-production-results.json), [light screenshot](screenshots/module-06-light.png), [dark screenshot](screenshots/module-06-dark.png). No browser page/console errors or script dialogs were present in the successful runs. Widths 900, 1024, 1440 and 1920 passed horizontal page-overflow checks.

## Real dataset observations

Final production-preview observations:

| Input | First screen | Parsing / retention-stop time | Loaded data rows | Search | Filter | Mounted rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100k × 22, 18,366,856 bytes | 101 ms | 964 ms, complete | 100,000 | 842 ms | 535 ms | 34 |
| 1M × 22, 203,666,956 bytes | 148 ms | 1,302 ms, budget stop | 136,362 | 1,354 ms | 711 ms | 34 |

Maximum sampled main-thread heartbeat intervals were approximately 88 ms. Point-in-time JS heap readings were approximately 85 MB and 187 MB respectively, with the limitations below.

The actual measurements are recorded in the JSON reports. Timing varies with CPU load, other browser checks and garbage collection; these are observations, not performance guarantees. `firstStatus` shows that the first screen appeared while indexing was still in progress. The browser script asserts all 100,000 data rows exist for `large.csv`, then checks both scroll axes, cell selection/keyboard, search navigation, filtering and bounded Source. Both tests mount approximately 34 row elements including the header, and a small column window. The wide fixture mounts roughly 16 headers rather than 10,000.

The 1M-row, 203,666,956-byte input intentionally stops at the 3M-cell retention budget: 136,362 data rows are loaded, with an explicit partial Large Dataset Mode and `+` count. Search/filter operate on this prefix; the remaining file is **not** indexed. This test is successful bounded preview acceptance, not full-million-row parsing acceptance.

Heap figures in the reports come from Chromium's `performance.memory.usedJSHeapSize`. They include the app/browser's JS heap at a point in time and garbage-collection effects; they are not worker/process RSS or a strict peak memory measurement. No 1–4 GiB full-file random-access or packaged macOS performance claim is made.

## Native UI verification

Through the Windows native Open File dialog, the fresh Tauri application opened `D:\Prism\tests\fixtures\csv\million-local.csv` via the actual Rust authorized FileSource. File Inspector confirmed 203,666,956 bytes, UTF-8, CSV and a 65,536-byte detection sample. The CSV viewer showed 22 columns, 136,362+ data rows and explicit partial Large Dataset Mode. A native screenshot confirmed actual data rows and sticky headers displayed correctly. Native timing was not instrumented and is not inferred from browser timing.

System clipboard contents, native BOM/very-long-record fixtures, native drag-resizing, package installation and macOS are remaining manual acceptance checks. Automated tests verify the clipboard adapter and keyboard resize; browser checks verify BOM and long-cell parsing, but those are not mislabeled as native checks.

## Manual fixture walkthrough

Open each fixture through the existing Open File action. Default mode must be Table; check Source against the original and Split with independent pane scrolling.

| Fixture | How to test / expected behavior |
| --- | --- |
| `basic.csv` | Select Alice, row number 2, then Revenue header. Inspect follows cell/row/column and Dataset restores file inspection. Numeric filter revenue > 1000 retains original row numbers 1 and 3. Clear view, sort Revenue ascending: Bob is first while raw `892.10` remains unchanged. |
| `quoted.csv` | Description containing commas is one field; doubled quotes display one literal quote. Copy row and parse it again to verify quoting. |
| `multiline.csv` | Two data records, not five physical lines. Grid shows a single fixed-height preview; cell Inspect preserves embedded CRLF text. |
| `headerless.csv` | Alice remains the first data row; generic column names are used. Toggle First row is header both ways without changing Source. |
| `duplicate-headers.csv` | Two name columns remain present; inspect their distinct `col:0` and `col:1` IDs. A duplicate warning appears. |
| `ragged.csv` | Additional Column 4 is retained. Inspect distinguishes an absent field from an explicit empty field. Diagnostics appear without a crash. |
| `unicode.csv` | Chinese, Japanese, Korean, emoji and Arabic remain readable; search a Unicode value and use Next to select it. |
| `numbers.csv` | `00123` and `9223372036854775807` are unchanged. High-significance decimals remain exact text; column statistics report unsafe numeric values skipped. |
| `dates.csv` | ISO dates/date-times infer correctly; ambiguous slash dates remain strings. |
| `unsafe.csv` | HTML, formula and javascript URL syntax are literal text. No script, formula, image or navigation executes. |
| `large.csv` | 100,000 data rows, 22 columns. First rows show during indexing. Scroll both axes, select a far-away cell, search Person 99999 and filter City contains Tokyo. Sort is disabled above its supported threshold. DOM row/header count stays bounded. |
| `basic.tsv`, `semicolon.csv`, `pipe.csv` | Correct delimiters and field counts; TSV/TAB use tab, and CSV dialects detect semicolon/pipe. |
| `bom.csv` | Actual BOM bytes decode cleanly; no BOM contaminates the id header. Repeat in the native application. |
| `long-cell.csv` | Long value stays in a 32px row; Inspect displays the full 25k-character fixture value. Larger values have a clearly bounded inspection preview. |
| `wide.csv` | 10,000 stable columns; horizontal scrolling mounts only the visible headers/cells. Grid keyboard End moves to the last column. |
| `invalid.csv` | Unclosed quote produces a diagnostic and retains available rows; Source is still original and readable. |
| `empty.csv`, `header-only.csv`, `one-column.csv` | Empty state, three columns / zero rows, and a valid one-column dataset respectively. |
| `million-local.csv` | Verify the explicit 136,362-row partial preview, limited query scope, bounded Source and finite memory behavior. Do not describe it as a full index. |

Also test pointer-drag and keyboard column resize, double-click auto-fit, Arrow/Home/End/PageUp/PageDown, Enter cell preview, per-mode scroll restoration, and switching files during parsing/search/filter to verify cancellation.
