import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang, LanguageSwitcher } from '../i18n/LanguageContext';
import { 
  LayoutDashboard, 
  ClipboardCheck, 
  UserPlus, 
  FileSpreadsheet, 
  Calendar, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  User
} from 'lucide-react';

export default function Layout({ children, currentView, setView }) {
  const { user, logout, hasPermission } = useAuth();
  const { t } = useLang();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', name: t('nav.dashboard'), icon: LayoutDashboard, requiredRole: null },
    { id: 'attendance', name: t('nav.attendance'), icon: ClipboardCheck, requiredRole: null },
    { id: 'registration', name: t('nav.registration'), icon: UserPlus, requiredRole: 'Registration Volunteer' },
    { id: 'import', name: t('nav.import'), icon: FileSpreadsheet, requiredRole: 'Admin' },
    { id: 'events', name: t('nav.events'), icon: Calendar, requiredRole: 'Coordinator' },
    { id: 'reports', name: t('nav.reports'), icon: BarChart3, requiredRole: 'Coordinator' },
    { id: 'admin', name: t('nav.admin'), icon: Settings, requiredRole: 'Admin' }
  ];

  const allowedItems = menuItems.filter(item => 
    item.requiredRole === null || hasPermission(item.requiredRole)
  );

  const handleNavigate = (viewId) => {
    setView(viewId);
    setMobileMenuOpen(false);
  };

  const getPageTitle = () => {
    const activeItem = menuItems.find(item => item.id === currentView);
    return activeItem ? activeItem.name : 'Sabha Mandal System';
  };

  if (currentView === 'shared-registration') {
    // Return children directly for public shared link view (no sidebar/admin panels)
    return <div className="public-layout">{children}</div>;
  }

  return (
    <div className="app-container">
      {/* Mobile Header Banner */}
      <header className="mobile-header d-md-none" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        width: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1rem',
            color: 'white'
          }}>S</div>
          <span style={{ fontWeight: 'bold', fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Sabha Attendance</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="btn btn-ghost" 
          style={{ padding: '0.5rem' }}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`sidebar-container ${mobileMenuOpen ? 'open' : ''}`} style={{
        width: '280px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 'var(--z-sidebar)',
        transition: 'var(--transition)'
      }}>
        <div>
          {/* Logo Brand Panel */}
          <div style={{
            padding: '2rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))',
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.25rem',
              color: 'white',
              boxShadow: 'var(--shadow-md)'
            }}>S</div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>Sabha Mandal</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Attendance Registry</p>
            </div>
          </div>

          {/* Links list */}
          <nav style={{ padding: '1.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {allowedItems.map(item => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    width: '100%',
                    padding: '0.85rem 1rem',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--accent-light)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                  className="sidebar-btn"
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Footer Panel */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)'
              }}>
                <User size={20} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {user.name}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                  {user.role}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '0.6rem' }}
          >
            <LogOut size={16} />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Viewport Container */}
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top bar header */}
        <header className="d-none d-md-flex" style={{
          height: '73px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem'
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{getPageTitle()}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <LanguageSwitcher />
            <span className="badge badge-info">{user?.role} Mode</span>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Content body wrapper */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </main>

      {/* Embedded Mobile CSS */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-container {
            position: fixed;
            top: 60px;
            left: -280px;
            bottom: 0;
            height: calc(100vh - 60px);
            width: 280px !important;
            box-shadow: 10px 0 30px rgba(0,0,0,0.5);
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          .sidebar-container.open {
            left: 0;
          }
          .main-content {
            margin-top: 0px;
            height: calc(100vh - 60px);
          }
        }
        .sidebar-btn:hover {
          color: var(--text-primary) !important;
          background-color: var(--bg-tertiary) !important;
        }
      `}</style>
    </div>
  );
}
