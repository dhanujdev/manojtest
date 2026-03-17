# JobApplyBot Spec Constitution

## Core Principles

### I. Safety Before Automation
The assistant exists to reduce manual work without removing user control. The system MUST never submit an application silently, MUST stop on CAPTCHA/2FA, and MUST require explicit user confirmation for any submit action. If safety and speed conflict, safety wins.

### II. Deterministic Behavior Only
Automation MUST use deterministic selectors and explicit allowlists. No fuzzy matching, heuristic selector healing, or hidden retries that change intent. Failures MUST be surfaced with actionable errors rather than guessed behavior.

### III. Local-First Privacy
Sensitive user data remains local by default. The API binds to localhost only and requires a shared secret between extension and agent. Password storage for job sites is prohibited. Any optional telemetry or crash reporting MUST be opt-in and privacy-redacted.

### IV. Contract-Driven Architecture
Extension, agent, runner, and adapters communicate through a versioned protocol with runtime validation. Schema changes MUST be explicit, reviewed, and backward-compatible where possible. If compatibility cannot be preserved, a migration path is required before merge.

### V. Testable Quality Gates
No feature is complete without tests and docs. Every merged feature MUST include unit/integration coverage for new behavior, with explicit tests for submit guard and protocol validation where applicable. CI gates (lint, typecheck, test, build) are mandatory for release readiness.

## Security and Reliability Requirements

- Local API MUST bind to `127.0.0.1` and reject non-local access.
- Shared secret (or equivalent CSRF defense) is required for extension-agent requests.
- Submit guard is mandatory and treated as a critical control; regressions block release.
- Artifacts (screenshots, logs, snapshots) are stored locally and handled as sensitive data.
- Job execution is state-machine driven with bounded retries and explicit terminal states.
- Any production encryption-at-rest implementation MUST use platform key management on macOS.

## Development Workflow and Review Standards

- Work follows Spec-Kit flow: `/speckit.specify` -> `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement`.
- Specs define WHAT and WHY; plans/tasks define HOW; implementation must trace back to approved requirements.
- Pull requests must include: scope statement, risks, test evidence, and notes on safety/privacy impact.
- Changes that affect protocol, data schema, or submit behavior require focused reviewer attention and migration notes.
- Release artifacts require passing CI, updated README, and updated `VALIDATION.md` scenarios.

## Governance

This constitution is the default decision authority for this repository. Any conflict between ad hoc implementation choices and this constitution is resolved in favor of this constitution.

Amendments require:
- A documented rationale and impacted areas.
- Version bump according to semantic intent (major for breaking governance changes, minor for new principles/sections, patch for clarifications).
- Updated templates/checklists where relevant.

Compliance checks:
- Every plan and PR must explicitly confirm alignment with all five core principles.
- Exceptions are temporary, documented, and approved with a rollback/remediation plan.

**Version**: 1.0.0 | **Ratified**: 2026-03-02 | **Last Amended**: 2026-03-02
