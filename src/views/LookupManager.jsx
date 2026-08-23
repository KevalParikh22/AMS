import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import Modal from '../components/Modal';
import LookupImporters from '../components/LookupImporters';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  GitMerge,
  Search,
  AlertTriangle
} from 'lucide-react';

const UNASSIGNED_KARYAKAR = 'None Assigned';

// Mandals and karyakars, with the operations that were previously impossible:
// rename (there was none anywhere in the app), merge, delete-with-reassign, and
// changing a karyakar's mandal without re-importing a CSV.
//
// Its own screen because a mandal's NAME is its identity — every one of these
// is a multi-table cascade, and they need room to show what they are about to
// touch before they touch it.
export default function LookupManager() {
  const {
    sabhas, sabhaNames, areas, karyakars,
    lookupUsage, addSabha, setSabhaArea, renameSabha, mergeSabhas, deleteSabha,
    addKaryakar, renameKaryakar, deleteKaryakar, setKaryakarSabha
  } = useDb();

  const [tab, setTab] = useState('mandals');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState(null);
  const [dialog, setDialog] = useState(null);

  const [newSabha, setNewSabha] = useState('');
  const [newSabhaArea, setNewSabhaArea] = useState('');
  const [newKaryakar, setNewKaryakar] = useState('');
  const [newKaryakarSabha, setNewKaryakarSabha] = useState('');

  const usage = lookupUsage();

  const report = (result, successText) => {
    if (!result?.success) {
      setMsg({ ok: false, text: result?.message || 'That could not be completed.' });
      return false;
    }
    setMsg({ ok: true, text: result.unchanged ? 'Nothing to change.' : successText });
    // In cloud mode the change is only real once it reaches Supabase, and a
    // cascade can fail part-way — that message matters more than most.
    result.syncPromise?.catch(err => setMsg({ ok: false, text: err.message }));
    setTimeout(() => setMsg(null), 9000);
    return true;
  };

  const q = search.trim().toLowerCase();
  const visibleSabhas = sabhas
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.area).toLowerCase().includes(q))
    .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  const visibleKaryakars = karyakars
    .filter(k => !q || k.name.toLowerCase().includes(q) || String(k.sabha).toLowerCase().includes(q))
    .sort((a, b) => a.sabha.localeCompare(b.sabha) || a.name.localeCompare(b.name));

  const sabhaUse = (n) => usage.sabhas[n] || { participants: 0, activeParticipants: 0, karyakars: 0, events: 0, openEvents: 0 };
  const karyakarUse = (n) => usage.karyakars[n] || { participants: 0, activeParticipants: 0 };

  // --- actions -------------------------------------------------------
  const submitRenameSabha = (from, to, allowMerge) => {
    const result = renameSabha(from, to, { allowMerge });
    if (result.requiresMerge) {
      setDialog({ kind: 'merge-sabha', from, to, message: result.message });
      return;
    }
    if (report(result, `Renamed "${from}" to "${to}". ${result.counts?.participants ?? 0} balak(s) updated.`)) {
      setDialog(null);
    }
  };

  const submitDeleteSabha = (name, reassignTo) => {
    const result = deleteSabha(name, { reassignTo: reassignTo || null });
    if (result.requiresReassign) {
      setDialog({ kind: 'delete-sabha', name, usage: result.usage, message: result.message });
      return;
    }
    if (report(result, reassignTo
      ? `Deleted "${name}" and moved everything to "${reassignTo}".`
      : `Deleted "${name}".`)) {
      setDialog(null);
    }
  };

  const submitRenameKaryakar = (from, to, allowMerge) => {
    const result = renameKaryakar(from, to, { allowMerge });
    if (result.requiresMerge) {
      setDialog({ kind: 'merge-karyakar', from, to, message: result.message });
      return;
    }
    if (report(result, `Renamed "${from}" to "${to}". ${result.counts?.participants ?? 0} balak(s) updated.`)) {
      setDialog(null);
    }
  };

  const submitDeleteKaryakar = (name, reassignTo) => {
    const result = deleteKaryakar(name, { reassignTo: reassignTo || null });
    if (result.requiresReassign) {
      setDialog({ kind: 'delete-karyakar', name, usage: result.usage, message: result.message });
      return;
    }
    if (report(result, reassignTo
      ? `Deleted "${name}" and reassigned their balaks to "${reassignTo}".`
      : `Deleted "${name}".`)) {
      setDialog(null);
    }
  };

  const tabStyle = (id) => ({
    background: 'none',
    border: 'none',
    borderBottom: tab === id ? '2px solid var(--accent)' : 'none',
    color: tab === id ? 'var(--accent)' : 'var(--text-secondary)',
    padding: '0.75rem 1.5rem',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600
  });

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div className="card" style={{ background: 'linear-gradient(to right, var(--bg-secondary), rgba(var(--accent-rgb), 0.02))' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers color="var(--accent)" size={22} />
          <span>Mandals &amp; Karyakars</span>
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
          A mandal is identified by its name, and balaks, karyakars and event scopes all refer to it by
          that name. Renaming or merging one therefore rewrites every record that points at it — the
          counts below show exactly how many before you commit.
        </p>
      </div>

      {msg && (
        <div className={`badge ${msg.ok ? 'badge-success' : 'badge-danger'}`}
          style={{ display: 'block', padding: '0.85rem', fontSize: '0.85rem' }}>
          {msg.text}
        </div>
      )}

      {(usage.orphanSabhas.length > 0 || usage.orphanKaryakars.length > 0) && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <AlertTriangle size={16} color="var(--warning)" />
            <strong style={{ fontSize: '0.9rem' }}>Names in use but not configured</strong>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Records point at these, but they are not in the lists below — usually from an older roster or
            an import. They appear in reports but in no dropdown. Merge them into a real one to tidy up.
            {usage.orphanSabhas.length > 0 && <><br /><strong>Mandals:</strong> {usage.orphanSabhas.join(', ')}</>}
            {usage.orphanKaryakars.length > 0 && <><br /><strong>Karyakars:</strong> {usage.orphanKaryakars.join(', ')}</>}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1rem' }}>
        <button onClick={() => setTab('mandals')} style={tabStyle('mandals')}>Mandals ({sabhas.length})</button>
        <button onClick={() => setTab('karyakars')} style={tabStyle('karyakars')}>Karyakars ({karyakars.length})</button>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Search size={14} /><span>Search</span>
        </label>
        <input
          type="text"
          className="form-control"
          placeholder={tab === 'mandals' ? 'Mandal or area…' : 'Karyakar or mandal…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ---------------- Mandals ---------------- */}
      {tab === 'mandals' && (
        <>
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (report(addSabha(newSabha, newSabhaArea), `Added mandal "${newSabha.trim()}".`)) {
                  setNewSabha('');
                  setNewSabhaArea('');
                }
              }}
              style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
            >
              <input type="text" className="form-control" placeholder="New mandal name"
                value={newSabha} onChange={(e) => setNewSabha(e.target.value)}
                style={{ flex: '2 1 200px' }} required />
              <input type="text" className="form-control" placeholder="Area (optional)" list="lm-areas"
                value={newSabhaArea} onChange={(e) => setNewSabhaArea(e.target.value)}
                style={{ flex: '1 1 140px' }} />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem' }}>
                <Plus size={16} /><span>Add</span>
              </button>
            </form>
            <datalist id="lm-areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
          </div>

          <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Mandal</th>
                    <th>Area</th>
                    <th>Balaks</th>
                    <th>Karyakars</th>
                    <th>Events</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSabhas.map(s => {
                    const u = sabhaUse(s.name);
                    return (
                      <tr key={s.name}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td>
                          <input
                            type="text"
                            className="form-control"
                            list="lm-areas"
                            // Controlled by name+area so a realtime update or an
                            // import is reflected here, unlike the uncontrolled
                            // input this replaces.
                            key={`${s.name}:${s.area}`}
                            defaultValue={s.area}
                            onBlur={(e) => {
                              if (e.target.value.trim() === s.area) return;
                              report(setSabhaArea(s.name, e.target.value), `Moved "${s.name}" to area "${e.target.value.trim()}".`);
                            }}
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', minWidth: '110px' }}
                          />
                        </td>
                        <td>
                          {u.participants}
                          {u.participants !== u.activeParticipants && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> ({u.activeParticipants} active)</span>
                          )}
                        </td>
                        <td>{u.karyakars}</td>
                        <td>
                          {u.events}
                          {u.openEvents > 0 && (
                            <span className="badge badge-warning" style={{ marginLeft: '0.35rem', fontSize: '0.68rem' }}>
                              {u.openEvents} open
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                              onClick={() => setDialog({ kind: 'rename-sabha', name: s.name, value: s.name })}>
                              <Pencil size={12} /><span>Rename</span>
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                              onClick={() => setDialog({ kind: 'merge-sabha-pick', name: s.name, value: '' })}>
                              <GitMerge size={12} /><span>Merge</span>
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                              onClick={() => submitDeleteSabha(s.name, null)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleSabhas.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      {sabhas.length === 0 ? 'No mandals configured yet.' : 'No mandal matches that search.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Karyakars ---------------- */}
      {tab === 'karyakars' && (
        <>
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const sabha = newKaryakarSabha || sabhaNames[0] || '';
                if (report(addKaryakar(newKaryakar, sabha), `Added karyakar "${newKaryakar.trim()}".`)) {
                  setNewKaryakar('');
                }
              }}
              style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
            >
              <input type="text" className="form-control" placeholder="New karyakar name"
                value={newKaryakar} onChange={(e) => setNewKaryakar(e.target.value)}
                style={{ flex: '2 1 200px' }} required />
              <select className="form-control" value={newKaryakarSabha}
                onChange={(e) => setNewKaryakarSabha(e.target.value)} style={{ flex: '1 1 160px' }}>
                <option value="">{sabhaNames[0] || 'Unassigned'} (default)</option>
                {sabhaNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1rem' }}>
                <Plus size={16} /><span>Add</span>
              </button>
            </form>
          </div>

          <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Karyakar</th>
                    <th>Mandal</th>
                    <th>Balaks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleKaryakars.map(k => {
                    const u = karyakarUse(k.name);
                    return (
                      <tr key={k.name}>
                        <td style={{ fontWeight: 600 }}>{k.name}</td>
                        <td>
                          <select
                            className="form-control"
                            value={k.sabha}
                            onChange={(e) => setDialog({
                              kind: 'move-karyakar', name: k.name, from: k.sabha, to: e.target.value, cascade: true
                            })}
                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', minWidth: '150px' }}
                          >
                            {!sabhaNames.includes(k.sabha) && <option value={k.sabha}>{k.sabha}</option>}
                            {sabhaNames.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>
                          {u.participants}
                          {u.participants !== u.activeParticipants && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> ({u.activeParticipants} active)</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                              onClick={() => setDialog({ kind: 'rename-karyakar', name: k.name, value: k.name })}>
                              <Pencil size={12} /><span>Rename</span>
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                              onClick={() => submitDeleteKaryakar(k.name, null)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleKaryakars.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      {karyakars.length === 0 ? 'No karyakars configured yet.' : 'No karyakar matches that search.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <LookupImporters />

      <LookupDialog
        dialog={dialog}
        setDialog={setDialog}
        sabhaNames={sabhaNames}
        karyakars={karyakars}
        sabhaUse={sabhaUse}
        karyakarUse={karyakarUse}
        onRenameSabha={submitRenameSabha}
        onMergeSabha={(from, to) => report(mergeSabhas(from, to), `Merged "${from}" into "${to}".`) && setDialog(null)}
        onDeleteSabha={submitDeleteSabha}
        onRenameKaryakar={submitRenameKaryakar}
        onDeleteKaryakar={submitDeleteKaryakar}
        onMoveKaryakar={(name, to, cascade) =>
          report(setKaryakarSabha(name, to, { cascadeParticipants: cascade }), `Moved "${name}" to "${to}".`) && setDialog(null)}
      />
    </div>
  );
}

// Every destructive action confirms with the counts it is about to touch.
function LookupDialog({
  dialog, setDialog, sabhaNames, karyakars, sabhaUse, karyakarUse,
  onRenameSabha, onMergeSabha, onDeleteSabha, onRenameKaryakar, onDeleteKaryakar, onMoveKaryakar
}) {
  const [value, setValue] = useState('');
  const [cascade, setCascade] = useState(true);

  React.useEffect(() => {
    setValue(dialog?.value ?? dialog?.to ?? '');
    setCascade(dialog?.cascade ?? true);
  }, [dialog]);

  if (!dialog) return null;
  const close = () => setDialog(null);

  const Title = ({ children }) => (
    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>{children}</h3>
  );
  const Actions = ({ onConfirm, label, danger }) => (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
      <button onClick={close} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Cancel</button>
      <button onClick={onConfirm} className="btn btn-primary"
        style={{ padding: '0.5rem 1rem', ...(danger ? { backgroundColor: 'var(--danger)' } : {}) }}>
        {label}
      </button>
    </div>
  );

  return (
    <Modal open onClose={close} maxWidth="520px">
      {dialog.kind === 'rename-sabha' && (() => {
        const u = sabhaUse(dialog.name);
        return (
          <>
            <Title>Rename mandal</Title>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              <strong>{u.participants}</strong> balak record(s), <strong>{u.karyakars}</strong> karyakar(s) and{' '}
              <strong>{u.events}</strong> event scope(s) point at "{dialog.name}" and will be updated to match.
            </p>
            <input className="form-control" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <Actions onConfirm={() => onRenameSabha(dialog.name, value, false)} label="Rename" />
          </>
        );
      })()}

      {dialog.kind === 'merge-sabha-pick' && (
        <>
          <Title>Merge "{dialog.name}" into another mandal</Title>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Everything referencing "{dialog.name}" moves across and "{dialog.name}" is removed. This cannot be undone.
          </p>
          <select className="form-control" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose the mandal to keep…</option>
            {sabhaNames.filter(s => s !== dialog.name).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Actions onConfirm={() => value && onMergeSabha(dialog.name, value)} label="Merge" danger />
        </>
      )}

      {dialog.kind === 'merge-sabha' && (
        <>
          <Title>"{dialog.to}" already exists</Title>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{dialog.message}</p>
          <Actions onConfirm={() => onRenameSabha(dialog.from, dialog.to, true)} label="Merge them" danger />
        </>
      )}

      {dialog.kind === 'delete-sabha' && (
        <>
          <Title>"{dialog.name}" is still in use</Title>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{dialog.message}</p>
          {dialog.usage?.openEvents > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--warning)', marginBottom: '0.75rem' }}>
              <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
              {dialog.usage.openEvents} of those events is still open — the public check-in link would stamp
              a deleted mandal onto every walk-in it creates.
            </p>
          )}
          <label className="form-label">Move everything to</label>
          <select className="form-control" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose a mandal…</option>
            {sabhaNames.filter(s => s !== dialog.name).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Actions onConfirm={() => value && onDeleteSabha(dialog.name, value)} label="Move and delete" danger />
        </>
      )}

      {dialog.kind === 'rename-karyakar' && (() => {
        const u = karyakarUse(dialog.name);
        return (
          <>
            <Title>Rename karyakar</Title>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              <strong>{u.participants}</strong> balak record(s) name "{dialog.name}" and will be updated.
              Their mandal is not affected.
            </p>
            <input className="form-control" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <Actions onConfirm={() => onRenameKaryakar(dialog.name, value, false)} label="Rename" />
          </>
        );
      })()}

      {dialog.kind === 'merge-karyakar' && (
        <>
          <Title>"{dialog.to}" already exists</Title>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{dialog.message}</p>
          <Actions onConfirm={() => onRenameKaryakar(dialog.from, dialog.to, true)} label="Merge them" danger />
        </>
      )}

      {dialog.kind === 'delete-karyakar' && (
        <>
          <Title>"{dialog.name}" still has balaks</Title>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{dialog.message}</p>
          <label className="form-label">Reassign their balaks to</label>
          <select className="form-control" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose…</option>
            <option value={UNASSIGNED_KARYAKAR}>{UNASSIGNED_KARYAKAR} (leave unassigned)</option>
            {karyakars.filter(k => k.name !== dialog.name).map(k => <option key={k.name} value={k.name}>{k.name}</option>)}
          </select>
          <Actions onConfirm={() => value && onDeleteKaryakar(dialog.name, value)} label="Reassign and delete" danger />
        </>
      )}

      {dialog.kind === 'move-karyakar' && (
        <>
          <Title>Move "{dialog.name}" to {dialog.to}</Title>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            <span>
              Also move their balaks who are still in "{dialog.from}".
              <br />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Balaks already in another mandal stay put, and archived or rejected records are never moved.
              </span>
            </span>
          </label>
          <Actions onConfirm={() => onMoveKaryakar(dialog.name, dialog.to, cascade)} label="Move" />
        </>
      )}
    </Modal>
  );
}
