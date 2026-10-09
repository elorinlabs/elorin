# CSV fixtures

Run `python tests/fixtures/csv/generate.py` to regenerate deterministic fixtures, including `large.csv` (100,000 rows, 22 columns, 18,366,856 bytes). Add `--million` to generate the ignored `million-local.csv` (1,000,000 rows, 22 columns, 203,666,956 bytes). The million-row file is a local performance input, not a promise that every row is resident in memory.

Core cases: `basic.csv`, `quoted.csv`, `multiline.csv`, `empty.csv`, `headerless.csv`, `duplicate-headers.csv`, `ragged.csv`, `unicode.csv`, `numbers.csv`, `dates.csv`, `unsafe.csv`, `basic.tsv`, `semicolon.csv`, and `large.csv`.

Additional cases: `pipe.csv`, `bom.csv`, `header-only.csv`, `one-column.csv`, `invalid.csv`, `long-cell.csv` (25,000-character value), and `wide.csv` (10,000 columns).

Fixtures use UTF-8; the multiline fixture intentionally uses CRLF and the BOM fixture has actual UTF-8 BOM bytes. Strings beginning with HTML, formula and unsafe-URL syntax are inert test data, never instructions.
