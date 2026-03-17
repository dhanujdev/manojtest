# Validation

This is the manual smoke-test checklist for the current MVP scaffold.

## Prerequisites

```bash
pnpm install
pnpm build
pnpm dev:agent
```

Keep the agent terminal open. It prints the shared secret required by the extension.
The default agent configuration launches a real persistent Chrome session through Playwright.

## Load the Extension

1. Run `pnpm --filter @jobapplybot/extension build`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click "Load unpacked" and choose `apps/extension/dist`.
5. Enable "Allow access to file URLs" for the JobApplyBot extension so it can capture the local mock pages.

## Smoke Test: Greenhouse

1. Open `tests/integration/mocks/greenhouse.html` in Chrome.
2. Open the JobApplyBot extension popup.
3. Paste the shared secret from the agent into the popup.
4. Click `Use Current Tab`.
5. Save a profile with full name and email only.
6. Click `Start Run`.
7. Expected result:
   - A job id is created.
   - Status changes to `paused`.
   - A missing field prompt appears for the required "Why are you interested in this role?" field.
8. Enter a value, optionally enable "Save this answer for future reuse", then click `Resume Run`.
9. Expected result:
   - Status changes to `ready_to_submit`.
   - The summary JSON shows `finalStepDetected: true`.
   - No submit action is executed.

## Smoke Test: Lever

1. Open `tests/integration/mocks/lever.html` in Chrome.
2. Use the popup to capture the current tab and start a run.
3. If phone is missing from the profile, expected result:
   - The job pauses for the required `Phone` field.
4. Provide the missing value and resume.
5. Expected result:
   - The job reaches `ready_to_submit`.
   - The summary includes adapter name `LeverAdapter`.

## Saved Answer Reuse

1. Run the same Greenhouse flow again after saving the "Why are you interested in this role?" answer.
2. Expected result:
   - The job should skip the previous question if the same field signature hash is encountered.
   - The job should move directly to `ready_to_submit` when no other required fields are missing.

## Failure Checks

1. Try an unsupported URL such as `https://example.com`.
2. Expected result:
   - The job fails with an unsupported portal error.

## Notes

- The current runner uses a real Playwright browser session and fills supported inputs directly on the page.
- Artifacts are written under `.local/artifacts/` and indexed in the local SQLite database.
- Electron packaging is still the next major upgrade.
