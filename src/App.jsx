import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DbProvider } from './context/DbContext';
import { LanguageProvider } from './i18n/LanguageContext';
import Layout from './components/Layout';

// Import Views
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import AttendanceDesk from './views/AttendanceDesk';
import Registration from './views/Registration';
import ExcelImport from './views/ExcelImport';
import EventManagement from './views/EventManagement';
import SharedRegistration from './views/SharedRegistration';
import Reports from './views/Reports';
import BalakDirectory from './views/BalakDirectory';
import AdminSettings from './views/AdminSettings';

function AppContent() {
  const { user } = useAuth();
  const [view, setView] = useState('dashboard');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [urlParams, setUrlParams] = useState({ view: null, eventId: null });

  useEffect(() => {
    // Reset navigation when the signed-in user changes so a lower-privileged
    // login doesn't inherit the previous user's active view
    setView(v => (v === 'shared-registration' ? v : 'dashboard'));
  }, [user?.id]);

  useEffect(() => {
    // Parse query params for shared registration routes
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const eventIdParam = params.get('eventId');
    
    // eventId is optional: a link without one always targets whichever event
    // is Active when the visitor opens it, so one permanent link can be shared
    // instead of re-sharing a new link per event.
    if (viewParam === 'shared-registration') {
      setView('shared-registration');
      setUrlParams({ view: viewParam, eventId: eventIdParam });
    }
  }, []);

  // Public shared link bypasses login checks
  if (view === 'shared-registration') {
    return <SharedRegistration eventId={urlParams.eventId} />;
  }

  // Otherwise, standard authenticated dashboard app
  if (!user) {
    return <Login />;
  }

  // Render view based on active navigation State
  const renderActiveView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard setView={setView} setSelectedEventId={setSelectedEventId} />;
      case 'attendance':
        return <AttendanceDesk setView={setView} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />;
      case 'registration':
        return <Registration setView={setView} selectedEventId={selectedEventId} />;
      case 'import':
        return <ExcelImport />;
      case 'events':
        return <EventManagement />;
      case 'balaks':
        return <BalakDirectory />;
      case 'reports':
        return <Reports />;
      case 'admin':
        return <AdminSettings />;
      default:
        return <Dashboard setView={setView} setSelectedEventId={setSelectedEventId} />;
    }
  };

  return (
    <Layout currentView={view} setView={setView}>
      {renderActiveView()}
    </Layout>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DbProvider>
          <AppContent />
        </DbProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
