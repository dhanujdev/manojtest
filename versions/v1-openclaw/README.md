# Smart Job Application Assistant (v1)

Local-first, human-supervised job application assistant.

## Status
**Functional beta — validation pending** (cross-portal sweep is in progress; current run results are captured in `VALIDATION.md`).

## Topology
- **Browser Extension (MV3)**: captures job URL, shows progress, prompts for missing fields, confirms submit.
- **Local Desktop Agent (Electron Tray)**: runs a local API + orchestrates Playwright (headed) automation.
- **Automation Runner (Playwright)**: uses the user’s visible browser session.

## Run the agent
```bash
pnpm install
pnpm --filter @job-assistant/agent start
```

## Load the extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `apps/extension`

## Safety model
- Human-in-the-loop field prompting for required unknown values
- Pause/resume via `need_field` → `field.provide`
- **No autosubmit**: runner stops at `READY_TO_SUBMIT` and never clicks submit-like controls

## Local data (SQLite)
- DB path: `app.getPath('userData')/job-assistant.sqlite`
- Stores:
  - `profile` (autofill profile)
  - `custom_values` (signature-hash keyed answers)

## Clear saved answers
- Through API:
  - List: `{"type":"custom_values.list"}`
  - Delete one: `{"type":"custom_values.delete","signatureHash":"..."}`
- Or delete rows from `custom_values` in `job-assistant.sqlite`

## Repo layout
- `apps/agent` – Electron + local API + runner
- `apps/extension` – MV3 extension UI
- `packages/shared` – schemas, types, message protocol
