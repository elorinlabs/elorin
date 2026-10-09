# Elorin bundled CAD backend

occt-import-js 0.0.23, unmodified upstream JavaScript and WebAssembly binaries. The adjacent cad-worker.js is Elorin's worker adapter.

Pinned importer source: https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2
Importer source archive: https://github.com/kovacsv/occt-import-js/archive/c2148e54b456b571238d35cac037d304053d64b2.tar.gz
Pinned OCCT submodule: d2abb6d844231cb8f29be6894440874a4700e4a5, OpenCascade 7.6.1.
OCCT source: https://github.com/Open-Cascade-SAS/OCCT/tree/d2abb6d844231cb8f29be6894440874a4700e4a5
OCCT source archive: https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz
Build instructions and required Emscripten/CMake configuration are in the importer repository. Fetch the pinned OCCT submodule before rebuilding. Keep the JS/WASM pair together when replacing the backend.

Licenses: importer LGPL-2.1; OCCT LGPL-2.1 with OCCT_LGPL_EXCEPTION.txt. The full notices are shipped next to the binaries. No commercial DWG, FBX, USD or proprietary CAD SDK is bundled.

WASM: 7,604,031 bytes. Loader: 96,871 bytes. All assets are local, loaded only for STEP/IGES import. No CDN or server conversion. This worker runs in WebView2/modern browser WebAssembly, rather than a Rust FFI or an OS child process. Windows is tested; macOS/Linux are architectural targets, not verified builds.
