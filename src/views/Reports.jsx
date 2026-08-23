import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import QrCode from '../components/QrCode';
import Modal from '../components/Modal';
import ParticipantEditModal from '../components/ParticipantEditModal';
import { participantKey, sabhaNameKey } from '../lib/participantIdentity';
import { useTableSort } from '../lib/tableSort';
import SortableTh from '../components/SortableTh';
import * as XLSX from 'xlsx';
import {
  Download,
  Search,
  Filter,
  Check,
  X,
  UserCheck,
  Link as LinkIcon,
  AlertCircle,
  Printer,
  Pencil
} from 'lucide-react';

const PAGE_SIZE = 50;

export default function Reports() {
  const {
    events,
    participants,
    attendance,
    markPresent,
    undoAttendance,
    getEffectiveStatus,
    areaOfSabha,
    areas,
    approveParticipant,
    rejectParticipant,
    linkParticipant,
    mergeParticipants,
    archiveParticipant,
    restoreParticipant,
    addAuditLog
  } = useDb();

  const { user, canViewGuardianDetails, hasPermission } = useAuth();

  // Filters state
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedSabha, setSelectedSabha] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'multi-day' | 'sabha-summary' | 'data-quality' | 'pending-review'

  const [areaFilter, setAreaFilter] = useState('All');
  const [karyakarFilter, setKaryakarFilter] = useState('All');

  // Multi-day report: which events are combined, and the minimum days filter
  const [multiEventIds, setMultiEventIds] = useState([]);
  const [minDaysFilter, setMinDaysFilter] = useState(0);

  // One sort per table — five independent states, so sorting the roster cannot
  // reorder a summary. These must be declared HERE, with the first state
  // cluster: reportRoster below consumes rosterSort, and a `const` declared
  // further down the body is in the temporal dead zone at that point, which is
  // a render-time ReferenceError rather than a lint warning.
  const rosterSort = useTableSort();
  const multiSort = useTableSort();
  const areaSort = useTableSort();
  const mandalSort = useTableSort();
  const exceptionSort = useTableSort();

  // The initial useState above reads `events` on the first render only, which in
  // cloud mode is before anything has loaded — so it settled on '' and never
  // recovered, leaving the picker blank. Adopt the first event once they arrive,
  // and recover if the selected event disappears.
  useEffect(() => {
    if (events.length === 0) return;
    if (!events.some(e => e.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Get active event details
  const activeEvent = events.find(e => e.id === selectedEventId);

  // Extract unique Sabhas from participants list
  const uniqueSabhas = ['All', ...new Set(participants.map(p => p.sabha))];
  // Derived from the roster, like uniqueSabhas, so a karyakar with no balaks
  // never appears as a dead choice.
  const uniqueKaryakars = ['All', ...new Set(participants.map(p => p.karyakar).filter(Boolean))].sort();

  // Who was actually marked present for this event, regardless of who was
  // expected. This is the source of truth for the "Present" figure.
  const presentIds = new Set(
    attendance.filter(a => a.eventId === selectedEventId).map(a => a.participantId)
  );

  // Who was EXPECTED to attend: approved members within the event's sabha
  // scope. Deliberately excludes the view filters below, so searching or
  // changing the sabha dropdown never changes the headline numbers.
  const isExpected = (p) => {
    if (p.status !== 'approved') return false;
    if (activeEvent && activeEvent.sabhaMandalScope !== 'All Sabhas') {
      if (p.sabha !== activeEvent.sabhaMandalScope) return false;
    }
    return true;
  };
  const targetParticipants = participants.filter(isExpected);

  // Marked present but NOT on the expected roster — a different sabha to the
  // event's scope, or still pending review. These used to be dropped from the
  // report entirely, so the Present count read lower than the number of people
  // actually checked in at the desk.
  const unexpectedPresent = participants.filter(p => presentIds.has(p.id) && !isExpected(p));

  // View-only filters: these shape the table, never the aggregates.
  const matchesView = (p) => {
    if (selectedSabha !== 'All' && p.sabha !== selectedSabha) return false;
    // A participant's sabha need not exist in the lookup, so resolve the area
    // through areaOfSabha rather than reading a field.
    if (areaFilter !== 'All' && areaOfSabha(p.sabha) !== areaFilter) return false;
    if (karyakarFilter !== 'All' && p.karyakar !== karyakarFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
        String(p.phone || '').includes(q) ||
        p.id.toLowerCase().includes(q);
    }
    return true;
  };

  // Off-roster people sat at the bottom only because they were concatenated
  // last. Now that a column sort can override the order, make that grouping
  // explicit — and because sorting is stable, (off-roster, name) also becomes
  // the automatic tiebreak whenever the chosen column has equal values.
  const rosterBase = [...targetParticipants, ...unexpectedPresent]
    .filter(matchesView)
    .map(p => ({
      ...p,
      present: presentIds.has(p.id),
      offRoster: !isExpected(p)
    }))
    .filter(row => {
      // Filter by Attendance Status (Present/Absent)
      if (statusFilter === 'Present') return row.present;
      if (statusFilter === 'Absent') return !row.present;
      return true;
    })
    .sort((a, b) => Number(a.offRoster) - Number(b.offRoster) || a.name.localeCompare(b.name));

  // Sorted here rather than in the JSX, so the Excel exports and the QR badge
  // sheet — which all iterate reportRoster — come out in the order on screen.
  const reportRoster = rosterSort.sorted(rosterBase);

  // Aggregates. Present counts everyone actually checked in — including the
  // off-roster people — so it always matches the desk and the Dashboard.
  const totalExpected = targetParticipants.length;
  const presentOnRoster = targetParticipants.filter(p => presentIds.has(p.id)).length;
  const totalPresent = presentOnRoster + unexpectedPresent.length;
  const totalAbsent = totalExpected - presentOnRoster;

  // Attendance rows whose participant no longer exists (removed/merged away).
  // Counted separately so Present never silently disagrees with the raw count.
  const orphanedMarks = presentIds.size - presentOnRoster - unexpectedPresent.length;

  // --- Multi-day combined report ---
  //
  // A shibir run as three one-day events is three rows in `events`, so no single
  // report can answer "who came all three days". Rather than adding a series
  // field to events, any set of events can be ticked and combined — which also
  // works retroactively on events that already happened.
  const combinableEvents = [...events]
    .filter(e => e.status !== 'Draft')
    .sort((a, b) => `${a.date}${a.startTime || ''}`.localeCompare(`${b.date}${b.startTime || ''}`));

  const multiEvents = combinableEvents.filter(e => multiEventIds.includes(e.id));

  // One pass over attendance rather than one filter per event.
  const presentByEvent = new Map(multiEvents.map(e => [e.id, new Set()]));
  attendance.forEach(a => {
    const set = presentByEvent.get(a.eventId);
    if (set) set.add(a.participantId);
  });

  // The per-event form of `isExpected` above. Scope varies between events, so
  // this has to be asked per (participant, event) rather than once.
  const isExpectedFor = (p, event) => {
    if (p.status !== 'approved') return false;
    if (event.sabhaMandalScope !== 'All Sabhas' && p.sabha !== event.sabhaMandalScope) return false;
    return true;
  };

  const multiRoster = participants
    .map(p => {
      const cells = multiEvents.map(e => {
        const inScope = isExpectedFor(p, e);
        const present = presentByEvent.get(e.id).has(p.id);
        // Someone marked present outside the event's scope still attended, so
        // the day counts for them — flagged, not discarded.
        if (present) return { state: 'present', offRoster: !inScope };
        return { state: inScope ? 'absent' : 'na', offRoster: false };
      });
      const daysAttended = cells.filter(c => c.state === 'present').length;
      // Denominator is days this person was actually expected on, not the raw
      // event count — otherwise a mandal out of scope on day 2 reads as absent.
      const daysApplicable = cells.filter(c => c.state !== 'na').length;
      return {
        ...p,
        cells,
        daysAttended,
        daysApplicable,
        percentage: daysApplicable > 0 ? Math.round((daysAttended / daysApplicable) * 100) : 0
      };
    })
    // Anyone with no connection to any selected event is simply not in this report.
    .filter(row => row.daysApplicable > 0);

  // Untick an event while "at least 3 days" is selected and the filter would
  // silently match nobody, which reads as "no data" rather than "bad filter".
  const effectiveMinDays = Math.min(minDaysFilter, multiEvents.length);

  const multiBase = multiRoster
    .filter(matchesView)
    .filter(row => row.daysAttended >= effectiveMinDays)
    .sort((a, b) => b.daysAttended - a.daysAttended || a.name.localeCompare(b.name));

  const multiVisible = multiSort.sorted(multiBase);

  // How many people attended each possible number of days: the "who came all
  // three days" answer, and its tail.
  const dayDistribution = multiEvents.map((_, i) => i + 1)
    .concat(0)
    .sort((a, b) => b - a)
    .map(n => ({ days: n, count: multiRoster.filter(r => r.daysAttended === n).length }));

  // Pending public registrations list
  const pendingRegistrations = participants.filter(p => p.status === 'pending');

  // --- Data quality: duplicate detection and exception records ---
  const activeParticipants = participants.filter(p => p.status === 'approved' || p.status === 'pending');
  const duplicateGroups = (() => {
    const byKey = new Map();
    activeParticipants.forEach(p => {
      const keys = [];
      if (p.phone) keys.push('phone:' + p.phone.trim());
      // Name + mandal, not name alone. A shared name across two different
      // mandals is two different balaks, and flagging those buried the real
      // duplicates under false ones.
      keys.push('sabhaname:' + sabhaNameKey(p.sabha, p.name));
      keys.forEach(key => {
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(p);
      });
    });
    const seenGroups = new Set();
    const groups = [];
    byKey.forEach((members, key) => {
      if (members.length < 2) return;
      const groupId = members.map(m => m.id).sort().join('|');
      if (seenGroups.has(groupId)) return;
      seenGroups.add(groupId);
      groups.push({ key, members });
    });
    return groups;
  })();
  const exceptionBase = participants
    .filter(p => p.status === 'rejected' || p.status === 'linked' || p.status === 'archived')
    .sort((a, b) => a.name.localeCompare(b.name));
  const exceptionRecords = exceptionSort.sorted(exceptionBase);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [rosterVisible, setRosterVisible] = useState(PAGE_SIZE);
  const [editingParticipant, setEditingParticipant] = useState(null);
  const [reviewMsg, setReviewMsg] = useState(null);

  // Paging resets when the RESULT SET changes. Deliberately not on sort: that
  // reorders the same rows, so the offset stays meaningful and scrolling back
  // through a long roster is not undone by clicking a header.
  useEffect(() => {
    setRosterVisible(PAGE_SIZE);
  }, [selectedEventId, selectedSabha, areaFilter, karyakarFilter, statusFilter, searchQuery]);

  // Sabha-wise summary for the SELECTED event (Phase 0 decision D8).
  //
  // These are head counts, so present + absent === members on every row and the
  // table reconciles against its own Participants column. It used to multiply
  // members by the event count, which meant a mandal of 118 across 5 events
  // reported 425 absences — a number that could not be read against the 118 next
  // to it, and that two faults inflated further: a Draft event that merely
  // expired was counted as an event that happened, and a balak was counted
  // absent from events held before they joined. Counting one event at a time
  // removes the multiplication those faults acted on.
  //
  // Reuses isExpected and presentIds from the attendance tab rather than
  // restating the rule, so the summary is a genuine breakdown of the same
  // figures the roster reports and cannot drift from them.
  const sabhaSummaryBase = [...new Set(participants.filter(isExpected).map(p => p.sabha))]
    .sort()
    .map(sabhaName => {
      const members = participants.filter(p => isExpected(p) && p.sabha === sabhaName);
      const present = members.filter(p => presentIds.has(p.id)).length;
      return {
        sabha: sabhaName,
        // A participant's sabha is free text and need not be in the lookup at
        // all, so an unmapped mandal falls back rather than dropping out.
        area: areaOfSabha(sabhaName),
        members: members.length,
        present,
        absent: members.length - present,
        percentage: members.length > 0 ? Math.round((present / members.length) * 100) : 0
      };
    });

  // Areas roll several mandals into one group. Summing the mandal rows rather
  // than recomputing keeps the two tables incapable of disagreeing. Built from
  // the BASE array, not the sorted one, so a column sort on the mandal table
  // cannot perturb the area totals.
  const areaSummaryBase = [...new Set(sabhaSummaryBase.map(r => r.area))]
    .sort()
    .map(area => {
      const rows = sabhaSummaryBase.filter(r => r.area === area);
      const members = rows.reduce((s, r) => s + r.members, 0);
      const present = rows.reduce((s, r) => s + r.present, 0);
      return {
        area,
        sabhaCount: rows.length,
        members,
        present,
        absent: members - present,
        percentage: members > 0 ? Math.round((present / members) * 100) : 0
      };
    });

  const sabhaSummary = mandalSort.sorted(sabhaSummaryBase);
  const areaSummary = areaSort.sorted(areaSummaryBase);

  // One row shape for all three places that emit the sabha summary, so an added
  // column can never reach some of them and not the others.
  const sabhaSummaryRows = () => sabhaSummary.map(row => ({
    'Event': activeEvent ? `${activeEvent.name} (${activeEvent.date})` : '-',
    'Area': row.area,
    'Mandal/Sabha': row.sabha,
    'Participants': row.members,
    'Present': row.present,
    'Absent': row.absent,
    'Present %': `${row.percentage}%`
  }));

  const handleExportSabhaSummary = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sabhaSummaryRows()), 'Sabha Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(areaSummary.map(row => ({
      'Event': activeEvent ? `${activeEvent.name} (${activeEvent.date})` : '-',
      'Area': row.area,
      'Mandals': row.sabhaCount,
      'Participants': row.members,
      'Present': row.present,
      'Absent': row.absent,
      'Present %': `${row.percentage}%`
    }))), 'Area Summary');
    XLSX.writeFile(wb, 'Sabha_Attendance_Summary.xlsx');
    addAuditLog('Export Report', 'Exported sabha-wise and area-wise attendance summary to Excel.');
  };

  // Full multi-sheet workbook: roster + sabha summary + pending queue
  const handleExportFullReport = () => {
    if (!activeEvent) return;
    const wb = XLSX.utils.book_new();

    const rosterSheet = XLSX.utils.json_to_sheet(reportRoster.map(row => ({
      'Participant ID': row.id,
      'Full Name': row.name,
      'Contact Number': row.phone,
      'Area': areaOfSabha(row.sabha),
      'Mandal/Sabha Class': row.sabha,
      'Responsible Karyakar': row.karyakar,
      'Guardian Contact Details': canViewGuardianDetails ? row.guardianDetails : 'Restricted',
      'Attendance Status': row.present ? 'Present' : 'Absent',
      'On Expected Roster': row.offRoster ? 'No (off-roster)' : 'Yes'
    })));
    XLSX.utils.book_append_sheet(wb, rosterSheet, 'Attendance Roster');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sabhaSummaryRows()), 'Sabha Summary');

    const pendingSheet = XLSX.utils.json_to_sheet(pendingRegistrations.map(p => ({
      'Reference ID': p.id,
      'Full Name': p.name,
      'Phone': p.phone || 'Not provided',
      'Target Sabha': p.sabha,
      'Registered For Event': p.registeredForEventId || '-',
      'Submitted': p.createdAt ? new Date(p.createdAt).toLocaleString() : '-'
    })));
    XLSX.utils.book_append_sheet(wb, pendingSheet, 'Pending Registrations');

    XLSX.writeFile(wb, `${activeEvent.name.replace(/\s+/g, '_')}_Full_Report.xlsx`);
    addAuditLog('Export Report', `Exported full multi-sheet report for event "${activeEvent.name}".`);
  };

  const handleExportMultiDay = () => {
    if (multiEvents.length < 2) return;

    // Event names go in COLUMN HEADERS, never sheet names — SheetJS caps a sheet
    // name at 31 characters and rejects []:*?/\, and event names are free text.
    const columnFor = (e) => `${e.name} (${e.date})`;
    const rows = multiVisible.map(row => {
      const record = {
        'Participant ID': row.id,
        'Full Name': row.name,
        'Guardian Number': row.phone,
        'Mandal/Sabha Class': row.sabha,
        'Responsible Karyakar': row.karyakar,
        'Guardian Contact Details': canViewGuardianDetails ? row.guardianDetails : 'Restricted'
      };
      multiEvents.forEach((e, i) => {
        const cell = row.cells[i];
        record[columnFor(e)] = cell.state === 'present'
          ? (cell.offRoster ? 'Present (off-roster)' : 'Present')
          : cell.state === 'absent' ? 'Absent' : 'Not applicable';
      });
      record['Days Attended'] = row.daysAttended;
      record['Days Applicable'] = row.daysApplicable;
      record['Attendance %'] = `${row.percentage}%`;
      return record;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Multi-Day Attendance');

    const summary = multiEvents.map(e => ({
      'Event': e.name,
      'Date': e.date,
      'Sabha Scope': e.sabhaMandalScope,
      'Total Present': presentByEvent.get(e.id).size
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Event Summary');

    const first = multiEvents[0].date;
    const last = multiEvents[multiEvents.length - 1].date;
    XLSX.writeFile(wb, `Combined_${first}_to_${last}.xlsx`);
    addAuditLog(
      'Export Report',
      `Exported combined ${multiEvents.length}-event report (${multiEvents.map(e => e.name).join(', ')}).`
    );
  };

  // Handle Excel download trigger using sheetjs
  const handleExportExcel = () => {
    if (!activeEvent) return;

    // Map rows for Excel
    const dataToExport = reportRoster.map(row => ({
      'Participant ID': row.id,
      'Full Name': row.name,
      'Contact Number': row.phone,
      'Mandal/Sabha Class': row.sabha,
      'Responsible Karyakar': row.karyakar,
      'Guardian Contact Details': canViewGuardianDetails ? row.guardianDetails : 'Restricted',
      'Attendance Status': row.present ? 'Present' : 'Absent',
      'On Expected Roster': row.offRoster ? 'No (off-roster)' : 'Yes',
      'Marked Time': row.present 
        ? new Date(attendance.find(a => a.eventId === selectedEventId && a.participantId === row.id).markedAt).toLocaleString() 
        : '-'
    }));

    // Create worksheet and workbook
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
    
    // Download
    const fileName = `${activeEvent.name.replace(/\s+/g, '_')}_Report.xlsx`;
    XLSX.writeFile(wb, fileName);

    addAuditLog('Export Report', `Exported attendance report for event "${activeEvent.name}" to Excel.`);
  };

  // Review Flow Actions — proper record states, no name/ID rewrites.
  // Every one of these returns { success, message }; showing it matters,
  // because a refused action used to look identical to a successful one.
  const reportReview = (result, successMsg) => {
    if (!result?.success) {
      setReviewMsg({ ok: false, text: result?.message || 'That action could not be completed.' });
    } else {
      setReviewMsg({ ok: true, text: successMsg });
      // In cloud mode the change is only real once the row reaches Supabase.
      result.syncPromise?.catch(err =>
        setReviewMsg({ ok: false, text: err.message })
      );
    }
    setTimeout(() => setReviewMsg(null), 8000);
  };

  // --- Admin correction of a closed event's roster ---
  //
  // Events auto-close past their end time and an expired one can never be
  // reopened, so a mark missed on the day would otherwise be permanent. Only an
  // Admin sees these controls, and each change is audited under its own action.
  const eventIsClosed = Boolean(activeEvent) && getEffectiveStatus(activeEvent) === 'Closed';
  const canCorrectClosed = eventIsClosed && hasPermission('Admin');

  const handleCorrectAttendance = (row) => {
    if (!canCorrectClosed) return;
    const verb = row.present ? 'Mark ABSENT' : 'Mark PRESENT';
    if (!window.confirm(
      `${verb}: "${row.name}" (${row.id}) for the closed event "${activeEvent.name}"?\n\n` +
      'This event has already finished. The correction is recorded in the audit log against your name.'
    )) return;

    const result = row.present
      ? undoAttendance(activeEvent.id, row.id, { allowClosed: true })
      : markPresent(activeEvent.id, row.id, { allowClosed: true });

    reportReview(
      result,
      `${row.name} is now marked ${row.present ? 'absent' : 'present'} for ${activeEvent.name}.`
    );
  };

  const handleApproveRegistration = (pId) => {
    const person = participants.find(x => x.id === pId);
    const result = approveParticipant(pId);
    // An approved person only joins the roster if their sabha matches the
    // selected event's scope, and that event defaults to events[0] — one the
    // reviewer never picked. Say so rather than letting them vanish.
    const onThisRoster = person && (!activeEvent
      || activeEvent.sabhaMandalScope === 'All Sabhas'
      || activeEvent.sabhaMandalScope === person.sabha);
    reportReview(
      result,
      `${person?.name || 'Registration'} approved.` + (onThisRoster
        ? ''
        : ` They are in "${person?.sabha}", so they do not appear on the roster for ${activeEvent?.name} — switch the event filter to see them.`)
    );
  };

  const handleLinkToExisting = (pId, existingId) => {
    const pending = participants.find(p => p.id === pId);
    const existing = participants.find(p => p.id === existingId);
    // This marks someone present AND removes the registrant from the roster.
    // On a false match — two siblings sharing a guardian number — that credits
    // the wrong person and makes the real attendee disappear, so confirm first.
    if (!window.confirm(
      `Treat "${pending?.name}" as the same person as "${existing?.name}" (${existingId})?\n\n` +
      `"${existing?.name}" will be marked present, and "${pending?.name}" will be removed from the roster as a duplicate.\n\n` +
      `If they are siblings sharing a guardian number, cancel and use Approve instead.`
    )) return;

    // Mark existing participant present for the event the registration targeted,
    // falling back to the event selected in the attendance tab
    const targetEventId = (pending && pending.registeredForEventId) || selectedEventId;
    if (targetEventId) {
      markPresent(targetEventId, existingId);
    }
    reportReview(
      linkParticipant(pId, existingId),
      `Linked "${pending?.name}" to ${existing?.name} and marked them present.`
    );
  };

  const handleRejectRegistration = (pId) => {
    const person = participants.find(x => x.id === pId);
    reportReview(rejectParticipant(pId), `${person?.name || 'Registration'} rejected.`);
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Control Filters Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'attendance' ? '2px solid var(--accent)' : 'none',
            color: activeTab === 'attendance' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600
          }}
        >
          Attendance Roster Reports
        </button>
        <button
          onClick={() => setActiveTab('multi-day')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'multi-day' ? '2px solid var(--accent)' : 'none',
            color: activeTab === 'multi-day' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600
          }}
        >
          Multi-Day Combined
        </button>
        <button
          onClick={() => setActiveTab('sabha-summary')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'sabha-summary' ? '2px solid var(--accent)' : 'none',
            color: activeTab === 'sabha-summary' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600
          }}
        >
          Sabha Summary
        </button>
        <button
          onClick={() => setActiveTab('data-quality')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'data-quality' ? '2px solid var(--accent)' : 'none',
            color: activeTab === 'data-quality' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>Data Quality</span>
          {duplicateGroups.length > 0 && (
            <span className="badge badge-warning" style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
              {duplicateGroups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('pending-review')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'pending-review' ? '2px solid var(--accent)' : 'none',
            color: activeTab === 'pending-review' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '0.75rem 1.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>Pending Public Registrations</span>
          {pendingRegistrations.length > 0 && (
            <span className="badge badge-warning" style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
              {pendingRegistrations.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'attendance' && (
        <>
          {/* Filters Bar */}
          <div className="glass-panel" style={{
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'end'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Selected Event</label>
              <select
                className="form-control"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.date})</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Sabha Class</label>
              <select
                className="form-control"
                value={selectedSabha}
                onChange={(e) => setSelectedSabha(e.target.value)}
              >
                {uniqueSabhas.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Area</label>
              <select
                className="form-control"
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
              >
                <option value="All">All areas</option>
                {areas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Karyakar</label>
              <select
                className="form-control"
                value={karyakarFilter}
                onChange={(e) => setKaryakarFilter(e.target.value)}
              >
                {uniqueKaryakars.map(k => (
                  <option key={k} value={k}>{k === 'All' ? 'All karyakars' : k}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Check-in Status</label>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Expected</option>
                <option value="Present">Present Only</option>
                <option value="Absent">Absent Only</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
              <label className="form-label">Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Name or Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Aggregate metrics grid */}
          {activeEvent && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Attendees</span>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>{totalExpected}</h4>
              </div>
              <div className="card" style={{ padding: '1rem', borderColor: 'var(--success)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Present</span>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.25rem' }}>{totalPresent}</h4>
                {unexpectedPresent.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>
                    incl. {unexpectedPresent.length} off-roster
                  </span>
                )}
              </div>
              <div className="card" style={{ padding: '1rem', borderColor: 'var(--danger)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Absent</span>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)', marginTop: '0.25rem' }}>{totalAbsent}</h4>
              </div>
            </div>
          )}

          {/* Why Present can exceed the expected roster */}
          {(unexpectedPresent.length > 0 || orphanedMarks > 0) && (
            <div style={{
              backgroundColor: 'var(--warning-light)',
              border: '1px solid var(--warning)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem',
              fontSize: '0.82rem',
              lineHeight: 1.6
            }}>
              {unexpectedPresent.length > 0 && (
                <div>
                  <strong>{unexpectedPresent.length}</strong> {unexpectedPresent.length === 1 ? 'person was' : 'people were'} checked in
                  but {unexpectedPresent.length === 1 ? 'is' : 'are'} not on this event's expected roster — a sabha outside
                  {activeEvent && activeEvent.sabhaMandalScope !== 'All Sabhas'
                    ? ` "${activeEvent.sabhaMandalScope}"`
                    : ' the event scope'}, or still awaiting review.
                  They are included in Present and listed below with an <em>Off-roster</em> tag.
                </div>
              )}
              {orphanedMarks > 0 && (
                <div style={{ marginTop: unexpectedPresent.length > 0 ? '0.4rem' : 0 }}>
                  <strong>{orphanedMarks}</strong> attendance record(s) point at a participant that no longer exists
                  (removed or merged). They are not shown in the list below.
                </div>
              )}
            </div>
          )}

          {/* Roster Report Table */}
          <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            {canCorrectClosed && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--warning-light, rgba(255,170,0,0.12))',
                border: '1px solid var(--warning)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertCircle size={16} color="var(--warning)" />
                <span>
                  <strong>Correction mode.</strong> "{activeEvent.name}" is closed, so the desk can no
                  longer change it. As an administrator you can still fix this roster — every change is
                  logged against your name.
                </span>
              </div>
            )}

            {reviewMsg && (
              <div
                className={`badge ${reviewMsg.ok ? 'badge-success' : 'badge-danger'}`}
                style={{ display: 'block', marginBottom: '1rem', padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
              >
                {reviewMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Roster Roll-Call List</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleExportExcel}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  disabled={reportRoster.length === 0}
                >
                  <Download size={14} />
                  <span>Export to Excel</span>
                </button>
                <button
                  onClick={handleExportFullReport}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  disabled={!activeEvent}
                  title="One workbook with roster, sabha summary, and pending registrations sheets"
                >
                  <Download size={14} />
                  <span>Export Full Report</span>
                </button>
                <button
                  onClick={() => setShowBadgeSheet(true)}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  disabled={reportRoster.length === 0}
                  title="Printable QR badge sheet for the filtered roster"
                >
                  <Printer size={14} />
                  <span>QR Badges</span>
                </button>
              </div>
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <SortableTh sortKey="id" sort={rosterSort}>Attendee ID</SortableTh>
                    <SortableTh sortKey="name" sort={rosterSort}>Full Name</SortableTh>
                    <SortableTh sortKey="phone" sort={rosterSort}>Phone</SortableTh>
                    <SortableTh sortKey="sabha" sort={rosterSort}>Mandal-Sabha</SortableTh>
                    <SortableTh sortKey="karyakar" sort={rosterSort}>Karyakar</SortableTh>
                    <SortableTh sortKey="present" sort={rosterSort} firstDir="desc">Attendance Status</SortableTh>
                    {canCorrectClosed && <th>Correction</th>}
                  </tr>
                </thead>
                <tbody>
                  {reportRoster.slice(0, rosterVisible).map((row) => (
                    <tr key={row.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{row.id}</td>
                      <td style={{ fontWeight: 600 }}>
                        {row.name}
                        {row.offRoster && (
                          <span
                            className="badge badge-warning"
                            style={{ marginLeft: '0.4rem', fontSize: '0.68rem' }}
                            title={row.status !== 'approved'
                              ? `Checked in but still ${row.status} — approve them to add them to the roster`
                              : "Checked in but outside this event's sabha scope"}
                          >
                            Off-roster
                          </span>
                        )}
                      </td>
                      <td>{row.phone}</td>
                      <td>{row.sabha}</td>
                      <td>{row.karyakar}</td>
                      <td>
                        <span className={`badge ${row.present ? 'badge-success' : 'badge-danger'}`}>
                          {row.present ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      {canCorrectClosed && (
                        <td>
                          <button
                            onClick={() => handleCorrectAttendance(row)}
                            className="btn btn-ghost"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                            title={`Correct ${row.name}'s attendance for this closed event`}
                          >
                            {row.present ? <X size={13} /> : <Check size={13} />}
                            <span>{row.present ? 'Mark absent' : 'Mark present'}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {reportRoster.length > rosterVisible && (
                    <tr>
                      <td colSpan={canCorrectClosed ? 7 : 6} style={{ textAlign: 'center', padding: '0.75rem' }}>
                        <button onClick={() => setRosterVisible(v => v + PAGE_SIZE)} className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}>
                          Show more ({reportRoster.length - rosterVisible} remaining)
                        </button>
                      </td>
                    </tr>
                  )}
                  {reportRoster.length === 0 && (
                    <tr>
                      <td colSpan={canCorrectClosed ? 7 : 6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No records match the current filter selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Multi-Day Combined Report Tab */}
      {activeTab === 'multi-day' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Event picker */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Combine Events</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              A multi-day programme run as one event per day shows up here as separate events. Tick the
              days that belong together to see who attended all of them.
            </p>

            {combinableEvents.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No events to combine yet — only events that have left Draft can be included.
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.6rem' }}>
              {combinableEvents.map(e => {
                const checked = multiEventIds.includes(e.id);
                return (
                  <label
                    key={e.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                      padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-color)'}`,
                      backgroundColor: 'var(--bg-primary)'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setMultiEventIds(ids =>
                        ids.includes(e.id) ? ids.filter(x => x !== e.id) : [...ids, e.id]
                      )}
                    />
                    <span style={{ fontSize: '0.85rem' }}>
                      <strong>{e.name}</strong>
                      <br />
                      <span style={{ color: 'var(--text-muted)' }}>
                        {e.date} · {e.sabhaMandalScope}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {combinableEvents.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setMultiEventIds(combinableEvents.map(e => e.id))}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setMultiEventIds([])}
                  className="btn btn-ghost"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {multiEvents.length < 2 && (
            <div className="glass-panel" style={{ padding: '3rem', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Tick at least two events to build a combined report.
            </div>
          )}

          {multiEvents.length >= 2 && (
            <>
              {/* Day distribution */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                {dayDistribution.map(d => (
                  <div
                    key={d.days}
                    className="glass-panel"
                    style={{
                      padding: '1.1rem', borderRadius: 'var(--radius-md)', textAlign: 'center',
                      borderLeft: `3px solid ${d.days === multiEvents.length ? 'var(--success)' : d.days === 0 ? 'var(--danger)' : 'var(--warning)'}`
                    }}
                  >
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{d.count}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      attended {d.days} of {multiEvents.length} day{multiEvents.length === 1 ? '' : 's'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="glass-panel" style={{
                padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-md)',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end'
              }}>
                {/* Area, Sabha, Karyakar and Search all live in the shared
                    matchesView, so they narrow this tab too. They are rendered
                    here as well rather than filtering it invisibly. */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Area</label>
                  <select className="form-control" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                    <option value="All">All areas</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sabha Class</label>
                  <select className="form-control" value={selectedSabha} onChange={(e) => setSelectedSabha(e.target.value)}>
                    {uniqueSabhas.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Karyakar</label>
                  <select className="form-control" value={karyakarFilter} onChange={(e) => setKaryakarFilter(e.target.value)}>
                    {uniqueKaryakars.map(k => <option key={k} value={k}>{k === 'All' ? 'All karyakars' : k}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Attended at least</label>
                  <select className="form-control" value={effectiveMinDays} onChange={(e) => setMinDaysFilter(Number(e.target.value))}>
                    {multiEvents.map((_, i) => (
                      <option key={i} value={i}>{i === 0 ? 'Any number of days' : `${i} day${i === 1 ? '' : 's'}`}</option>
                    ))}
                    <option value={multiEvents.length}>All {multiEvents.length} days</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Search</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Name or Phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Matrix */}
              <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>
                    Combined Roster — {multiVisible.length} of {multiRoster.length} shown
                  </h4>
                  <button
                    onClick={handleExportMultiDay}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    disabled={multiVisible.length === 0}
                  >
                    <Download size={14} />
                    <span>Export Combined Report</span>
                  </button>
                </div>

                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <SortableTh sortKey="name" sort={multiSort}>Full Name</SortableTh>
                        <SortableTh sortKey="sabha" sort={multiSort}>Mandal-Sabha</SortableTh>
                        {multiEvents.map(e => (
                          <th key={e.id} title={`${e.name} — ${e.sabhaMandalScope}`}>{e.date}</th>
                        ))}
                        <SortableTh sortKey="daysAttended" sort={multiSort} firstDir="desc">Days Attended</SortableTh>
                        <SortableTh sortKey="percentage" sort={multiSort} firstDir="desc">%</SortableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {multiVisible.map(row => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td>{row.sabha}</td>
                          {row.cells.map((cell, i) => (
                            <td key={multiEvents[i].id}>
                              {cell.state === 'na' ? (
                                <span style={{ color: 'var(--text-muted)' }} title="Not in this event's sabha scope">—</span>
                              ) : (
                                <span
                                  className={`badge ${cell.state === 'present' ? 'badge-success' : 'badge-danger'}`}
                                  title={cell.offRoster ? "Checked in but outside this event's sabha scope" : undefined}
                                >
                                  {cell.state === 'present' ? (cell.offRoster ? 'Present*' : 'Present') : 'Absent'}
                                </span>
                              )}
                            </td>
                          ))}
                          <td style={{ fontWeight: 700 }}>
                            {row.daysAttended} / {row.daysApplicable}
                          </td>
                          <td>
                            <span className={`badge ${row.percentage >= 75 ? 'badge-success' : row.percentage >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                              {row.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                      {multiVisible.length === 0 && (
                        <tr>
                          <td colSpan={multiEvents.length + 4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No one matches the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                  <strong>—</strong> means that day did not apply to this person (their mandal was outside the
                  event's scope), so it is excluded from their total. <strong>Present*</strong> means they were
                  checked in on a day their mandal was not scoped for.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sabha-wise Attendance Summary Tab */}
      {activeTab === 'sabha-summary' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Sabha-wise Attendance Summary</h3>
            <button
              onClick={handleExportSabhaSummary}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              disabled={sabhaSummary.length === 0}
            >
              <Download size={14} />
              <span>Export to Excel</span>
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Head counts for one event: <strong>Present + Absent = Participants</strong> on every row, and the
            totals match the Present and Absent figures on the Attendance Roster tab for the same event.
            A mandal outside this event's scope is not listed.
          </p>

          {/* The numbers are per-event now, so the event has to be visible and
              changeable here rather than only on the attendance tab, whose
              picker this shares. */}
          <div className="form-group" style={{ marginBottom: '1.5rem', maxWidth: '420px' }}>
            <label className="form-label">Event</label>
            <select
              className="form-control"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.date})</option>
              ))}
            </select>
          </div>

          {!activeEvent && (
            <div className="badge badge-warning" style={{ display: 'block', padding: '0.85rem', fontSize: '0.85rem' }}>
              Select an event to see its mandal and area breakdown.
            </div>
          )}

          {/* Area rollup: the same numbers grouped a level up */}
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Area</h4>
          <div className="table-container" style={{ marginBottom: '2rem' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <SortableTh sortKey="area" sort={areaSort}>Area</SortableTh>
                  <SortableTh sortKey="sabhaCount" sort={areaSort} firstDir="desc">Mandals</SortableTh>
                  <SortableTh sortKey="members" sort={areaSort} firstDir="desc">Participants</SortableTh>
                  <SortableTh sortKey="present" sort={areaSort} firstDir="desc">Present</SortableTh>
                  <SortableTh sortKey="absent" sort={areaSort} firstDir="desc">Absent</SortableTh>
                  <SortableTh sortKey="percentage" sort={areaSort} firstDir="desc">Present %</SortableTh>
                </tr>
              </thead>
              <tbody>
                {areaSummary.map((row) => (
                  <tr key={row.area}>
                    <td style={{ fontWeight: 600 }}>{row.area}</td>
                    <td>{row.sabhaCount}</td>
                    <td>{row.members}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>
                      <span className={`badge ${
                        row.percentage >= 75 ? 'badge-success' : row.percentage >= 40 ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {row.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
                {areaSummary.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>By Mandal</h4>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <SortableTh sortKey="area" sort={mandalSort}>Area</SortableTh>
                  <SortableTh sortKey="sabha" sort={mandalSort}>Mandal / Sabha</SortableTh>
                  <SortableTh sortKey="members" sort={mandalSort} firstDir="desc">Participants</SortableTh>
                  <SortableTh sortKey="present" sort={mandalSort} firstDir="desc">Present</SortableTh>
                  <SortableTh sortKey="absent" sort={mandalSort} firstDir="desc">Absent</SortableTh>
                  <SortableTh sortKey="percentage" sort={mandalSort} firstDir="desc">Present %</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sabhaSummary.map((row) => (
                  <tr key={row.sabha}>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.area}</td>
                    <td style={{ fontWeight: 600 }}>{row.sabha}</td>
                    <td>{row.members}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>
                      <span className={`badge ${
                        row.percentage >= 75 ? 'badge-success' : row.percentage >= 40 ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {row.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
                {sabhaSummary.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No participant data available for summary.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ParticipantEditModal
        participant={editingParticipant}
        onClose={() => setEditingParticipant(null)}
      />

      {/* Printable QR Badge Sheet overlay */}
      <Modal
        open={showBadgeSheet}
        variant="sheet"
        className="badge-sheet-overlay"
        zIndex="var(--z-print-sheet)"
      >
        <div className="badge-sheet-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            QR Badge Sheet — {reportRoster.length} participant(s)
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => window.print()} className="btn btn-primary" style={{ padding: '0.5rem 1.25rem' }}>
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button onClick={() => setShowBadgeSheet(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>
              <X size={14} />
              <span>Close</span>
            </button>
          </div>
        </div>

        <div className="badge-sheet-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.75rem'
        }}>
          {reportRoster.map(p => (
            <div key={p.id} className="qr-badge" style={{
              backgroundColor: '#ffffff', color: '#111111',
              border: '1px solid #cccccc', borderRadius: '8px',
              padding: '0.9rem', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              breakInside: 'avoid'
            }}>
              <QrCode value={p.id} size={110} />
              <strong style={{ fontSize: '0.9rem' }}>{p.name}</strong>
              <span style={{ fontSize: '0.75rem', color: '#555555' }}>{p.sabha}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{p.id}</span>
            </div>
          ))}
        </div>

        {/* Print styles: badges only, white page */}
        <style>{`
          @media print {
            /* Modal locks body scrolling while open; overflow:hidden would truncate
               the printout to a single page. */
            body { overflow: visible !important; }
            body * { visibility: hidden; }
            .badge-sheet-overlay, .badge-sheet-overlay * { visibility: visible; }
            .badge-sheet-overlay { position: absolute !important; background: #fff !important; padding: 0 !important; }
            .badge-sheet-toolbar { display: none !important; }
          }
        `}</style>
      </Modal>

      {/* Data Quality Tab: duplicate merge tools, archive, and exception history */}
      {activeTab === 'data-quality' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {reviewMsg && (
            <div
              className={`badge ${reviewMsg.ok ? 'badge-success' : 'badge-danger'}`}
              style={{ display: 'block', padding: '0.6rem 0.9rem', fontSize: '0.85rem' }}
            >
              {reviewMsg.text}
            </div>
          )}

          {/* Possible duplicates with merge actions */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={20} color="var(--warning)" />
              <span>Possible Duplicate Records</span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Active participants sharing a guardian number, or carrying the same name within the same
              mandal. A name repeated across two different mandals is two different balaks, so it is not
              flagged. Merging moves attendance history to the record you keep and retains the other as a
              linked reference.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {duplicateGroups.map(group => (
                <div key={group.key} style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--warning-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem'
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600, marginBottom: '0.75rem' }}>
                    {group.key.startsWith('phone:')
                      ? `Shared guardian number ${group.key.slice(6)} — may be siblings`
                      : `Same name "${group.members[0].name}" in the same mandal (${group.members[0].sabha})`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {group.members.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <span>
                          <strong>{m.name}</strong> ({m.id}) — {m.phone || 'no phone'} | {m.sabha}
                          {m.status === 'pending' && <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>Pending</span>}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {group.members.filter(o => o.id !== m.id).map(other => (
                            <button
                              key={other.id}
                              onClick={() => {
                                if (window.confirm(`Merge "${other.name}" (${other.id}) INTO "${m.name}" (${m.id})? Attendance history moves to ${m.name}.`)) {
                                  // The result used to be discarded, so a refused
                                  // merge looked exactly like a successful one.
                                  reportReview(
                                    mergeParticipants(m.id, other.id),
                                    `Merged ${other.name} into ${m.name}. Attendance history moved.`
                                  );
                                }
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              title={`Keep ${m.name}, merge ${other.name} into it`}
                            >
                              Keep — merge {other.name.split(' ')[0]} in
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {duplicateGroups.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No duplicate phone numbers or names detected among active participants.
                </div>
              )}
            </div>
          </div>

          {/* Archive tool (retention decision D7) */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Archive a Participant</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              For removal requests: archiving takes a person off every roster and report while retaining their history for audit.
            </p>
            <input
              type="text"
              className="form-control"
              placeholder="Search name or phone to archive..."
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              style={{ marginBottom: '0.75rem', maxWidth: '420px' }}
            />
            {archiveSearch.trim() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activeParticipants
                  .filter(p => p.name.toLowerCase().includes(archiveSearch.toLowerCase()) || p.phone.includes(archiveSearch))
                  .slice(0, 5)
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.9rem' }}>
                      <span><strong>{p.name}</strong> ({p.id}) — {p.phone || 'no phone'} | {p.sabha}</span>
                      <button
                        onClick={() => {
                          if (window.confirm(`Archive "${p.name}" (${p.id})? They will disappear from all rosters; history is retained.`)) {
                            archiveParticipant(p.id);
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                      >
                        Archive
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Exception history: rejected / linked / archived */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>Exception Records</h3>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <SortableTh sortKey="id" sort={exceptionSort}>ID</SortableTh>
                    <SortableTh sortKey="name" sort={exceptionSort}>Name</SortableTh>
                    <SortableTh sortKey="phone" sort={exceptionSort}>Phone</SortableTh>
                    <SortableTh sortKey="status" sort={exceptionSort}>Status</SortableTh>
                    <SortableTh sortKey="linkedToId" sort={exceptionSort}>Linked To</SortableTh>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptionRecords.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{p.id}</td>
                      <td>{p.name}</td>
                      <td>{p.phone || '-'}</td>
                      <td>
                        <span className={`badge ${p.status === 'rejected' ? 'badge-danger' : 'badge-info'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{p.linkedToId || '-'}</td>
                      <td>
                        <button
                          onClick={() => restoreParticipant(p.id)}
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          title="Move back to the pending review queue"
                        >
                          Restore to Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {exceptionRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No rejected, linked, or archived records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue Tab */}
      {activeTab === 'pending-review' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} color="var(--warning)" />
            <span>Public Pre-Registrations Queue</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Check new registrations, approve them into the registry, or link to pre-existing participant sheets.
          </p>

          {reviewMsg && (
            <div
              className={`badge ${reviewMsg.ok ? 'badge-success' : 'badge-danger'}`}
              style={{ display: 'block', width: '100%', padding: '0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.85rem' }}
            >
              {reviewMsg.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {pendingRegistrations.map((p) => {
              // Candidate duplicates, each labelled with WHY it matched.
              //
              // Matching on phone alone is wrong twice over now that phone holds
              // the GUARDIAN's number: blank phones are stored as '' so '' === ''
              // made every phone-less record match every other one, and siblings
              // deliberately share a guardian number. Identity is name + number
              // together (participantKey), so anything less is a maybe, not a
              // "same person" — and the reviewer needs to see which.
              const pendingKey = participantKey(p.name, p.phone);
              const matches = participants
                .map(exist => {
                  if (exist.status !== 'approved' || exist.id === p.id) return null;
                  const sameName = exist.name.toLowerCase().trim() === p.name.toLowerCase().trim();
                  // Never treat two blank numbers as the same number
                  const samePhone = Boolean(p.phone) && exist.phone === p.phone;
                  if (participantKey(exist.name, exist.phone) === pendingKey && p.phone) {
                    return { ...exist, reason: 'Same name and guardian number', confident: true };
                  }
                  if (samePhone) return { ...exist, reason: 'Same guardian number — may be a sibling', confident: false };
                  // Same name inside one mandal is a strong signal even without a
                  // matching number; the same name in a different mandal is not.
                  if (sameName && sabhaNameKey(exist.sabha, exist.name) === sabhaNameKey(p.sabha, p.name)) {
                    return { ...exist, reason: 'Same name in the same mandal', confident: true };
                  }
                  if (sameName) return { ...exist, reason: 'Same name — different mandal, likely a different balak', confident: false };
                  return null;
                })
                .filter(Boolean)
                .sort((a, b) => Number(b.confident) - Number(a.confident));
              
              return (
                <div key={p.id} style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{p.name}</h4>
                      <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                        Phone: {p.phone || 'Not provided'} | Target Sabha: <strong>{p.sabha}</strong> | Guardian Contact Details: {canViewGuardianDetails ? (p.guardianDetails || 'None') : 'Restricted'}
                      </p>
                    </div>

                    {/* Actions Panel */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setEditingParticipant(p)}
                        className="btn btn-secondary"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                        title="Correct their details before approving"
                      >
                        <Pencil size={14} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleApproveRegistration(p.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', color: 'var(--success)', borderColor: 'var(--success-light)' }}
                      >
                        <UserCheck size={14} />
                        <span>Approve New</span>
                      </button>
                      <button
                        onClick={() => handleRejectRegistration(p.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger-light)' }}
                      >
                        <X size={14} />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>

                  {/* Suggest merging if duplicate exists */}
                  {matches.length > 0 && (
                    <div style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.05)',
                      border: '1px solid var(--warning-light)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem 1rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        <AlertCircle size={14} />
                        <span>Possible existing record{matches.length > 1 ? 's' : ''} — check before linking:</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingBottom: '0.35rem', borderBottom: '1px dashed var(--border-color)' }}>
                          This registration: <strong>{p.name}</strong> | {p.phone || 'no guardian number'} | {p.sabha}
                        </div>
                        {matches.map(m => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                            <span>
                              <strong>{m.name}</strong> ({m.id}) | {m.phone || 'no guardian number'} | {m.sabha}
                              <span
                                className={`badge ${m.confident ? 'badge-warning' : 'badge-info'}`}
                                style={{ marginLeft: '0.4rem', fontSize: '0.68rem' }}
                              >
                                {m.reason}
                              </span>
                            </span>
                            <button
                              onClick={() => handleLinkToExisting(p.id, m.id)}
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', gap: '0.15rem' }}
                            >
                              <LinkIcon size={10} />
                              <span>Link & Mark Present</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {pendingRegistrations.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                color: 'var(--text-muted)'
              }}>
                No pending registrations in review queue.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
