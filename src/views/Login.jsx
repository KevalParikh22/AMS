import React, { useState } from 'react';
import { useAuth, ROLES } from '../context/AuthContext';
import { useLang, LanguageSwitcher } from '../i18n/LanguageContext';
import { isCloudMode } from '../lib/supabase';
import { Lock, User } from 'lucide-react';

export default function Login() {
  const {
    login, loginWithEmail, requestPasswordReset, completePasswordReset,
    recoveryMode, MOCK_USERS
  } = useAuth();
  const { t } = useLang();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(ROLES.ATTENDANCE_VOLUNTEER);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (isCloudMode) {
      setBusy(true);
      const res = await loginWithEmail(username.trim(), password);
      setBusy(false);
      if (!res.success) setError(res.message);
      return;
    }
    const res = login(username, role);
    if (!res.success) {
      setError(res.message);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setInfo('');
    if (!username.trim()) {
      setError('Enter your email above first, then click "Forgot password".');
      return;
    }
    const res = await requestPasswordReset(username.trim());
    if (res.success) setInfo(res.message);
    else setError(res.message);
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    const res = await completePasswordReset(password);
    setBusy(false);
    if (!res.success) setError(res.message);
    else setPassword('');
  };

  const handleQuickLogin = (userObj) => {
    setUsername(userObj.username);
    login(userObj.username);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(var(--accent-rgb), 0.1) 0%, transparent 40%)',
      padding: '1.5rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '2.5rem',
        borderRadius: 'var(--radius-lg)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-lg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 800,
            fontSize: '2rem',
            marginBottom: '1rem',
            boxShadow: 'var(--shadow-lg)'
          }}>S</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Sabha Mandal System</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{t('login.subtitle')}</p>
          <div style={{ marginTop: '0.75rem' }}>
            <LanguageSwitcher />
          </div>
        </div>

        {error && (
          <div className="badge badge-danger" style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)'
          }}>
            {error}
          </div>
        )}

        {info && (
          <div className="badge badge-info" style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)'
          }}>
            {info}
          </div>
        )}

        {isCloudMode && recoveryMode ? (
          /* Password recovery: user arrived via a reset email link */
          <form onSubmit={handleSetNewPassword}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}>
              <Lock size={16} />
              <span>Set New Password</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{isCloudMode ? 'Email' : 'Full Name / Tester Username'}</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }} />
                <input
                  type={isCloudMode ? 'email' : 'text'}
                  className="form-control"
                  placeholder={isCloudMode ? 'you@example.com' : 'Enter username or your name'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            {isCloudMode ? (
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Assigned Role (For custom write-in names)</label>
                <select
                  className="form-control"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {Object.values(ROLES).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem' }}
            >
              <Lock size={16} />
              <span>{busy ? '...' : t('login.signIn')}</span>
            </button>

            {isCloudMode && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        {/* Demo Fast Login Selector (sandbox mode only) */}
        {!isCloudMode && (
          <div style={{
            marginTop: '2rem',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '1.5rem'
          }}>
            <h4 style={{
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: '1rem',
              fontWeight: 600,
              textAlign: 'center'
            }}>Quick Access Sandbox Accounts</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {MOCK_USERS.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleQuickLogin(u)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.6rem 0.5rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem'
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
