# Sabha Mandal Attendance & Event Registration System — Phase 1 BRD

## 1. Title and summary

This initiative will standardize event attendance and participant registration around a controlled web workflow, using the existing Excel list as the initial master-data input. The mandal/sabha is treated as the class or group, the balak as the student/attendee, and the karyakar as the teacher or person responsible for that group.

## 2. Business need

Manual spreadsheet-based attendance creates operational delays and data-quality issues. A centralized workflow is needed so volunteers can record attendance quickly while coordinators retain control over participant identity, sabha associations, new registrations, and reporting.

## 3. Stakeholders

- Organization or regional leadership.
- Sabha mandal and sabha coordinators.
- Event organizers.
- Attendance and registration volunteers.
- Karyakkars.
- Balaks and their guardians, where applicable.
- System administrator or technology owner.

## 4. Current state

- Participant information is stored in Excel.
- The expected initial columns are Name, Phone, Mandal-Sabha, Karyakar Name, and Guardian Contact Details.
- Attendance is expected to be manually checked or marked.
- New people may not have a consistent registration route.
- Duplicate records and inconsistent spellings are likely risks.
- Reporting requires spreadsheet cleanup or manual consolidation.

## 5. Target state

- A maintained participant registry is loaded from Excel and progressively cleaned.
- Each event has a controlled attendance process.
- Volunteers can mark existing people present in seconds.
- New people follow a structured registration process with a reference ID.
- Sabha and participant associations are explicit and reportable.
- Coordinators can review exceptions, correct data, and export reliable reports.

## 6. Business rules / policy impacts

- One attendance status per participant per event, with controlled correction.
- Registration creates attendance only when the registration is submitted during an active event date and attendance is confirmed.
- Registration outside an event remains a registration and does not mark attendance.
- Event-specific registration links and attendance actions expire or become read-only after the configured event end date.
- Existing records must be matched before a new record is created.
- Potential matches require human confirmation.
- New registrations may require coordinator approval before becoming part of the master list.
- A public/shared form must not reveal other participants’ data.
- Shared registration access must be configurable as public or protected.
- Guardian contact information should be visible only to authorized users.
- Every administrative correction should retain who changed it and when.

Formal consent capture, safeguarding workflows, and a detailed privacy policy are deferred from the current phase.

## 7. Operational changes

### Before an event

- Administrator imports or verifies the current master data.
- Organizer creates the event and confirms sabha/mandal scope.
- Volunteers receive access and, if applicable, a registration link.

### During an event

- Volunteers use the attendance desk to find and mark participants present.
- Unmatched people are routed to registration.
- Exceptions and uncertain matches are escalated to a coordinator.

### After an event

- Coordinator reviews new registrations, duplicates, and corrections.
- Attendance and registration reports are exported or shared.
- Approved new data is incorporated into the maintained registry.

## 8. Approval and governance needs

The following should be approved before design/development:

- Canonical terminology and hierarchy.
- Master data ownership and Excel import policy.
- Mandatory registration fields.
- Attendance correction authority.
- Public-link and privacy policy.
- Retention and deletion policy for participant/guardian data.
- User roles and access boundaries.
- Event reporting requirements.

## 9. Dependencies and risks

- A reliable, representative Excel sample is required.
- Data cleanup and deduplication may need a one-time operational effort.
- Event volunteers may use different devices and levels of technical comfort.
- Network availability and device/browser compatibility may affect event-day use.
- Incorrect identity matching can affect trust and reporting.
- Unapproved public access could expose personal data.

## 10. Assumptions

- The organization will nominate a data owner and an operational administrator.
- Event coordinators can identify the responsible mandal/sabha and karyakar teams.
- The organization can define which fields are acceptable to collect.
- The first release will focus on attendance and registration, with broader organization management deferred.

## 11. Open questions

1. Which leadership/coordinator role approves the process and owns the data?
2. Is there one common master Excel file or multiple files by mandal/sabha?
3. What is the expected number of users, events, and participants per event?
4. What is the acceptable process when a person has no reliable unique identifier?
5. Does the organization need multilingual forms or labels?
6. Which channels should be used to share the registration reference link?

## 12. Suggested delivery phases

### Phase 0: Discovery and data definition

Confirm terminology, roles, workflows, privacy rules, Excel structure, and success metrics.

### Phase 1: Core operational MVP

Authentication, Excel import, participant search, event setup, mobile attendance, duplicate protection, basic registration, and reports.

### Phase 2: Registration and governance hardening

Shareable forms, approval queues, deduplication tools, audit history, stronger role controls, and improved exports.

### Phase 3: Event-day optimization

Offline capability if needed, QR/ID scanning, multilingual support, performance improvements, and operational dashboards.
