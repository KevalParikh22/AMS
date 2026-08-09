import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import { 
  Trash2, 
  Plus, 
  Database, 
  RotateCcw, 
  Layers, 
  Users, 
  ShieldAlert,
  ClipboardList
} from 'lucide-react';

export default function AdminSettings() {
  const { 
    sabhas, 
    karyakars, 
    auditLogs, 
    clearDatabase, 
    resetToFactoryDefault,
    setSabhas,
    setKaryakars,
    addAuditLog
  } = useDb();

  const { user } = useAuth();

  // Lookup Entry Forms
  const [newSabha, setNewSabha] = useState('');
  const [newKaryakar, setNewKaryakar] = useState('');
  
  // Status Messages
  const [dbSuccess, setDbSuccess] = useState('');

  const handleAddSabha = (e) => {
    e.preventDefault();
    if (!newSabha.trim()) return;
    if (sabhas.includes(newSabha.trim())) return;

    const updated = [...sabhas, newSabha.trim()];
    setSabhas(updated);
    localStorage.setItem('ams_sabhas', JSON.stringify(updated));
    addAuditLog('Add Sabha Type', `Added new Sabha group: "${newSabha.trim()}"`);
    setNewSabha('');
  };

  const handleRemoveSabha = (name) => {
    const updated = sabhas.filter(s => s !== name);
    setSabhas(updated);
    localStorage.setItem('ams_sabhas', JSON.stringify(updated));
    addAuditLog('Remove Sabha Type', `Removed Sabha group: "${name}"`);
  };

  const handleAddKaryakar = (e) => {
    e.preventDefault();
    if (!newKaryakar.trim()) return;
    if (karyakars.includes(newKaryakar.trim())) return;

    const updated = [...karyakars, newKaryakar.trim()];
    setKaryakars(updated);
    localStorage.setItem('ams_karyakars', JSON.stringify(updated));
    addAuditLog('Add Karyakar Profile', `Added new Karyakar: "${newKaryakar.trim()}"`);
    setNewKaryakar('');
  };

  const handleRemoveKaryakar = (name) => {
    const updated = karyakars.filter(k => k !== name);
    setKaryakars(updated);
    localStorage.setItem('ams_karyakars', JSON.stringify(updated));
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

          <form onSubmit={handleAddKaryakar} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
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
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {karyakars.map(k => (
              <div key={k} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <span style={{ fontSize: '0.875rem' }}>{k}</span>
                <button 
                  onClick={() => handleRemoveKaryakar(k)}
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
        <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <ClipboardList size={18} color="var(--accent)" />
          <span>System Audit Logbook</span>
        </h3>
        
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
              {auditLogs.map((log) => (
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
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No audit records registered.
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
