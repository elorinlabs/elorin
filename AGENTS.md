# Elorin development

Default development branch: `develop`. Use `feature/<module>` for substantial work. Keep `main` as the protected recoverable baseline; integrate through pull requests.

Never reset or clean the user's work, rewrite shared history, or force push. Preserve ongoing Module 24 changes. Do not change Tauri identifiers or file permissions as part of repository maintenance.

Before native QA, use an isolated application identifier and configuration. Never use the real user's workspace for test writes.

Frozen candidates are identified by installer SHA-256. Consult `releases/candidates` before fixing a reported defect. An unknown source commit must remain unknown. Create hotfix worktrees only from a verified affected commit; otherwise reproduce on an explicitly documented known commit first. Forward-port tested fixes to develop without replacing newer functionality.

Every bug fix needs focused regression verification. Run appropriate frontend/Rust checks. Packaging alone does not establish formal release acceptance. Use `docs/development/WORKFLOW.md` and `scripts/candidate.cjs` for candidate registration and verification.
