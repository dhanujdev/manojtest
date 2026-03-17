Below is a **production-grade, end-to-end project plan/spec** you can paste into Codex (or any coding agent) to get a “100% build” in one shot. It maps **all features**, defines **architecture**, **APIs**, **data model**, **security**, **testing**, and **release packaging**. It assumes your current direction:

* **Option 1 Local-first:** MV3 Extension ⇄ **macOS Electron tray agent** ⇄ Playwright headed
* **Adapters:** Greenhouse + Lever
* **Human-in-the-loop** (pause/resume)
* **No auto-submit by default** + strict submit guard
* **Local SQLite** persistence
* **Production-grade quality** (signing, updater, crash reporting, tests, CI)

---

## MASTER SPEC: Job Application Smart Assistant (Production Grade)

### Goal

Build a **local-first job application assistant** that:

1. Accepts job links (capture current tab, paste, file import)
2. Opens job apply pages in a **headed Playwright browser** using a persistent profile
3. Extracts application fields and fills them using user profile + learned answers
4. Pauses for missing required data and prompts user via extension UI
5. Stores new answers locally (opt-in per answer) and reuses them later
6. Stops at a safe **READY_TO_SUBMIT** state, shows a structured review, and only submits when user explicitly approves (optional feature flag)

### Constraints (Hard Rules)

* **No fuzzy selector healing.** Deterministic selectors only.
* **Never bypass CAPTCHA/2FA.** If detected → pause and ask user.
* **No password storage for job sites.** Use persistent browser context cookies instead.
* **No silent submissions.** Default: never click Submit; submission requires explicit user action.
* **Protocol stability.** Use versioned message protocol with runtime validation.
* **Keep sensitive data local by default.** Cloud sync (if any) is phase 2+ and opt-in.

---

## END PRODUCT COMPONENTS

### 1) Browser Extension (Chrome MV3, React TS)

**Features**

* Capture job URL from current tab
* Paste list of URLs (bulk capture)
* Import URLs from PDF/DOCX/text file (extract hyperlinks + plain URLs)
* Start application run for a captured job
* Live status updates (SSE/WS from local agent)
* Render:

  * fields_ready list
  * need_field modal with input control based on field type
  * “Save answer for future” checkbox
  * Review screen at READY_TO_SUBMIT:

    * Company, Title, URL
    * Adapter name
    * “Final step detected” indicator
    * Filled fields summary (truncate long values)
* Profile editor (local): first name, last name, email, phone, linkedin, etc.
* Saved answers manager: list + delete

**UI/UX**

* Clear states: disconnected agent / running / paused / ready-to-submit / failed
* Minimal friction: “one click apply assist”
* Accessibility: keyboard nav + screenreader-friendly controls

### 2) Local Agent (Electron tray app, macOS)

**Features**

* Tray icon with states:

  * Agent running
  * Runner active
  * Paused waiting for input
  * Error
* Local API server on localhost (Fastify)
* SSE endpoint streaming job events
* Launch/close Playwright persistent context
* SQLite persistence (profile, custom_values, applications history, artifacts metadata)
* Maintain job queue + job lifecycle state machine
* Collect and store:

  * screenshots per step
  * HTML snapshot on READY_TO_SUBMIT
  * logs (local only)
* Strict submit guard enforcement

### 3) Automation Runner (Playwright headed)

**Features**

* Persistent browser context stored in Electron userData path
* Portal adapter selection by URL
* Deterministic field extraction & fill
* Multi-step flow support
* Pause/resume via promise resolver map
* Never click submit (unless explicit “confirm submit” command is added and user confirms)

### 4) Portal Adapters (Production-grade)

Implement adapters as isolated modules implementing `PortalAdapter` interface.

**Adapters in v1**

* GreenhouseAdapter (boards.greenhouse.io + job-boards.greenhouse.io)
* LeverAdapter (jobs.lever.co / lever.co)

**Must-have adapter behaviors**

* Form root targeting with deterministic fallbacks
* Field extraction producing normalized `Field[]`
* Consolidation:

  * same-name radios → one logical radio field w/options
  * checkbox groups by fieldset or same-name → one logical checkbox field w/options
* Fill strategy:

  1. profile deterministic match
  2. custom_values signatureHash lookup
  3. need_field pause prompt
* Multi-step navigation:

  * deterministic Next allowlist: Next, Continue, Review, Save and Continue
  * strict MAX_STEPS safeguard (10)
* Submit detection:

  * deterministic exact label patterns: Submit, Submit Application, Apply, Send Application
  * NEVER click submit by default
  * runtime guard: if any click attempts submit-labeled button → fail job

---

## DATA MODEL (SQLite, production-grade)

### Tables

**profile**

* id TEXT PK (use “default” in v1)
* data TEXT NOT NULL (JSON, encrypt later)
* updated_at INTEGER

**custom_values** (signatureHash memory)

* signature_hash TEXT PK
* value TEXT NOT NULL (JSON)
* updated_at INTEGER

**applications** (history)

* id TEXT PK (uuid)
* url TEXT NOT NULL
* portal_type TEXT NOT NULL
* adapter_name TEXT
* company TEXT
* title TEXT
* status TEXT NOT NULL
* created_at INTEGER
* updated_at INTEGER
* last_error TEXT nullable

**artifacts**

* id TEXT PK
* application_id TEXT FK(applications.id)
* kind TEXT (SCREENSHOT | HTML_SNAPSHOT | LOG)
* path TEXT
* created_at INTEGER

**migrations**

* id INTEGER PK AUTOINCREMENT
* name TEXT
* applied_at INTEGER

> Note: Keep schema migration-ready.

---

## MESSAGE PROTOCOL (Extension ⇄ Agent)

Use JSON messages via POST `/api` and SSE `/events/:jobId`. Validate with Zod.

### Commands (POST /api)

* `job.capture { url, source } -> { jobId }`
* `job.start { jobId } -> { ok }`
* `field.provide { jobId, requestId, value, save?: boolean } -> { ok }`
* `profile.get -> { ok, data|null }`
* `profile.set { data } -> { ok }`
* `custom_values.list -> { ok, items[] }`
* `custom_values.delete { signatureHash } -> { ok }`
* `job.summary { jobId } -> { ok, summary|null }`

### SSE Events

* `status { state, portalType, adapterName?, message?, fieldsCount?, error? }`
* `fields_ready { jobId, fields: Field[] }`
* `need_field { jobId, requestId, field: Field, reason }`

### Normalized Field Shape

```
Field = {
  label: string
  inputType: "text"|"email"|"tel"|"number"|"date"|"select"|"radio"|"checkbox"|"file"|"textarea"
  required: boolean
  options?: string[]   // select/radio/checkbox groups (max 50)
  signatureHash: string
}
```

---

## FIELD SIGNATURE HASH SPEC

SHA-256 over normalized JSON:

* normalized label (lowercase, trim, collapse whitespace, strip punctuation)
* inputType
* name/id if available (optional)
* section header / legend (optional)
* sorted options (if any, limit 50)

This hash must be stable across runs.

---

## SECURITY & PRIVACY (Production Requirements)

* Localhost API only: bind to `127.0.0.1`, reject non-local connections
* Use CSRF token or shared secret between extension and agent:

  * Agent generates secret on first run, stored in userData
  * Extension includes it in headers for every request
* Encrypt sensitive profile/custom_values at rest:

  * Phase 1: optional (cleartext acceptable for dev)
  * Production: AES-GCM with key stored in macOS Keychain
* Never store portal passwords
* Never attempt captcha solving
* Audit logging:

  * local only, redact PII in logs where possible

---

## PRODUCTION HARDENING REQUIREMENTS

### Reliability

* Auto-retry safe operations (navigation waits, element presence) with bounded attempts
* Capture screenshot before/after each step & on failure
* Always fail loudly on selector mismatch, never guess

### Observability

* Local logs with timestamps and jobId
* Crash reporting (Sentry or similar) in agent only (opt-in), redact URLs if needed
* Event timeline accessible via UI (optional)

### Performance

* Avoid re-extraction loops; only re-extract on navigation step change
* Limit DOM scanning to form root
* Avoid heavy polling; SSE only

---

## TESTING REQUIREMENTS (Must ship with)

### Unit tests

* signatureHash stability tests
* field normalization tests
* radio/checkbox grouping tests
* submit guard tests (ensures submit click throws)
* protocol validation tests (Zod schemas)

### Integration tests (local)

* mock HTML pages for greenhouse/lever forms in repo
* Playwright tests run against local mock servers
* verify fields_ready/need_field/READY_TO_SUBMIT behavior

### Manual validation

* Maintain `VALIDATION.md` test matrix
* Provide instructions to validate on real job links
* Record pass/fail results

---

## CI/CD & RELEASE (macOS)

### Repo requirements

* Monorepo with pnpm + turbo
* scripts:

  * `lint` (eslint)
  * `typecheck` (tsc)
  * `test` (vitest/jest)
  * `format` (prettier)
  * `build` (extension + agent)
* GitHub Actions pipeline:

  * lint → typecheck → unit tests → build artifacts
* Electron packaging:

  * notarized signed build for macOS
  * auto-updater (electron-updater) pointed to GitHub releases or S3
* Extension packaging:

  * build to `dist/`, zip for upload to Chrome Web Store later

---

## FEATURE COMPLETE CHECKLIST (Definition of “100%”)

### Core flow

* [ ] capture URL from tab
* [ ] start run
* [ ] adapter selected correctly
* [ ] fields_ready emitted
* [ ] autofill from profile
* [ ] autofill from saved custom_values
* [ ] need_field pause/resume
* [ ] multi-step works
* [ ] strict submit guard prevents submit
* [ ] READY_TO_SUBMIT only when submit visible
* [ ] review screen shows summary + finalStepDetected
* [ ] user can manage saved answers
* [ ] profile persists across restarts

### Production quality

* [ ] localhost API secured with secret token
* [ ] encryption at rest for profile/custom_values (Keychain)
* [ ] crash reporting (opt-in)
* [ ] packaging + signing + notarization
* [ ] CI pipeline working
* [ ] README fully updated
* [ ] VALIDATION.md completed with real links

---

## IMPLEMENTATION ORDER (One-shot build plan)

Codex should implement in this order to avoid rework:

1. Confirm monorepo structure + build scripts
2. Protocol definitions + Zod validation package
3. Agent server + SSE + secret token auth
4. SQLite schema + migrations + storage services
5. Runner core + job state machine + artifacts capture
6. Adapter interface + registry
7. GreenhouseAdapter production logic
8. LeverAdapter production logic
9. Extension UI:

   * capture/start
   * profile editor
   * saved answers manager
   * need_field modal
   * fields_ready list
   * review screen with adapterName + finalStepDetected
10. Tests:

    * unit + integration with mock forms
11. Packaging:

    * electron builder config
    * signing/notarization docs
    * extension build zip
12. Docs:

    * README
    * VALIDATION.md instructions
13. Final pass:

    * run local smoke tests
    * ensure no protocol drift
    * ensure submit guard cannot be bypassed

---

## OPTIONAL (Phase 2+) — Not in v1

* Cloud dashboard sync
* Multi-device
* LLM-based suggestions
* Generic adapter for unknown portals
* Bulk apply queueing
* Confirm & Submit command (explicit user approval)

---

## OUTPUT EXPECTATIONS FOR CODEX

Codex must return:

1. Full code changes implementing everything above
2. Updated README and VALIDATION.md
3. Scripts and CI config
4. Packaging instructions + configs
5. A “How to run end-to-end” section with exact commands
6. A list of known limitations

---

If you want, tell me which coding agent you mean by “Codex app” (OpenAI Codex CLI? a specific tool?), and I’ll format this spec exactly in the style that tool expects (some want a single `TASK.md`, some prefer JSON+files).
