import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { 
  Download, 
  Search, 
  Filter, 
  Check, 
  X, 
  UserCheck, 
  Link as LinkIcon,
  AlertCircle
} from 'lucide-react';

export default function Reports() {
  const { 
    events, 
    participants, 
    attendance, 
    updateParticipant, 
    markPresent,
    addAuditLog
  } = useDb();

  const { user } = useAuth();

  // Filters state
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedSabha, setSelectedSabha] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' or 'pending-review'

  // Get active event details
  const activeEvent = events.find(e => e.id === selectedEventId);

  // Extract unique Sabhas from participants list
  const uniqueSabhas = ['All', ...new Set(participants.map(p => p.sabha))];

  // List of participants that should attend (based on event scope and filters)
  const targetParticipants = participants.filter(p => {
    // Exclude pending review registrations from standard reports list
    if (p.pendingReview) return false;

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
  const pendingRegistrations = participants.filter(p => p.pendingReview);

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
      'Guardian Contact Details': row.guardianDetails,
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

  // Review Flow Actions
  const handleApproveRegistration = (pId) => {
    updateParticipant(pId, { pendingReview: false, isNewRegistration: false });
    addAuditLog('Pending Registration Approved', `Approved registration for participant (ID: ${pId}).`);
  };

  const handleLinkToExisting = (pId, existingId) => {
    // Mark existing participant present for the event
    if (selectedEventId) {
      markPresent(selectedEventId, existingId);
    }
    // Delete the duplicate pending participant record by updating it as link placeholder
    updateParticipant(pId, { pendingReview: false, id: `LINKED-${Date.now()}` }); // Marks it linked/archived
    addAuditLog(
      'Pending Registration Linked', 
      `Linked pending registration ID: ${pId} to existing master record: ${existingId}.`
    );
  };

  const handleRejectRegistration = (pId) => {
    // Set pendingReview to false and set flag rejected
    updateParticipant(pId, { pendingReview: false, name: `[REJECTED] ${participants.find(p => p.id === pId).name}` });
    addAuditLog('Pending Registration Rejected', `Rejected public registration application (ID: ${pId}).`);
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
              <button 
                onClick={handleExportExcel} 
                className="btn btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                disabled={reportRoster.length === 0}
              >
                <Download size={14} />
                <span>Export to Excel</span>
              </button>
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
                  {reportRoster.map((row) => (
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
                !exist.pendingReview && 
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
                        Phone: {p.phone} | Target Sabha: <strong>{p.sabha}</strong> | Guardian Contact Details: {p.guardianDetails || 'None'}
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
