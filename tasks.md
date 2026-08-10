# Tasks — Sabha Mandal Attendance & Event Registration System

Phase-wise task list derived from the [PRD](attendance-system-prd.md) and [BRD](attendance-system-brd.md) (BRD §12 delivery phases). Status reflects the current codebase: `[x]` done in the Phase 1 MVP, `[ ]` pending.

---

## Phase 0 — Discovery and data definition ✅

Completed 2026-08-10 — decisions recorded in [phase-0-decisions.md](phase-0-decisions.md).

- [x] Terminology and hierarchy confirmed: BRD glossary adopted; group stored as one combined "Mandal-Sabha" field (D1)
- [x] Excel template confirmed: five columns; "Guardian Contact Details" = guardian's contact (D2)
- [x] Identity/matching strategy: phone number is the unique key; no-phone records go to manual review (D3)
- [x] Mandatory registration fields: Name + Phone + Sabha; karyakar and guardian optional (D6)
- [x] Roles/permissions boundaries confirmed as current defaults (D4)
- [x] Public-link policy: public with mandatory review, no auto-approval; retention: keep until removal requested (D5, D7)
- [x] Reporting requirements: present/absent list, new registrations list, sabha-wise attendance summary (D8)
- [x] Ownership: single administrator is both data owner and operator (D9)
- [ ] Open: expected volumes (records/users/events) — needed before backend/hosting choices

## Phase 1 — Core operational MVP

### Done (prototype level)

- [x] Login screen with role-based access (Admin, Coordinator, Attendance Volunteer, Registration Volunteer) and role-filtered navigation
- [x] Excel/CSV import with column mapping, auto header matching, preview, and inserted/updated/rejected counts (upsert keyed on phone)
- [x] Participant search with ranked exact/tolerant matching showing multiple candidates
- [x] Event management: create/edit events with date, time, sabha scope, and Draft/Active/Closed status
- [x] Mobile-friendly attendance desk with swipe-to-present interaction
- [x] Duplicate attendance protection (one present record per participant per event) and undo/correction with audit entry
- [x] Attendance records capture event, participant, status, timestamp, and acting user
- [x] Internal new-participant registration; registration during an active event marks the person present
- [x] Shared public registration link per event with reference code and pending-review queue; link rejects submissions once the event is Closed
- [x] Reports with event/sabha filters, present/absent detail rows and totals, and Excel export (SheetJS)
- [x] Pending-registration approval queue (approve / link to existing / reject)
- [x] Audit log for imports, attendance actions, registrations, and admin changes
- [x] Admin settings: manage sabha/karyakar dropdown values, wipe database, factory reset

### Completed 2026-08-10 (client-side hardening)

- [x] **Automatic event closing** — events auto-close past their end date/time: a persisted sweep on load (with audit entry) plus an effective-status guard on all attendance/registration actions and shared links (`getEffectiveStatus`/`isEventExpired` in `DbContext.jsx`); expired events cannot be reopened
- [x] **Stable internal IDs** — participant/event IDs come from a persisted monotonic sequence (`ams_seq_*` keys) seeded from the max existing ID, so deletions never cause reuse (PRD FR-1)
- [x] **Pre-import duplicate/ambiguity detection** — the import preview analyzes all rows and classifies each as new / update / unchanged / duplicate-in-file / review / rejected before import; the import summary reports the same six counts (PRD FR-1)
- [x] **Sabha-wise attendance summary report** — new Reports tab with per-sabha attendance % across non-Draft events, exportable to Excel (decision D8)
- [x] **No-phone review routing** — imports and registrations without a phone number are created flagged `pendingReview` instead of auto-created/rejected (decision D3)
- [x] **Registration reference for internal desk** — internal registrations now show a persistent, copyable reference receipt (PRD FR-4)
- [x] **Explicit attendance confirmation on registration** — `registerNewParticipant` no longer auto-marks attendance; the internal desk marks present only via the explicit checkbox, and the public shared form never creates attendance (PRD FR-4, Journey B)
- [x] **Guardian contact visibility** — guardian details are masked as "Restricted" for Attendance Volunteers in reports, exports, and the review queue (`canViewGuardianDetails` in `AuthContext.jsx`)
- [x] **Permission fixes** — Admin-only nav items (Excel Import, Admin Control) no longer leak to other roles (`hasPermission` Admin fall-through bug), and the active view resets on user switch so a lower-privileged login can't inherit the previous user's screen
- ~~Protected registration links~~ — dropped per Phase 0 decision D5: links stay public with mandatory review; auto-expiry at event end is covered above

### Backend phase — implemented 2026-08-11 (Supabase; decisions: Supabase / small scale / Vercel)

- [x] **Backend / persistent database** — dual-mode data layer: with Supabase env vars configured the app loads from Postgres, writes through on every change (`src/lib/cloudSync.js`), caches locally for offline resilience, and refreshes via realtime subscriptions; without them it runs as the original localStorage sandbox. Schema + seed in `supabase/schema.sql`.
- [x] **Real authentication** (cloud mode) — Supabase email/password login, forgot-password email flow with in-app password reset, roles/enabled flags in a `profiles` table auto-created per account; disabled profiles are signed out. Sandbox mode keeps mock logins.
- [x] **Server-side permission enforcement** — row-level security policies mirror the D4 matrix independently of the UI (public form: insert-pending-only, no registry reads; imports/settings: Admin; corrections/reviews: Coordinator+).
- [x] **Audit immutability** — `audit_logs` has insert-only policies; nobody can update or delete rows server-side.
- [x] **Sandbox → cloud migration** — pre-cloud data is snapshotted automatically and uploadable from Admin Control ("Upload sandbox data to cloud").
- [x] Setup + Vercel deployment guide: `SETUP-BACKEND.md`

### Remaining (requires the user's Supabase/Vercel accounts)

- [ ] Create the Supabase project, run `supabase/schema.sql`, create the admin account, and fill `.env.local` (steps 1–4 of SETUP-BACKEND.md)
- [ ] Enable realtime replication on the six tables (step 6)
- [ ] Deploy to Vercel with the env vars and set the Supabase Site URL (step 7)
- [ ] End-to-end cloud testing once credentials exist (login, sync between two devices, RLS denials, password reset)

## Phase 2 — Registration and governance hardening

### Completed 2026-08-10 (client-side)

- [x] Approval queue hardening — participants now carry an explicit lifecycle `status` (`approved` / `pending` / `rejected` / `linked` / `archived`) with dedicated actions in `DbContext.jsx`; the `[REJECTED]` name-prefix and `LINKED-` ID-rewrite workarounds are gone, and legacy records auto-migrate on load
- [x] Match-before-create enforcement — internal registration surfaces potential matches (active records only) and requires an explicit choice; the review queue shows master-record matches before approval (BRD business rule)
- [x] Deduplication/merge tools — new "Data Quality" tab in Reports detects active participants sharing a phone or exact name and merges them: attendance history moves to the kept record (duplicate marks dropped), empty fields fill in, and the duplicate is retained as a linked reference
- [x] Participant archive/removal workflow — archive action (search + confirm) removes a person from all rosters while retaining history; exception records (rejected/linked/archived) are listed with a "Restore to Review" action (decision D7)
- [x] Stronger role controls — user management in Admin Control (create accounts, assign roles, disable/enable with last-admin and self-disable guards; disabled accounts cannot log in), plus per-action permission guards on all DbContext mutations per the D4 matrix (import = Admin; events, corrections, reviews, merges = Coordinator+; direct registration = Registration Volunteer+); attendance undo is now hidden from plain volunteers
- [x] Audit history improvements — text search, action-type filter, and Excel export on the audit logbook
- [x] Improved exports — "Export Full Report" produces one workbook with Attendance Roster, Sabha Summary, and Pending Registrations sheets
- [x] Shared-form field policy — public form captures only the approved minimal set and always routes to review, never auto-approval (decision D5); satisfied by Phase 1 + status model
- [x] Coordinator exception/escalation workflow — covered by the review queue (uncertain matches surfaced with link/approve/reject) and the Data Quality exception list

### Pending (needs backend)

- [ ] Server-side enforcement of permissions and audit immutability once a backend exists (client-side guards can be bypassed by editing localStorage)
- [ ] Audit retention policy (define how long logs are kept — ties into the backend/volume decision)

## Phase 3 — Event-day optimization

### Completed 2026-08-10 (client-side)

- [x] Offline capability — installable PWA: `public/manifest.webmanifest` + `public/sw.js` (network-first navigations with cached-shell fallback, stale-while-revalidate assets); registered in production builds only so dev HMR is unaffected. Confirmed as a need by the user.
- [x] QR check-in — participant QR on internal and shared-form receipts, printable QR badge sheet from Reports (respects roster filters, print CSS shows badges only), and a desk scanner using the browser BarcodeDetector API with manual ID entry fallback for unsupported browsers (e.g. iOS Safari)
- [x] Multilingual — English + Gujarati via `src/i18n/` (LanguageContext + translations dictionary, EN/ગુ switcher in the header, login, and public form); covers nav, login, attendance desk, and the full public registration form. **Gujarati strings are machine-drafted — have a native speaker review before real use.** Missing keys fall back to English; new languages are added in `translations.js`.
- [x] Performance — memoized participant search (`useCallback`), capped desk results (30 + show-more), paginated report roster (50 + show-more)
- [x] Operational dashboard — "Live Event Pulse" panel for the active event: checked-in total, check-ins in the last 15 minutes, last check-in (name + time), pending registrations count

### Deferred to backend phase

- [ ] Offline *data sync* between devices (current offline mode is per-device localStorage; multi-device sync needs the backend)
- [ ] Full translation coverage of internal admin screens (only guardian/volunteer-facing surfaces are translated)

## Cross-cutting / engineering

- [ ] Automated tests (none exist)
- [ ] Proper routing (URL-based navigation instead of the `view` state string in `App.jsx`), needed for deep-linking beyond the shared registration form
- [ ] Input validation and phone-number normalization (import and forms currently trust raw strings)
- [ ] Deployment setup (hosting, environments) once a backend is chosen
