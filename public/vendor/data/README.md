# Local data engines

Unmodified assets copied from pinned npm packages:

- h5wasm 0.10.3: `hdf5_hl.js`, `hdf5_util.js`, `file_handlers.js` (4,201,030 bytes together). The utility embeds its HDF5 WebAssembly engine. NIST and bundled HDF5 notices are preserved in `HDF5-LICENSE.txt`. Source/build: https://github.com/usnistgov/h5wasm .
- sql.js 1.14.2: `sql-wasm.wasm` (658,410 bytes); JavaScript wrapper is bundled through Vite. MIT notice: `SQLJS-LICENSE.txt`. SQLite itself is public domain. Source/build: https://github.com/sql-js/sql.js .

These engines load from the app's own assets. No remote code, SQLite extension, or HDF5 compression plugin is downloaded. HDF5 receives a read-only virtual filesystem node backed by authorized ranges or a local Blob in a Worker. There is no native HDF5 DLL packaging dependency.

To refresh assets, install the exact reviewed package versions, copy these files from their distributions, retain all notices, and rerun Module 14 browser/native fixtures. Do not replace them with CDN URLs.
