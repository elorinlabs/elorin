# Module 05 — JSON Viewer verification

Verified on Windows on 2026-10-08. Implementation and changed-file inventory: [JSON architecture](../architecture/json-viewer.md).

## Executed checks

| Check | Result |
| --- | --- |
| `npm test` | Passed: 12 files, 193 tests, including 53 JSON parser/viewer tests and existing module tests. |
| `npm run build` | Passed: TypeScript and production Vite build; JSON plugin and worker are separate lazy chunks. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Passed: 21 Rust tests. |
| Rust `file_loading` integration suite after adding extension assertions | Passed: 15 tests, including JSON, GeoJSON, JSONL and NDJSON detection. |
| `npm run tauri:dev` | Rust compilation and native application launch passed. |
| `node tests/module-05-browser-qa.cjs` against development port 1420 | Passed in real headless Edge; no console/page errors or script dialogs. |
| Same script with `PRISM_QA_URL=http://127.0.0.1:1421` against production preview | Passed; production worker loaded successfully. |
| `node tests/module-03-browser-qa.cjs` and `node tests/module-04-browser-qa.cjs` | Passed: registry/fallback and Markdown browser regressions, with no page errors. |

Browser automation requires Playwright to be available via `PRISM_PLAYWRIGHT` or installed in the environment. It does not add a project runtime dependency. The results are recorded in [development results](module-05-browser-results.json) and [production results](module-05-production-results.json). Appearance evidence: [light](screenshots/module-05-light.png) and [dark](screenshots/module-05-dark.png).

The browser checks cover lazy loading, Tree/Source/Split, exact source, exact numeric tokens, retained duplicate members, invalid-input diagnostics and Source, hostile text, Unicode pointers, off-screen navigation, search limits, scroll restoration, keyboard navigation, bounded huge-file preview, and widths 900/1024/1440/1920 without horizontal page overflow. Clipboard behavior is verified with an injected clipboard in interaction tests, rather than claimed as an actual system-clipboard check.

## Actual native checks

The fresh Windows Tauri development application opened these files through its native Open File dialog and actual Rust FileSource:

- `large.json`: 1,160,571 bytes; root array with 10,000 items displayed in the virtualized tree after worker parsing.
- `unicode.json`: Chinese, Japanese, Korean, emoji and Arabic text displayed correctly, including escaped-pointer keys.
- `invalid.json`: line/column diagnostics displayed, and the original trailing-comma source remained readable.

These were observed in the native UI. Packaged-release installation, macOS, and actual native system-clipboard behavior remain manual acceptance checks.

## Observed performance and bounds

| Final browser run | Development | Production |
| --- | ---: | ---: |
| Open large fixture: 90,001 nodes | 752 ms | 1,062 ms |
| Large-fixture search | 857 ms | 874 ms |
| Initially mounted tree rows | 24 | 24 |
| Mounted rows after navigation | 32 | 32 |
| Largest sampled main-thread heartbeat interval | 323 ms | 339 ms |

These are observations on this machine, not guarantees. Parsing runs in a worker from 256 KiB, but transferring the flat model and updating UI still require main-thread work. Smaller input parses on the main thread. Tree rows are virtualized; Source is a bounded whole-source text surface, not a streaming editor. Structured parsing is capped at 8 MiB, 250,000 nodes, depth 256 and 16 Mi cumulative pointer storage. Above the file-size cap, only a clearly marked first-256-KiB Source preview is read. Expanding more than 5,000 nodes at once is guarded. Search checks primitive prefixes of at most 4,096 characters and returns at most 500 matches.

## Manual fixture walkthrough

Regenerate with `python tests/fixtures/json/generate.py`. Open files through the existing Open File action; the viewer is selected by the existing registry.

| Fixture | Steps and expected result |
| --- | --- |
| `basic.json` | Expand the root and nested containers. Go to `/modules/1/name`; ancestors expand, the target scrolls into view, and Inspect follows selection. Switch Tree/Split/Source; Source matches the original. Try Copy Key, Value, JSON and both path representations. |
| `array-root.json`, `primitives.json` | Confirm array indexing and a primitive root both render; scalar root `42` has no fake children. |
| `unicode.json` | Inspect multilingual strings and special keys. `/a~1b` locates a slash key; RFC 6901 escaping distinguishes literal tilde, dots and empty keys. |
| `big-number.json` | Compare Tree, Inspect, Source and copied JSON for long integers, decimals, exponent notation and negative zero. Exact source tokens must remain unchanged. |
| `duplicate-keys.json` | Both duplicate members remain visible with a warning. Their node IDs differ. Canonical-pointer navigation selects the last matching member; copied parent JSON retains both members. |
| `invalid.json` | Observe diagnostic line/column, use Jump to Error, and confirm read-only Source remains available. No recovered partial tree is presented as valid. |
| `unsafe.json` | HTML/script-looking strings and prototype-like keys display as text; nothing executes or loads external resources. |
| `large.json` | Confirm root has 10,000 items; Go to `/9999/email` scrolls to the off-screen item. Search value `8888`, then search key `email` to see the 500-result cap. Expand All is guarded; pane scrolling does not scroll the whole page. |
| `deep.json` | Expand nested containers; excessive visual indentation is capped while actual depth remains visible. |
| `long-string.json` | Row previews are bounded. Inspect offers bounded additional text; Copy remains guarded for overly large values. |
| `geo.json`, `sample.geojson` | Both use JSON structure rendering; no map viewer is created. |
| `sample.jsonl` | Explicit structured-view unsupported state; original Source remains available. |
| `empty.json` | Explicit empty-input state with Source; no parse crash. |

Also check actual clipboard contents in the native application, Light/Dark/System themes, keyboard-only navigation, changing the selected file during loading, and independent Tree/Source/Split scroll restoration. Existing Markdown and other fallback formats should continue to open through their own plugins.
