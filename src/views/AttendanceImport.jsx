import React, { useState, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth, ROLES } from '../context/AuthContext';
import { autoMapHeaders } from '../lib/columnMapping';
import { extractGuardianPhone, normalizePhone, participantKey } from '../lib/participantIdentity';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  UserCheck
} from 'lucide-react';

// A sheet of people to mark present. Only three columns matter; everything else
// in the file is ignored, so an exported roster or a signing-in sheet both work.
const ATTENDANCE_FIELDS = {
  id: { label: 'Participant ID', required: false, synonyms: ['participant id', 'reference id', 'attendee id', 'balak id'] },
  name: { label: 'Name', required: false, synonyms: ['name', 'full name', 'balak name'] },
  phone: { label: 'Guardian Number', required: false, synonyms: ['guardian mobile number', 'phone', 'mobile', 'cell', 'number'] },
  guardianDetails: { label: 'Guardian Contact Details', required: false, synonyms: ['guardian contact details', 'guardian', 'parent'] }
};

const BUCKET_STYLE = {
  match: { badge: 'badge-success', label: 'Will mark present' },
  already: { badge: 'badge-info', label: 'Already present' },
  ambiguous: { badge: 'badge-warning', label: 'Ambiguous' },
  notFound: { badge: 'badge-danger', label: 'Not found' }
};

export default function AttendanceImport() {
  const { events, participants, attendance, markPresentBulk, getEffectiveStatus } = useDb();
  const { hasPermission } = useAuth();

  const [selectedEventId, setSelectedEventId] = useState('');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [summary, setSummary] = useState(null);
  const fileRef = useRef(null);

  const importableEvents = [...events]
    .filter(e => e.status !== 'Draft')
    .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));

  const activeEvent = events.find(e => e.id === selectedEventId);
  const eventClosed = activeEvent ? getEffectiveStatus(activeEvent) === 'Closed' : false;
  const canCorrectClosed = hasPermission(ROLES.ADMIN);
  const blockedByClosed = eventClosed && !canCorrectClosed;

  const handleDownloadSample = () => {
    const sample = participants.slice(0, 3).map(p => ({
      'Participant ID': p.id,
      'Name': p.name,
      'Guardian Mobile Number': p.phone || ''
    }));
    if (sample.length === 0) {
      sample.push({ 'Participant ID': 'P-101', 'Name': 'Sample Balak', 'Guardian Mobile Number': '9876543210' });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample), 'Attendance');
    XLSX.writeFile(wb, 'attendance_import_sample.csv', { bookType: 'csv' });
  };

  // Classify every row against the roster. Nothing is written here — this is
  // purely what the import WOULD do, so the sheet can be fixed first.
  const analyse = (matrix, eventId) => {
    const headers = matrix[0].map(h => String(h).trim());
    const mappings = autoMapHeaders(headers, ATTENDANCE_FIELDS);
    if (mappings.id === -1 && mappings.name === -1) {
      setErrorMsg(`Could not find a Participant ID or Name column. Found headers: ${headers.join(', ') || '(none)'}.`);
      return;
    }

    const presentIds = new Set(
      attendance.filter(a => a.eventId === eventId).map(a => a.participantId)
    );
    const cell = (row, key) => (mappings[key] > -1 && row[mappings[key]] !== undefined
      ? String(row[mappings[key]]).trim()
      : '');

    const seen = new Set();
    const analysed = matrix.slice(1).map((row, i) => {
      const sheetRow = i + 2; // 1-based, and row 1 is the header
      const id = cell(row, 'id');
      const name = cell(row, 'name');
      const guardianDetails = cell(row, 'guardianDetails');
      const phone = normalizePhone(cell(row, 'phone')) || extractGuardianPhone(guardianDetails);
      const label = name || id || `row ${sheetRow}`;

      if (!id && !name) return null; // blank line

      let match = null;
      let bucket = 'notFound';
      let note = '';

      if (id) {
        match = participants.find(p => p.id === id) || null;
        if (!match) {
          note = `No participant has ID ${id}`;
        }
      } else {
        // Name + guardian number is the identity rule the rest of the app uses.
        const byKey = participants.filter(
          p => participantKey(p.name, p.phone) === participantKey(name, phone) &&
            (p.status === 'approved' || p.status === 'pending')
        );
        if (byKey.length === 1) {
          match = byKey[0];
        } else if (byKey.length > 1) {
          bucket = 'ambiguous';
          note = `${byKey.length} people share this name and number`;
        } else {
          // Fall back to name alone, but only to REPORT the ambiguity — never
          // to guess. Siblings share a guardian number, so a name-only match is
          // not evidence of who actually turned up.
          const byName = participants.filter(
            p => p.name.trim().toLowerCase() === name.trim().toLowerCase() &&
              (p.status === 'approved' || p.status === 'pending')
          );
          if (byName.length === 1 && !phone) {
            match = byName[0];
          } else if (byName.length > 1) {
            bucket = 'ambiguous';
            note = `${byName.length} people are called "${name}" — add a Participant ID column to say which`;
          } else {
            note = phone ? `No match for "${name}" with number ${phone}` : `No match for "${name}"`;
          }
        }
      }

      if (match) {
        if (presentIds.has(match.id)) {
          bucket = 'already';
          note = 'Already marked present for this event';
        } else if (seen.has(match.id)) {
          bucket = 'already';
          note = 'Listed more than once in this file';
        } else {
          bucket = 'match';
          seen.add(match.id);
          note = `${match.name} (${match.id})`;
        }
      }

      return { sheetRow, label, bucket, note, participantId: match ? match.id : null };
    }).filter(Boolean);

    const counts = { match: 0, already: 0, ambiguous: 0, notFound: 0 };
    analysed.forEach(r => { counts[r.bucket]++; });
    setRows({ analysed, counts, headers, mappings });
  };

  const handleFileChange = (e) => {
    setErrorMsg('');
    setSummary(null);
    setRows(null);
    const uploaded = e.target.files[0];
    if (!uploaded) return;
    if (!selectedEventId) {
      setErrorMsg('Choose the event this sheet belongs to first.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(uploaded);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1, defval: '', raw: false
        });
        if (matrix.length < 2) {
          setErrorMsg('That file has no data rows.');
          return;
        }
        analyse(matrix, selectedEventId);
      } catch (err) {
        console.error(err);
        setErrorMsg('Could not read that file. Make sure it is a .csv or .xlsx.');
      }
    };
    reader.readAsArrayBuffer(uploaded);
  };

  const handleConfirm = () => {
    if (!rows || !activeEvent) return;
    const ids = rows.analysed.filter(r => r.bucket === 'match').map(r => r.participantId);
    if (ids.length === 0) return;

    const result = markPresentBulk(selectedEventId, ids, { allowClosed: eventClosed && canCorrectClosed });
    if (!result.success) {
      setErrorMsg(result.message);
      return;
    }
    setSummary(result);
    result.syncPromise?.catch(err => setErrorMsg(err.message));
    setRows(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const reset = () => {
    setFile(null);
    setRows(null);
    setErrorMsg('');
    setSummary(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div className="card" style={{ background: 'linear-gradient(to right, var(--bg-secondary), rgba(var(--accent-rgb), 0.02))' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserCheck color="var(--accent)" size={20} />
          <span>Mark attendance from a sheet</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
          Upload a list of people who attended and mark them all present in one go. The sheet needs a
          <strong> Participant ID</strong> column, or a <strong>Name</strong> (plus a guardian number if
          two balaks share a name). Nothing is written until you confirm, and rows that do not match
          anyone are listed rather than creating new people.
        </p>
      </div>

      {errorMsg && (
        <div className="badge badge-danger" style={{ display: 'block', padding: '0.85rem', fontSize: '0.85rem' }}>
          {errorMsg}
        </div>
      )}

      {summary && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--success)' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={18} />
            <span>Attendance imported</span>
          </h4>
          <ul style={{ listStyle: 'none', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <li>✅ Marked present: <strong>{summary.marked}</strong></li>
            <li>➖ Already present (skipped): <strong>{summary.alreadyPresent}</strong></li>
            {summary.unknown > 0 && <li>⚠️ Unknown participant: <strong>{summary.unknown}</strong></li>}
          </ul>
        </div>
      )}

      {/* Event + file */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Mark present for which event?</label>
          <select
            className="form-control"
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); reset(); }}
          >
            <option value="">Select an event…</option>
            {importableEvents.map(e => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.date}){getEffectiveStatus(e) === 'Closed' ? ' — Closed' : ''}
              </option>
            ))}
          </select>
        </div>

        {blockedByClosed && (
          <div className="badge badge-danger" style={{ display: 'block', padding: '0.75rem', fontSize: '0.82rem' }}>
            This event is closed. Only an administrator can add attendance to it.
          </div>
        )}
        {eventClosed && canCorrectClosed && (
          <div className="badge badge-warning" style={{ display: 'block', padding: '0.75rem', fontSize: '0.82rem' }}>
            This event is closed. As an administrator you can still import into it — every row is logged
            as a correction against your name.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="form-control"
            style={{ flex: '1 1 240px', fontSize: '0.85rem', padding: '0.4rem' }}
            disabled={!selectedEventId || blockedByClosed}
          />
          <button onClick={handleDownloadSample} className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}>
            <Download size={13} />
            <span>Sample</span>
          </button>
        </div>
        {file && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <UploadCloud size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            {file.name}
          </div>
        )}
      </div>

      {/* Preview */}
      {rows && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="badge badge-success">Will mark present: {rows.counts.match}</span>
            <span className="badge badge-info">Already present: {rows.counts.already}</span>
            {rows.counts.ambiguous > 0 && <span className="badge badge-warning">Ambiguous: {rows.counts.ambiguous}</span>}
            {rows.counts.notFound > 0 && <span className="badge badge-danger">Not found: {rows.counts.notFound}</span>}
          </div>

          {(rows.counts.ambiguous > 0 || rows.counts.notFound > 0) && (
            <div style={{
              padding: '0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--warning)',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)'
            }}>
              <AlertTriangle size={14} color="var(--warning)" style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              These rows will be <strong>skipped</strong>, not created. Fix them in the sheet and upload
              again, or register those people first.
            </div>
          )}

          <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Sheet row</th>
                  <th>From the file</th>
                  <th>Outcome</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {/* Problems first — they are what the reviewer needs to act on. */}
                {[...rows.analysed]
                  .sort((a, b) => {
                    const rank = { notFound: 0, ambiguous: 1, already: 2, match: 3 };
                    return rank[a.bucket] - rank[b.bucket] || a.sheetRow - b.sheetRow;
                  })
                  .map(r => (
                    <tr key={r.sheetRow}>
                      <td style={{ color: 'var(--text-muted)' }}>{r.sheetRow}</td>
                      <td style={{ fontWeight: 600 }}>{r.label}</td>
                      <td>
                        <span className={`badge ${BUCKET_STYLE[r.bucket].badge}`}>
                          {BUCKET_STYLE[r.bucket].label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{r.note}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{ padding: '0.6rem 1.25rem' }}
              disabled={rows.counts.match === 0 || blockedByClosed}
            >
              <CheckCircle2 size={16} />
              <span>Mark {rows.counts.match} present</span>
            </button>
            <button onClick={reset} className="btn btn-secondary" style={{ padding: '0.6rem 1.25rem' }}>
              <RefreshCw size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
