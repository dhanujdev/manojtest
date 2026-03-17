# State

Last updated: 2026-03-02

## Current Phase

- Feature spec drafted from the master product brief.
- Buildable monorepo baseline created and verified.
- Core localhost agent, SQLite-backed storage, real Playwright browser control, HTML extraction adapters, and MV3 extension popup are implemented.
- Ready for the next production hardening pass: Electron packaging and deeper portal coverage.

## Completed

- [x] Install and verify `codex-cli`.
- [x] Install and verify `uv`/`uvx`.
- [x] Initialize Spec-Kit project with `--ai codex`.
- [x] Create `SPECKIT_SPECIFY_PROMPT.md`.
- [x] Draft project constitution.
- [x] Add workspace `README.md`.
- [x] Replace placeholder feature spec with a concrete v1 spec.
- [x] Scaffold the monorepo packages and app entry points.
- [x] Add a functional localhost API, runner, storage layer, and popup extension baseline.
- [x] Add basic unit tests and mock integration HTML fixtures.
- [x] Add CI workflow and manual validation instructions.
- [x] Replace JSON storage with a schema-backed SQLite store and migrations.
- [x] Replace static adapter templates with deterministic HTML field extraction.
- [x] Replace the HTML-only runner path with real Playwright browser automation.
- [x] Re-run `pnpm build`, `pnpm lint`, and `pnpm test` successfully.

## Next Actions

- [x] Run `pnpm install`.
- [x] Run `pnpm build` and `pnpm test`.
- [x] Replace file-backed JSON storage with SQLite migrations.
- [x] Replace deterministic HTML extraction flow with real Playwright browser automation.
- [ ] Wrap the local agent in Electron tray packaging.
- [ ] Expand the extension into a richer React-based UI if desired.

## Guardrails Checklist

- [x] Submit guard remains enabled by default.
- [x] CAPTCHA/2FA paths always pause for user by design intent in the spec.
- [x] Protocol changes are versioned + schema-validated.
- [x] Data remains local-first with localhost-only API.

## Open Decisions

- Confirm whether to keep the lightweight popup UI or upgrade immediately to React.
- Confirm whether to stay on `node:sqlite` or migrate to a non-experimental SQLite runtime later.
- Confirm Electron signing/notarization strategy for the macOS app shell.

## Risks to Track

- Adapter fragility from portal DOM changes.
- Multi-step edge cases and hidden required fields.
- Security regressions around local auth secret handling.
- Packaging/signing/notarization setup complexity on macOS.
- Browser extension UX complexity once real field extraction and artifact inspection are added.
