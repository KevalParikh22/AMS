import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import ParticipantEditModal from '../components/ParticipantEditModal';
import { Users, Search, Pencil } from 'lucide-react';

// Every lifecycle status a record can hold. The directory can reach all of
// them — unlike queryParticipants, which deliberately hides rejected, linked
// and archived people so they never surface at the attendance desk.
const STATUS_OPTIONS = ['All', 'approved', 'pending', 'rejected', 'linked', 'archived'];

const STATUS_BADGE = {
  approved: 'badge-success',
  pending: 'badge-warning',
  rejected: 'badge-danger',
  linked: 'badge-info',
  archived: 'badge-info'
};

const PAGE_SIZE = 30;

// The full balak registry: every participant, unscoped by event.
//
// Reports shows a roster filtered to one event's sabha scope, so anyone
// outside that scope simply is not there to correct. This is the screen for
// managing the records themselves.
export default function BalakDirectory() {
  const { participants, sabhas } = useDb();

  const [search, setSearch] = useState('');
  const [sabhaFilter, setSabhaFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState(null);

  // Reset paging whenever the result set changes underneath, so "Show more"
  // never leaves a stale offset over a shorter list.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sabhaFilter, statusFilter]);

  const q = search.trim().toLowerCase();
  const filtered = participants.filter(p => {
    if (statusFilter !== 'All' && p.status !== statusFilter) return false;
    if (sabhaFilter !== 'All' && p.sabha !== sabhaFilter) return false;
    if (!q) return true;
    return [p.name, p.id, p.phone, p.sabha, p.karyakar, p.guardianDetails]
      .some(field => String(field || '').toLowerCase().includes(q));
  });

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const visible = sorted.slice(0, visibleCount);
  const isFiltered = Boolean(q) || sabhaFilter !== 'All' || statusFilter !== 'All';

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div className="card" style={{ background: 'linear-gradient(to right, var(--bg-secondary), rgba(var(--accent-rgb), 0.02))' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users color="var(--accent)" size={22} />
          <span>Balak Registry</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
          Every participant in the system, across all sabhas and events. Search for someone and
          correct their details here — this is the only place that also reaches archived and
          rejected records.
        </p>
      </div>

      {/* Filters */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={14} />
              <span>Search</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Name, ID, guardian number, sabha or karyakar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sabha</label>
            <select className="form-control" value={sabhaFilter} onChange={(e) => setSabhaFilter(e.target.value)}>
              <option value="All">All sabhas</option>
              {sabhas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Showing <strong>{visible.length}</strong> of <strong>{sorted.length}</strong>
          {isFiltered && <> matching — {participants.length} in the system</>}
          {!isFiltered && <> total</>}
        </div>
      </div>

      {/* Registry table */}
      <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Guardian No.</th>
                <th>Mandal-Sabha</th>
                <th>Karyakar</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{p.id}</td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.phone || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{p.sabha}</td>
                  <td>{p.karyakar}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[p.status] || 'badge-info'}`}>{p.status}</span>
                  </td>
                  <td>
                    <button
                      onClick={() => setEditing(p)}
                      className="btn btn-ghost"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      title={`Edit ${p.name}`}
                    >
                      <Pencil size={13} />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}

              {sorted.length > visibleCount && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '0.75rem' }}>
                    <button
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}
                    >
                      Show more ({sorted.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {participants.length === 0
                      ? 'No participants yet — import a roster or register someone.'
                      : 'No one matches these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ParticipantEditModal participant={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
