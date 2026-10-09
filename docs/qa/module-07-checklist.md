# Module 07 — Executed verification

Windows / Edge / WebView2, 2026-10-08. The [full delivery report](../architecture/text-viewer.md) lists every added/modified file, dependencies, architecture and limits.

## Commands actually executed

| Command | Result |
| --- | --- |
| `pnpm add highlight.js` | Installed 11.12.0 and updated the lockfile. |
| `node tests/fixtures/text/generate.cjs 1 20 100 500` | Created actual local logs at those MiB sizes and small text/code/config/log fixtures. |
| `node tests/fixtures/text/generate.cjs 1024` | Created an actual 1 GiB local log and the generated 10 MiB source file. |
| `pnpm test` | Final run: 16 test files, 300 tests passed, including Modules 01–06 regressions. |
| `pnpm build` | Final strict TypeScript and Vite production build passed. Text worker and syntax bundle are separate lazy assets. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 23 native tests passed, including actual authorized text ranges and a generated 100 MiB+ native disk file. |
| `pnpm dev` | Browser development server started at `127.0.0.1:1420`. |
| `node tests/module-07-browser-qa.cjs` with the available `PRISM_PLAYWRIGHT` | Development UI suite passed, including actual 1/20/100/500 MiB inputs. |
| `pnpm exec vite preview --host 127.0.0.1 --port 1421` | Production preview started. |
| Same browser QA with `PRISM_QA_URL=http://127.0.0.1:1421/`, `PRISM_QA_RESULT=docs/qa/module-07-production-results.json`, `PRISM_QA_GB=1` | Production UI suite passed, adding actual 1 GiB input, 10 MiB source, last-line scrolling and adversarial regex timeout. |
| `pnpm tauri dev --no-watch --config <temporary local config>` | Native debug compilation and actual Windows application launch passed. The temporary config only disabled the duplicate beforeDevCommand because Vite was already running. |
| `node tests/module-07-tauri-qa.cjs` | Actual WebView2 checks passed with 10 selected fixture inputs, including a 100 MiB log. |
| `pnpm dlx prettier --write ...` and `cargo fmt --manifest-path src-tauri/Cargo.toml --all` | Formatted the new implementation/tests. Existing native source files were already formatted. |

The Tauri smoke run used `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` solely to attach the test driver. The runtime was stopped after testing. Playwright was loaded from the bundled tooling runtime; it was not added to project dependencies.

Initial failures were corrected before the successful runs: the old fallback test still expected a 256 KiB string, a highlighter locator omitted Makefile's section token, an unsafe fixture's unusually high control-character ratio correctly triggered Module 02's binary rejection, and generated TypeScript fixtures initially entered application compilation. A native test attempt also encountered the running desktop EXE lock; stopping the application allowed the reported 23 passing tests. These failed attempts are not counted as successful checks.

## Observed production performance

Actual local files, standard headless Edge, warm application and OS caches. First-visible time includes file selection and the first nonempty visible row. Indexing time below starts after first-visible content. Scroll time measures a jump to 70% and the changed virtual row, not a continuous frame-rate benchmark. Search is literal `ERROR`, with first-result time including the 150 ms debounce.

| Input | First visible | Index after visible | First match | Full search | Scroll row update | Mounted rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 MiB log | 70 ms | 47 ms | 208 ms | 220 ms | 26 ms | 30 |
| 20 MiB log | 69 ms | 561 ms | 177 ms | 587 ms | 18 ms | 29 |
| 100 MiB log | 97 ms | 2,559 ms | 170 ms | 1,906 ms | 20 ms | 29 |
| 500 MiB log | 65 ms | 18,355 ms | 179 ms | 9,507 ms | 19 ms | 29 |
| 1 GiB log | 66 ms | 23,020 ms | 177 ms | 16,169 ms | 20 ms | 29 |

Browser-reported used main-page JS heap snapshots were approximately 13.3, 12.9, 10.2, 14.4 and 21.1 MiB respectively. They are snapshots rather than peaks, and exclude worker/native/browser file-buffer memory. No total-process memory-growth claim is inferred from them. Raw observations are in [production results](module-07-production-results.json); the earlier [development results](module-07-browser-results.json) show the additional development-runtime overhead.

The 1 GiB test counted 128,143 matches while retaining only the first 2,000 locations for navigation. The 500 MiB test counted 62,570. Both also opened the end of the file and verified that the final logical line was mounted; this exercises the compressed scroll range rather than relying on a huge CSS element.

The 10 MiB source file displayed its first content in 75 ms and passed actual highlighting/search checks. The 5 MiB single-line fixture displayed in 186 ms and passed bounded page preview, next page and go-to-line 2 checks. The adversarial `(a+)+$` pattern on 30,000 `a` characters plus `!` was terminated after 4,467 ms including UI/debounce overhead; the wrap control remained responsive.

## Actual file-opening checks

These were automatically driven through real UI controls, not described as human manual tests:

- `basic.txt`, `unicode.txt`, `utf8-bom.txt`, `mixed-line-endings.txt`: Plain defaults, encoding, Unicode and Mixed inspection.
- `example.ts`, `example.py`, `example.rs`, `example.go`, `example.cpp`, `Dockerfile`, `Makefile`, `no-extension-script`: Code routing and actual syntax tokens.
- `.env`: Config routing.
- `unknown.custom`: generic text fallback.
- `basic.log`, `mixed-levels.log`, `timestamp.log`, `ansi.log`: log routing, timestamp/level presentation and inert ANSI.
- `unsafe.txt`: source script/HTML/URL text produced no executable script, image or link nodes and no dialogs.
- `long-line.txt`: 5 MiB bounded preview and paging, followed by correct navigation to the next line.
- Actual 1/20/100/500/1024 MiB logs: first screen, full indexing, 70% scrolling, literal search, next match, line 1000, selected-line Inspect and final-line scrolling.
- Actual 10 MiB source: initial viewing, syntax highlighting and search.
- 500 MiB indexing/search cancellation and a switch back to small text; superseded search produced no stale UI failure.
- Markdown, JSON and CSV fixtures still opened their dedicated viewers.
- Light and Dark modes were captured and visually inspected; System continues to use the unchanged shared theme hook.

Copy line was checked against the actual clipboard value. Unit tests separately verify normal and multibyte page contents. The final successful browser suite recorded no page errors and no dialogs. It did not install a console-error listener, so it does not claim a separate console-log audit.

## Tauri verification scope

[Tauri results](module-07-tauri-results.json) record actual Windows WebView2 presentation and worker execution for basic text, Unicode/BOM, mixed endings, TS, Python, Dockerfile, a log, a 5 MiB single-line input and a 100 MiB log. Search, next result, go-to-line and Inspect passed. Those files were supplied through the browser File input in the actual desktop WebView; the report explicitly identifies this source mechanism.

Native Rust tests independently exercised the production FileAccess disk implementation: authorized fixture metadata/ranges, a generated 100 MiB+ log's bounded sample and tail range, and rejection of excessive reads. The existing TauriFileSource adapter/range contract also remains covered by frontend tests.

The operating-system file dialog → native selected path → frontend IPC pipeline has **not** been automated end-to-end. A final human desktop acceptance should choose a large local log through Open File, scroll/search/go-to-line/copy/Inspect, switch files during indexing, and check the 500 MiB native IPC workload. This remaining acceptance is not marked passed by the independent WebView2 and Rust tests.

## Product acceptance status

- Implemented and verified: shared plugin/profiles, dedicated-viewer precedence, read-only source, gutters/wrap, virtual DOM, protected/cancellable search, go-to-line, long-line paging, cancellable indexing, UTF-8/BOM/Unicode and mixed endings, basic logs, file/line inspection, safe source rendering, shared themes, browser dev, production build and Tauri runtime smoke.
- Explicit first-version limits: regex is line-scoped and skips lines over 64 KiB; navigation retains 2,000 matches; Copy line has a 1 MiB budget; multiline syntax context can be approximate; long-line extent history retains 2,048 entries; selection is limited to mounted text.
- Remaining human acceptance: native dialog/IPC file-opening loop and native 500 MiB interaction. No claim of completing that manual acceptance is made.

Screenshots: [Light](screenshots/module-07-light.png), [Dark](screenshots/module-07-dark.png), [Tauri](screenshots/module-07-tauri.png).
