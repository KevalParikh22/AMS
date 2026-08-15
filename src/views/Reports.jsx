import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import QrCode from '../components/QrCode';
import Modal from '../components/Modal';
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
  Printer
} from 'lucide-react';

export default function Reports() {
  const {
    events,
    participants,
    attendance,
    markPresent,
    approveParticipant,
    rejectParticipant,
    linkParticipant,
    mergeParticipants,
    archiveParticipant,
    restoreParticipant,
    addAuditLog
  } = useDb();

  const { user, canViewGuardianDetails } = useAuth();

  // Filters state
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedSabha, setSelectedSabha] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'sabha-summary' | 'pending-review'

  // Get active event details
  const activeEvent = events.find(e => e.id === selectedEventId);

  // Extract unique Sabhas from participants list
  const uniqueSabhas = ['All', ...new Set(participants.map(p => p.sabha))];

  // List of participants that should attend (based on event scope and filters)
  const targetParticipants = participants.filter(p => {
    // Only approved registry members appear on standard rosters
    if (p.status !== 'approved') return false;

    // Filter by Sabha scope of event
    if (activeEvent && activeEvent.sabhaMandalScope !== 'All Sabhas') {
      if (p.sabha !== activeEvent.sabhaMandalScope) return false;
    }

    // Filter by manual dropdown sabha selection
    if (selectedSabha !== 'All' && p.sabha !== selectedSabha) return false;

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = p.name.toLowerCase().includes(q) || 
                    p.phone.includes(q) || 
                    p.id.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // Attach attendance state to participants list
  const reportRoster = targetParticipants.map(p => {
    const isPresent = attendance.some(
      a => a.eventId === selectedEventId && a.participantId === p.id
    );
    return {
      ...p,
      present: isPresent
    };
  }).filter(row => {
    // Filter by Attendance Status (Present/Absent)
    if (statusFilter === 'Present') return row.present;
    if (statusFilter === 'Absent') return !row.present;
    return true;
  });

  // Aggregates
  const totalExpected = targetParticipants.length;
  const totalPresent = targetParticipants.filter(p => 
    attendance.some(a => a.eventId === selectedEventId && a.participantId === p.id)
  ).length;
  const totalAbsent = totalExpected - totalPresent;

  // Pending public registrations list
  const pendingRegistrations = participants.filter(p => p.status === 'pending');

  // --- Data quality: duplicate detection and exception records ---
  const activeParticipants = participants.filter(p => p.status === 'approved' || p.status === 'pending');
  const duplicateGroups = (() => {
    const byKey = new Map();
    activeParticipants.forEach(p => {
      const keys = [];
      if (p.phone) keys.push('phone:' + p.phone.trim());
      keys.push('name:' + p.name.toLowerCase().trim());
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
  const exceptionRecords = participants.filter(
    p => p.status === 'rejected' || p.status === 'linked' || p.status === 'archived'
  );
  const [archiveSearch, setArchiveSearch] = useState('');
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [rosterVisible, setRosterVisible] = useState(50);

  // Sabha-wise attendance summary across events (Phase 0 decision D8).
  // Draft events are excluded; expected = members x relevant events.
  const summaryEvents = events.filter(e => e.status !== 'Draft');
  const sabhaSummary = [...new Set(participants.filter(p => p.status === 'approved').map(p => p.sabha))]
    .sort()
    .map(sabhaName => {
      const members = participants.filter(p => p.status === 'approved' && p.sabha === sabhaName);
      const relevantEvents = summaryEvents.filter(
        e => e.sabhaMandalScope === 'All Sabhas' || e.sabhaMandalScope === sabhaName
      );
      const memberIds = new Set(members.map(m => m.id));
      const relevantEventIds = new Set(relevantEvents.map(e => e.id));
      const presentMarks = attendance.filter(
        a => relevantEventIds.has(a.eventId) && memberIds.has(a.participantId)
      ).length;
      const expected = members.length * relevantEvents.length;
      return {
        sabha: sabhaName,
        members: members.length,
        eventCount: relevantEvents.length,
        presentMarks,
        expected,
        percentage: expected > 0 ? Math.round((presentMarks / expected) * 100) : 0
      };
    });

  const handleExportSabhaSummary = () => {
    const dataToExport = sabhaSummary.map(row => ({
      'Mandal/Sabha': row.sabha,
      'Participants': row.members,
      'Events Held': row.eventCount,
      'Present Marks': row.presentMarks,
      'Expected Marks': row.expected,
      'Attendance %': `${row.percentage}%`
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sabha Summary');
    XLSX.writeFile(wb, 'Sabha_Attendance_Summary.xlsx');
    addAuditLog('Export Report', 'Exported sabha-wise attendance summary to Excel.');
  };

  // Full multi-sheet workbook: roster + sabha summary + pending queue
  const handleExportFullReport = () => {
    if (!activeEvent) return;
    const wb = XLSX.utils.book_new();

    const rosterSheet = XLSX.utils.json_to_sheet(reportRoster.map(row => ({
      'Participant ID': row.id,
      'Full Name': row.name,
      'Contact Number': row.phone,
      'Mandal/Sabha Class': row.sabha,
      'Responsible Karyakar': row.karyakar,
      'Guardian Contact Details': canViewGuardianDetails ? row.guardianDetails : 'Restricted',
      'Attendance Status': row.present ? 'Present' : 'Absent'
    })));
    XLSX.utils.book_append_sheet(wb, rosterSheet, 'Attendance Roster');

    const summarySheet = XLSX.utils.json_to_sheet(sabhaSummary.map(row => ({
      'Mandal/Sabha': row.sabha,
      'Participants': row.members,
      'Events Held': row.eventCount,
      'Present Marks': row.presentMarks,
      'Expected Marks': row.expected,
      'Attendance %': `${row.percentage}%`
    })));
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Sabha Summary');

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

  // Review Flow Actions — proper record states, no name/ID rewrites
  const handleApproveRegistration = (pId) => {
    approveParticipant(pId);
  };

  const handleLinkToExisting = (pId, existingId) => {
    // Mark existing participant present for the event the registration targeted,
    // falling back to the event selected in the attendance tab
    const pending = participants.find(p => p.id === pId);
    const targetEventId = (pending && pending.registeredForEventId) || selectedEventId;
    if (targetEventId) {
      markPresent(targetEventId, existingId);
    }
    linkParticipant(pId, existingId);
  };

  const handleRejectRegistration = (pId) => {
    rejectParticipant(pId);
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
              </div>
              <div className="card" style={{ padding: '1rem', borderColor: 'var(--danger)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Absent</span>
                <h4 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)', marginTop: '0.25rem' }}>{totalAbsent}</h4>
              </div>
            </div>
          )}

          {/* Roster Report Table */}
          <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
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
                    <th>Attendee ID</th>
                    <th>Full Name</th>
                    <th>Phone</th>
                    <th>Mandal-Sabha</th>
                    <th>Karyakar</th>
                    <th>Attendance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRoster.slice(0, rosterVisible).map((row) => (
                    <tr key={row.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{row.id}</td>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td>{row.phone}</td>
                      <td>{row.sabha}</td>
                      <td>{row.karyakar}</td>
                      <td>
                        <span className={`badge ${row.present ? 'badge-success' : 'badge-danger'}`}>
                          {row.present ? 'Present' : 'Absent'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {reportRoster.length > rosterVisible && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '0.75rem' }}>
                        <button onClick={() => setRosterVisible(v => v + 50)} className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}>
                          Show more ({reportRoster.length - rosterVisible} remaining)
                        </button>
                      </td>
                    </tr>
                  )}
                  {reportRoster.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Attendance percentage per sabha across all Active and Closed events in scope. Draft events are excluded.
          </p>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Mandal / Sabha</th>
                  <th>Participants</th>
                  <th>Events Held</th>
                  <th>Present Marks</th>
                  <th>Expected Marks</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {sabhaSummary.map((row) => (
                  <tr key={row.sabha}>
                    <td style={{ fontWeight: 600 }}>{row.sabha}</td>
                    <td>{row.members}</td>
                    <td>{row.eventCount}</td>
                    <td>{row.presentMarks}</td>
                    <td>{row.expected}</td>
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

          {/* Possible duplicates with merge actions */}
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={20} color="var(--warning)" />
              <span>Possible Duplicate Records</span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Active participants sharing a phone number or exact name. Merging moves attendance history to the record you keep and retains the other as a linked reference.
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
                    Shared {group.key.startsWith('phone:') ? `phone ${group.key.slice(6)}` : `name "${group.members[0].name}"`}
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
                                  mergeParticipants(m.id, other.id);
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
                    <th>ID</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Linked To</th>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {pendingRegistrations.map((p) => {
              // Find likely duplicate match candidates in database
              const matches = participants.filter(exist =>
                exist.status === 'approved' &&
                (exist.phone === p.phone || exist.name.toLowerCase().trim() === p.name.toLowerCase().trim())
              );
              
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
                        <span>Found Matching Master Record:</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {matches.map(m => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                            <span>Name: {m.name} | Phone: {m.phone} | Sabha: {m.sabha}</span>
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
