import { useState, type FormEvent } from "react";
import { updateCenter, type Center, type CenterInput } from "../centers";

export function CenterSettings({
  center,
  token,
  onSaved,
  onCancel,
}: {
  center: Center;
  token: string;
  onSaved: (center: Center) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<CenterInput>({
    name: center.name,
    description: center.description,
    opens_at: center.opens_at.slice(0, 5),
    closes_at: center.closes_at.slice(0, 5),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function change(input: Partial<CenterInput>) {
    setForm((current) => ({ ...current, ...input }));
    setSaved(false);
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (!form.name.trim()) {
      setError("Ingresa el nombre del centro.");
      return;
    }
    if (form.opens_at >= form.closes_at) {
      setError("La hora de cierre debe ser posterior a la hora de apertura.");
      return;
    }
    setBusy(true);
    try {
      const updated = await updateCenter(token, center.id, form);
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos guardar los cambios.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="staff-section staff-page-section"
      aria-labelledby="center-settings-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="center-settings-heading">Configuraciones del centro</h2>
          <p>
            Actualiza la información que se muestra en el perfil público del
            centro.
          </p>
        </div>
      </div>
      <form className="form-card service-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Nombre del centro
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label>
            Descripción
            <textarea
              maxLength={400}
              rows={4}
              value={form.description}
              onChange={(e) => change({ description: e.target.value })}
              aria-describedby="center-description-count"
            />
          </label>
          <div className="hint" id="center-description-count">
            {form.description.length}/400 caracteres
          </div>
          <div className="time-grid">
            <label>
              Hora de apertura
              <input
                type="time"
                required
                value={form.opens_at}
                onChange={(e) => change({ opens_at: e.target.value })}
              />
            </label>
            <label>
              Hora de cierre
              <input
                type="time"
                required
                value={form.closes_at}
                onChange={(e) => change({ closes_at: e.target.value })}
              />
            </label>
          </div>
          <p className="form-help">
            El mismo horario se aplica todos los días. Las citas existentes se
            conservan.
          </p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="notice" role="status">
              Configuración guardada.
            </p>
          )}
          <div className="service-actions">
            <button className="button button-primary btn" type="submit">
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
            {onCancel && (
              <button
                className="staff-signout"
                type="button"
                onClick={onCancel}
              >
                Cancelar
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
