import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { 
  Calendar, 
  Plus, 
  Check, 
  Copy, 
  Clock, 
  Users, 
  ShieldAlert,
  Play,
  Archive,
  Eye,
  RefreshCw
} from 'lucide-react';

export default function EventManagement() {
  const { events, addEvent, updateEvent, sabhas, getEffectiveStatus, isEventExpired } = useDb();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedEventId, setCopiedEventId] = useState(null);

  // Form States
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('18:00');
  const [sabhaScope, setSabhaScope] = useState('All Sabhas');
  const [status, setStatus] = useState('Draft');

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    addEvent({
      name,
      date,
      startTime,
      endTime,
      sabhaMandalScope: sabhaScope,
      status
    });

    // Reset Form
    setName('');
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('16:00');
    setEndTime('18:00');
    setSabhaScope('All Sabhas');
    setStatus('Draft');
    setShowCreateModal(false);
  };

  const handleCopyLink = (eventId) => {
    // Generate public shared URL using query string routing for the client SPA
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?view=shared-registration&eventId=${eventId}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedEventId(eventId);
      setTimeout(() => setCopiedEventId(null), 2000);
    });
  };

  const toggleEventStatus = (event) => {
    const current = getEffectiveStatus(event);
    let nextStatus = 'Draft';
    if (current === 'Draft') nextStatus = 'Active';
    else if (current === 'Active') nextStatus = 'Closed';
    else if (current === 'Closed') nextStatus = 'Active'; // Reopen

    updateEvent(event.id, { status: nextStatus });
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

      {/* Modal Dialog for Event Creation */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="card glass-panel" style={{
            width: '100%',
            maxWidth: '520px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Create Sabha Event</h3>
            
            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    {sabhas.map(s => (
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
                <label className="form-label">Initial Status</label>
                <select 
                  className="form-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active (Open for Attendance)</option>
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
          </div>
        </div>
      )}

      {/* Grid of Existing Events */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '1.5rem'
      }}>
        {events.map((event) => {
          const effectiveStatus = getEffectiveStatus(event);
          const expired = isEventExpired(event);
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

              {/* Action Buttons panel */}
              <div style={{
                borderTop: '1px solid var(--border-color)',
                paddingTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {/* Status Toggle Control */}
                  <button
                    onClick={() => toggleEventStatus(event)}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                    disabled={isClosed && expired}
                    title={isClosed && expired ? 'Event has passed its end time and cannot be reopened' : isDraft ? 'Activate Event' : isActive ? 'Close Event' : 'Reopen Event'}
                  >
                    {isDraft && <Play size={12} />}
                    {isActive && <Archive size={12} />}
                    {isClosed && <RefreshCw size={12} />}
                    <span style={{ marginLeft: '0.25rem' }}>
                      {isDraft ? 'Activate' : isActive ? 'Close' : 'Reopen'}
                    </span>
                  </button>
                </div>

                {/* Shareable Pre-registration Link */}
                <button
                  onClick={() => handleCopyLink(event.id)}
                  className="btn btn-ghost"
                  style={{
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.8rem',
                    color: copiedEventId === event.id ? 'var(--success)' : 'var(--text-secondary)'
                  }}
                  disabled={isClosed}
                >
                  {copiedEventId === event.id ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedEventId === event.id ? 'Copied' : 'Pre-Reg Link'}</span>
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
    </div>
  );
}
