# Module 04 — Markdown Viewer

## Pipeline and lifecycle

Module 02 produces a `FileDescriptor`. The existing lazy `ViewerRegistry` matches `detectedType: markdown` and `isText`, loads the Markdown plugin, and lets `ViewerHost` own loading, cancellation, errors, fallback and session state. There is no extension switch in App and no second registry. The existing detector recognizes md, markdown, mdown, mkd and now mkdn; content detection remains in Module 02.

The plugin reads decoded source once per load, parses it once with unified + remark-parse + remark-gfm, and derives headings, the heading tree and content statistics from that MDAST. It converts the same tree to sanitized HAST through remark-rehype + rehype-sanitize. The retained model contains source, source lines, sanitized HAST, headings, statistics and a resource resolver. The intermediate MDAST can be collected after load. React renders sanitized HAST without injecting HTML strings.

Read, Split and Source use the same model. Inspect returns cached statistics. Outline consumes the same headings. Scroll events mutate session metadata without triggering React updates; positions are stored separately for Read, Source and both Split panes. Restoration clamps naturally to the available scroll range. Stable ViewerShell slot keys preserve the content node when a side panel opens. Copy feedback is local to the code block. No permanent scroll persistence or precise Split scroll synchronization is added.

Heading slugs normalize Unicode, preserve letters, marks and digits, and suffix duplicates. Empty/punctuation-only headings use `section`. Generated IDs also reserve sanitized renderer IDs, including footnote IDs. The model retains depth, source line and children for future structural modes; no Lens or Zoom UI is implemented.

Words count visible text and inline code, excluding fenced code and raw HTML. CJK characters are counted separately. Characters count source Unicode code points, and lines recognize CRLF, LF and CR (empty source has zero lines). Reading minutes are `max(1, ceil(words / 220 + cjkCharacters / 400))`. Link/image/code/table counts come from AST nodes, including reference links.

## Minimal generic API changes

Previously `ViewerPlugin.inspect(model, context)` could return data, but ViewerHost always displayed it as raw JSON. That could not provide a readable content inspection panel. Added optional:

```ts
renderInspection?(inspection: TInspect, props: ViewerRenderProps<TModel>): ReactNode;
```

Plugins without this hook retain the existing JSON display. The hook is format-neutral; core knows no Markdown headings or tables. A ViewerHost regression test covers custom rendering, and existing fallback tests still pass.

Previously `ViewerServices.file` only offered `openExternal()` and `reveal()`. Added optional:

```ts
openUrl?(url: string): Promise<void>;
openRelated?(relative: string): Promise<void>;
readRelated?(relative: string): Promise<{ file: FileDescriptor; source: FileSource }>;
```

The Markdown plugin cannot safely resolve local resources or hand off related files through the old API. The additions work for any viewer: services resolve descriptors and sources, App activates a related document, and Registry chooses its viewer. The plugin never reads disk directly. Browser services omit unavailable related-file functions.

`FileSource.readText({ encoding?, maxBytes? })` additionally accepts optional `fatal?: boolean`. Markdown uses fatal decoding; existing text fallback remains permissive. Optional `getRevision(): Promise<string>` lets any viewer check for changes around a read. Browser revisions use the immutable File's size/lastModified; native revisions use pinned-handle length/modified time. This detects ordinary changes, not every possible same-size/same-timestamp rewrite. Controller cancellation, cleanup and disposal contracts are unchanged.

ViewerHost also delays its lightweight loading feedback by 150 ms and avoids a duplicate Source control when a plugin already declares that mode. The shell's small theme selector uses the existing palette tokens and one shared theme hook, since earlier modules had no user-selectable Light/Dark/System control. Markdown has no independent theme state.

## Security and bounds

- Raw HTML is disabled, then output is sanitized. No arbitrary script execution, raw HTML injection, iframe, Mermaid runtime or SVG rendering is introduced.
- Anchors navigate inside the reader. Only credential-free HTTP(S) external URLs are accepted; native handoff uses the opener plugin after Rust validates the URL. Browser handoff uses a separate window with noopener/noreferrer. Middle-click follows the same guarded path.
- Relative links reject unsafe schemes, absolute paths, backslashes, colon, control characters, invalid encoding and `..`, including percent-encoded traversal. Rust independently requires an already authorized base file, canonicalizes the target, verifies a regular file, and confines it to the document directory. Symlinks escaping that directory are rejected. The existing grant/read infrastructure remains authoritative; this is not a guarantee against every concurrent filesystem mutation.
- Relative images use generic `readRelated` + bound FileSource, then a typed Blob URL. Only detected PNG/JPEG/GIF/WebP/AVIF are allowed. Remote images are not fetched automatically; SVG is blocked. CSP adds `blob:` to images without granting arbitrary remote image origins or broad filesystem permissions.
- Limits: Markdown 2 MiB; parsed document 30,000 nodes; up to 32 cached image requests; 4 MiB per raster resource and 16 MiB total resource budget. Existing whole-file and range limits remain. Oversized Markdown enters the host error flow with Open as Text; it does not silently truncate the document.
- Resource allocation registers cleanup with the existing context. Cancellation guards reads and late completions; all allocated Blob URLs are revoked on cleanup. Missing images show Image unavailable; missing related links give local feedback; read/encoding/parser/revision errors reach ViewerHost.
- Parsing is synchronous after a cancellation yield and is not interruptible while executing. Bounds limit exposure; this version is not a streaming or worker parser. Raster byte budgets do not bound decoded pixel memory.

## Added dependencies

| Package | Purpose |
| --- | --- |
| unified | Shared parsing/transform pipeline |
| remark-parse | CommonMark parser; avoids a custom regex parser |
| remark-gfm | Tables, task lists, deletion and autolinks |
| remark-rehype | MDAST to HAST conversion with raw HTML disabled |
| rehype-sanitize | Sanitizes generated HAST before rendering |
| hast-util-to-jsx-runtime | Renders HAST as React elements with guarded components |
| mdast-util-to-string | Heading text extraction from AST |
| @types/mdast, @types/hast | Development-only AST typing |

Versions are recorded in package.json and pnpm-lock.yaml. No editor or syntax-highlighting runtime is added. Production build emits a separate Markdown plugin bundle (~173 kB, ~53 kB gzip); browser checks confirm the home screen does not load Markdown parsing code.

## File changes

New files (paths relative to the project root):

```text
src/hooks/useTheme.ts
src/viewer/plugins/markdown/markdown.plugin.tsx
src/viewer/plugins/markdown/markdown-model.ts
src/viewer/plugins/markdown/markdown-parser.ts
src/viewer/plugins/markdown/markdown-links.ts
src/viewer/plugins/markdown/markdown-resources.ts
src/viewer/plugins/markdown/MarkdownViewer.tsx
src/viewer/plugins/markdown/MarkdownReader.tsx
src/viewer/plugins/markdown/MarkdownSource.tsx
src/viewer/plugins/markdown/MarkdownOutline.tsx
src/viewer/plugins/markdown/MarkdownInspector.tsx
src/viewer/plugins/markdown/markdown.css
tests/markdown-parser.test.ts
tests/markdown-viewer.test.tsx
tests/markdown-resources.test.ts
tests/module-04-browser-qa.cjs
tests/fixtures/markdown/basic.md
tests/fixtures/markdown/gfm.md
tests/fixtures/markdown/chinese.md
tests/fixtures/markdown/links.md
tests/fixtures/markdown/images.md
tests/fixtures/markdown/code-blocks.md
tests/fixtures/markdown/large.md
tests/fixtures/markdown/empty.md
tests/fixtures/markdown/malicious.md
tests/fixtures/markdown/README.md
tests/fixtures/markdown/assets/sample.png
tests/fixtures/markdown/assets/unsafe.svg
src-tauri/tests/markdown_resources.rs
src-tauri/permissions/autogenerated/load_related_file.toml
src-tauri/permissions/autogenerated/file_revision.toml
src-tauri/permissions/autogenerated/open_external_url.toml
docs/architecture/markdown-viewer.md
docs/qa/module-04-checklist.md
docs/qa/module-04-browser-results.json
docs/qa/module-04-production-results.json
docs/qa/screenshots/module-04-light.png
docs/qa/screenshots/module-04-dark.png
```

Modified files:

```text
src/viewer/core/types.ts
src/viewer/components/ViewerHost.tsx
src/viewer/components/ViewerShell.tsx
src/viewer/builtins.ts
src/services/fileSource.ts
src/services/fileLoader.ts
src/services/detection/rules.ts
src/app/App.tsx
src/styles.css
src-tauri/src/detection/extension.rs
src-tauri/src/file_io/mod.rs
src-tauri/src/commands.rs
src-tauri/src/lib.rs
src-tauri/build.rs
src-tauri/capabilities/main.json
src-tauri/tauri.conf.json
tests/viewer-host.test.tsx
tests/module-03-browser-qa.cjs
package.json
pnpm-lock.yaml
README.md
```
