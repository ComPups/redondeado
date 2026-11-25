import { useEffect, useState } from 'react';
import { apiUrl } from '../../shared/api';
import { staffFetch } from './staffWorkspace';

export function PlatformAdmin({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [entity, setEntity] = useState('centers');
  const [fields, setFields] = useState<Record<string, string[]>>();
  const [fieldsError, setFieldsError] = useState(false);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const path = entity === 'memberships' ? '/staff/platform-memberships' : `/staff/platform/${entity}`;
  useEffect(() => {
    const controller = new AbortController();
    staffFetch('/staff/platform/editable-fields', token, controller.signal).then(fields => {
      if (controller.signal.aborted) return;
      setFields(fields);
      setFieldsError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setFieldsError(true);
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    let active = true;
    staffFetch(path, token).then(rows => { if (active) setRecords(rows); }).catch(() => { if (active) setMessage('Could not load records.'); });
    return () => { active = false; };
  }, [path, token, revision]);
  async function save(record: Record<string, unknown>, form: HTMLFormElement) {
    try {
      const changes = JSON.parse(new FormData(form).get('changes') as string);
      const id = entity === 'staff_profiles' ? record.professional_id : record.id;
      const target = entity === 'memberships' ? `${path}/${record.center_id}/${record.user_id}` : `${path}/${id}`;
      const response = await fetch(`${apiUrl}${target}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      if (!response.ok) throw new Error('Update failed');
      setMessage('Record updated.'); setEditing(''); setRevision(v => v + 1); if (entity === 'centers') onCreated();
    } catch { setMessage('Could not save. Check the editable fields and values.'); }
  }
  if (fieldsError || !fields) return <section><h2>Platform administration</h2>
    {fieldsError ? <p role="alert">Could not load editable fields.</p> : <p role="status">Loading editable fields…</p>}
  </section>;

  return <section><h2>Platform administration</h2>
    <h3>Edit records</h3><label>Entity <select value={entity} onChange={e => { setEntity(e.target.value); setEditing(''); setRecords([]); }}>{Object.keys(fields).map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select></label>
    {entity === 'services' && <p>Service prices and durations are suggested starting values for new professional offerings; editing them does not change existing offerings.</p>}
    {message && <p role="status">{message}</p>}
    <ul>{records.map(record => { const id = String(record.id ?? record.professional_id ?? `${record.center_id}/${record.user_id}`); return <li key={id}>
      <pre>{JSON.stringify(record, null, 2)}</pre><button onClick={() => setEditing(id)}>Edit</button>
      {editing === id && <form onSubmit={e => { e.preventDefault(); void save(record, e.currentTarget); }}><label>Editable fields (JSON)<br /><textarea name="changes" rows={8} cols={50} defaultValue={JSON.stringify(Object.fromEntries(fields[entity].map(k => [k, record[k]])), null, 2)} /></label><br /><button>Save</button><button type="button" onClick={() => setEditing('')}>Cancel</button></form>}
    </li>; })}</ul>
  </section>;
}
