# Module 06 — CSV / Tabular Data Viewer

## Architecture

`FileDescriptor → existing ViewerRegistry → lazy CsvViewerPlugin → FileSource.readRange → CSV worker / Papa Parser → dialect → TabularDocumentModel → virtual grid → existing Inspect / Search / Filter surfaces`.

The plugin uses the existing ViewerHost, session, cancellation, modes and inspection contract. App, Viewer Core interfaces, file permissions, file API and Modules 04/05 implementations are unchanged. CSV/TSV MIME normalization already exists in Module 02; only `.tab` is added as a TSV alias in both browser and native detection. Default mode is Table; Split and Source share the loaded model.

The model exposes a CsvRowSource (`count`, `get`) rather than an array of keyed objects. ChunkedRows owns arrays of string arrays and finds a row by binary-searching chunk ranges. Column IDs are `col:index`, independent of potentially duplicated names. Source-record ordinal is stable across header presentation, filtering and sorting. Data row numbers are not physical line numbers; multiline fields make those different. Precise cell byte offsets and a disk-backed random-access index are not implemented.

Parsing is delegated to Papa's real parser, not regex or line splitting. Its cursor/carry contract emits only complete records until EOF, including escaped quotes and quoted newlines across chunk boundaries. The isolated adapter is tested against every split of representative records. Delimiter detection uses Papa's parser with comma, tab, semicolon and pipe candidates. TSV uses tab. Standard double-quote escaping is supported; quote metadata describes that policy, not a claim of arbitrary quote-character inference. Line endings come from parser metadata, with a CRLF correction for incomplete quoted samples. Header detection is explicitly heuristic, with separate detectedHeader and confidence. First-row-header override only changes presentation and sampled metadata.

Duplicate headers retain separate columns and values. Ragged rows retain their actual array lengths; additional fields create columns and absent fields differ from explicit empty fields in cell inspection. Parser errors retain available rows plus diagnostics and original Source. Fatal decoding uses the existing detected encoding with TextDecoder(fatal); an initial error enters the host error flow, while a later error stops indexing with explicit partial-data diagnostics.

## Streaming and lifecycle

FileSource reads 256 KiB ranges, respecting its existing 1 MiB range cap. Each transferable byte buffer is decoded and parsed by a Vite module worker. One request is outstanding at a time: a batch response provides backpressure before the next range is read. Messages contain a chunk's completed rows, not one message per row. Batch row count varies with record size.

Once the first complete record batch arrives, load returns a live model and ViewerHost becomes ready. Background reading extends the dataset and publishes external-store revisions. Row count is shown with `+` until complete; scroll height corresponds only to loaded rows. No fake full-file row count or scroll extent is created. Queries use the loaded prefix and rerun cooperatively as the model changes. File revision is checked around reading; abort stops range requests, terminates the worker and prevents late commits. Search and projections have separate AbortControllers linked to the host signal. Browser and native mode use exactly the same FileSource pipeline. If workers are unavailable, only inputs up to 256 KiB use the small synchronous fallback.

## Memory and size strategy

Limits are centralized in `csv-config.ts`. Byte-size classes aid inspection; structural budgets govern actual retention for every class.

| Class | Strategy |
| --- | --- |
| Small, below 1 MiB | Worker parsing in normal browser/native operation, complete retention if budgets allow; exact statistics when all data fit the 5,000-row sample. |
| Medium, 1–32 MiB | Chunked progressive parsing, dual-axis virtualization, prefix-sampled types/statistics. Full dataset retained only within budgets. |
| Large, 32 MiB–1 GiB | Same streaming pipeline; stop at a structural budget with an explicit Large Dataset Mode partial preview. Queries cover loaded rows. |
| Very Large, 1 GiB+ | Bounded progressive preview with the same stop policy; no full indexing or random-access claim. |

Retention stops at 1,000,000 source records, 3,000,000 cells, 32 Mi UTF-16 character units, 10,000 columns, or a 1 Mi-character record. Million-record limits include a header record when present. Worker carry is bounded for incomplete long records. The 1M × 22-column test therefore loads 136,362 data rows and stops; it does **not** parse or index all million rows. This first implementation deliberately has no background disk index after stopping.

Retained data are raw parsed field strings, chunk array references, a maximum 256 Ki-character original-source prefix, at most 5,001 sample row references, column metadata/statistics, capped diagnostics and numeric projection indices. No typed cell copies, lowercase search index or whole raw CSV text is retained. The worker releases its completed rows after posting and retains only parser carry; worker-message cloning still incurs a transient copy. Only the retained source prefix is sent back, not every later decoded chunk. JavaScript strings/arrays have overhead beyond the character/cell budgets; these are bounded retention limits, not a strict process-RAM guarantee.

Source is original decoded text, never parse-and-serialize output. Larger source is explicitly marked as a partial preview. Mode switching performs no file read or reparse. Tree-independent table/source scroll positions are maintained per mode in session metadata, and Split panes scroll independently.

## Grid and interaction

A fixed 32px row window with six overscan rows per side renders visible rows only. Cumulative column positions select visible columns plus a small horizontal overscan; even 10,000-column files mount a small number of headers. Header and the lightweight row-number column are sticky. Sampled width estimates use the header and up to 100 prefix rows, bounded to 90–360px. Pointer dragging and keyboard separator arrows resize presentation widths, clamped to 60–800px; double-click restores the sampled width.

Selection is unified: none, cell, row or column. Cell selection records original row/column index, stable column ID, raw string and on-demand typed interpretation. The existing inspection capability supplies dataset, column, row or cell details. Long values remain fixed-height previews; Inspect/Enter exposes up to 32,768 characters with a size explanation. Copy value retains the decoded field text; Copy row uses Papa.unparse with the original delimiter/newline and correct quotes, capped at 1 Mi-character clipboard text. No files are written.

The grid is a single keyboard focus stop with grid/row/header/cell ARIA semantics and an active descendant only for mounted cells. Arrows, Home/End and PageUp/PageDown move selection and scroll both axes; Enter focuses a temporary cell preview. Resize handles remain keyboard-accessible. No tab stop is attached to every cell. Colors use existing Light/Dark/System tokens; CSV adds no theme state.

## Types, statistics, search, filter and sort

Type inference uses the first 5,000 data rows. Types are metadata: raw strings always remain the display and copy values. Leading-zero IDs stay strings; TRUE/FALSE are Boolean, but 1/0 and yes/no are not. Dates only accept validated ISO dates or ISO date-times with an explicit timezone, avoiding locale guesses. Mixed numeric columns can retain numeric type/confidence at 70% agreement.

Large integers and high-significance decimals remain exact text. Approximate numeric aggregates exclude nonfinite, unsafe-range or more-than-15-significant-digit values and report skipped counts. Sample statistics cache count, missing, limited unique count, min/max/approximate mean, length, Boolean and date bounds. Small datasets within the sample are exact; larger/partial datasets explicitly say Sampled. Statistics are built at initial readiness and completion/limit rather than rescanning on opening Inspect. Sample Sets are temporary and bounded; row samples are references, not cell copies.

Search is literal, case-insensitive, all/current column, with 200ms debounce and cooperative 1,000-row chunks. It searches the first 32,768 characters of each value, keeps at most 500 results, and Next/Previous scrolls to and selects the actual cell. Search results refer to source records; navigating a result clears the filter to reveal the source row. Filter supports contains, equals, empty, nonempty and numeric comparisons. Numeric comparisons compare decimal tokens exactly within a 256-character / bounded-exponent budget, including integers outside Number's safe range. Filter/sort produce original-row index projections without copying cells. Header names are never object keys.

Sort is limited to 50,000 loaded source records after indexing. It uses cooperative stable merge sort, numeric/date/text semantics, with original row index breaking ties. Larger files disable sort. Invalid numeric values receive a text fallback; unsupported oversized numeric tokens are not coerced into an approximate Number. Filter UI offers the first 1,000 column choices; the grid itself virtualizes all supported 10,000 columns.

## Security and dependencies

React renders cells, source and inspection as text. No HTML renderer, formula evaluator, automatic link or URL navigation is present. HTML, formulas and javascript URLs remain inert. No chart/editor/conversion/AI dependency or new filesystem permission is introduced. Clipboard output preserves data and is not advertised as formula-sanitized for a separate spreadsheet application.

Runtime dependency: `papaparse` 5.7.0 (MIT). Its mature parser supports chunking, quote/newline handling, delimiter detection and array results; its unparse function provides correct row quoting. The adapter uses the library's exported low-level Parser cursor contract, isolated and regression-tested. `@types/papaparse` 5.5.2 is development-only. No grid, virtualization or worker helper dependency is added. Official reference: [Papa Parse documentation](https://www.papaparse.com/docs). Modern Edge/WebView2 and production Vite worker compatibility were exercised; macOS native runtime remains unverified.

At the validated production build, the complete CSV plugin is approximately 48 kB (17.5 kB gzip), its separate worker about 21 kB, and CSS about 4 kB (1.3 kB gzip). Those include implementation and parser code; they are not parser-only package sizes. Browser QA confirms no CSV parser/plugin/worker startup request before opening a CSV.

## A. Added files

```text
src/viewer/plugins/csv/csv-config.ts
src/viewer/plugins/csv/csv-types.ts
src/viewer/plugins/csv/csv-stats.ts
src/viewer/plugins/csv/csv-parser.ts
src/viewer/plugins/csv/csv-model.ts
src/viewer/plugins/csv/csv-load.ts
src/viewer/plugins/csv/csv-query.ts
src/viewer/plugins/csv/csv.worker.ts
src/viewer/plugins/csv/csv.plugin.tsx
src/viewer/plugins/csv/CsvGrid.tsx
src/viewer/plugins/csv/CsvViewer.tsx
src/viewer/plugins/csv/CsvInspector.tsx
src/viewer/plugins/csv/csv.css
tests/csv-parser.test.ts
tests/csv-viewer.test.tsx
tests/module-06-browser-qa.cjs
tests/fixtures/csv/generate.py
tests/fixtures/csv/README.md
tests/fixtures/csv/basic.csv
tests/fixtures/csv/quoted.csv
tests/fixtures/csv/multiline.csv
tests/fixtures/csv/empty.csv
tests/fixtures/csv/headerless.csv
tests/fixtures/csv/duplicate-headers.csv
tests/fixtures/csv/ragged.csv
tests/fixtures/csv/unicode.csv
tests/fixtures/csv/numbers.csv
tests/fixtures/csv/dates.csv
tests/fixtures/csv/unsafe.csv
tests/fixtures/csv/large.csv
tests/fixtures/csv/basic.tsv
tests/fixtures/csv/semicolon.csv
tests/fixtures/csv/pipe.csv
tests/fixtures/csv/bom.csv
tests/fixtures/csv/header-only.csv
tests/fixtures/csv/one-column.csv
tests/fixtures/csv/invalid.csv
tests/fixtures/csv/long-cell.csv
tests/fixtures/csv/wide.csv
docs/architecture/csv-viewer.md
docs/qa/module-06-checklist.md
docs/qa/module-06-browser-results.json
docs/qa/module-06-production-results.json
docs/qa/screenshots/module-06-light.png
docs/qa/screenshots/module-06-dark.png
```

Generated local extra: `tests/fixtures/csv/million-local.csv` (ignored).

## B. Modified files

| File | Purpose |
| --- | --- |
| src/viewer/builtins.ts | Register lazy CSV/TSV plugin through existing registry. |
| src/services/detection/rules.ts | Add `.tab` to existing TSV aliases. |
| src-tauri/src/detection/extension.rs | Match native `.tab` detection. |
| src-tauri/tests/file_loading.rs | Assert native TSV/TAB aliases. |
| package.json / pnpm-lock.yaml | Add parser runtime and type definitions. |
| .gitignore | Keep the generated 1M-row performance input local. |
| README.md | Document Module 06 and its real bounds. |

Running browser regressions also refreshes existing Module 03/04/05 QA result JSON/screenshots; no earlier viewer implementation was changed. See [Module 06 QA](../qa/module-06-checklist.md) for executed commands, observed measurements, remaining manual checks and fixture walkthrough.
