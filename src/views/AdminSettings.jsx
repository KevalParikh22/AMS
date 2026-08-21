import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth, ROLES } from '../context/AuthContext';
import { isCloudMode } from '../lib/supabase';
import * as XLSX from 'xlsx';
import {
  Trash2,
  Plus,
  Database,
  RotateCcw,
  Layers,
  Users,
  ShieldAlert,
  ClipboardList,
  UserCog,
  Download
} from 'lucide-react';

export default function AdminSettings() {
  const {
    sabhas,
    karyakars,
    participants,
    auditLogs,
    clearDatabase,
    resetToFactoryDefault,
    cloudStatus,
    uploadLocalSandbox,
    setSabhas,
    setKaryakars,
    saveToStorage,
    addLookupEntries,
    addAuditLog
  } = useDb();

  const { user, users, addManagedUser, addCloudUser, removeManagedUser, setManagedUserEnabled, setManagedUserRole } = useAuth();

  // Lookup Entry Forms
  const [newSabha, setNewSabha] = useState('');
  const [newKaryakar, setNewKaryakar] = useState('');
  const [newKaryakarSabha, setNewKaryakarSabha] = useState('');

  // User management form
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  // Registration Volunteer is the tier a typical event volunteer needs: it
  // covers marking attendance (base level) AND registering walk-ins, without
  // granting undo, approvals, Events, or Reports.
  const [newUserRole, setNewUserRole] = useState(ROLES.REGISTRATION_VOLUNTEER);
  const [userMsg, setUserMsg] = useState('');

  // Audit log filters
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('All');

  // Status Messages
  const [dbSuccess, setDbSuccess] = useState('');

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      // Cloud mode creates a real Supabase login; sandbox mode only adds a
      // local role entry (there are no passwords there).
      const result = isCloudMode
        ? await addCloudUser(newUserName, newUserUsername, newUserPassword, newUserRole)
        : addManagedUser(newUserName, newUserUsername, newUserRole);

      if (result.success) {
        addAuditLog('User Account Created', `Created user "${newUserName}" (${result.username}) with role: ${newUserRole}.`);
        setUserMsg(`${newUserName} can now sign in as ${result.username}.`);
        setNewUserName('');
        setNewUserUsername('');
        setNewUserPassword('');
      } else {
        setUserMsg(result.message);
      }
    } finally {
      setAddingUser(false);
      setTimeout(() => setUserMsg(''), 6000);
    }
  };

  const handleToggleUser = (u) => {
    const result = setManagedUserEnabled(u.username, !u.enabled);
    if (result.success) {
      addAuditLog(
        u.enabled ? 'User Account Disabled' : 'User Account Enabled',
        `${u.enabled ? 'Disabled' : 'Enabled'} account @${u.username} (${u.name}).`
      );
    } else {
      setUserMsg(result.message);
      setTimeout(() => setUserMsg(''), 3500);
    }
  };

  const handleRemoveUser = async (u) => {
    const warning = isCloudMode
      ? `Remove ${u.name} (${u.email || u.username})?\n\nThey will be signed out and can never sign in again. Their attendance and audit history is kept.\n\nTheir Supabase login is not deleted — to reuse that email address you must also remove it from Authentication → Users in the dashboard.`
      : `Remove ${u.name} (@${u.username})? They will no longer be able to sign in.`;
    if (!window.confirm(warning)) return;

    const result = await removeManagedUser(u);
    if (result.success) {
      addAuditLog('User Account Removed', `Removed account ${u.email || '@' + u.username} (${u.name}), role: ${u.role}.`);
    }
    setUserMsg(result.message);
    setTimeout(() => setUserMsg(''), 8000);
  };

  // --- Karyakar ↔ sabha mapping import ---------------------------------
  // Bulk-loads the lookup list from a two-column sheet. Nothing is written
  // until the admin confirms the preview, because a typo'd sabha would
  // otherwise silently become a real sabha in every dropdown.
  const [mapPreview, setMapPreview] = useState(null);
  const [applyRemaps, setApplyRemaps] = useState(true);
  // Off by default: this rewrites participant records, not just the lookup list.
  const [cascadeParticipants, setCascadeParticipants] = useState(false);
  const [mapMsg, setMapMsg] = useState('');
  const mapFileRef = React.useRef(null);

  const KARYAKAR_SYNONYMS = ['karyakar', 'mentor', 'teacher', 'responsible'];
  const SABHA_SYNONYMS = ['sabha', 'mandal', 'class', 'group'];

  const handleMappingFile = (e) => {
    setMapMsg('');
    setMapPreview(null);
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1, defval: '', raw: false
        });
        if (matrix.length < 2) {
          setMapMsg('That file has no data rows.');
          return;
        }
        const headers = matrix[0].map(h => String(h).trim().toLowerCase());
        // Match sabha first: "Karyakar Name" must not be captured by a loose
        // sabha synonym, and vice versa.
        const sabhaCol = headers.findIndex(h => SABHA_SYNONYMS.some(x => h.includes(x)));
        const karyakarCol = headers.findIndex((h, i) => i !== sabhaCol && KARYAKAR_SYNONYMS.some(x => h.includes(x)));
        if (karyakarCol === -1 || sabhaCol === -1) {
          setMapMsg(`Could not find both columns. Found headers: ${matrix[0].join(', ') || '(none)'}. Expected a karyakar name column and a mandal/sabha column.`);
          return;
        }

        const seen = new Set();
        const newKaryakars = [];
        const remaps = [];
        const unchanged = [];
        const newSabhas = new Set();
        let skipped = 0;

        matrix.slice(1).forEach(row => {
          const name = String(row[karyakarCol] ?? '').trim();
          const sabha = String(row[sabhaCol] ?? '').trim();
          if (!name || !sabha) { skipped++; return; }
          if (seen.has(name.toLowerCase())) { skipped++; return; }
          seen.add(name.toLowerCase());

          if (!sabhas.includes(sabha)) newSabhas.add(sabha);
          const existing = karyakars.find(k => k.name === name);
          if (!existing) newKaryakars.push({ name, sabha });
          else if (existing.sabha !== sabha) remaps.push({ name, from: existing.sabha, to: sabha });
          else unchanged.push(name);
        });

        // How many balaks would follow their karyakar — same rule the cascade
        // itself applies: active records still sitting in the karyakar's old sabha.
        const moves = new Map(remaps.map(r => [r.name, r]));
        const affectedParticipants = participants.filter(p => {
          if (p.status !== 'approved' && p.status !== 'pending') return false;
          const m = moves.get(p.karyakar);
          return !!m && p.sabha === m.from;
        }).length;

        setMapPreview({
          fileName: file.name,
          newKaryakars,
          remaps,
          unchanged,
          newSabhas: [...newSabhas],
          skipped,
          affectedParticipants
        });
      } catch (err) {
        console.error(err);
        setMapMsg('Could not read that file. Make sure it is a .csv or .xlsx.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleApplyMapping = () => {
    if (!mapPreview) return;
    const result = addLookupEntries({
      sabhas: mapPreview.newSabhas,
      karyakars: mapPreview.newKaryakars,
      remapKaryakars: applyRemaps ? mapPreview.remaps.map(r => ({ name: r.name, sabha: r.to })) : [],
      cascadeParticipants: applyRemaps && cascadeParticipants
    });
    if (result.error) {
      setMapMsg(result.error);
      return;
    }
    setMapMsg(
      `Added ${result.addedKaryakars.length} karyakar(s) and ${result.addedSabhas.length} sabha(s)` +
      (result.remapped.length ? `, remapped ${result.remapped.length}` : '') +
      (result.movedParticipants ? `, moved ${result.movedParticipants} participant(s)` : '') + '.'
    );
    setMapPreview(null);
    if (mapFileRef.current) mapFileRef.current.value = '';
    setTimeout(() => setMapMsg(''), 6000);
  };

  const handleDownloadMappingSample = () => {
    const rows = (karyakars.length ? karyakars : [{ name: 'Ghanshyam Patel', sabha: sabhas[0] || 'Bal Sabha - Sub-group A1' }])
      .map(k => ({ 'Karyakar Name': k.name, 'Mandal-Sabha': k.sabha }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ['Karyakar Name', 'Mandal-Sabha'] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Karyakar Mapping');
    XLSX.writeFile(wb, 'karyakar_mapping_sample.csv', { bookType: 'csv' });
  };

  // Audit filtering
  const actionTypes = ['All', ...new Set(auditLogs.map(l => l.action))];
  const filteredLogs = auditLogs.filter(log => {
    if (logActionFilter !== 'All' && log.action !== logActionFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      return log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        String(log.userId).toLowerCase().includes(q);
    }
    return true;
  });

  const [migrateMsg, setMigrateMsg] = useState('');
  const hasSandboxBackup = isCloudMode && !!localStorage.getItem('ams_sandbox_backup');

  const handleUploadSandbox = async () => {
    if (!window.confirm('Upload the saved local sandbox data into the cloud database? Existing cloud rows with the same IDs will be overwritten.')) return;
    setMigrateMsg('Uploading...');
    const result = await uploadLocalSandbox();
    setMigrateMsg(result.success ? 'Sandbox data uploaded to the cloud successfully.' : result.message);
  };

  const handleExportAuditLog = () => {
    const ws = XLSX.utils.json_to_sheet(filteredLogs.map(log => ({
      'Timestamp': new Date(log.timestamp).toLocaleString(),
      'Action': log.action,
      'User': log.userId,
      'Role': log.userRole,
      'Details': log.details
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
    XLSX.writeFile(wb, 'Audit_Log.xlsx');
  };

  const handleAddSabha = (e) => {
    e.preventDefault();
    if (!newSabha.trim()) return;
    if (sabhas.includes(newSabha.trim())) return;

    const updated = [...sabhas, newSabha.trim()];
    setSabhas(updated);
    saveToStorage('ams_sabhas', updated);
    addAuditLog('Add Sabha Type', `Added new Sabha group: "${newSabha.trim()}"`);
    setNewSabha('');
  };

  const handleRemoveSabha = (name) => {
    const updated = sabhas.filter(s => s !== name);
    setSabhas(updated);
    saveToStorage('ams_sabhas', updated);
    addAuditLog('Remove Sabha Type', `Removed Sabha group: "${name}"`);
  };

  const handleAddKaryakar = (e) => {
    e.preventDefault();
    const name = newKaryakar.trim();
    if (!name) return;
    if (karyakars.some(k => k.name === name)) return;

    const sabhaAssignment = newKaryakarSabha || sabhas[0] || 'Unassigned';
    const updated = [...karyakars, { name, sabha: sabhaAssignment }];
    setKaryakars(updated);
    saveToStorage('ams_karyakars', updated);
    addAuditLog('Add Karyakar Profile', `Added new Karyakar: "${name}" mapped to sabha: "${sabhaAssignment}"`);
    setNewKaryakar('');
  };

  const handleRemoveKaryakar = (name) => {
    const updated = karyakars.filter(k => k.name !== name);
    setKaryakars(updated);
    saveToStorage('ams_karyakars', updated);
    addAuditLog('Remove Karyakar Profile', `Removed Karyakar: "${name}"`);
  };

  const handleDbClear = () => {
    if (window.confirm('WARNING: Are you sure you want to delete all participants, events, attendance history, and logs? This is irreversible.')) {
      clearDatabase();
      setDbSuccess('Central database wiped successfully.');
      setTimeout(() => setDbSuccess(''), 3000);
    }
  };

  const handleDbResetDefault = () => {
    if (window.confirm('Reset database to default sandbox mock data? This will clear custom changes.')) {
      resetToFactoryDefault();
      setDbSuccess('Factory mock database restored.');
      setTimeout(() => setDbSuccess(''), 3000);
    }
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {dbSuccess && (
        <div className="badge badge-success" style={{ padding: '1rem', borderRadius: 'var(--radius-md)', display: 'block', width: '100%', textAlign: 'center' }}>
          {dbSuccess}
        </div>
      )}

      {/* Grid: Sabha and Karyakar lookups manager */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.5rem'
      }}>
        {/* Sabha Groups Manager */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Layers size={18} color="var(--accent)" />
            <span>Manage Sabha Assemblies</span>
          </h3>

          <form onSubmit={handleAddSabha} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Kishore Mandal B" 
              value={newSabha}
              onChange={(e) => setNewSabha(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem' }}>
              <Plus size={16} />
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {sabhas.map(s => (
              <div key={s} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <span style={{ fontSize: '0.875rem' }}>{s}</span>
                <button 
                  onClick={() => handleRemoveSabha(s)}
                  className="btn btn-ghost" 
                  style={{ padding: '0.25rem', color: 'var(--danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Karyakar profiles manager */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Users size={18} color="var(--accent)" />
            <span>Manage Karyakars (Mentors)</span>
          </h3>

          <form onSubmit={handleAddKaryakar} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Rajesh Patel"
                value={newKaryakar}
                onChange={(e) => setNewKaryakar(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem' }}>
                <Plus size={16} />
              </button>
            </div>
            <select
              className="form-control"
              value={newKaryakarSabha}
              onChange={(e) => setNewKaryakarSabha(e.target.value)}
              title="Sabha this karyakar is responsible for"
            >
              <option value="">Map to sabha: {sabhas[0] || 'Unassigned'} (default)</option>
              {sabhas.map(s => (
                <option key={s} value={s}>Map to sabha: {s}</option>
              ))}
            </select>
          </form>

          {/* Bulk import of the karyakar -> sabha mapping */}
          <div style={{
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Import mapping from a sheet</span>
              <button onClick={handleDownloadMappingSample} className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}>
                <Download size={12} />
                <span>Sample</span>
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Two columns: <strong>Karyakar Name</strong> and <strong>Mandal-Sabha</strong>. Nothing is saved until you review the preview.
            </p>
            <input
              type="file"
              ref={mapFileRef}
              accept=".csv,.xlsx,.xls"
              onChange={handleMappingFile}
              className="form-control"
              style={{ fontSize: '0.75rem', padding: '0.35rem' }}
            />

            {mapMsg && (
              <div className="badge badge-info" style={{ display: 'block', padding: '0.5rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                {mapMsg}
              </div>
            )}

            {mapPreview && (
              <div style={{ fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-success">New: {mapPreview.newKaryakars.length}</span>
                  <span className="badge badge-warning">Mapping changes: {mapPreview.remaps.length}</span>
                  <span className="badge badge-info" style={{ opacity: 0.75 }}>Unchanged: {mapPreview.unchanged.length}</span>
                  {mapPreview.skipped > 0 && <span className="badge badge-danger">Skipped: {mapPreview.skipped}</span>}
                </div>

                {mapPreview.newSabhas.length > 0 && (
                  <div style={{ color: 'var(--warning)' }}>
                    <strong>These sabhas do not exist yet and will be created:</strong>
                    <div style={{ color: 'var(--text-secondary)' }}>{mapPreview.newSabhas.join(', ')}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Check for typos — a misspelling becomes a real sabha in every dropdown.</div>
                  </div>
                )}

                {mapPreview.remaps.length > 0 && (
                  <div>
                    <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={applyRemaps}
                        onChange={(e) => setApplyRemaps(e.target.checked)}
                        style={{ marginTop: '0.15rem' }}
                      />
                      <span>
                        <strong>Move {mapPreview.remaps.length} existing karyakar(s)</strong> to the sabha in the file:
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {mapPreview.remaps.slice(0, 6).map(r => `${r.name}: ${r.from} → ${r.to}`).join('; ')}
                          {mapPreview.remaps.length > 6 && ` …and ${mapPreview.remaps.length - 6} more`}
                        </div>
                      </span>
                    </label>

                    {applyRemaps && mapPreview.affectedParticipants > 0 && (
                      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', cursor: 'pointer', marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                        <input
                          type="checkbox"
                          checked={cascadeParticipants}
                          onChange={(e) => setCascadeParticipants(e.target.checked)}
                          style={{ marginTop: '0.15rem' }}
                        />
                        <span>
                          Also move <strong>{mapPreview.affectedParticipants} balak(s)</strong> under {mapPreview.remaps.length === 1 ? 'that karyakar' : 'those karyakars'} into the new sabha.
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            Edits participant records. Only those still in the karyakar's old sabha are moved; anyone already elsewhere is left alone.
                          </div>
                        </span>
                      </label>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleApplyMapping} className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>
                    Apply
                  </button>
                  <button
                    onClick={() => { setMapPreview(null); if (mapFileRef.current) mapFileRef.current.value = ''; }}
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {karyakars.map(k => (
              <div key={k.name} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.875rem' }}>{k.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k.sabha}</span>
                </div>
                <button
                  onClick={() => handleRemoveKaryakar(k.name)}
                  className="btn btn-ghost"
                  style={{ padding: '0.25rem', color: 'var(--danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Backend Status */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={18} color="var(--accent)" />
          <div>
            <strong style={{ fontSize: '0.95rem' }}>
              Data backend: {isCloudMode ? 'Supabase Cloud' : 'Local Sandbox (this device only)'}
            </strong>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              {isCloudMode
                ? 'Data syncs across devices. Accounts are created in the Supabase dashboard; roles are assigned below.'
                : 'Data lives in this browser’s storage. Configure Supabase (see SETUP-BACKEND.md) for multi-device sync and real logins.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${
            cloudStatus === 'online' ? 'badge-success' :
            cloudStatus === 'local' ? 'badge-info' :
            cloudStatus === 'syncing' ? 'badge-warning' : 'badge-danger'
          }`}>
            {cloudStatus === 'local' ? 'Sandbox' : cloudStatus}
          </span>
          {hasSandboxBackup && (
            <button onClick={handleUploadSandbox} className="btn btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}>
              Upload sandbox data to cloud
            </button>
          )}
        </div>
        {migrateMsg && (
          <div className="badge badge-info" style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
            {migrateMsg}
          </div>
        )}
      </div>

      {/* User Account Management */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
        <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <UserCog size={18} color="var(--accent)" />
          <span>User Accounts & Roles</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          {isCloudMode
            ? 'Add a volunteer here and they can sign in immediately on their own phone. Accounts created any other way (including self-signup) stay disabled until you enable them below.'
            : 'Create volunteer/coordinator accounts and disable access when someone leaves. (Passwords arrive once cloud mode is configured.)'}
        </p>

        {userMsg && (
          <div className="badge badge-info" style={{ display: 'block', padding: '0.6rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)' }}>
            {userMsg}
          </div>
        )}

        <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Full Name</label>
            <input type="text" className="form-control" placeholder="e.g. Mehul Trivedi" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{isCloudMode ? 'Email (their login)' : 'Username'}</label>
            <input
              type={isCloudMode ? 'email' : 'text'}
              className="form-control"
              placeholder={isCloudMode ? 'e.g. mehul@example.com' : 'e.g. mehul_t'}
              value={newUserUsername}
              onChange={(e) => setNewUserUsername(e.target.value)}
              required
            />
          </div>
          {isCloudMode && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Initial Password</label>
              <input
                type="text"
                className="form-control"
                placeholder="min. 6 characters"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Role</label>
            <select className="form-control" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
              {Object.values(ROLES).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem' }} disabled={addingUser}>
            <Plus size={16} />
            <span>{addingUser ? 'Creating…' : 'Add User'}</span>
          </button>
        </form>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.enabled ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {isCloudMode ? (u.email || `#${String(u.id).slice(0, 8)}`) : `@${u.username}`}
                  </td>
                  <td>
                    {isCloudMode ? (
                      <select
                        className="form-control"
                        value={u.role}
                        onChange={(e) => setManagedUserRole(u.id, e.target.value)}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot change your own role' : 'Assign role'}
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                      >
                        {Object.values(ROLES).map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : u.role}
                  </td>
                  <td>
                    <span className={`badge ${u.enabled ? 'badge-success' : 'badge-danger'}`}>
                      {u.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button
                        onClick={() => handleToggleUser(u)}
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: u.enabled ? 'var(--danger)' : 'var(--success)' }}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot disable your own account' : (u.enabled ? 'Temporarily revoke access; can be re-enabled' : 'Restore access')}
                      >
                        {u.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleRemoveUser(u)}
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot remove your own account' : 'Remove this account permanently'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Maintenance and Reset Controls */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
        <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--danger)' }}>
          <ShieldAlert size={18} />
          <span>System Maintenance Controls</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Destructive operations for sandbox configuration. Ensure all reports have been exported before resetting.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={handleDbResetDefault} className="btn btn-secondary">
            <RotateCcw size={16} />
            <span>Restore Factory Mock Data</span>
          </button>
          <button onClick={handleDbClear} className="btn btn-danger">
            <Trash2 size={16} />
            <span>Clear Central Database</span>
          </button>
        </div>
      </div>

      {/* Complete Audit Logs Grid view */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <ClipboardList size={18} color="var(--accent)" />
            <span>System Audit Logbook</span>
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search logs..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              style={{ width: '200px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            />
            <select
              className="form-control"
              value={logActionFilter}
              onChange={(e) => setLogActionFilter(e.target.value)}
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              {actionTypes.map(a => (
                <option key={a} value={a}>{a === 'All' ? 'All Actions' : a}</option>
              ))}
            </select>
            <button onClick={handleExportAuditLog} className="btn btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} disabled={filteredLogs.length === 0}>
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operation Action</th>
                <th>User (Role)</th>
                <th>Details Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.action}</td>
                  <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {log.userId} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({log.userRole})</span>
                  </td>
                  <td style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>{log.details}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No audit records match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
