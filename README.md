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
- **Excel import** — upload a master roster (`.xlsx`/`.csv`) with column mapping, preview, and insert/update/reject reporting. Participants are upserted by phone number. A sample file is included at `test_roster.csv`.
- **Attendance desk** — ranked fuzzy search by name/phone/sabha/karyakar, swipe-to-mark-present, duplicate protection, undo/correction with audit trail.
- **Event management** — create/edit events with Draft / Active / Closed statuses, sabha scoping, and shareable public registration links.
- **Registration** — internal registration desk plus a public shared form (`?view=shared-registration&eventId=...`) that issues a reference code and routes submissions to a review queue.
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

## Tech stack

- React 19 + Vite (JavaScript, no TypeScript)
- `xlsx` (SheetJS) for spreadsheet import/export
- `lucide-react` icons, plain CSS (`src/index.css`)
- State/persistence via React Context + `localStorage` (`src/context/DbContext.jsx`, `src/context/AuthContext.jsx`)

## Documentation

- [attendance-system-prd.md](attendance-system-prd.md) — product requirements (functional requirements, user journeys, scope)
- [attendance-system-brd.md](attendance-system-brd.md) — business requirements (business rules, delivery phases)
- [phase-0-decisions.md](phase-0-decisions.md) — recorded Phase 0 discovery decisions (data model, identity, roles, policies)
- [tasks.md](tasks.md) — phase-wise task list and pending work
- [CLAUDE.md](CLAUDE.md) — architecture notes for AI-assisted development
