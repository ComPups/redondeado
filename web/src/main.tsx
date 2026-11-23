import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function ApiStatus() {
  const [status, setStatus] = useState('Checking API…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json();
      })
      .then((data: { status: string }) => setStatus(data.status === 'ok' ? 'API connected' : 'API unavailable'))
      .catch(() => { if (!controller.signal.aborted) setStatus('API unavailable'); });
    return () => controller.abort();
  }, []);
  return <p role="status">{status}</p>;
}

function PublicLayout({ slug }: { slug: string }) {
  return <main><h1>Redondeado — Public site</h1><p>Center: {slug}</p><ApiStatus /></main>;
}

function StaffLayout() {
  return <main><h1>Redondeado — Backoffice</h1><h2>Staff sign-in</h2><p>Staff sign-in is not available yet.</p><ApiStatus /></main>;
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isStaff = path === '/staff' || path.startsWith('/staff/');
  useEffect(() => {
    // COM-9 will replace this signed-out guard with the real session check.
    if (isStaff && path !== '/staff/login') window.location.replace('/staff/login');
  }, [isStaff, path]);
  if (isStaff) return path === '/staff/login' ? <StaffLayout /> : null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 1) return <PublicLayout slug={segments[0]} />;
  return <main><h1>Redondeado</h1><p>Choose a center to book an appointment.</p></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
