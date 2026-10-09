# Module 09 fixtures

`tests/generate-module-09.py` creates the small PDF / DOCX / ODT / RTF / legacy DOC examples and local performance files using bundled Python libraries. Password fixture: `prism-secret`.

The generated large files are ignored: a 1001-page PDF, large sparse range fixtures, a 238-page image-heavy PDF exceeding 500 MB, a 3000-paragraph DOCX and a document with 40 images / 40 tables. Each image stream in the image-heavy PDF is referenced by a page. Generated files are reproducible; they are not distribution assets.

`headings.docx`, `tables.docx` and `images.docx` intentionally share the same basic source document containing all of those features. `links.docx` additionally contains an actual external hyperlink relationship. `actions.pdf` includes JavaScript, a note and an attachment to verify that a read-only preview does not execute embedded content. `restricted.pdf` is encrypted with copying disallowed and no reader password.

`malformed.docx` contains an unsafe XML declaration; `corrupted.pdf` contains a damaged PDF header/body. `legacy.doc` is a synthetic OLE Word stream signature used only to test the explicit limited-support fallback.
