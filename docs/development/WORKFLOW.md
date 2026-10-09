# Development and independent Windows QA

The initial main commit is a historical import of recovered, ongoing development, including Module 24. It is not formal release acceptance. Previously built installers are not assumed to come from this commit.

- `develop`: daily development; `feature/<module>`: substantial isolated changes.
- `main`: protected baseline, updated through reviewed pull requests after verification.
- `hotfix/<bug-id>`: start from the verified affected commit in a separate worktree. Run a targeted regression test, then merge or cherry-pick only the fix into develop and verify it there.
- `release/<rc-id>`: create only for a named candidate with a proven source commit. The existing recovered installer has unknown source provenance, so has no release branch or Git tag.

DeepSeek installs the frozen package in a separate Windows 11 VM, verifies its SHA-256, and stores results under its candidate ID. Do not replace that package during testing. Codex continues on develop. Report candidate ID, package hash, source commit if known, test case ID, severity, reproduction steps, expected/actual result, evidence and environment. `.github/ISSUE_TEMPLATE/bug.yml` enforces this structure.

Use `node scripts/candidate.cjs register <id> <installer> <archive-directory> [verified-source-commit]` to archive a package and create its manifest. IDs cannot be reused and an existing archive cannot be overwritten. Omit the commit unless build provenance proves it. `node scripts/candidate.cjs verify <id> <archived-installer>` checks the frozen hash. Metadata goes into `releases/candidates`; installers stay outside Git. Manifests retain unknown fields instead of inventing them.

For a verified affected version: `git worktree add -b hotfix/BUG-123 ../elorin-BUG-123 <verified-commit>`. Preserve existing worktrees and changes. For an unknown-source installer, first reproduce against a known checkout and record that difference; do not claim exact source equivalence.

Commit the next candidate's manifest with proven build inputs and immutable hash. Keep result evidence and fixes linked to that candidate. Never upload personal workspaces, tokens or real customer test files. Synthetic SQLite fixtures and required licensed WASM are repository assets, not personal databases.

The frozen historical package is `legacy-0.1.0-20261009`, SHA-256 `61ec10318d431ff241508e41446bf15ef20bb4256e5a9fd61efe1820a38e6588`. Its source commit is UNKNOWN. Use the candidate manifest for build evidence and limitations. DeepSeek¡¯s 451-case VM regression is independent from the local frontend suite; neither is reported as completed unless its own results are available.
