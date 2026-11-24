import { useEffect, useState } from 'react';
import { apiUrl } from './api';

export function ApiStatus() {
  const [status, setStatus] = useState('Checking API…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: { status: string }) => setStatus(data.status === 'ok' ? 'API connected' : 'API unavailable'))
      .catch(() => { if (!controller.signal.aborted) setStatus('API unavailable'); });
    return () => controller.abort();
  }, []);
  return <p role="status">{status}</p>;
}
