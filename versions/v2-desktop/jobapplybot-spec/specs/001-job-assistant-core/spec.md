# Feature Specification: Job Application Smart Assistant Core

**Feature Branch**: `001-job-assistant-core`  
**Created**: 2026-03-02  
**Status**: Draft  
**Input**: User description: "Build a local-first job application assistant with a Chrome MV3 extension, macOS Electron tray agent, headed Playwright runner, Greenhouse and Lever adapters, human-in-the-loop pause/resume, local SQLite persistence, and a strict no-silent-submit safety model."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guided Autofill to Review State (Priority: P1)

A user captures a supported job application URL and starts an assisted run. The system opens the job form in a headed browser, extracts fillable fields, autofills any deterministic matches from the local profile and previously saved answers, pauses for missing required inputs, and stops at a safe review state before any submission occurs.

**Why this priority**: This is the core value proposition. If this flow does not work reliably, the product does not meaningfully reduce application friction.

**Independent Test**: Can be fully tested by starting a run on a supported Greenhouse or Lever mock form, providing any missing answers, and confirming the system reaches `READY_TO_SUBMIT` without clicking a submit action.

**Acceptance Scenarios**:

1. **Given** the user has saved profile data and captures a supported application URL, **When** they start the run, **Then** the runner opens the form in a headed persistent browser, extracts normalized fields, and emits `fields_ready`.
2. **Given** a required field cannot be filled from profile or saved answers, **When** the runner reaches that field, **Then** the system pauses and emits `need_field` with the normalized field definition and a request id.
3. **Given** the user supplies all required missing inputs, **When** the final application step is reached and a submit control is detectable, **Then** the system stops at `READY_TO_SUBMIT` and presents a structured review instead of submitting.

---

### User Story 2 - Reusable Saved Answers (Priority: P2)

A user can choose to save answers they manually provide for recurring questions so future supported applications can reuse those values automatically using a stable field signature hash.

**Why this priority**: Reusability compounds the product’s value over time and reduces repeat manual entry across multiple applications.

**Independent Test**: Can be fully tested by providing a missing answer with save enabled on one run, then starting a second run with the same normalized field signature and verifying the value autofills without another prompt.

**Acceptance Scenarios**:

1. **Given** the system pauses for a missing field, **When** the user submits a value with "save for future" enabled, **Then** the value is stored locally against that field’s signature hash.
2. **Given** a later application exposes a field with the same signature hash, **When** the runner evaluates fill sources, **Then** it uses the saved answer before prompting the user again.
3. **Given** the user opens saved answers management, **When** they delete a saved answer, **Then** that signature hash is removed and is no longer used for future autofill.

---

### User Story 3 - Safe Human-Controlled Execution (Priority: P3)

A user remains in control throughout automation. The system must stop on unsafe or unsupported conditions such as CAPTCHA, 2FA, unsupported portals, selector mismatches, or any action that would otherwise trigger submission without explicit user approval.

**Why this priority**: Safety controls are mandatory for trust, compliance with project governance, and avoiding damaging behavior during job applications.

**Independent Test**: Can be fully tested by running against mocked pages that include CAPTCHA, submit controls, or unsupported layouts and verifying the system pauses or fails loudly without guessing or submitting.

**Acceptance Scenarios**:

1. **Given** a page presents CAPTCHA or 2FA, **When** the runner detects it, **Then** automation pauses and the user is instructed to intervene manually.
2. **Given** the runner is about to click a control whose label matches submit patterns, **When** submit guard evaluates the action, **Then** the action is blocked and the job fails or pauses rather than submitting.
3. **Given** the URL is not supported by any registered adapter, **When** the user starts a run, **Then** the job enters a failed state with a clear unsupported-portal error.

---

### User Story 4 - Local Profile and Application History (Priority: P4)

A user can maintain a local profile and review past runs, including statuses and locally stored artifacts, without sending data to external services by default.

**Why this priority**: The system needs persistent state to be useful across sessions, but it must preserve local-first privacy guarantees.

**Independent Test**: Can be fully tested by saving profile data, running an application, restarting the agent, and confirming the profile, application history, and artifacts remain available locally.

**Acceptance Scenarios**:

1. **Given** the user saves profile data, **When** they later request the profile, **Then** the same data is returned from local storage.
2. **Given** a run completes, pauses, or fails, **When** the job state changes, **Then** the application history is updated with current status, timestamps, and any terminal error.
3. **Given** the runner advances through steps, **When** screenshots or HTML snapshots are captured, **Then** artifact metadata is recorded and linked to the application locally.

---

### Edge Cases

- What happens when a required field is hidden until another field is selected on the same page?
- What happens when a multi-step form loops back to a previously visited step?
- How does the system handle duplicate radio or checkbox inputs that must be consolidated into one logical field?
- How does the system handle file upload fields that require user-provided documents not available in the local profile?
- How does the system handle a saved answer whose prior format is no longer compatible with the rendered field options?
- How does the system handle local agent disconnects while the extension is subscribed to job events?
- What happens when a portal DOM changes and deterministic selectors no longer match expected elements?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Chrome MV3 extension that can capture a job URL from the current tab, accept pasted URLs, and support importing URLs from text, PDF, or DOCX sources.
- **FR-002**: The system MUST provide a local macOS agent that exposes a localhost-only API bound to `127.0.0.1` for extension communication.
- **FR-003**: The system MUST require a shared secret or equivalent request authentication mechanism between the extension and the local agent for every command request.
- **FR-004**: The system MUST implement versioned JSON command and event contracts validated at runtime.
- **FR-005**: The system MUST support starting an application run from a captured job entry and return a stable job identifier.
- **FR-006**: The system MUST run automation in a headed Playwright browser using a persistent browser context stored locally.
- **FR-007**: The system MUST select a portal adapter deterministically based on the application URL.
- **FR-008**: The system MUST support Greenhouse application flows on `boards.greenhouse.io` and `job-boards.greenhouse.io`.
- **FR-009**: The system MUST support Lever application flows on `jobs.lever.co` and supported `lever.co` application pages.
- **FR-010**: The system MUST reject unsupported portals with a clear terminal error and MUST NOT attempt generic fallback automation in v1.
- **FR-011**: The system MUST extract fillable form fields into a normalized `Field` shape containing `label`, `inputType`, `required`, optional `options`, and `signatureHash`.
- **FR-012**: The system MUST compute `signatureHash` from stable normalized field attributes so the same logical question produces the same hash across runs.
- **FR-013**: The system MUST consolidate same-name radio inputs into one logical radio field and same-group checkbox inputs into one logical checkbox field.
- **FR-014**: The system MUST attempt field fill in this order: deterministic profile match, saved custom value by signature hash, then explicit user prompt.
- **FR-015**: The system MUST pause the job and emit a `need_field` event whenever a required field lacks a deterministic fill value.
- **FR-016**: The system MUST allow the user to provide a value for a pending field request and resume the paused run.
- **FR-017**: The system MUST allow the user to opt in to saving a manually provided value for reuse on future matching signature hashes.
- **FR-018**: The system MUST persist saved answers locally and allow listing and deletion of saved answers from the extension UI.
- **FR-019**: The system MUST support multi-step application flows with deterministic next-step controls limited to an explicit allowlist such as `Next`, `Continue`, `Review`, and `Save and Continue`.
- **FR-020**: The system MUST enforce a bounded maximum step count of 10 and fail loudly if that bound is exceeded.
- **FR-021**: The system MUST detect submit-capable controls using deterministic label matching.
- **FR-022**: The system MUST stop at a `READY_TO_SUBMIT` state once the final step is reached and a submit action is available, without clicking submit by default.
- **FR-023**: The system MUST block any automated action that would click a submit-labeled control unless an explicit future submit-confirmation capability is introduced and user-approved.
- **FR-024**: The system MUST never submit an application silently.
- **FR-025**: The system MUST never attempt to bypass CAPTCHA or 2FA and MUST pause when either is detected.
- **FR-026**: The system MUST never store job site passwords and MUST rely on the persistent browser context for session continuity.
- **FR-027**: The system MUST store profile data locally and allow the extension UI to get and update the active profile.
- **FR-028**: The system MUST persist application history locally, including URL, portal type, adapter name, company, title, job status, timestamps, and last error.
- **FR-029**: The system MUST capture artifacts locally, including screenshots before or after steps and HTML snapshots at `READY_TO_SUBMIT` or on failure.
- **FR-030**: The system MUST expose live job state updates to the extension through server-sent events for status, fields ready, and need-field prompts.
- **FR-031**: The extension MUST display distinct UI states for disconnected, running, paused, ready-to-submit, and failed jobs.
- **FR-032**: The extension MUST provide a review screen showing the company, title, URL, adapter name, final-step detection, and a summary of filled fields when a job reaches `READY_TO_SUBMIT`.
- **FR-033**: The system MUST fail loudly on selector mismatch or unsupported DOM conditions and MUST NOT guess alternative selectors via fuzzy matching or self-healing logic.
- **FR-034**: The system MUST record local logs with timestamps and job identifiers and should redact sensitive values where feasible.
- **FR-035**: The system MUST be designed to support schema migrations for persisted local data.
- **FR-036**: The system MUST ship with unit tests for signature hashing, field normalization, field grouping, submit guard, and protocol validation.
- **FR-037**: The system MUST ship with local integration tests using mock Greenhouse and Lever forms to validate the pause/resume and `READY_TO_SUBMIT` flows.
- **FR-038**: The system MUST provide build, lint, typecheck, test, and formatting scripts for the monorepo.
- **FR-039**: The system MUST provide CI that runs linting, type checks, unit tests, and build verification before release.
- **FR-040**: The system MUST document manual validation steps for testing against real job links.

### Key Entities *(include if feature involves data)*

- **Profile**: The local user identity and reusable personal data used for deterministic autofill, including common fields such as name, email, phone, and LinkedIn URL.
- **Custom Value**: A saved answer keyed by a field signature hash for future reuse on matching questions.
- **Application Job**: A locally tracked application run with URL, portal type, adapter, company/title metadata, lifecycle state, and error information.
- **Artifact**: A locally stored screenshot, HTML snapshot, or log entry associated with an application job.
- **Field**: A normalized representation of a logical form field used across adapters and extension-agent communication.
- **Field Request**: A pending prompt for user input tied to a job id, request id, and normalized field.
- **Portal Adapter**: A deterministic automation module that knows how to detect, extract, and progress through a supported portal’s form flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For supported Greenhouse and Lever mock forms, 95% or more of test runs reach either `READY_TO_SUBMIT` or an intentional safety pause/fail state without unhandled exceptions.
- **SC-002**: The system performs zero automated submit clicks in the default configuration across all automated test and manual validation scenarios.
- **SC-003**: On repeat runs containing previously saved answers with matching signature hashes, at least 80% of repeated prompts are autofilled without additional user input in validation scenarios.
- **SC-004**: Users can complete the capture-to-review flow for a supported mock application in under 3 minutes when required profile data is already present.
- **SC-005**: CI passes lint, typecheck, unit tests, and build verification for every release candidate.
- **SC-006**: All persisted job data, saved answers, and artifacts remain stored locally by default, with no required external service dependency for core v1 functionality.
