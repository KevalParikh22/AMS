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
    auditLogs,
    clearDatabase,
    resetToFactoryDefault,
    cloudStatus,
    uploadLocalSandbox,
    setSabhas,
    setKaryakars,
    saveToStorage,
    addAuditLog
  } = useDb();

  const { user, users, addManagedUser, addCloudUser, setManagedUserEnabled, setManagedUserRole } = useAuth();

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
                    <button
                      onClick={() => handleToggleUser(u)}
                      className="btn btn-ghost"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: u.enabled ? 'var(--danger)' : 'var(--success)' }}
                      disabled={u.id === user?.id}
                      title={u.id === user?.id ? 'You cannot disable your own account' : (u.enabled ? 'Disable account' : 'Enable account')}
                    >
                      {u.enabled ? 'Disable' : 'Enable'}
                    </button>
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
