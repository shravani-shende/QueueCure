import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PatientPortal from './pages/PatientPortal';
import PatientTracking from './pages/PatientTracking';
import WaitingDisplay from './pages/WaitingDisplay';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import AdminPanel from './pages/AdminPanel';
import LoginPage from './pages/LoginPage';

function parseHash(): { path: string; params: string[] } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  return { path: parts[0] ?? '', params: parts.slice(1) };
}

function Router() {
  const [route, setRoute] = useState(parseHash());
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    function onHashChange() { setRoute(parseHash()); }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Patient-facing routes (no auth required)
  if (route.path === 'track' && route.params.length >= 3) {
    return (
      <PatientTracking
        doctorId={route.params[0]}
        tokenNumber={Number(route.params[1])}
        date={route.params[2]}
      />
    );
  }

  if (route.path === 'display') {
    return <WaitingDisplay />;
  }

  if (route.path === 'receptionist') {
    if (loading) return <LoadingScreen />;
    if (!user) return <LoginPage mode="receptionist" />;
    if (profile?.role !== 'receptionist' && profile?.role !== 'admin') return <LoginPage mode="receptionist" />;
    return <ReceptionistDashboard />;
  }

  if (route.path === 'admin') {
    if (loading) return <LoadingScreen />;
    if (!user) return <LoginPage mode="admin" />;
    if (profile?.role !== 'admin') {
      return <LoginPage mode="admin" />;
    }
    return <AdminPanel />;
  }

  // Default: patient portal
  return <PatientPortal />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
