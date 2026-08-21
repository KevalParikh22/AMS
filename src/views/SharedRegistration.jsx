import React, { useState } from 'react';
import { useDb } from '../context/DbContext';
import { useLang, LanguageSwitcher } from '../i18n/LanguageContext';
import QrCode from '../components/QrCode';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Calendar,
  Clock,
  Check
} from 'lucide-react';

export default function SharedRegistration({ eventId }) {
  const { events, sabhas, publicSelfCheckIn, getCurrentPublicEvent, getEffectiveStatus } = useDb();
  const { t } = useLang();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sabha, setSabha] = useState('');
  const [guardianDetails, setGuardianDetails] = useState('');

  const [receipt, setReceipt] = useState(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resolve which event this link targets. An explicit eventId still wins while
  // that event is live, so previously shared per-event links keep working; once
  // it is over (or the link never named one) fall through to whichever event is
  // Active now, so a permanent link never lands on a stale event.
  const namedEvent = eventId ? events.find(e => e.id === eventId) : null;
  const namedIsLive = namedEvent && getEffectiveStatus(namedEvent) === 'Active';
  const event = namedIsLive ? namedEvent : getCurrentPublicEvent();

  // A link that named an event which has since ended is not broken — it just
  // has no session to check into right now.
  const hadNamedEvent = Boolean(namedEvent);

  // Set default sabha scope from event if possible
  React.useEffect(() => {
    if (event && event.sabhaMandalScope !== 'All Sabhas') {
      setSabha(event.sabhaMandalScope);
    } else if (sabhas.length > 0) {
      setSabha(sabhas[0]);
    }
  }, [event, sabhas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!event) {
      setErrorMsg(t('shared.noSessionDesc'));
      return;
    }

    setSubmitting(true);
    try {
      // Creates the person AND marks them present for the live event in one go
      const result = publicSelfCheckIn({ name, phone, sabha, guardianDetails });
      if (result.error) {
        setErrorMsg(result.error);
        return;
      }

      // Deliberate exception to "views never await data": in cloud mode the
      // check-in is only real once the rows reach Supabase, and showing a
      // reference code for something that failed to save loses the person
      // entirely. Absent in sandbox mode, where this stays synchronous.
      if (result.syncPromise) await result.syncPromise;

      setReceipt({
        id: result.participant.id,
        name: result.participant.name,
        phone: result.participant.phone,
        sabha: result.participant.sabha,
        eventName: result.event.name,
        refNumber: 'REG-' + Date.now().toString().slice(-6).toUpperCase()
      });
    } catch (err) {
      console.error(err);
      // Form values are left in place so the guardian can simply retry
      setErrorMsg(t('shared.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyReceipt = () => {
    if (!receipt) return;
    const text = `Registration Confirmation\nEvent: ${event?.name}\nName: ${receipt.name}\nPhone: ${receipt.phone}\nReference ID: ${receipt.refNumber}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2000);
    });
  };

  if (!event) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        padding: '1.5rem',
        color: 'var(--text-primary)'
      }}>
        <div className="card glass-panel" style={{ maxWidth: '480px', textAlign: 'center', padding: '3rem 2rem' }}>
          <AlertTriangle size={48} color="var(--danger)" style={{ marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t('shared.noSessionTitle')}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {hadNamedEvent ? t('shared.sessionEndedDesc') : t('shared.noSessionDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(circle at 90% 10%, rgba(var(--accent-rgb), 0.08) 0%, transparent 40%)',
      padding: '2rem 1rem'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '540px',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem',
        boxShadow: 'var(--shadow-glass)'
      }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span className="badge badge-info" style={{ padding: '0.4rem 0.8rem' }}>{t('shared.publicEntryForm')}</span>
            <LanguageSwitcher />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{event.name}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{t('shared.portalSubtitle')}</p>
        </div>

        {errorMsg && (
          <div className="badge badge-danger" style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            padding: '0.85rem',
            marginBottom: '1.5rem',
            borderRadius: 'var(--radius-sm)'
          }}>
            {errorMsg}
          </div>
        )}

        {/* Success Receipt State */}
        {receipt ? (
          <div className="animate-fade-in" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--success-light)',
              color: 'var(--success)',
              width: '64px',
              height: '64px',
              borderRadius: 'var(--radius-full)',
              alignSelf: 'center'
            }}>
              <CheckCircle2 size={36} />
            </div>
            
            <div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{t('shared.submitted')}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {t('shared.submittedDesc')}
              </p>
            </div>

            {/* QR for quick desk check-in (scans to the participant record ID) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <QrCode value={receipt.id} size={140} />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('shared.qrHint')}</p>
            </div>

            {/* Receipt Details Box */}
            <div style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('shared.referenceCode')}</span>
                <strong style={{ color: 'var(--accent)', fontSize: '0.95rem' }}>{receipt.refNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('shared.name')}</span>
                <span style={{ fontWeight: 600 }}>{receipt.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('shared.contactPhone')}</span>
                <span>{receipt.phone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('shared.sabhaScope')}</span>
                <span>{receipt.sabha}</span>
              </div>
            </div>

            <button
              onClick={handleCopyReceipt}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem' }}
            >
              {copiedReceipt ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedReceipt ? t('shared.receiptCopied') : t('shared.copyReceipt')}</span>
            </button>
          </div>
        ) : (
          /* Form Entry State */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Event Meta Info Box */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} color="var(--accent)" />
                <span>{t('shared.date')} <strong>{event.date}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={14} color="var(--accent)" />
                <span>{t('shared.assemblyTime')} {event.startTime} - {event.endTime}</span>
              </div>
            </div>

                <div className="form-group">
                  <label className="form-label">{t('shared.fullName')}</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={t('shared.fullNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('shared.guardianMobile')}</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="e.g. 98XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('shared.targetSabha')}</label>
                  {event.sabhaMandalScope !== 'All Sabhas' ? (
                    <input 
                      type="text" 
                      className="form-control" 
                      value={event.sabhaMandalScope} 
                      disabled 
                    />
                  ) : (
                    <select
                      className="form-control"
                      value={sabha}
                      onChange={(e) => setSabha(e.target.value)}
                    >
                      {sabhas.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">{t('shared.guardianDetails')}</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder={t('shared.guardianPlaceholder')}
                    value={guardianDetails}
                    onChange={(e) => setGuardianDetails(e.target.value)}
                    style={{ resize: 'none' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}
                  disabled={submitting}
                >
                  {submitting ? t('shared.submitting') : t('shared.submit')}
                </button>
          </form>
        )}
      </div>
    </div>
  );
}
