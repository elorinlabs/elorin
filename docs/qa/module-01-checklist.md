# Module 01 — Application Shell QA

Status: frontend implementation and browser checks complete; native desktop acceptance pending.

## Startup

- [ ] App launches successfully — native launch blocked: Cargo is not installed.
- [x] No console errors — browser page-error check passed.
- [x] Window renders correctly — browser screenshots reviewed at 1440px and 1024px.
- [ ] Native Windows window renders correctly.
- [ ] Native macOS window renders correctly.

## Sidebar

- [x] Navigation works — behavioral test and browser navigation check.
- [x] Active state correct — behavioral test.
- [x] Sidebar collapse works — manual toggle test and responsive browser checks.

## Search

- [x] Ctrl/Cmd + K focuses search — both shortcut variants tested; Ctrl verified in browser.
- [x] Escape releases focus — behavioral and browser checks.

## Home

- [x] Hero layout correct — SVG geometric placeholder, reviewed screenshots.
- [x] Category cards correct.
- [x] Recent files render correctly — five development fixtures tested.
- [x] Production frontend omits development fixtures and shows an empty state.

## File Dialog

- [ ] Open File works — real native dialog requires Rust/Cargo and Windows build tools.
- [ ] Open Folder works — real native dialog pending.
- [ ] Drag & drop path detected — real native event pending.
- [x] Open File callback and selected path display tested with service adapter.
- [x] Open Folder callback and selected path display tested with service adapter.
- [x] Cancellation and errors handled.
- [x] Dropped paths rendered without content parsing; async event cleanup tested.

## Resize

- [x] 1920px layout correct — browser, no horizontal overflow.
- [x] 1440px layout correct — browser, no horizontal overflow.
- [x] 1024px layout usable — browser, sidebar collapsed, no horizontal overflow.
- [x] 900px layout usable — browser, sidebar collapsed, no horizontal overflow.
- [ ] Native window resize verified on Windows.
- [ ] Native window resize verified on macOS.

## Automated results

- `pnpm test`: 11/11 tests passed.
- `pnpm build`: strict TypeScript and Vite production build passed.
- Browser QA: four widths passed; zero page errors; search focus and Escape passed.
- `pnpm tauri icon src-tauri/icons/prism.svg`: desktop icons generated successfully.
- `pnpm tauri dev`: failed before compilation because `cargo metadata` executable was not found.

Evidence: [browser results](./browser-results.json), [1440px screenshot](./screenshots/home-1440.png), [1024px screenshot](./screenshots/home-1024.png).

## Tester handoff

Install the native prerequisites in README, run `pnpm tauri dev`, and verify real selection, cancellation, paths with Unicode/spaces, multiple dropped files, folder drops, resize, keyboard focus, and window controls. Record platform and results above. Do not begin Module 02 before acceptance.
