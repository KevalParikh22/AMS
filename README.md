# Sabha Mandal Attendance & Event Registration System

A mobile-friendly web application for managing event attendance and participant registration for sabha mandals. Volunteers can mark existing participants present in seconds using a swipe/tap action, import the master roster from Excel, register new people when no matching record exists, and export attendance/registration reports.

Runs in two modes: a zero-setup **local sandbox** (all data in the browser's `localStorage`, mock logins) and an optional **cloud mode** backed by Supabase — real email/password logins with password reset, multi-device realtime sync, and server-side role enforcement. See [SETUP-BACKEND.md](SETUP-BACKEND.md) to enable cloud mode and deploy to Vercel.

## Domain terminology

| Term | Meaning |
|---|---|
| Sabha / Mandal | A class or group of participants |
| Balak | A participant / attendee |
| Karyakar | The person responsible for a group |

## Features

- **Login & roles** — Admin, Coordinator, Attendance Volunteer, Registration Volunteer (mock authentication; see below).
- **Excel/CSV import** — upload a master roster (`.xlsx`/`.csv`) with column mapping, preview, and insert/update/reject reporting. The template is four columns — `Name`, `Mandal-Sabha`, `Karyakar Name`, `Guardian Contact Details` — of which name and guardian contact are required; balaks rarely have a phone of their own, so the contact number is the guardian's and is read out of the guardian column. Participants are upserted on **name + guardian phone**, so siblings sharing one number import as separate people. The import screen lists the expected columns, flags sabha/karyakar values that aren't configured yet, and offers a **sample CSV download** pre-filled with your own sabha↔karyakar pairings. A static sample also lives at `test_roster.csv`.
- **Attendance desk** — ranked fuzzy search by name/phone/sabha/karyakar/guardian, swipe-to-mark-present, duplicate protection, undo/correction with audit trail. Several volunteers can mark attendance at once: each check-in is written as its own row, and the database rejects a double-mark so the second volunteer is told rather than silently overwriting the first.
- **Event management** — create/edit events with Draft / Active / Closed statuses, sabha scoping, and a share panel with the link and a scannable QR.
- **Registration** — internal registration desk plus a public shared form (`?view=shared-registration`). The link is permanent: it targets whichever event is **Active** when someone opens it, so it never points at a finished event, and it shows a "no session open" page when nothing is running. A submission registers the person and marks them **present immediately**, returning a reference code and QR. Appending `&eventId=...` still pins the link to one event while that event is live.
- **Reports** — event/sabha filters, present/absent lists, pending-registration approval queue, and Excel export.
- **Admin settings** — manage sabha and karyakar dropdown values, user accounts and roles, audit logs (search/filter/export), wipe or factory-reset the database.
- **QR check-in** — participant QR on registration receipts, printable badge sheets, and a camera scanner at the attendance desk (with manual ID fallback).
- **Offline PWA** — installable to the home screen; the app shell loads without connectivity after the first visit (data is device-local).
- **Multilingual** — English and Gujarati (ગુજરાતી) with a language switcher; translations live in `src/i18n/translations.js`.

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # Production build to dist/
npm run preview  # Serve the production build
npm run lint     # Oxlint
```

### Demo logins (sandbox mode)

In sandbox mode authentication is mocked — no passwords. Use one of the preset usernames, or type any name to create a custom user with a chosen role. (In cloud mode the login screen switches to real email/password accounts.)

| Username | Role |
|---|---|
| `admin` | Admin |
| `coordinator` | Coordinator |
| `attendance_vol` | Attendance Volunteer |
| `reg_vol` | Registration Volunteer |

### Accounts in cloud mode

Real email/password logins, with two rules worth knowing:

- **New accounts are created disabled.** Signing up is not the same as being let in — an admin activates the account, and that activation is the security boundary. It also means an unrecognised signup gets no access to the roster.
- **Admins create volunteer logins in the app**, from *Admin Control → User Accounts & Roles* — name, email, an initial password and a role — and the volunteer can sign in immediately. No Supabase dashboard needed after the first admin.

**Registration Volunteer** is the right role for a typical event volunteer: marking attendance is the base level every signed-in user has, so that role covers both checking people in *and* registering walk-ins, while corrections and approvals stay with Coordinators and Admins. Full setup steps are in [SETUP-BACKEND.md](SETUP-BACKEND.md).

## Tech stack

- React 19 + Vite (JavaScript, no TypeScript)
- `xlsx` (SheetJS) for spreadsheet import/export
- `lucide-react` icons, plain CSS (`src/index.css`)
- State/persistence via React Context + `localStorage` (`src/context/DbContext.jsx`, `src/context/AuthContext.jsx`), with an optional Supabase Postgres backend for multi-device sync, real logins, and server-side row-level security

## Documentation

- [attendance-system-prd.md](attendance-system-prd.md) — product requirements (functional requirements, user journeys, scope)
- [attendance-system-brd.md](attendance-system-brd.md) — business requirements (business rules, delivery phases)
- [phase-0-decisions.md](phase-0-decisions.md) — recorded Phase 0 discovery decisions (data model, identity, roles, policies)
- [tasks.md](tasks.md) — phase-wise task list and pending work
- [CLAUDE.md](CLAUDE.md) — architecture notes for AI-assisted development
- [SETUP-BACKEND.md](SETUP-BACKEND.md) — Supabase + Vercel setup, account onboarding, upgrading an existing project, and one-time maintenance SQL (including the `profiles.email` backfill)
