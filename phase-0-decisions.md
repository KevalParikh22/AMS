# Phase 0 — Discovery and Data Definition: Decisions

Recorded 2026-08-10. These decisions resolve the open questions in [attendance-system-prd.md](attendance-system-prd.md) §13–14 and the approval items in [attendance-system-brd.md](attendance-system-brd.md) §8, and govern Phase 1 hardening and Phase 2 work.

## D1. Terminology and hierarchy

The BRD glossary is adopted as canonical: **mandal/sabha** = class or group, **balak** = participant/attendee, **karyakar** = person responsible for a group.

The group is stored as **one combined "Mandal-Sabha" field** (e.g. `Bal Sabha - Sub-group A1`), matching the Excel sheet and the current app. No split into separate mandal and sabha fields.

## D2. Excel template

The five-column template is confirmed: `Name`, `Phone`, `Mandal-Sabha`, `Karyakar Name`, `Guardian Contact Details`. "Guardian Contact Details" means the **guardian's** contact information (not the karyakar's). The importer keeps column mapping, so header names may vary.

## D3. Identity and matching

**Phone number is the unique participant key.** Imports upsert by phone; a matching phone updates the existing record, a new phone creates a new record. Duplicate prevention and attendance dedup key on the participant record. Participants without a phone number are routed to manual review rather than auto-created.

## D4. Roles and permissions

Current role defaults are confirmed:

| Action | Admin | Coordinator | Attendance Vol. | Registration Vol. |
|---|---|---|---|---|
| Excel import, settings, user management | ✓ | — | — | — |
| Edit master data | ✓ | ✓ | — | — |
| Correct/undo attendance | ✓ | ✓ | — | — |
| Approve new registrations | ✓ | ✓ | — | — |
| Mark attendance | ✓ | ✓ | ✓ | — |
| Register new participants | ✓ | ✓ | — | ✓ |

## D5. Shared registration links

Links are **public with mandatory review**: anyone with the URL can submit, the form never exposes existing participant data, and every submission lands in the coordinator review queue (no auto-approval). Token-protected links are not required for Phase 1; links must still expire when the event ends.

## D6. Mandatory registration fields

**Name, Phone, and Sabha** are required to create a participant. Karyakar and guardian contact details are optional and can be completed later by a coordinator.

## D7. Data retention

Records are **kept indefinitely as the operational registry** and removed only on request from a guardian/participant or when a coordinator archives them. Formal consent capture and a written privacy policy remain deferred (per PRD FR-6 note).

## D8. Reporting requirements

Required on event day and after the event:

1. **Present/absent list** per event with totals (implemented).
2. **New registrations list** with review status (implemented).
3. **Sabha-wise attendance summary** — attendance percentage per sabha/mandal across events (new requirement; added to the task list).

A dedicated duplicate/exception report was **not** selected as a Phase 1 requirement; duplicate handling is deferred to the Phase 2 deduplication tools.

## D9. Ownership

**A single administrator acts as both data owner and system operator** — realistic for one mandal in Phase 1. Responsibilities: maintain the master Excel import, manage users and settings, and carry final say on registration approvals and corrections (coordinators still approve day-to-day).

## Remaining open items

- Expected volumes (records in the Excel file, users, events, participants per event) — needed before choosing backend/hosting in Phase 1 hardening.
- Channels for sharing registration links (WhatsApp/SMS/etc.) — informational; messaging automation stays out of scope.
- Multilingual needs — deferred to Phase 3.
