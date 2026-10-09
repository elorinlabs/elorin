# Module 02 performance evidence

Detection is bounded by file size-independent budgets:

| Operation | Maximum bytes read |
| --- | ---: |
| Header sample | 65,536 |
| ZIP end-of-central-directory search | 65,557 |
| ZIP central directory | 262,144 |
| Total ZIP identification | 393,237 |

No archive members are decompressed or extracted. The 2,048-entry cap bounds filename scanning work.

Windows debug tests on 2026-10-08 used mock seekable sparse sources for large files; the data body was not allocated:

| Logical size | Header bytes read | Example elapsed time |
| --- | ---: | ---: |
| 10MB | 65,536 | 2.28ms |
| 100MB | 65,536 | 1.63ms |
| 1GB | 65,536 | 1.43ms |
| 20GB | 65,536 | 1.49ms |

A real 10MB temporary file also returned exactly 65,536 read bytes. Timings are observations of debug builds, not production guarantees or real-disk throughput benchmarks. Absolute timings are intentionally not asserted; byte counts are asserted. The test reports updated timings on each run.

Browser tests independently assert exactly 65,536 `Blob.slice` bytes for the same four logical sizes. A 20GB ZIP-like mock missing its directory reads only the 65,557-byte tail before returning a corruption warning.

Native commands run on `spawn_blocking` threads. The frontend inspects batches sequentially and ignores results superseded by a later selection. Buffer sizes are bounded; whole-process memory / UI stress acceptance remains a manual tester task.

Reproduce:

```text
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture --test-threads=1
```
