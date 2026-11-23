import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [status, setStatus] = useState('Checking API…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json();
      })
      .then((data: { status: string }) => setStatus(data.status === 'ok' ? 'API connected' : 'API unavailable'))
      .catch(() => { if (!controller.signal.aborted) setStatus('API unavailable'); });
    return () => controller.abort();
  }, []);
  return <main><h1>Redondeado — Public site</h1><p role="status">{status}</p></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
