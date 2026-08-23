import React, { useState, useEffect, useRef } from 'react';
import { useDb } from '../context/DbContext';
import { isCloudMode } from '../lib/supabase';
import { useAuth, ROLES } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import Modal from '../components/Modal';
import {
  Search,
  Check,
  RotateCcw,
  UserPlus,
  AlertTriangle,
  ChevronRight,
  UserCheck,
  QrCode as QrCodeIcon,
  X
} from 'lucide-react';

// Camera QR scanner using the built-in BarcodeDetector API (Chrome/Android).
// Browsers without it (e.g. iOS Safari) fall back to manual ID entry.
function QrScannerModal({ onDetect, onClose, feedback, t }) {
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [manualId, setManualId] = useState('');
  const supported = 'BarcodeDetector' in window;

  useEffect(() => {
    if (!supported) return;
    let stream = null;
    let timer = null;
    let cancelled = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        timer = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              onDetect(codes[0].rawValue.trim());
            }
          } catch { /* detection can fail transiently; keep polling */ }
        }, 600);
      } catch (err) {
        setCameraError(err.message || 'Camera access denied.');
      }
    };
    start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach(tr => tr.stop());
    };
  }, [supported, onDetect]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualId.trim()) {
      onDetect(manualId.trim().toUpperCase());
      setManualId('');
    }
  };

  return (
    <Modal open onClose={onClose} maxWidth="440px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{t('desk.scanTitle')}</h3>
        <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.35rem' }}>
          <X size={18} />
        </button>
      </div>

      {supported && !cameraError ? (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', borderRadius: 'var(--radius-md)', backgroundColor: '#000', aspectRatio: '4 / 3' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0.75rem 0' }}>
            {t('desk.scanHint')}
          </p>
        </>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--warning)', margin: '0.5rem 0 1rem' }}>
          {cameraError || t('desk.scanNotSupported')}
        </p>
      )}

      {feedback && (
        <div
          className={`badge ${feedback.ok ? 'badge-success' : 'badge-danger'}`}
          style={{ display: 'block', textAlign: 'center', padding: '0.65rem', marginBottom: '0.75rem', borderRadius: 'var(--radius-sm)' }}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleManualSubmit}>
        <label className="form-label" style={{ fontSize: '0.8rem' }}>{t('desk.scanManual')}</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder="P-101"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
            {t('desk.scanMark')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AttendanceDesk({ setView, selectedEventId, setSelectedEventId }) {
  const {
    events,
    queryParticipants,
    participants,
    attendance,
    markPresent,
    undoAttendance,
    getEffectiveStatus
  } = useDb();

  const { user, hasPermission } = useAuth();
  const { t } = useLang();
  const canCorrectAttendance = hasPermission(ROLES.COORDINATOR);

  const [searchQuery, setSearchQuery] = useState('');
  const [syncError, setSyncError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [visibleCount, setVisibleCount] = useState(30);
  const [showScanner, setShowScanner] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);

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
    setVisibleCount(30); // Reset pagination on a new search
  }, [searchQuery, queryParticipants]);

  const activeEvent = events.find(e => e.id === selectedEventId);

  // An empty roster in cloud mode means the read returned nothing, not that the
  // search missed. RLS denies these rows to an unauthenticated or disabled
  // account as an empty SUCCESS, so nothing else reports it — and cloudStatus
  // is only rendered on the Admin-only settings screen.
  const rosterUnavailable = isCloudMode && participants.length === 0;

  // A mark is optimistic locally; in cloud mode the row still has to land in
  // Postgres. If another volunteer won the race for the same participant, the
  // unique (event_id, participant_id) constraint rejects it and DbContext rolls
  // the row back — surface that instead of leaving a phantom "Present".
  const reportSyncFailure = (name, result) => {
    if (!result?.syncPromise) return;
    result.syncPromise.catch(err => {
      setSyncError(`${name}: ${err.message}`);
      setTimeout(() => setSyncError(''), 5000);
    });
  };

  const handleMarkPresent = (participantId) => {
    if (!selectedEventId) return;
    const person = participants.find(p => p.id === participantId);
    const result = markPresent(selectedEventId, participantId);
    reportSyncFailure(person ? person.name : participantId, result);
  };

  // QR scan (or manual ID entry) → look up active participant and check in
  const handleScannedId = (scannedValue) => {
    const id = scannedValue.toUpperCase();
    const match = queryParticipants('').find(r => r.item.id.toUpperCase() === id);
    if (!match) {
      setScanFeedback({ ok: false, message: `${id}: not found in the active roster.` });
      return;
    }
    if (!selectedEventId) {
      setScanFeedback({ ok: false, message: 'Select an active event first.' });
      return;
    }
    const result = markPresent(selectedEventId, match.item.id);
    reportSyncFailure(match.item.name, result);
    setScanFeedback(result.success
      ? { ok: true, message: `${match.item.name} — ${t('desk.present')} ✓` }
      : { ok: false, message: `${match.item.name}: ${result.message}` });
  };

  const handleUndoPresent = (participantId) => {
    if (!selectedEventId) return;
    const person = participants.find(p => p.id === participantId);
    const name = person ? person.name : participantId;
    const result = undoAttendance(selectedEventId, participantId);
    // A refusal used to be discarded entirely, so a blocked undo looked exactly
    // like a successful one. Report both the refusal and a failed cloud write.
    if (!result?.success) {
      setSyncError(`${name}: ${result?.message || 'Could not undo that check-in.'}`);
      setTimeout(() => setSyncError(''), 5000);
      return;
    }
    reportSyncFailure(name, result);
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
        <div className="swipe-track-label">{t('desk.swipeToCheckIn')}</div>
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
      {syncError && (
        <div className="badge badge-danger" style={{
          display: 'block', width: '100%', padding: '0.85rem',
          borderRadius: 'var(--radius-sm)', marginBottom: '1rem'
        }}>
          {syncError}
        </div>
      )}

      
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
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap', fontWeight: 600 }}>{t('desk.activeEvent')}</label>
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

        {/* Scan + Quick Registration Shortcuts */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { setScanFeedback(null); setShowScanner(true); }}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.25rem' }}
            disabled={!activeEvent}
            title={activeEvent ? t('desk.scanTitle') : 'Select an active event first'}
          >
            <QrCodeIcon size={16} />
            <span>{t('desk.scanQr')}</span>
          </button>
          <button
            onClick={() => setView('registration')}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.25rem' }}
          >
            <UserPlus size={16} />
            <span>{t('desk.registerNewPerson')}</span>
          </button>
        </div>
      </div>

      {showScanner && (
        <QrScannerModal
          onDetect={handleScannedId}
          onClose={() => setShowScanner(false)}
          feedback={scanFeedback}
          t={t}
        />
      )}

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
              placeholder={t('desk.searchPlaceholder')}
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

          {/* Search Result Grid (capped for large rosters) */}
          <div className="attendance-grid">
            {searchResults.slice(0, visibleCount).map(({ item }) => {
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
                          <span>{t('desk.present')}</span>
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
                          <span>{t('desk.undoCheckIn')}</span>
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

            {searchResults.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(c => c + 30)}
                className="btn btn-secondary"
                style={{ gridColumn: '1 / -1', padding: '0.75rem' }}
              >
                {t('desk.showMore')} ({searchResults.length - visibleCount})
              </button>
            )}

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
                  <h4 style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                    {rosterUnavailable ? 'Roster Not Loaded' : 'No Matches Found'}
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {rosterUnavailable
                      ? 'No participants could be loaded for this device. Reload the page — if it stays empty, sign out and back in.'
                      : searchQuery.trim()
                        ? `"${searchQuery}" did not match any name, phone, or sabha in the master roster.`
                        : 'The roster is empty — import a roster or register someone.'}
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
