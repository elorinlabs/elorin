# Module 04 QA — 2026-10-08, Windows

## Executed checks

- `npm test`: 10 test files, 140 tests passed. Includes Modules 01–03 regression suites and Markdown parsing, rendering, registry selection, resource cancellation, exact source, mixed CJK reading time, links, raw HTML, scroll restoration, outline observation after mode changes and theme checks.
- `npm run build`: TypeScript and production Vite build passed. Markdown parsing is in a separate lazy chunk.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 21 tests passed on Windows. Includes authorized relative-resource boundaries and revision changes. The Unix-only symlink test did not run on Windows.
- `npm run dev`: development server ran at 127.0.0.1:1420; real Edge automation passed.
- Production Vite preview at 127.0.0.1:1421: the same real Edge automation passed.
- `npm run tauri:dev`: Rust compilation succeeded and native Prism launched. Native window observation showed an actual selected local README.md detected as Markdown, with Source and Outline displayed. Further automated clicking was stopped when the tool detected concurrent user input. Native relative image/link UI checks below remain unverified; Rust and injected-service tests do not substitute for these UI checks.

Browser automation command (requires an installed Playwright package and Edge):

```powershell
$env:PRISM_PLAYWRIGHT = '<absolute path to playwright package>'
node tests/module-04-browser-qa.cjs
# Against a running production preview:
$env:PRISM_QA_URL = 'http://127.0.0.1:1421/'
node tests/module-04-browser-qa.cjs
```

The development and production JSON reports are in this directory. Both report no console/page errors, no script dialogs, no Markdown imports on initial home load, exact Source text, restored scroll positions and successful >2 MiB fallback. Widths 1920, 1440, 1024 and 900 have no page horizontal overflow. Light, Dark and System follow shell tokens. Screenshots are in `screenshots/module-04-light.png` and `module-04-dark.png`.

Production fixture load-to-visible measurements on this machine ranged from 30–189 ms (large.md: 189 ms, 501 headings). These are one local run, including UI/automation overhead, not a performance guarantee. Markdown up to the byte/node limit still parses synchronously.

## Manual fixture walkthrough

Start `npm run dev` for browser mode or `npm run tauri:dev` for native mode. Use Open File and choose files under `D:\Prism\tests\fixtures\markdown`.

| Fixture | Expected result |
| --- | --- |
| basic.md | Read defaults to centered document; GFM table and disabled tasks render. Outline → Code scrolls and focuses that heading. Inspect shows content counts. Read/Source/Split preserve positions without reloading. |
| gfm.md | Tables, autolinks, deletion, ordered/unordered lists, disabled checkboxes and code fences render. |
| chinese.md | Chinese/Unicode headings and duplicates have distinct anchors; Outline navigates correctly. CJK contributes to reading time. |
| links.md | Internal scrolls to Destination. Native Related opens chinese.md through File Loading and Registry. Missing shows feedback. Traversal and unsafe links cannot open. External opens a separate system browser, leaving Prism in place. |
| images.md | Native sample PNG loads from assets/sample.png through FileSource. Missing/SVG/remote images show Image unavailable. Browser mode also falls back for local resources it cannot access. |
| code-blocks.md | Language is retained, whitespace stays intact, long lines scroll horizontally. Hover/focus Copy and verify clipboard contains pure code, with brief Copied feedback. |
| large.md | 501 headings; modes/outline/inspection remain usable. Scroll each Split pane independently, switch modes and return. |
| empty.md | Empty Markdown document, no error. |
| malicious.md | No alert, script, iframe, executable link or image event handler. Raw HTML is not executed. |

Select rendered text and Source text; verify normal copy and keyboard focus. Resize to 900px, test wide code/table overflow inside their own containers. Change Light/Dark/System; when System is selected change the OS theme. Rapidly switch documents while an image is loading; stale results must not replace the active document.

## Remaining native/platform acceptance

- [ ] Native Read layout, code clipboard, relative sample image and related document link verified by a person in the current build.
- [ ] Native external URL opens the system browser and does not navigate the Prism WebView.
- [ ] Native missing/replaced/permission-denied file flow verified with live filesystem changes.
- [ ] Windows symlink/reparse-point escape verified manually where available; Unix-only automated symlink test run on a Unix host.
- [ ] macOS native dialog, WebView, clipboard, opener and theme behavior checked on macOS.

Automated coverage includes invalid decoding, read failure, cancellation, revision changes, object URL cleanup, encoded traversal and oversized content. A syntactically unusual CommonMark document is normally recoverable syntax, not inherently a parser failure. Actual parsing exceptions are wrapped as PARSE_FAILED and reach the existing ViewerHost error/fallback flow.
