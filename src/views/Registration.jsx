import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import { useAuth } from '../context/AuthContext';
import { 
  UserPlus, 
  AlertTriangle, 
  Check, 
  HelpCircle,
  Link as LinkIcon
} from 'lucide-react';

export default function Registration({ setView, selectedEventId }) {
  const { 
    sabhas, 
    karyakars, 
    participants, 
    registerNewParticipant, 
    markPresent,
    events
  } = useDb();

  const { user } = useAuth();

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sabha, setSabha] = useState('');
  const [karyakar, setKaryakar] = useState('');
  const [guardianDetails, setGuardianDetails] = useState('');
  const [markPresentImmediately, setMarkPresentImmediately] = useState(true);

  // Flow controllers
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Find active event
  const activeEvent = events.find(e => e.id === selectedEventId) || events.find(e => e.status === 'Active');

  useEffect(() => {
    if (sabhas.length > 0) {
      setSabha(sabhas[0]);
    }
    if (karyakars.length > 0) {
      setKaryakar(karyakars[0]);
    }
  }, [sabhas, karyakars]);

  // Run duplicate check on submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    // Check existing participants by exact phone or near-name match
    const queryName = name.toLowerCase().trim();
    const queryPhone = phone.trim();

    const matches = participants.filter(p => 
      p.phone === queryPhone || 
      p.name.toLowerCase().trim() === queryName
    );

    if (matches.length > 0) {
      setDuplicates(matches);
      setShowDuplicateModal(true);
    } else {
      executeRegistration();
    }
  };

  // Perform participant creation
  const executeRegistration = () => {
    const newParticipant = registerNewParticipant({
      name,
      phone,
      sabha,
      karyakar,
      guardianDetails,
      pendingReview: false // Internal registrations are approved immediately
    });

    if (markPresentImmediately && activeEvent) {
      markPresent(activeEvent.id, newParticipant.id);
    }

    setSuccessMsg(`Registered "${name}" successfully! ID: ${newParticipant.id}`);
    
    // Clear form
    setName('');
    setPhone('');
    setGuardianDetails('');
    setShowDuplicateModal(false);
    
    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  // Skip duplicate warning and force create
  const handleForceRegister = () => {
    executeRegistration();
  };

  // Select the existing participant instead of creating a duplicate
  const handleUseExisting = (existingParticipant) => {
    if (markPresentImmediately && activeEvent) {
      markPresent(activeEvent.id, existingParticipant.id);
      setSuccessMsg(`Marked existing participant "${existingParticipant.name}" present!`);
    } else {
      setSuccessMsg(`Selected existing participant "${existingParticipant.name}"! Details up-to-date.`);
    }

    setName('');
    setPhone('');
    setGuardianDetails('');
    setShowDuplicateModal(false);

    setTimeout(() => {
      setSuccessMsg('');
    }, 4000);
  };

  return (
    <div className="container-padding animate-fade-in" style={{ maxWidth: '640px', margin: '0 auto' }}>
      
      {successMsg && (
        <div className="badge badge-success animate-fade-in" style={{
          display: 'block',
          width: '100%',
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          textAlign: 'center',
          fontSize: '0.95rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Check size={18} />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* Main Registration Card */}
      <div className="glass-panel" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent)',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <UserPlus size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-display)', margin: 0 }}>Register New Balak</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Manually add a participant to the central roster.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Priyesh Patel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contact Phone Number *</label>
            <input 
              type="tel" 
              className="form-control" 
              placeholder="e.g. 98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Sabha Mandal Group *</label>
              <select 
                className="form-control" 
                value={sabha} 
                onChange={(e) => setSabha(e.target.value)}
              >
                {sabhas.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Responsible Karyakar *</label>
              <select 
                className="form-control" 
                value={karyakar} 
                onChange={(e) => setKaryakar(e.target.value)}
              >
                {karyakars.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Guardian Contact Details</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="e.g. Nilesh Patel (Father) - 9822334455"
              value={guardianDetails}
              onChange={(e) => setGuardianDetails(e.target.value)}
            />
          </div>

          {/* Conditional Attendance mark check */}
          {activeEvent && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              backgroundColor: 'var(--bg-primary)',
              padding: '1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              marginTop: '0.5rem'
            }}>
              <input 
                type="checkbox" 
                id="instant-checkin"
                checked={markPresentImmediately}
                onChange={(e) => setMarkPresentImmediately(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: 'var(--accent)'
                }}
              />
              <label htmlFor="instant-checkin" style={{ fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                Mark present for active event immediately: <strong>{activeEvent.name}</strong>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setView('attendance')}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              style={{ flex: 2 }}
            >
              Create & Register
            </button>
          </div>
        </form>
      </div>

      {/* Potential Duplicate Modal Warning */}
      {showDuplicateModal && (
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
          <div className="card glass-panel animate-fade-in" style={{
            width: '100%',
            maxWidth: '540px',
            border: '1px solid var(--warning)'
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div style={{
                backgroundColor: 'var(--warning-light)',
                color: 'var(--warning)',
                padding: '0.5rem',
                borderRadius: 'var(--radius-sm)'
              }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Potential Duplicate Match</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  A participant with a matching name or phone number already exists in the central registry database.
                </p>
              </div>
            </div>

            {/* List of potential matches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {duplicates.map(dup => (
                <div key={dup.id} style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{dup.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                      Phone: {dup.phone} | Sabha: {dup.sabha}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleUseExisting(dup)}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem' }}
                  >
                    <LinkIcon size={12} />
                    <span>Select Existing</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowDuplicateModal(false)}
              >
                Go Back & Edit
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleForceRegister}
              >
                Ignore Match & Register
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
