Use this as the feature description for `/speckit.specify`.

Build a local-first Job Application Smart Assistant for macOS with these product outcomes and strict safety rules.

Outcome
- User captures one or many job links from a Chrome MV3 extension.
- Local Electron tray agent runs automation in headed Playwright with persistent browser profile.
- System extracts application fields, autofills from profile + learned answers, pauses for missing required data, resumes after user input.
- System reaches READY_TO_SUBMIT with a structured review; by default it never clicks Submit.

Hard constraints
- Deterministic selectors only, no fuzzy healing.
- Never bypass CAPTCHA or 2FA; pause and request user action.
- Never store site passwords.
- No silent submission; submit requires explicit user confirmation command and feature flag.
- Keep sensitive data local by default.

Core components (v1)
- Chrome MV3 extension (React + TypeScript): capture URL(s), import URL list from text/PDF/DOCX, start run, live status, need_field modal with save-for-future, profile editor, saved answers manager, READY_TO_SUBMIT review screen.
- Local agent (Electron tray app, macOS): localhost API, SSE events, queue/state machine, SQLite persistence, screenshots/html/log artifacts, strict submit guard.
- Automation runner (Playwright headed): persistent context, adapter selection by URL, deterministic extraction/fill, multi-step flow (max 10), pause/resume.
- Adapters: Greenhouse + Lever with normalized field extraction and deterministic multi-step behavior.

Data + protocol requirements
- SQLite tables: profile, custom_values, applications, artifacts, migrations.
- Protocol is versioned and runtime-validated with Zod.
- Commands: job.capture, job.start, field.provide, profile.get/set, custom_values.list/delete, job.summary.
- SSE events: status, fields_ready, need_field.
- Field shape includes label, inputType, required, options, signatureHash.
- signatureHash uses SHA-256 on normalized field identity and stable option ordering.

Security + production requirements
- Bind API to 127.0.0.1 only.
- Use extension<->agent shared secret or CSRF token.
- Production path includes encryption at rest for profile/custom values via macOS Keychain-managed key.
- Local logs with PII redaction where possible.
- Optional opt-in crash reporting for agent.

Quality requirements
- Unit tests: signature hash stability, field normalization, group consolidation, submit guard, protocol schema validation.
- Integration tests: local mock Greenhouse/Lever pages with Playwright.
- CI: lint, typecheck, tests, build.
- Packaging: signed/notarized Electron build for macOS, extension build artifact zip.
- Documentation: README and VALIDATION.md with a manual real-link validation matrix.

Definition of done
- End-to-end flow from URL capture to READY_TO_SUBMIT works with pause/resume.
- Saved answers are reusable and manageable.
- Submit guard is impossible to bypass in normal flow.
- Production hardening and release pipeline are documented and runnable.

Planning defaults to reduce ambiguity
- v1 is local-first only, no cloud sync.
- No generic adapter for unknown portals in v1.
- No auto-submit in v1; explicit submit command is out of scope unless behind a disabled-by-default feature flag.
- Prioritize reliability and safety over speed.
