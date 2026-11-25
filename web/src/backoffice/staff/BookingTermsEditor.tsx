import { useEffect, useState } from 'react';
import { apiUrl } from '../../shared/api';
import { staffFetch } from './staffWorkspace';

type Service = { id: string; name: string };
type Term = { service_id: string | null; body: string };

export function BookingTermsEditor({ centerId, centerName, professionalName, services, administrator, token }: { centerId: string; centerName: string; professionalName: string; services: Service[]; administrator: boolean; token: string }) {
  const [scope, setScope] = useState(services[0]?.id ?? (administrator ? 'center' : ''));
  const [terms, setTerms] = useState<Term[]>([]);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoaded(false);
    staffFetch(`/staff/centers/${encodeURIComponent(centerId)}/terms`, token, controller.signal).then((data: Term[]) => {
      setTerms(data); setMessage(''); setLoaded(true); setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setMessage('No pudimos cargar los términos.'); setLoading(false); } });
    return () => controller.abort();
  }, [centerId, revision, token]);
  useEffect(() => { setBody(terms.find(t => (t.service_id ?? 'center') === scope)?.body ?? ''); }, [terms, scope]);
  async function save(value: string | null) {
    setLoading(true); setMessage('');
    try {
      const existing = terms.some(t => (t.service_id ?? 'center') === scope);
      const response = await fetch(`${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/terms/${encodeURIComponent(scope)}`, {
        method: value === null ? 'DELETE' : existing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(value === null ? {} : { 'Content-Type': 'application/json' }) },
        ...(value === null ? {} : { body: JSON.stringify({ body: value }) }),
      });
      if (!response.ok) throw new Error('Could not update terms');
      setRevision(v => v + 1);
    } catch { setMessage('No pudimos guardar los términos.'); setLoading(false); }

  }
  return <section className="staff-section staff-page-section staff-terms"><div className="section-heading"><div><p className="eyebrow">CONFIGURACIÓN DE RESERVAS</p><h2>Términos y condiciones</h2><p>Define los términos que tus pacientes deben aceptar al reservar.</p></div></div>
    <div className="staff-terms-card"><p className="staff-terms-context"><strong>Centro:</strong> {centerName} <span aria-hidden="true">·</span> <strong>Profesional:</strong> {scope === 'center' ? 'Todos' : professionalName}</p>
    <label htmlFor="terms-scope">Servicio</label><select id="terms-scope" value={scope} onChange={e => setScope(e.target.value)}>{administrator && <option value="center">Términos del centro</option>}{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <label htmlFor="terms-body">Texto completo</label><textarea id="terms-body" rows={10} maxLength={30000} value={body} onChange={e => setBody(e.target.value)} />
    <p className="staff-terms-help">Revisa la base de licitud, privacidad y las cláusulas de edad, cancelación e inasistencia antes de publicar. El consentimiento clínico es independiente.</p>
    <div className="staff-terms-actions"><button className="staff-terms-publish" type="button" disabled={loading || !loaded || !scope || !body.trim()} onClick={() => void save(body)}>Publicar términos</button>{' '}
    <button className="staff-terms-withdraw" type="button" disabled={loading || !loaded || !terms.some(t => (t.service_id ?? 'center') === scope)} onClick={() => void save(null)}>Retirar términos</button></div>
    {message && <p className="notice error" role="alert">{message} {!loaded && <button type="button" onClick={() => setRevision(v => v + 1)}>Reintentar</button>}</p>}
    </div></section>;
}
