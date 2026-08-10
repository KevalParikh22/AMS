# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build (outputs to dist/)
npm run lint     # Oxlint (config in .oxlintrc.json)
npm run preview  # Serve the production build
```

There is no test suite.

## What this is

Phase 1 MVP of the Sabha Mandal Attendance & Event Registration System — a mobile-friendly React app for marking event attendance against a participant roster imported from Excel, with a fallback registration flow for people not in the roster. Requirements live in [attendance-system-prd.md](attendance-system-prd.md) and [attendance-system-brd.md](attendance-system-brd.md); consult them before changing workflows or business rules. `test_roster.csv` is a sample import file.

Domain terms: a **sabha/mandal** is a class/group, a **balak** (participant) is an attendee, and a **karyakar** is the person responsible for a group.

## Architecture

React 19 + Vite (JavaScript, no TypeScript). There is **no backend and no router** — everything is client-side:

- **Persistence** is `localStorage` under `ams_*` keys, managed entirely by [DbContext.jsx](src/context/DbContext.jsx). It seeds mock data on first load and exposes the whole "database API" via `useDb()`: participant fuzzy search (`queryParticipants`, score-ranked), Excel import upsert-by-phone (`importExcelData`), event CRUD, attendance marking with duplicate/closed-event guards (`markPresent`, `undoAttendance`), registration, and admin wipe/reset. Every mutation writes to localStorage and appends an audit log entry via `addAuditLog`.
- **Auth** is mock-only: [AuthContext.jsx](src/context/AuthContext.jsx) defines `ROLES` (Admin, Coordinator, Attendance Volunteer, Registration Volunteer), preset usernames (`admin`, `coordinator`, `attendance_vol`, `reg_vol`), and accepts any write-in name as a custom user. `hasPermission(requiredRole)` implements the hierarchy (Admin overrides all; Coordinator subsumes Registration Volunteer).
- **Navigation** is a `view` string in [App.jsx](src/App.jsx) switched over the components in `src/views/`; [Layout.jsx](src/components/Layout.jsx) renders the nav, filtering items by `hasPermission`. The one URL-driven route is the public shared registration link (`?view=shared-registration&eventId=...`), which bypasses login and renders `SharedRegistration` directly.

Key business rules enforced in DbContext: events have `Draft`/`Active`/`Closed` statuses; attendance cannot be marked or undone on a `Closed` event; a participant cannot be marked present twice for the same event; participant identity for imports is keyed on phone number; registering a new participant with an active `eventId` also marks them present.

Karyakars are stored as `{ name, sabha }` objects mapped to their sabha (legacy string arrays in localStorage are auto-migrated): registration forms auto-select the karyakar from the chosen sabha, so never present them as two independent dropdowns.

Participants carry a lifecycle `status`: `approved` (on rosters/reports), `pending` (review queue; searchable at the desk with a badge), `rejected`, `linked` (merged/linked to another record via `linkedToId`), `archived` (retention removal). Legacy `pendingReview` flags auto-migrate on load. Only `approved`/`pending` records are "active" — searches, duplicate checks, and import upserts must filter to those. Lifecycle transitions go through the dedicated DbContext actions (`approveParticipant`, `mergeParticipants`, etc.), which enforce the role matrix from [phase-0-decisions.md](phase-0-decisions.md) D4 — as do all other mutations. User accounts live in localStorage (`ams_users`) managed via `AuthContext` (`addManagedUser`, `setManagedUserEnabled`).

Styling is plain CSS in [src/index.css](src/index.css) (no CSS framework). Brand colors live in [src/theme.css](src/theme.css) — the only place to change primary/secondary colors (current palette: Kesari saffron & maroon); `index.css` derives `--accent*` from those theme variables, so never hardcode accent hex values in components.

i18n: user-facing strings on public/volunteer surfaces go through `t('key')` from [src/i18n/LanguageContext.jsx](src/i18n/LanguageContext.jsx) with English + Gujarati dictionaries in [translations.js](src/i18n/translations.js) (missing keys fall back to English). The app is an installable PWA — [public/sw.js](public/sw.js) caches the shell in production builds only (never registered in dev). QR check-in: receipts and printable badges encode the participant ID via [QrCode.jsx](src/components/QrCode.jsx); the desk scanner uses the browser BarcodeDetector API with manual ID entry fallback.
