import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth, ROLES } from '../context/AuthContext';
import { 
  Search, 
  Check, 
  RotateCcw, 
  UserPlus, 
  AlertTriangle,
  ChevronRight,
  UserCheck
} from 'lucide-react';

export default function AttendanceDesk({ setView, selectedEventId, setSelectedEventId }) {
  const {
    events,
    queryParticipants,
    attendance,
    markPresent,
    undoAttendance,
    getEffectiveStatus
  } = useDb();

  const { user, hasPermission } = useAuth();
  const canCorrectAttendance = hasPermission(ROLES.COORDINATOR);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Find active events (expired events are effectively closed)
  const activeEvents = events.filter(e => getEffectiveStatus(e) === 'Active');

  // Sync selected event id if not set and active events exist
  useEffect(() => {
    if (!selectedEventId && activeEvents.length > 0) {
      setSelectedEventId(activeEvents[0].id);
    }
  }, [activeEvents, selectedEventId]);

  // Execute query whenever participants or query changes
  useEffect(() => {
    const results = queryParticipants(searchQuery);
    setSearchResults(results);
  }, [searchQuery, queryParticipants]);

  const activeEvent = events.find(e => e.id === selectedEventId);

  const handleMarkPresent = (participantId) => {
    if (!selectedEventId) return;
    markPresent(selectedEventId, participantId);
  };

  const handleUndoPresent = (participantId) => {
    if (!selectedEventId) return;
    undoAttendance(selectedEventId, participantId);
  };

  // Touch & Mouse Drag Handler for Premium Swipe Actions
  const SwipeTrack = ({ participantId }) => {
    const [startX, setStartX] = useState(0);
    const [deltaX, setDeltaX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const trackRef = React.useRef(null);

    const trackWidth = 260; // Approximate width of track in px
    const handleWidth = 44;
    const maxSwipe = trackWidth - handleWidth - 8;

    const handleStart = (clientX) => {
      setStartX(clientX);
      setIsDragging(true);
    };

    const handleMove = (clientX) => {
      if (!isDragging) return;
      const diff = clientX - startX;
      const val = Math.max(0, Math.min(diff, maxSwipe));
      setDeltaX(val);
    };

    const handleEnd = () => {
      if (!isDragging) return;
      setIsDragging(false);
      
      // Trigger threshold (80% of max swipe distance)
      if (deltaX >= maxSwipe * 0.8) {
        setDeltaX(maxSwipe);
        handleMarkPresent(participantId);
      } else {
        // Bounce back animation
        setDeltaX(0);
      }
    };

    // Mouse events
    const onMouseDown = (e) => handleStart(e.clientX);
    const onMouseMove = (e) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();

    // Touch events
    const onTouchStart = (e) => handleStart(e.touches[0].clientX);
    const onTouchMove = (e) => handleMove(e.touches[0].clientX);
    const onTouchEnd = () => handleEnd();

    // Global listeners to clean up drag actions outside components
    useEffect(() => {
      if (isDragging) {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
      }
    }, [isDragging, startX, deltaX]);

    return (
      <div 
        ref={trackRef}
        className="swipe-container"
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        <div 
          className="swipe-fill"
          style={{ width: `${deltaX + (handleWidth / 2)}px`, transition: isDragging ? 'none' : 'width 0.2s ease-out' }}
        />
        <div className="swipe-track-label">Swipe to check-in</div>
        <div
          className="swipe-handle"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          style={{
            transform: `translateX(${deltaX}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <ChevronRight size={20} />
        </div>
      </div>
    );
  };

  return (
    <div className="container-padding animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Target Event Picker */}
      <div className="glass-panel" style={{
        padding: '1.25rem 1.5rem',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '280px' }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap', fontWeight: 600 }}>Active Event:</label>
          {activeEvents.length === 0 ? (
            <span style={{ color: 'var(--danger)', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertTriangle size={16} />
              No active events found.
            </span>
          ) : (
            <select
              className="form-control"
              value={selectedEventId || ''}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{ maxWidth: '360px', margin: 0 }}
            >
              {activeEvents.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.date})</option>
              ))}
            </select>
          )}
        </div>

        {/* Quick Registration Shortcut */}
        <button 
          onClick={() => setView('registration')} 
          className="btn btn-secondary"
          style={{ padding: '0.6rem 1.25rem' }}
        >
          <UserPlus size={16} />
          <span>Register New Person</span>
        </button>
      </div>

      {activeEvent ? (
        <>
          {/* Real-time Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, phone number, class/sabha..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: '3rem',
                fontSize: '1.1rem',
                paddingTop: '1rem',
                paddingBottom: '1rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)'
              }}
            />
          </div>

          {/* Search Result Grid */}
          <div className="attendance-grid">
            {searchResults.map(({ item }) => {
              const isPresent = attendance.some(
                a => a.eventId === activeEvent.id && a.participantId === item.id
              );
              
              return (
                <div 
                  key={item.id} 
                  className={`attendance-card ${isPresent ? 'present' : ''}`}
                >
                  {/* Participant Meta info */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{item.name}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {item.id}</span>
                        {item.status === 'pending' && (
                          <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                            Pending Review
                          </span>
                        )}
                      </div>
                      {isPresent && (
                        <span className="badge badge-success" style={{ padding: '0.35rem 0.6rem' }}>
                          <Check size={12} />
                          <span>Present</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      <div>Phone: <strong>{item.phone}</strong></div>
                      <div>Sabha: <strong>{item.sabha}</strong></div>
                      <div>Karyakar: <span style={{ color: 'var(--text-muted)' }}>{item.karyakar}</span></div>
                    </div>
                  </div>

                  {/* Attendance marking toggle */}
                  <div>
                    {isPresent ? (
                      canCorrectAttendance ? (
                        <button
                          onClick={() => handleUndoPresent(item.id)}
                          className="btn btn-ghost"
                          style={{
                            width: '100%',
                            marginTop: '1rem',
                            color: 'var(--danger)',
                            fontSize: '0.85rem',
                            border: '1px dashed var(--danger-light)',
                            padding: '0.5rem'
                          }}
                        >
                          <RotateCcw size={14} />
                          <span>Undo Check-in</span>
                        </button>
                      ) : (
                        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Ask a coordinator to correct a wrong check-in.
                        </p>
                      )
                    ) : (
                      /* Swipe to check-in component */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <SwipeTrack participantId={item.id} />
                        {/* Instant Tap Fallback for Desktop */}
                        <button
                          onClick={() => handleMarkPresent(item.id)}
                          className="btn btn-secondary d-none d-md-flex"
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            fontSize: '0.75rem',
                            justifyContent: 'center',
                            opacity: 0.8
                          }}
                        >
                          <UserCheck size={12} />
                          <span>Click to Check-in Instead</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {searchResults.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '4rem 2rem',
                backgroundColor: 'rgba(22, 30, 49, 0.4)',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <AlertTriangle size={36} color="var(--warning)" />
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '1.1rem' }}>No Matches Found</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    "{searchQuery}" did not match any name, phone, or sabha in the master roster.
                  </p>
                </div>
                <button
                  onClick={() => setView('registration')}
                  className="btn btn-primary"
                  style={{ padding: '0.6rem 1.5rem' }}
                >
                  <UserPlus size={16} />
                  <span>Register as New Person</span>
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card" style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <AlertTriangle size={48} color="var(--warning)" />
          <div>
            <h3 style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>No Active Event Selected</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Select or create an active event first to enable the attendance marking desk.
            </p>
          </div>
          {user?.role === 'Admin' || user?.role === 'Coordinator' ? (
            <button onClick={() => setView('events')} className="btn btn-primary">
              Manage Events
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
