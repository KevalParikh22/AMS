import React, { useState, useEffect } from 'react';
import { useDb } from '../context/DbContext';
import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

// Edit an existing participant's details. Used from the Reports roster and
// from the pending-review queue, both of which are already Coordinator-gated
// by the nav filter, so this component does no role check of its own —
// updateParticipant and the participants_update RLS policy are the real gates.
export default function ParticipantEditModal({ participant, onClose }) {
  const { sabhas, karyakars, updateParticipant } = useDb();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sabha, setSabha] = useState('');
  const [karyakar, setKaryakar] = useState('');
  const [guardianDetails, setGuardianDetails] = useState('');
  const [error, setError] = useState('');

  // Seed the form from the record each time a different person is opened.
  useEffect(() => {
    if (!participant) return;
    setName(participant.name || '');
    setPhone(participant.phone || '');
    setSabha(participant.sabha || '');
    setKaryakar(participant.karyakar || 'None Assigned');
    setGuardianDetails(participant.guardianDetails || '');
    setError('');
    // Keyed on id only: re-running when the record object changes would wipe
    // whatever the user has typed on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.id]);

  const mappedKaryakars = karyakars.filter(k => k.sabha === sabha);

  // Registration derives karyakar from sabha with an effect that also fires on
  // mount. Reused as-is here, opening this modal would overwrite the stored
  // karyakar with the sabha's first one before the user touched anything — so
  // only re-derive when the sabha actually moves away from the saved value.
  useEffect(() => {
    if (!participant) return;
    if (sabha === participant.sabha) return;
    setKaryakar(mappedKaryakars[0]?.name || 'None Assigned');
    // Intentionally depends on sabha alone — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sabha]);

  if (!participant) return null;

  const phoneChanged = phone.trim() !== (participant.phone || '');
  // The sabha on record may not be in the configured list (legacy import), and
  // dropping it silently would reassign the person on save.
  const sabhaOptions = sabhas.includes(sabha) || !sabha ? sabhas : [sabha, ...sabhas];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }
    const result = updateParticipant(participant.id, {
      name, phone, sabha, karyakar, guardianDetails
    });
    if (!result.success) {
      setError(result.message);
      return;
    }
    onClose();
  };

  return (
    <Modal open onClose={onClose} maxWidth="560px" closeOnBackdrop={false}>
      <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>Edit Participant</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 1.25rem 0' }}>
        {participant.id}
        {participant.status !== 'approved' && (
          <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
            {participant.status}
          </span>
        )}
      </p>

      {error && (
        <div className="badge badge-danger" style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Full Name *</label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Guardian Mobile Number</label>
          <input
            type="tel"
            className="form-control"
            placeholder="e.g. 98XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {phoneChanged && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--warning)' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <span>
                This number identifies the participant on roster imports. Changing it means a future
                import of their old number will create a second record instead of updating this one.
              </span>
            </div>
          )}
          {!phone.trim() && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <span>Without a number this person cannot be matched on import. Their review status is not changed by saving.</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sabha Mandal Group</label>
            <select className="form-control" value={sabha} onChange={(e) => setSabha(e.target.value)}>
              {sabhaOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Responsible Karyakar</label>
            {mappedKaryakars.length > 1 ? (
              <select className="form-control" value={karyakar} onChange={(e) => setKaryakar(e.target.value)}>
                {mappedKaryakars.map(k => (
                  <option key={k.name} value={k.name}>{k.name}</option>
                ))}
                {!mappedKaryakars.some(k => k.name === karyakar) && (
                  <option value={karyakar}>{karyakar}</option>
                )}
              </select>
            ) : (
              <input
                type="text"
                className="form-control"
                value={karyakar}
                disabled
                title="Auto-assigned from the selected sabha's karyakar mapping"
              />
            )}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Guardian Contact Details</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g. Nilesh Patel (Father) - 9822334455"
            value={guardianDetails}
            onChange={(e) => setGuardianDetails(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
}
