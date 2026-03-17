# JobApplyBot

This repository now contains a functional MVP scaffold for the Job Application Smart Assistant:

- `apps/agent`: local Fastify-based localhost agent
- `apps/extension`: Chrome MV3 popup extension
- `packages/protocol`: shared command/event contracts and validation
- `packages/storage`: local SQLite-backed persistence layer with migrations
- `packages/adapters`: deterministic Greenhouse and Lever HTML form extraction
- `packages/runner`: resumable job orchestration with real Playwright-driven browser control

The current implementation is intentionally local-first and safety-first. It stops at `ready_to_submit`, never submits automatically, and uses deterministic adapter logic only.

## What Works Today

- Capture a supported job URL and create a local job id
- Start a run against Greenhouse or Lever URLs in a real persistent Chrome session
- Parse actual form HTML from the live page and fill supported inputs deterministically
- Autofill from saved local profile values when labels match common fields
- Pause on missing required answers and resume after user input
- Optionally save manual answers for future reuse by field signature hash
- Auto-advance supported `Next` or `Continue` steps when no required input is missing
- Reach a review-ready summary state without clicking submit
- Stream live status, `fields_ready`, and `need_field` events over SSE
- Persist profile, learned answers, jobs, and artifacts in local SQLite storage
- Capture real HTML snapshots and screenshots during runs

## Current Limitations

- The agent is a local Node service scaffold, not a full Electron tray app yet
- The runner depends on a locally available Chrome-compatible browser and uses `playwright-core`
- Storage uses `node:sqlite`, which is available in Node 22 but still marked experimental upstream
- The extension uses a lightweight popup UI rather than a full React app
- Complex portals with dynamic client-side validation may still need additional selector coverage

## Install

```bash
pnpm install
```

## Run

Build everything:

```bash
pnpm build
```

Start the agent:

```bash
pnpm dev:agent
```

The agent prints a shared secret on startup. Paste that secret into the extension popup before making API calls.
By default the agent launches a persistent Chrome session via Playwright using the local browser profile under `.local/browser-profile`.

Optional browser env vars:

```bash
PLAYWRIGHT_CHANNEL=chrome
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLAYWRIGHT_HEADLESS=0
```

Build the extension bundle:

```bash
pnpm --filter @jobapplybot/extension build
```

Then load `apps/extension/dist` as an unpacked extension in Chrome.
If you want to use the local mock HTML files directly, enable "Allow access to file URLs" for the extension in Chrome.

## Test

```bash
pnpm test
```

## Validation

See `VALIDATION.md` for a quick manual smoke test using the included mock Greenhouse and Lever pages.
The live browser path was smoke-tested locally against the Greenhouse fixture with headless Chrome.

## Safety and Non-Negotiables

- No silent submission by default
- No CAPTCHA/2FA bypass
- No password storage for job sites
- Deterministic selectors only
- Localhost-only API with extension-agent auth secret

## Planning Artifacts

- `SPECKIT_SPECIFY_PROMPT.md`: canonical feature prompt
- `specs/001-job-assistant-core/spec.md`: current feature spec
- `.specify/memory/constitution.md`: project constitution
- `state.md`: live progress log
