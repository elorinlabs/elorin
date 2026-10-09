# Module 07 — Universal Text Engine

Implemented in `D:\Prism`, 2026-10-08. The existing `core.text-fallback` registry ID now loads one read-only Text plugin with Plain, Code, Log and Config profiles. Dedicated Markdown, JSON and CSV plugins retain priority. No editor, saving, execution, terminal, LSP or code outline was added.

## A. Added files

Engine and presentation:

- `src/viewer/plugins/text/text.plugin.tsx` — real ViewerPlugin registration contract, Text mode, search and Inspect.
- `src/viewer/plugins/text/text-config.ts` — all size, chunk, result, viewport, timeout and copy budgets.
- `src/viewer/plugins/text/text-profile.ts` — language/filename/shebang mappings and conservative log recognition.
- `src/viewer/plugins/text/text-engine.ts` — streaming encoding validation, sparse byte checkpoints, bounded line reads and streamed search.
- `src/viewer/plugins/text/text.worker.ts` — batched background operations with FileSource read requests.
- `src/viewer/plugins/text/text-model.ts` — TextSource facade (`lines`, `linePage`, `copyLine`, `search`), observable statistics, cancellation and resource ownership.
- `src/viewer/plugins/text/TextViewer.tsx` — virtual viewport, measured wrapping, go-to-line, search navigation, session settings and long-line pages.
- `src/viewer/plugins/text/TextLine.tsx` — inert text/tokens, log accents and current-match highlighting.
- `src/viewer/plugins/text/TextInspector.tsx` — file and selected-line information with explicit sample labels.
- `src/viewer/plugins/text/syntax-highlighter.ts` — lazy Highlight.js grammar bundle and text/span conversion.
- `src/viewer/plugins/text/text.css` — Prism token integration and restrained light/dark syntax colors.

Verification:

- `tests/text-engine.test.ts` — newline, Unicode/BOM, UTF-16, malformed UTF-8, sparse index, huge line, literal/regex search, caps and cancellation.
- `tests/text-viewer.test.tsx` — routing, shared defaults, safe rendering, search navigation, bounded DOM, page boundaries, worker timeout and disposal.
- `tests/module-07-browser-qa.cjs` — actual browser UI checks and recorded performance observations.
- `tests/module-07-tauri-qa.cjs` — actual Windows WebView2 UI smoke checks through its debugging connection.
- `src-tauri/tests/text_ranges.rs` — real authorized disk ranges, text fixtures and a generated 100 MiB+ local log.
- `tests/fixtures/text/generate.cjs` — small fixture generation, 10 MiB source and optional 1/20/100/500/1024 MiB logs.

Small fixtures under `tests/fixtures/text/`:

`basic.txt`, `unicode.txt`, `utf8-bom.txt`, `mixed-line-endings.txt`, `empty.txt`, `unsafe.txt`, `unknown.custom`, `regex-adversarial.txt`, `example.ts`, `example.py`, `example.rs`, `example.go`, `example.cpp`, `Dockerfile`, `Makefile`, `no-extension-script`, `.env`, `basic.log`, `mixed-levels.log`, `timestamp.log`, `ansi.log`.

Generated local fixtures, excluded from version control:

`long-line.txt` (5 MiB line), `generated-10.ts`, `generated-1.log`, `generated-20.log`, `generated-100.log`, `generated-500.log`, `generated-1024.log`.

Documentation/evidence:

- `docs/architecture/text-viewer.md` — this full delivery report.
- `docs/qa/module-07-checklist.md` — executed validation and measured results.
- `docs/qa/module-07-browser-results.json` — development UI observations.
- `docs/qa/module-07-production-results.json` — production UI observations including the 1 GiB test.
- `docs/qa/module-07-tauri-results.json` — WebView2 smoke results with the source mechanism identified.
- `docs/qa/screenshots/module-07-light.png`, `module-07-dark.png`, `module-07-tauri.png` — actual UI captures.

## B. Modified files

| File | Final change |
| --- | --- |
| `src/viewer/plugins/textFallback.tsx` | Reexports the new plugin under the established fallback name; recovery actions and old plugin IDs keep working. |
| `src/viewer/builtins.ts` | Names the lazy fallback Text and rejects descriptors flagged binary, without changing structured viewer priority. |
| `package.json` | Adds Highlight.js. Existing scripts remain available. |
| `pnpm-lock.yaml` | Locks the added dependency. |
| `tsconfig.json` | Excludes fixture source files from application compilation, allowing intentionally invalid and large source samples. |
| `.gitignore` | Excludes generated large logs/source and the 5 MiB line fixture. |
| `tests/file-source.test.ts` | Replaces the obsolete 256 KiB fallback assertion with rejection of synchronous large-file parsing when workers are unavailable. |
| `README.md` | Describes Module 07 and links its architecture/verification instructions. |

No changes to the FileSource API, native access permissions, detector implementation or Viewer Core were required.

## C. Dependencies

`highlight.js` 11.12.0, BSD-3-Clause (verified from the installed package license). It supplies mature grammars for common code/config languages, with explicit language selection rather than expensive autodetection. A lazy chunk contains the common grammars plus Kotlin, Swift, SCSS, Less, PowerShell, DOS, Lua, R, Dart, Scala, Dockerfile, Makefile, CMake, properties and nginx. The production highlighter chunk is approximately 227 kB raw / 70 kB gzip and loads only when a eligible code/config line is visible.

Monaco and a full editor runtime would introduce editing/IDE machinery outside this module. No virtualization or worker utility dependency was added: the viewport and standard module-worker bridge are small project-owned components. Playwright comes from the available tooling runtime and is not a production dependency. Prettier was used through a temporary package-tool invocation and was not added to the project.

## D. Architecture

```text
BrowserFileSource / TauriFileSource
  → existing getSize / readText(sample) / readRange
  → TextDocumentModel (TextSource facade)
  → sparse byte-offset index, one checkpoint per 256 logical lines
  → virtual visible line range + overscan
  → Plain / Code / Log / Config profile
  → safe React text and spans
```

Load reads a 16 KiB profile sample and a bounded first viewport, then returns without waiting for full-file indexing. Indexing streams 256 KiB reads and reports progress. A pathological first line is initially previewed after at most 1 MiB of scanning; its final extent is resolved by background indexing. Up to 2,048 very long line extents are retained to allow direct previews and skips past those lines.

The worker cannot read arbitrary paths: it requests ranges from the main thread's existing session-bound FileSource. Bytes are transferred to it rather than cloned. Each operation owns a worker, and cancellation or model disposal terminates that worker, including a worker blocked in regex evaluation. Messages are per range/progress batch, not per line.

File inspection subscribes to the same model. Selected-line metadata and wrapping, gutters and scroll position are stored in the existing in-memory ViewerSessionState. The outer Inspect surface does not reload the document.

## E. Large-file strategy

| Class | Threshold | Reading/indexing | Presentation |
| --- | --- | --- | --- |
| Small | less than 2 MiB | Same streaming index; bounded fallback can run without Worker | Virtual lines, ordinary visible-line highlighting, all search features with Worker |
| Medium | 2–20 MiB | Worker streaming and sparse checkpoints | Virtual visible lines and ordinary highlighting |
| Large | 20–200 MiB | Worker streaming, incremental progress/counts | Large Text Mode; reduced highlighting only for short visible lines |
| Very Large | 200 MiB and above | Worker streaming; no full-file string | Large Text Mode; syntax highlighting disabled; search remains available |

Very large vertical extents use a compressed scroll range capped at 8,000,000 pixels, including correct navigation to the end. Go-to-line uses logical line numbers, not the browser's finite maximum CSS height. Indexing progress expands the available scroll extent; line totals stay explicitly incomplete until indexing finishes.

Long lines initially render at most 4,096 UTF-16 units. “View pages” reads bounded 16 KiB byte pages and preserves multibyte characters across page boundaries. Copy line is limited to 1 MiB and gives a clear message for larger lines. Browser-native selection/copy works for the mounted text; arbitrary selection across millions of unmounted lines is outside the first version.

## F. Memory strategy

There is no whole-file source string, `source.split('\n')`, whole-file HTML, lowercase duplicate or object for every line. Full indexing retains numeric sparse offsets; UTF-8 validation and character statistics use a streamed decoder. The current viewport holds only bounded previews. Highlight tokens use a 256-entry cache. Wrapping measurements retain at most 2,048 row deltas. Search counts every match while retaining only the first 2,000 locations. Worker batches and their temporary decoded text are released as scanning advances.

Heap figures in QA are browser-reported main-page snapshots. They do not include every worker, browser file buffer or native allocation, and are not peak process-memory measurements.

## G. Search strategy

Small and large files use the same background chunk scan. Literal searches support case sensitivity and Unicode letters/numbers for whole words, preserve original columns, and overlap chunks to find matches across boundaries and newlines. Neither strategy makes a full-file lowercase copy.

The query is debounced; changing it, closing search, cancelling or switching files aborts the old operation. Results/counts arrive progressively. Enter / Shift+Enter and next/previous buttons navigate the retained locations and highlight the current match. When there are more than 2,000 matches the UI labels the navigation cap; the total count continues to grow.

Regex is opt-in and explicitly scans one logical line at a time, up to 65,536 UTF-16 units. Longer lines are skipped and labelled; literal search can still scan all their text. Regex runs only in a worker, with a 4-second computation/inactivity budget enforced from the main thread by terminating the worker. Slow disk reads are excluded from that computation budget. A simpler query can start immediately after timeout. Cross-line regex is deliberately unsupported.

## H. Highlight strategy

All size classes use visible-region highlighting, never full-file highlighted HTML. Small/Medium code lines can be highlighted up to 2,048 units; Large highlights only visible lines below 512 units; Very Large disables it. Log timestamps and levels remain lightweight source-text accents. Common code grammar coverage is broad; Vue/Svelte use XML presentation and fish uses the generic shell grammar.

Highlight.js output is parsed into a text/span token representation and rendered by React. The viewer never inserts that output with `dangerouslySetInnerHTML`. Syntax calculation is bounded on the UI thread, while indexing/search/line scans run in workers. Multiline parser state across virtual viewports is not retained, so multiline comment/string coloring can be approximate. No structural code metrics pretend to be AST results.

## I. Security

- HTML and scripts are rendered as data; no iframe, executable HTML or script elements are created.
- Syntax output becomes text/span nodes with restricted token class names; source markup remains escaped text.
- ANSI escape sequences are not interpreted as commands, styling or terminal operations.
- URLs and stack-trace locations are ordinary unlinked text.
- Binary descriptors are rejected before text loading; Module 02 remains the encoding/binary detector.
- Existing native pinned-handle grants and bounded read permissions are unchanged.

## J. Tests and K. File-opening verification

See [the execution checklist](../qa/module-07-checklist.md) and its raw JSON evidence. It records actual commands, input sizes and timings, including failures corrected during development and the scope of Tauri verification. The fixture generator reproduces the tests without committing GB-scale files.

Remaining limits are explicit: first-2,000 search navigation, line-scoped bounded regex, 1 MiB copy-line budget, approximate multiline syntax context, bounded long-line extent history, and native dialog → selected path → frontend IPC not automated end-to-end. Tauri WebView2 execution and real Rust disk reads were verified independently.
