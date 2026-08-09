# Sabha Mandal Attendance & Event Registration System — Phase 1 PRD

## 1. Title and summary

**Working title:** Sabha Mandal Attendance & Event Registration System

The product is a web application for managing event attendance and new registrations using an existing Excel participant list as the starting data source. It should make attendance fast on a mobile device, support a swipe/tap-style present action, and provide a controlled registration flow when a person is not found in the existing data.

## 2. Problem statement

Attendance is currently dependent on a spreadsheet and manual checking. This can make entry slow, create duplicate records, and make it difficult to distinguish existing balaks/karyakkars from new registrants. Event organizers also need a clear way to capture people who are not in the master list and share a registration reference link.

## 3. Target users / personas

1. **Attendance volunteer** — searches or selects a participant and marks them present quickly on a phone.
2. **Registration volunteer** — registers a new participant when no matching Excel record exists.
3. **Sabha mandal coordinator** — manages sabha, karyakkar, balak, and event-related information.
4. **Administrator** — imports/maintains master data, configures events, manages access, and reviews reports.
5. **Participant or guardian** — optionally completes a registration form through a shared link.

## 4. Goals

- Reduce time required to mark a person present.
- Use existing Excel data without requiring a complete manual re-entry.
- Prevent duplicate attendance for the same person and event.
- Provide a clear fallback registration flow for people missing from the master list.
- Capture whether a registrant is associated with the current sabha mandal or is a karyakkar/other category.
- Associate people with a sabha and show relevant pre-filled balak data where available.
- Provide event attendance, registration, and exportable reporting.

## 5. Non-goals for phase 1

- Full replacement of every existing organizational database.
- Payroll, finance, donations, or accounting.
- Biometric identification or facial recognition.
- Complex offline synchronization unless it is confirmed as a core operational need.
- Native iOS/Android apps; the initial product can be mobile-responsive web.

## 6. Scope

### Provisional Excel import template

The first import template is expected to contain:

- `Name`
- `Phone`
- `Mandal-Sabha`
- `Karyakar Name`
- `Guardian Contact Details`

`Guardian Contact Details` refers to the guardian's contact information. The import process should allow column mapping rather than permanently depending on these exact header names.

### In scope

- Secure login and role-based access.
- Master data import from Excel.
- Participant search and matching.
- Event creation and event-specific attendance.
- Event-date rules that automatically close attendance and registration when the event ends.
- Mobile-friendly present action, including swipe/tap interaction.
- Duplicate attendance protection and correction workflow.
- New registration form.
- Existing/new participant decision flow.
- Sabha mandal and karyakkar association fields.
- Sabha and balak selection with pre-filled data where available.
- Shareable registration link, subject to access/privacy rules.
- Attendance and registration reports.
- Audit history for important changes.

### Out of scope / later phase

- Automated WhatsApp/SMS/email messaging.
- QR-code or NFC attendance.
- Advanced analytics and forecasting.
- Multi-organization tenancy.
- Payments or event ticketing.

## 7. Planning-level module map

1. **Authentication and roles**
   - Login, logout, password reset, and role permissions.

2. **Master data / Excel import**
   - Upload Excel file, map columns, validate rows, preview changes, import, and show rejected rows.
   - Maintain people, sabhas, mandals, karyakkars, and balaks as structured records.

3. **Event management**
   - Create an event, set date/location/status, define registration and attendance rules, and open/close attendance.

4. **Attendance desk**
   - Search by name, phone, ID, or other agreed identifier.
   - Show likely matches with enough information to avoid selecting the wrong person.
   - Mark present with a large tap/swipe action.
   - Show confirmation, timestamp, volunteer, and duplicate status.

5. **Registration**
   - Ask whether the person is associated with the current sabha mandal and/or is a karyakkar.
   - Select sabha from a dropdown.
   - Select an existing balak/person when a match exists.
   - If no match exists, capture a new record and event registration.
   - Generate a reference number/link.

6. **Shared registration form**
   - Optional public or token-protected form.
   - Capture only the fields approved by the organization.
   - Route submitted data for review or auto-approval according to policy.

7. **Reports and exports**
   - Present/absent lists, registration list, duplicate/exception list, and Excel/CSV export.

8. **Administration and audit**
   - Manage users, dropdown values, imports, corrections, and audit history.

## 8. Functional requirements

### FR-1: Import and data quality

- The system shall accept the agreed Excel format or provide column mapping.
- It shall validate required fields and identify duplicates or ambiguous rows before import.
- It shall preserve an internal stable ID so future imports do not create duplicates.
- It shall report inserted, updated, unchanged, and rejected rows.

### FR-2: Participant matching

- Matching shall support exact and tolerant matching according to approved rules.
- The UI shall show multiple possible matches rather than silently choosing an uncertain person.
- A person shall have a stable record independent of any one event.

### FR-3: Attendance

- An authorized volunteer shall select an event and mark a participant present from a mobile-friendly screen.
- A participant can have at most one present attendance record per event unless an administrator explicitly corrects it.
- The system shall record event, participant, status, timestamp, and user who performed the action.
- Authorized users shall be able to undo/correct an accidental attendance mark, with an audit entry.

### FR-4: Registration

- The form shall distinguish existing participant registration from new participant registration.
- The form shall capture the mandal/sabha class or group and the responsible karyakar.
- Existing sabha/balak data shall be selectable and pre-filled when available.
- New records shall be flagged for review if required fields or identity confidence are incomplete.
- The system shall generate a reference ID and allow an approved reference link to be shared.
- A new registration shall be marked present only when it is submitted for an active event date and attendance is confirmed; registration on other dates shall not create attendance.

### FR-5: Reporting

- Users shall be able to filter by event, sabha, mandal, participant category, and attendance status where applicable.
- Reports shall include totals and detail rows.
- Exports shall be suitable for Excel review.

### FR-6: Security and privacy

- Access shall be role-based.
- Public registration links shall not expose the full participant database.
- Sensitive fields shall be limited to the minimum required and protected in storage and display.
- Important imports, attendance corrections, and registration changes shall be auditable.
- Event registration links shall support configurable access: public or protected.
- Event-specific links and attendance actions shall automatically expire or become read-only after the configured event end date.

Additional consent and formal privacy-policy workflows are deferred from the current phase.

## 9. Key user journeys

### Journey A: Existing person attends an event

1. Volunteer logs in and selects the event.
2. Volunteer searches by name, phone, ID, or scans/uses another approved identifier.
3. System shows the best match and relevant sabha/balak details.
4. Volunteer swipes/taps “Present.”
5. System confirms attendance and prevents a duplicate mark.

### Journey B: Person is not found during an event

1. Volunteer searches the master list.
2. Volunteer selects “Register new person.”
3. Form asks association/category questions and captures approved details.
4. Volunteer selects an existing sabha and, where applicable, existing balak data.
5. System creates a registration reference and marks the person present only after explicit confirmation for that active event.

### Journey C: Shared registration

1. Organizer shares an event-specific registration link configured as public or protected.
2. Participant/guardian submits the form.
3. System validates the submission, creates a pending registration or approved record, and generates a reference ID.
4. Authorized staff review and link the submission to an existing person if a safe match is found.

## 10. Success metrics

- Median time to mark an existing participant present.
- Percentage of attendance records completed without duplicate or correction.
- Percentage of imported Excel rows accepted without manual cleanup.
- Number and percentage of new registrations successfully matched to an existing person.
- Registration form completion rate.
- Time required to produce an event attendance report.
- Number of unresolved duplicate or ambiguous records after each event.

## 11. Dependencies and risks

- Excel data may have inconsistent names, spellings, phone numbers, or duplicate rows.
- The precise meaning and hierarchy of “sabha mandal,” “sabha,” “balak,” and “karyakkar” must be confirmed.
- Mobile connectivity at event locations may be unreliable.
- Public links create privacy and spam risks.
- A swipe interaction can be accidental; confirmation and undo must be designed carefully.
- Matching people incorrectly is more harmful than asking a volunteer to choose between two matches.

## 12. Assumptions

- The first version is a responsive web app used on phones and desktops.
- There is one organization or operating group in the first release.
- Excel is the initial source of truth, but the web app will become the operational source for attendance and registrations.
- Attendance is event-specific and a person may attend multiple events.
- At least one unique or semi-unique identifier such as phone number or membership ID may be available.
- Guardian contact details are collected as operational contact information; formal consent capture is deferred.

## 13. Open questions

1. What is the approximate number of records in the Excel file?
2. Is “mandal-sabha” stored as one combined class/group field, or should the system preserve separate names?
3. What fields are mandatory beyond name, phone, mandal-sabha, karyakar name, and guardian contact details?
4. Who can import Excel, edit master data, correct attendance, and approve new registrations?
5. What reports are needed on event day and after the event?

## 14. Recommended next-step decisions

1. Confirm the final Excel template and whether “contact details” means the balak/guardian contact or karyakar contact.
2. Choose the identity/matching strategy and duplicate policy.
3. Confirm roles and permissions; defer formal consent/privacy policy decisions.
4. Approve the phase 1 scope, then produce wireframes and a data model before development.
