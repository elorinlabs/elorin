# Module 05 — JSON Viewer

## Architecture

The existing File Loading service produces FileDescriptor and FileSource. ViewerRegistry matches the normalized JSON detection result and lazily imports `json.plugin.tsx`. ViewerHost owns loading, cancellation, errors, modes, capabilities, inspection and session lifetime. The JSON plugin reads source, parses through an isolated boundary, and supplies a JsonDocumentModel for Tree / Split / Source / Inspect. There is no App extension switch, second runtime, JSON-specific Core type, or replacement detector.

No Viewer Core API changes were necessary: Module 04's generic `renderInspection(inspection, props)` receives the latest session metadata, so selection can drive inspection without reloading or re-inspecting the file. The existing Search capability toggles a plugin-owned structural search surface. Node actions use a small disclosure surface; the host retains its existing mode controls. Selection, expansion and scroll positions use the existing session metadata.

The parser uses the strict visitor API of Microsoft's [jsonc-parser](https://github.com/microsoft/node-jsonc-parser). Comments and trailing commas are disabled, and errors invalidate the entire recovered tree. Source remains available with diagnostic line, column and offset, plus Jump to error. Empty files are a separate normal state. UTF-8 BOM and encodings are handled by the existing FileSource decoder. Read, permission and revision errors still enter the existing host error/fallback flow.

The retained model contains decoded source, one flat node store, a pointer-to-index map, cached statistics and bounded diagnostics. No ordinary parsed JS object tree, duplicate recursive tree, pretty-source copy or full-text search index is retained. Visitor nesting frames are temporary. Each node keeps parent/children indices, depth, sibling position, key, type, offset and length. Root depth is zero. Array object/primitive item counts and file type/depth counts are accumulated while building the store; Inspect does not rescan a subtree.

## Paths, duplicates and precision

Canonical paths use RFC 6901 escaping (`~` → `~0`, `/` → `~1`), including empty keys and array indices. Friendly paths are display-only, with quoted bracket notation for literal dotted/special keys. Path lookup never evaluates expressions or traverses arbitrary JavaScript properties. Navigation expands ancestors, selects the target and scrolls its virtual row into view.

Duplicate object members are retained in source order, including all their children. The parser detects decoded duplicate keys within each object and adds diagnostics; the total duplicate count remains accurate even if the first 100 diagnostics are the only ones retained. Because duplicate members share a canonical pointer, row identity combines pointer and source offset. Canonical pointer lookup resolves the last occurrence of a duplicated path, and the interface states that ambiguity. Clicking an earlier duplicate still selects and copies that exact occurrence.

Numbers never use the parser's approximate JavaScript Number for display or copy. The model stores the exact source token, preserving large integers, decimals, exponent notation and negative zero. Number conversion is used only for a supplemental safe-integer/range risk count. That count is not a complete decimal precision analyzer; exact token preservation applies to every number regardless of the count. Copy JSON slices the selected original subtree, preserving both numeric tokens and duplicate keys. Copy value decodes strings without quotes and preserves number tokens; Copy key/path/JSON Pointer are distinct actions. No numeric arithmetic or formatting is performed.

## Size and performance strategy

All budgets are centralized in `json-config.ts`; thresholds intentionally respect Module 03's existing 8 MiB whole-file limit rather than claiming 50–200 MiB parsing support.

| Class | Strategy |
| --- | --- |
| Small, below 256 KiB | Read once, cancellation yield, strict main-thread visitor parse, flat model and cached statistics. |
| Medium/large supported, 256 KiB–8 MiB | Read once, parse/build in a module Web Worker, terminate on cancellation and after result delivery. Same bounded virtual tree and debounced search. |
| Above 8 MiB | Skip structured parsing; display Large JSON preview and first 256 KiB of decoded input in Source. Explicitly mark truncation. |
| Pathological structure | Stop at 250,000 nodes, depth 256 or 16 Mi UTF-16 units of cumulative pointer text; discard partial tree and keep Source available. |
| JSONL / NDJSON | Explicit future-viewer Source state, never parsed as one JSON document. |

Worker messages require a transient source/model clone; the worker is terminated once its result arrives. This implementation is bounded full parsing, not streaming. There is still main-thread work for the worker result transfer, visible-row derivation and React commit. No zero-pause claim is made.

Expanded IDs flatten into a list of numeric node indices. A fixed 36px-row window plus eight overscan rows per side renders only the viewport. The virtual tree never recursively creates a DOM subtree for every JSON node. Initial expansion is conservative for 1,000+ nodes; Expand all/subtree is unavailable above 5,000 nodes. Deep rows cap visual indentation at 12 levels while retaining actual depth in ARIA and a depth indicator. Long values/keys use 240-character previews; Inspect offers up to 16,384 characters of string detail. Original Source and copy retain exact data. UI path/tooltip previews are bounded to avoid huge attribute/text allocations.

Search is literal, case-insensitive, Keys / Values / Both, debounced by 200 ms. It scans the existing flat store in cancellable chunks of 2,000 nodes, does not stringify container subtrees, and searches the first 4,096 characters of primitive values. Results stop at 500 and explicitly report the cap. Search cancellation prevents obsolete commits. Tree filtering is not implemented. Source remains raw and selectable, with a separate line-number gutter; Formatted Source is optional in the request and is not implemented.

Read/parse counts do not increase when changing modes, inspection or selection. Tree and Source scroll positions are retained separately per mode in memory; Split panes scroll independently. The tree uses one focusable `role=tree`, windowed treeitems, aria-activedescendant when mounted, selected/expanded/level/position semantics, arrow navigation, Enter and Ctrl/Cmd+C. Copy shortcuts defer to normal text selection when present. Shell Light/Dark/System tokens provide the theme; no independent JSON theme state is introduced.

## Security

JSON values and keys are React text only. No dangerouslySetInnerHTML, automatic link conversion, image resolution, HTML execution, network requests or unsafe-URL navigation is provided. Map/Set and flat records avoid assigning user keys to object prototypes, including `__proto__` and `constructor`. Standard parsing exceptions and structural limits cannot publish a partial valid-looking tree. Node/path/string/diagnostic/clipboard limits bound optional allocations. Clipboard actions are read-only and capped at 1 Mi UTF-16 units; large values can still be selected in Source.

Native reads continue through the existing authorized Rust/FileSource layer. The only Rust change is adding GeoJSON/JSONL/NDJSON extension aliases to existing JSON detection, with regression assertions. No filesystem permissions or command surface was expanded. The existing self-origin CSP supports the module worker; no new CSP allowance was added. No editor, schema validator, map, graph, formatting engine, AI, conversion or other file viewer is included.

## Dependency

`jsonc-parser` 3.3.1 is the only new runtime dependency. Its visitor API supplies decoded strings, token locations, diagnostics and duplicate-member events without building a second object tree. Strict options preserve standard JSON behavior. Its numeric conversion is not relied on for data fidelity; exact token slices provide lossless display and copy. Virtualization is a local fixed-row window, with no new virtualization library or editor dependency. The parser and viewer are lazy chunks; the worker is a separate bundle. Package versions are locked in pnpm-lock.yaml.

## Files added

```text
src/viewer/plugins/json/json-config.ts
src/viewer/plugins/json/json-model.ts
src/viewer/plugins/json/json-parser.ts
src/viewer/plugins/json/json-pointer.ts
src/viewer/plugins/json/json-search.ts
src/viewer/plugins/json/json-load.ts
src/viewer/plugins/json/json.worker.ts
src/viewer/plugins/json/json.plugin.tsx
src/viewer/plugins/json/JsonViewer.tsx
src/viewer/plugins/json/JsonTreeView.tsx
src/viewer/plugins/json/JsonSourceView.tsx
src/viewer/plugins/json/JsonSearch.tsx
src/viewer/plugins/json/JsonInspector.tsx
src/viewer/plugins/json/json.css
tests/json-parser.test.ts
tests/json-viewer.test.tsx
tests/module-05-browser-qa.cjs
tests/fixtures/json/generate.py
tests/fixtures/json/README.md
tests/fixtures/json/basic.json
tests/fixtures/json/array-root.json
tests/fixtures/json/primitives.json
tests/fixtures/json/unicode.json
tests/fixtures/json/deep.json
tests/fixtures/json/large.json
tests/fixtures/json/invalid.json
tests/fixtures/json/duplicate-keys.json
tests/fixtures/json/unsafe.json
tests/fixtures/json/big-number.json
tests/fixtures/json/geo.json
tests/fixtures/json/sample.geojson
tests/fixtures/json/sample.jsonl
tests/fixtures/json/empty.json
tests/fixtures/json/long-string.json
docs/architecture/json-viewer.md
docs/qa/module-05-checklist.md
docs/qa/module-05-browser-results.json
docs/qa/module-05-production-results.json
docs/qa/screenshots/module-05-light.png
docs/qa/screenshots/module-05-dark.png
```

## Files modified and reasons

| File | Reason |
| --- | --- |
| src/viewer/builtins.ts | Lazy JSON registration following the existing plugin registry pattern. |
| src/services/detection/rules.ts | GeoJSON/JSONL/NDJSON aliases and JSON MIME normalization in the existing detector. |
| src-tauri/src/detection/extension.rs | Equivalent native extension aliases; detector architecture unchanged. |
| src-tauri/tests/file_loading.rs | Regression assertions for all JSON-related aliases. |
| src/styles.css | Existing viewer container sizing and optional inspection-panel layout for JSON. |
| tests/module-03-browser-qa.cjs | Legacy browser checks now expect sample.json to use the concrete viewer. |
| package.json / pnpm-lock.yaml | Add and lock jsonc-parser. |
| README.md | Update module status and documentation links. |

No Viewer Core interfaces, App routing, file permissions or Markdown implementation changed.
