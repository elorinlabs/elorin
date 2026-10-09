# Prism — Module 01

Tauri 2 + React + strict TypeScript + Vite. Application shell only; no file contents are read or parsed.

## Development

Install Node.js and pnpm, then `pnpm install`. Run `pnpm dev` for the browser preview, `pnpm test` for interaction tests, and `pnpm build` for a production frontend build.

For native development install Rust through rustup and the platform prerequisites (Windows: Visual Studio C++ build tools and WebView2; macOS: Xcode command line tools). Run `pnpm tauri dev`. Package with `pnpm tauri build`.

## Boundaries

- `app/`: route state and composition. Other routes deliberately render placeholders.
- `components/`: shared primitives, accessible controls, SVG prism and sidebar.
- `design-system/`: semantic dark/light palettes, spacing, radii, typography, borders, shadows and motion. Only dark theme is exposed.
- `services/fileSelection.ts`: native dialog and drag/drop adapter; returns paths and names only. Browser preview explicitly reports native API unavailability.
- `services/recentFiles.ts`: replaceable async interface. Development fixture is dynamically loaded only in development. Production returns an empty list until a later module provides storage.
- `fixtures/`: sample data, never persisted as user history.
- `tests/`: behavioral shell tests using injected service adapters.

Native window decorations are retained for proper Windows/macOS controls, window dragging and resizing. Minimum desktop width is 900px; sidebar collapses automatically at 1100px, with a manual override. No network resources or external fonts are used.

Native APIs follow the [Tauri dialog documentation](https://v2.tauri.app/plugin/dialog/) and [webview drag/drop API](https://v2.tauri.app/reference/javascript/api/namespacewebview/). The main window is granted only core permissions and open-dialog access.
