import { useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { createCenter, type Center, type CenterInput } from '../centers';
import { CenterForm } from '../components/CenterForm';
import { CenterList } from '../components/CenterList';

export function CentersView({ token, centers, loading, onCreated, onSelect }: { token: string; centers: Center[]; loading: boolean; onCreated: () => void; onSelect: (id: string) => void }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(input: CenterInput) {
    setError(''); setSuccess(''); setSubmitting(true);
    try {
      await createCenter(token, input);
      setSuccess('Centro creado correctamente.');
      onCreated();
      setShowForm(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el centro.'); }
    finally { setSubmitting(false); }
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">TU ORGANIZACIÓN</p><h1>Centros</h1><p className="lead">Todos tus espacios de atención, en un solo lugar.</p></div>
        <Button className="button-primary" aria-expanded={showForm} aria-controls="nuevo-centro" onClick={() => { setShowForm(true); setError(''); setSuccess(''); }}>+ Nuevo centro</Button>
      </div>
      {error && <Alert className="notice" variant="danger" role="alert">{error}</Alert>}
      {success && <Alert className="notice" variant="success" role="status">{success}</Alert>}
      <div className={`grid${showForm ? '' : ' grid-list-only'}`}>
        <CenterList centers={centers} loading={loading} onSelect={onSelect} />
        {showForm && <CenterForm submitting={submitting} onSubmit={handleCreate} onCancel={() => { setShowForm(false); setError(''); }} />}
      </div>
    </>
  );
}
