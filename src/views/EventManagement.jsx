import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth, ROLES } from '../context/AuthContext';
import Modal from '../components/Modal';
import QrCode from '../components/QrCode';
import {
  Calendar,
  Plus,
  Check,
  Copy,
  Clock,
  Users,
  Play,
  Archive,
  AlertTriangle,
  Share2,
  RefreshCw,
  Pencil,
  Trash2
} from 'lucide-react';

// The public link is query-string routed, so it works from whatever path the
// app is served at without any host rewrite rule.
// Omitting eventId yields the permanent link: it resolves to whichever event
// is Active when someone opens it, so it never goes stale.
const buildShareUrl = (eventId) =>
  `${window.location.origin}${window.location.pathname}?view=shared-registration${eventId ? `&eventId=${eventId}` : ''}`;

export default function EventManagement() {
  const { events, addEvent, updateEvent, deleteEvent, attendance, sabhaNames, getEffectiveStatus, isEventExpired } = useDb();
  const { hasPermission } = useAuth();
  // Closed events are Admin-only to change, matching the post-close
  // attendance correction already in place.
  const canEditClosed = hasPermission(ROLES.ADMIN);
  const editingClosed = editingEventId
    ? (() => { const ev = events.find(e => e.id === editingEventId); return ev ? getEffectiveStatus(ev) === 'Closed' : false; })()
    : false;
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Set while editing an existing event: the same form serves both, so the
  // create and edit fields cannot drift apart.
  const [editingEventId, setEditingEventId] = useState(null);
  const [reopenEvent, setReopenEvent] = useState(null);
  const [reopenUntil, setReopenUntil] = useState('');
  const [msg, setMsg] = useState(null);
  const [copiedEventId, setCopiedEventId] = useState(null);
  const [shareEventId, setShareEventId] = useState(null);
  const [usePermanent, setUsePermanent] = useState(true);

  // Form States
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('18:00');
  const [sabhaScope, setSabhaScope] = useState('All Sabhas');
  const [status, setStatus] = useState('Draft');

  // Every action reports its outcome. The status toggle used to discard
  // updateEvent's return entirely, so a refusal looked identical to success.
  const report = (result, successText) => {
    if (!result?.success) {
      setMsg({ ok: false, text: result?.message || 'That could not be completed.' });
      setTimeout(() => setMsg(null), 9000);
      return false;
    }
    setMsg({ ok: true, text: result.unchanged ? 'Nothing to change.' : successText });
    result.syncPromise?.catch(err => setMsg({ ok: false, text: err.message }));
    setTimeout(() => setMsg(null), 9000);
    return true;
  };

  const resetForm = () => {
    setName('');
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('16:00');
    setEndTime('18:00');
    setSabhaScope('All Sabhas');
    setStatus('Draft');
    setEditingEventId(null);
    setShowCreateModal(false);
  };

  const openEditModal = (event) => {
    setEditingEventId(event.id);
    setName(event.name);
    setDate(event.date);
    setStartTime(event.startTime || '16:00');
    setEndTime(event.endTime || '18:00');
    setSabhaScope(event.sabhaMandalScope || 'All Sabhas');
    setStatus(event.status || 'Draft');
    setShowCreateModal(true);
  };

  const handleSubmitEvent = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fields = { name, date, startTime, endTime, sabhaMandalScope: sabhaScope, status };

    if (editingEventId) {
      const target = events.find(ev => ev.id === editingEventId);
      const wasClosed = target && getEffectiveStatus(target) === 'Closed';
      const result = updateEvent(editingEventId, fields, { allowClosed: wasClosed && canEditClosed });
      if (!report(result, `Updated "${name}".`)) return;
    } else {
      addEvent(fields);
      setMsg({ ok: true, text: `Created "${name}".` });
      setTimeout(() => setMsg(null), 9000);
    }
    resetForm();
  };

  const handleDeleteEvent = (event) => {
    const marks = attendance.filter(a => a.eventId === event.id).length;
    if (marks > 0) {
      // Say why before the confirm, rather than after a pointless prompt.
      setMsg({
        ok: false,
        text: `"${event.name}" has ${marks} attendance record(s) and cannot be deleted — that register would be lost. Close it instead.`
      });
      setTimeout(() => setMsg(null), 9000);
      return;
    }
    if (!window.confirm(`Delete "${event.name}" (${event.date})?\n\nIt has no attendance records, so nothing is lost. This cannot be undone.`)) return;
    report(deleteEvent(event.id), `Deleted "${event.name}".`);
  };

  // Reopening an expired event means genuinely extending its window: because
  // getEffectiveStatus derives Closed from date + endTime, flipping the status
  // alone leaves it closed and the auto-close sweep re-persists that on reload.
  const handleReopen = () => {
    if (!reopenEvent || !reopenUntil) return;
    const result = updateEvent(
      reopenEvent.id,
      { endTime: reopenUntil, date: new Date().toISOString().split('T')[0], status: 'Active' },
      { allowClosed: true }
    );
    if (report(result, `"${reopenEvent.name}" is open again until ${reopenUntil}.`)) {
      setReopenEvent(null);
      setReopenUntil('');
    }
  };

  const openReopenModal = (event) => {
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
    setReopenUntil(`${String(inTwoHours.getHours()).padStart(2, '0')}:${String(inTwoHours.getMinutes()).padStart(2, '0')}`);
    setReopenEvent(event);
  };

  const handleCopyLink = (eventId) => {
    navigator.clipboard.writeText(buildShareUrl(eventId)).then(() => {
      setCopiedEventId(eventId || '__permanent__');
      setTimeout(() => setCopiedEventId(null), 2000);
    });
  };

  const toggleEventStatus = (event) => {
    const current = getEffectiveStatus(event);
    let nextStatus = 'Draft';
    if (current === 'Draft') nextStatus = 'Active';
    else if (current === 'Active') nextStatus = 'Closed';
    else if (current === 'Closed') nextStatus = 'Active'; // Reopen

    const wasClosed = current === 'Closed';
    report(
      updateEvent(event.id, { status: nextStatus }, { allowClosed: wasClosed && canEditClosed }),
      `"${event.name}" is now ${nextStatus}.`
    );
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* View Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Schedule assemblies, set attendee scopes, and distribute public pre-registration links.
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn btn-primary"
        >
          <Plus size={16} />
          <span>Assemble New Event</span>
        </button>
      </div>

      {msg && (
        <div className={`badge ${msg.ok ? 'badge-success' : 'badge-danger'}`}
          style={{ display: 'block', padding: '0.85rem', fontSize: '0.85rem' }}>
          {msg.text}
        </div>
      )}

      {/* Reopen an event that has passed its end time.
          Flipping the status is not enough on its own — getEffectiveStatus
          derives Closed from date + endTime, so the window has to move too. */}
      <Modal open={Boolean(reopenEvent)} onClose={() => setReopenEvent(null)} maxWidth="460px">
        {reopenEvent && (
          <>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Reopen "{reopenEvent.name}"
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
              It ended at {reopenEvent.endTime} on {reopenEvent.date}, which is why it closed.
            </p>
            <div className="form-group">
              <label className="form-label">Keep it open until (today)</label>
              <input
                type="time"
                className="form-control"
                value={reopenUntil}
                onChange={(e) => setReopenUntil(e.target.value)}
              />
            </div>
            <div className="badge badge-warning" style={{ display: 'block', padding: '0.75rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
              The event's recorded date and end time change to match, so it will read as having run today.
              To fix a missed mark without moving the event, use correction mode on the Reports roster instead.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setReopenEvent(null)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Cancel</button>
              <button onClick={handleReopen} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={!reopenUntil}>Reopen</button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal Dialog for Event Creation */}
      <Modal
        open={showCreateModal}
        onClose={resetForm}
        maxWidth="520px"
      >
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>
          {editingEventId ? 'Edit Sabha Event' : 'Create Sabha Event'}
        </h3>

        {editingEventId && editingClosed && (
          <div className="badge badge-warning" style={{ display: 'block', padding: '0.75rem', fontSize: '0.82rem', marginBottom: '1rem' }}>
            This event is closed. Your change is recorded in the audit log as a correction against your name.
            Editing the date or end time can also reopen it.
          </div>
        )}

        <form onSubmit={handleSubmitEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Event Assembly Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Weekly Bal Sabha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sabha/Mandal Scope</label>
              <select
                className="form-control"
                value={sabhaScope}
                onChange={(e) => setSabhaScope(e.target.value)}
              >
                <option value="All Sabhas">All Sabhas (Global)</option>
                {sabhaNames.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input
                type="time"
                className="form-control"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input
                type="time"
                className="form-control"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{editingEventId ? 'Status' : 'Initial Status'}</label>
            <select
              className="form-control"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active (Open for Attendance)</option>
              {/* Only offered when editing: a new event is never created closed,
                  but an existing one may already be. */}
              {editingEventId && <option value="Closed">Closed</option>}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create Event
            </button>
          </div>
        </form>
      </Modal>

      {/* Grid of Existing Events */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '1.5rem'
      }}>
        {events.map((event) => {
          const effectiveStatus = getEffectiveStatus(event);
          const expired = isEventExpired(event);
          const eventMarks = attendance.filter(a => a.eventId === event.id).length;
          const isClosed = effectiveStatus === 'Closed';
          const isActive = effectiveStatus === 'Active';
          const isDraft = effectiveStatus === 'Draft';
          
          return (
            <div key={event.id} className="card" style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.25rem',
              borderColor: isActive ? 'var(--accent)' : 'var(--border-color)',
              position: 'relative'
            }}>
              <div>
                {/* Event Name & Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
                    {event.name}
                  </h4>
                  <span className={`badge ${
                    isActive ? 'badge-success' : isClosed ? 'badge-danger' : 'badge-warning'
                  }`}>
                    {isClosed && expired ? 'Closed (Expired)' : effectiveStatus}
                  </span>
                </div>

                {/* Scope details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} color="var(--accent)" />
                    <span>Date: <strong>{event.date}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={14} color="var(--accent)" />
                    <span>Time: {event.startTime} - {event.endTime}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={14} color="var(--accent)" />
                    <span>Scope: <strong>{event.sabhaMandalScope}</strong></span>
                  </div>
                </div>
              </div>

              {/* Action Buttons panel.
                  position/zIndex lift this above the closed-event scrim below.
                  The scrim has pointerEvents:'none', so without this the buttons
                  would still work but LOOK greyed out — a control that reads as
                  dead and isn't is worse than one that is. */}
              <div style={{
                borderTop: '1px solid var(--border-color)',
                paddingTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                position: 'relative',
                zIndex: 1
              }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {/* Status Toggle Control */}
                  <button
                    onClick={() => (isClosed && expired ? openReopenModal(event) : toggleEventStatus(event))}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                    // An expired event can only be reopened by extending its end
                    // time, so that route goes through the reopen dialog — but it
                    // is no longer simply disabled.
                    disabled={isClosed && expired && !canEditClosed}
                    title={isClosed && expired
                      ? (canEditClosed ? 'Reopen by extending the end time' : 'Past its end time — only an administrator can reopen it')
                      : isDraft ? 'Activate Event' : isActive ? 'Close Event' : 'Reopen Event'}
                  >
                    {isDraft && <Play size={12} />}
                    {isActive && <Archive size={12} />}
                    {isClosed && <RefreshCw size={12} />}
                    <span style={{ marginLeft: '0.25rem' }}>
                      {isDraft ? 'Activate' : isActive ? 'Close' : 'Reopen'}
                    </span>
                  </button>

                  <button
                    onClick={() => openEditModal(event)}
                    className="btn btn-ghost"
                    style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }}
                    disabled={isClosed && !canEditClosed}
                    title={isClosed && !canEditClosed ? 'Closed — only an administrator can edit it' : 'Edit this event'}
                  >
                    <Pencil size={12} />
                    <span style={{ marginLeft: '0.25rem' }}>Edit</span>
                  </button>

                  {canEditClosed && (
                    <button
                      onClick={() => handleDeleteEvent(event)}
                      className="btn btn-ghost"
                      style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem', color: 'var(--danger)' }}
                      title={eventMarks > 0
                        ? `${eventMarks} attendance record(s) — cannot be deleted`
                        : 'Delete this event'}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Shareable Pre-registration Link */}
                <button
                  onClick={() => setShareEventId(event.id)}
                  className="btn btn-ghost"
                  style={{
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                  }}
                  disabled={isClosed}
                >
                  <Share2 size={14} />
                  <span>Share Link</span>
                </button>
              </div>

              {/* Expired warning flag if closed */}
              {isClosed && (
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  right: '0',
                  bottom: '0',
                  backgroundColor: 'rgba(11, 15, 25, 0.4)',
                  backdropFilter: 'grayscale(1)',
                  pointerEvents: 'none',
                  borderRadius: 'var(--radius-md)'
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Public pre-registration link: visible URL + QR so a karyakar can show
          it on a phone rather than only pasting from the clipboard */}
      <Modal
        open={Boolean(shareEventId)}
        onClose={() => setShareEventId(null)}
        maxWidth="440px"
      >
        {(() => {
          const shareEvent = events.find(e => e.id === shareEventId);
          if (!shareEvent) return null;
          const shareUrl = buildShareUrl(shareEvent.id);
          const shareIsDraft = getEffectiveStatus(shareEvent) === 'Draft';
          const copied = copiedEventId === (usePermanent ? '__permanent__' : shareEvent.id);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>Public Registration Link</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Anyone with this link can pre-register for <strong>{shareEvent.name}</strong>. Every
                  submission lands in the review queue — nobody is added to the roster automatically.
                </p>
              </div>

              {shareIsDraft && (
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                  padding: '0.75rem',
                  fontSize: '0.8rem',
                  color: 'var(--warning)',
                  backgroundColor: 'var(--warning-light)',
                  border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <span>
                    This event is still a <strong>Draft</strong>. You can hand the link out now, but it
                    won't accept submissions until you set the event to Active.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <QrCode value={usePermanent ? buildShareUrl(null) : shareUrl} size={180} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                <button
                  onClick={() => setUsePermanent(true)}
                  className={usePermanent ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ flex: 1, padding: '0.45rem' }}
                >
                  Permanent link
                </button>
                <button
                  onClick={() => setUsePermanent(false)}
                  className={usePermanent ? 'btn btn-secondary' : 'btn btn-primary'}
                  style={{ flex: 1, padding: '0.45rem' }}
                >
                  This event only
                </button>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                {usePermanent
                  ? 'Share once and reuse every week — it always checks people into whichever event is Active at that moment, so it can never point at a finished event.'
                  : `Always targets ${shareEvent.name} specifically. Once that event ends the link falls back to the current Active event.`}
              </p>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Link</label>
                <input
                  type="text"
                  className="form-control"
                  value={usePermanent ? buildShareUrl(null) : shareUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  style={{ fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => handleCopyLink(usePermanent ? null : shareEvent.id)}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy Link'}</span>
                </button>
                <button onClick={() => setShareEventId(null)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
