import React from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Calendar, 
  Layers, 
  CheckCircle, 
  ArrowRight,
  TrendingUp,
  Activity
} from 'lucide-react';

export default function Dashboard({ setView, setSelectedEventId }) {
  const { participants, events, attendance, sabhaNames, auditLogs, getEffectiveStatus } = useDb();
  const { user } = useAuth();

  // Active Events (expired events are effectively closed)
  const activeEvents = events.filter(e => getEffectiveStatus(e) === 'Active');
  
  // Basic aggregates (approved registry members only)
  const approvedParticipants = participants.filter(p => p.status === 'approved');
  const totalBalaks = approvedParticipants.length;
  const activeEventsCount = activeEvents.length;
  const totalSabhasCount = sabhaNames.length;
  
  // Calculate attendance count today (or most recent event)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendanceCount = attendance.filter(a => {
    return a.markedAt.startsWith(todayStr);
  }).length;

  const handleOpenAttendance = (eventId) => {
    setSelectedEventId(eventId);
    setView('attendance');
  };

  // Live event-day pulse for the first active event (PRD success metrics)
  const liveEvent = activeEvents[0] || null;
  const livePulse = liveEvent ? (() => {
    const marks = attendance
      .filter(a => a.eventId === liveEvent.id)
      .sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    const recentMarks = marks.filter(a => new Date(a.markedAt).getTime() >= fifteenMinAgo).length;
    const lastMark = marks[0] || null;
    const lastMarkName = lastMark
      ? (participants.find(p => p.id === lastMark.participantId)?.name || lastMark.participantId)
      : null;
    const pendingCount = participants.filter(p => p.status === 'pending').length;
    return { total: marks.length, recentMarks, lastMark, lastMarkName, pendingCount };
  })() : null;

  // Helper to calculate attendance stats for a specific event
  const getEventStats = (event) => {
    const scope = event.sabhaMandalScope;
    let expectedCount = 0;
    
    if (scope === 'All Sabhas' || !scope) {
      expectedCount = approvedParticipants.length;
    } else {
      expectedCount = approvedParticipants.filter(p => p.sabha === scope).length;
    }

    const presentCount = attendance.filter(a => a.eventId === event.id).length;
    const percentage = expectedCount > 0 ? Math.round((presentCount / expectedCount) * 100) : 0;
    
    return { expectedCount, presentCount, percentage };
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Welcome Banner */}
      <div className="glass-panel" style={{
        padding: '2rem',
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(99,102,241,0.05) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: 0 }}>
            Jai Swaminarayan, {user?.name}!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Here is the operational status for today's Sabha and Mandal activities.
          </p>
        </div>
        {activeEventsCount > 0 && (
          <button 
            onClick={() => handleOpenAttendance(activeEvents[0].id)}
            className="btn btn-primary"
            style={{ padding: '0.8rem 1.5rem', boxShadow: 'var(--shadow-md)' }}
          >
            <span>Launch Attendance Desk</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* Live Event Pulse (event-day operational stats) */}
      {livePulse && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Activity size={18} color="var(--accent)" />
              <span>Live: {liveEvent.name}</span>
            </h3>
            <span className="badge badge-success">In Progress</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', textAlign: 'center' }}>
            <div className="card" style={{ padding: '0.9rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Checked In</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success)' }}>{livePulse.total}</h4>
            </div>
            <div className="card" style={{ padding: '0.9rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 15 Minutes</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{livePulse.recentMarks}</h4>
            </div>
            <div className="card" style={{ padding: '0.9rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last Check-in</span>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.25rem' }}>
                {livePulse.lastMarkName || '—'}
              </h4>
              {livePulse.lastMark && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(livePulse.lastMark.markedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="card" style={{ padding: '0.9rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Registrations</span>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 700, color: livePulse.pendingCount > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                {livePulse.pendingCount}
              </h4>
            </div>
          </div>
        </div>
      )}

      {/* Aggregate Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.5rem'
      }}>
        {/* Metric 1 */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent)',
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Total Registered Balaks</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{totalBalaks}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            backgroundColor: 'var(--success-light)',
            color: 'var(--success)',
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Calendar size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Active Sabha Events</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{activeEventsCount}</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            backgroundColor: 'var(--warning-light)',
            color: 'var(--warning)',
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Total Active Sabhas</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{totalSabhasCount}</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent)',
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Check-ins Today</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{todayAttendanceCount}</span>
          </div>
        </div>
      </div>

      {/* Grid: Events Overview and Recent Activity */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '1.5rem'
      }}>
        {/* Active Events Tracker */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <TrendingUp size={20} color="var(--accent)" />
            <span>Active Events & Roster Stats</span>
          </h3>

          {activeEvents.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1.5rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Calendar size={48} color="var(--text-muted)" />
              <p style={{ fontWeight: 600, margin: 0 }}>No Active Events Found</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Coordinators can create new assemblies from the Event Management tab.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {activeEvents.map(event => {
                const stats = getEventStats(event);
                return (
                  <div key={event.id} style={{
                    backgroundColor: 'var(--bg-primary)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{event.name}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Scope: <strong>{event.sabhaMandalScope}</strong> | Time: {event.startTime} - {event.endTime}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleOpenAttendance(event.id)}
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        <span>Open Desk</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        <span>Attendance Roster</span>
                        <span>{stats.presentCount} of {stats.expectedCount} Present ({stats.percentage}%)</span>
                      </div>
                      <div style={{
                        height: '8px',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${stats.percentage}%`,
                          backgroundColor: stats.percentage > 70 ? 'var(--success)' : 'var(--accent)',
                          borderRadius: 'var(--radius-full)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Audit Timeline */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Activity size={20} color="var(--warning)" />
            <span>Activity Trail</span>
          </h3>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            overflowY: 'auto',
            maxHeight: '320px',
            paddingRight: '0.25rem',
            flex: 1
          }}>
            {auditLogs.slice(0, 5).map(log => (
              <div key={log.id} style={{
                position: 'relative',
                paddingLeft: '1.25rem',
                borderLeft: '2px solid var(--border-color)',
                fontSize: '0.85rem'
              }}>
                {/* Timeline Dot */}
                <div style={{
                  position: 'absolute',
                  left: '-5px',
                  top: '5px',
                  width: '8px',
                  height: '8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: log.action.includes('Attendance') ? 'var(--success)' : 'var(--accent)'
                }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>{log.action}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ margin: '0.15rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {log.details}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500 }}>
                  By: {log.userId} ({log.userRole})
                </span>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem 0' }}>No logs recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* CSS Overrides for responsive grid layout */}
      <style>{`
        @media (max-width: 992px) {
          div[style*="gridTemplateColumns: 2fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
