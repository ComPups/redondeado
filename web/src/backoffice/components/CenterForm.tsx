import { useState, type FormEvent } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import type { CenterInput } from '../centers';

type Props = { submitting: boolean; onSubmit: (input: CenterInput) => void; onCancel: () => void };

export function CenterForm({ submitting, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<CenterInput>({ name: '', description: '', opens_at: '09:00', closes_at: '18:00' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(form); }
  return (
    <section className="form-card" id="nuevo-centro" aria-labelledby="form-heading">
      <p className="eyebrow">NUEVO ESPACIO</p><h2 id="form-heading">Crear un centro</h2><p>Agrega la información básica para comenzar.</p>
      <Form onSubmit={submit}>
        <Form.Label htmlFor="name">Nombre del centro</Form.Label>
        <Form.Control id="name" required maxLength={120} placeholder="Ej. Centro Bienestar Arrayán" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Form.Label htmlFor="description">Descripción <span>Opcional</span></Form.Label>
        <Form.Control as="textarea" id="description" maxLength={400} rows={4} placeholder="Cuéntanos un poco sobre este centro" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <div className="hint">{form.description.length}/400 caracteres</div>
        <div className="time-grid">
          <div><Form.Label htmlFor="opens">Apertura</Form.Label><Form.Control id="opens" type="time" required value={form.opens_at} onChange={e => setForm({ ...form, opens_at: e.target.value })} /></div>
          <div><Form.Label htmlFor="closes">Cierre</Form.Label><Form.Control id="closes" type="time" required value={form.closes_at} onChange={e => setForm({ ...form, closes_at: e.target.value })} /></div>
        </div>
        <p className="form-help">El horario se aplica todos los días.</p>
        <Button type="submit" className="button-primary submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear centro'}</Button>
        <Button type="button" variant="outline-secondary" className="cancel" disabled={submitting} onClick={onCancel}>Cancelar</Button>
      </Form>
    </section>
  );
}
