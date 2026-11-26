import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import { apiFetch } from "../../shared/requestCache";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Modal } from "react-bootstrap";
import { NewAppointment } from "./NewAppointment";

export type Appointment = {
  id: string;
  professional_user_id: string;
  service_name: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  starts_at: string;
  ends_at: string;
  professional_name?: string | null;
};
const santiagoParts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
const localInput = (value: string) => {
  const p = santiagoParts(new Date(value));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const format = (value: string) =>
  new Date(value).toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  });
const dateKey = (value: Date | string) => {
  const parts = santiagoParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const monthKey = (value: Date) =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateLabel = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
// Convert a Santiago wall time to an instant, checking daylight-saving transitions.
function santiagoInstant(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const target = Date.UTC(
    +match[1],
    +match[2] - 1,
    +match[3],
    +match[4],
    +match[5],
  );
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const p = santiagoParts(new Date(instant));
    const represented = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
    );
    instant += target - represented;
  }
  const result = new Date(instant);
  return localInput(result.toISOString()) === value ? result : null;
}

export function Agenda({
  role,
  token,
  centerId,
  apiUrl,
  scope = "personal",
}: {
  role: string;
  token: string;
  centerId: string;
  apiUrl: string;
  scope?: "personal" | "center";
}) {
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = santiagoParts(new Date());
    return new Date(Date.UTC(Number(today.year), Number(today.month) - 1, 1));
  });
  const [calendarAppointments, setCalendarAppointments] = useState<
    Appointment[]
  >([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCalendarLoading(true);
    setCalendarError("");
    setCalendarAppointments([]);
    setSelectedDay(null);
    const query = new URLSearchParams({
      scope,
      month: monthKey(calendarMonth),
    });
    apiFetch(
      `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/appointments?${query}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result: { appointments: Appointment[] }) => {
        if (!controller.signal.aborted) {
          setCalendarAppointments(result.appointments);
          setCalendarLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCalendarError("No se pudo cargar el calendario.");
          setCalendarLoading(false);
        }
      });
    return () => controller.abort();
  }, [apiUrl, centerId, token, scope, calendarMonth, revision]);
  const refresh = () => setRevision((value) => value + 1);
  const appointmentsByDay = useMemo(() => {
    const byDay = new Map<string, Appointment[]>();
    calendarAppointments.forEach((appointment) => {
      const key = dateKey(appointment.starts_at);
      byDay.set(key, [...(byDay.get(key) ?? []), appointment]);
    });
    return byDay;
  }, [calendarAppointments]);
  const firstCalendarDay = useMemo(
    () =>
      new Date(
        Date.UTC(
          calendarMonth.getUTCFullYear(),
          calendarMonth.getUTCMonth(),
          1,
        ),
      ),
    [calendarMonth],
  );
  const lastCalendarDay = useMemo(
    () =>
      new Date(
        Date.UTC(
          calendarMonth.getUTCFullYear(),
          calendarMonth.getUTCMonth() + 1,
          0,
        ),
      ),
    [calendarMonth],
  );
  const calendarDays = useMemo(
    () =>
      Array.from(
        { length: lastCalendarDay.getUTCDate() },
        (_, index) =>
          new Date(
            Date.UTC(
              calendarMonth.getUTCFullYear(),
              calendarMonth.getUTCMonth(),
              index + 1,
            ),
          ),
      ),
    [calendarMonth, lastCalendarDay],
  );
  const today = dateKey(new Date());
  const selectedAppointments = selectedDay
    ? (appointmentsByDay.get(selectedDay) ?? [])
    : [];
  function close() {
    setSelected(null);
    setEditing(false);
    setMessage("");
    setConfirmDelete(false);
  }
  async function request(method: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiFetch(
        `${apiUrl}/staff/centers/${encodeURIComponent(centerId)}/appointments/${selected!.id}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "No se pudo guardar la cita.");
      }
      close();
      refresh();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo guardar la cita.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const start = santiagoInstant(String(form.get("starts_at")));
    if (!start) {
      setMessage("Ingresa una fecha válida.");
      return;
    }
    const duration =
      Date.parse(selected!.ends_at) - Date.parse(selected!.starts_at);
    void request("PATCH", {
      patient_name: form.get("patient_name"),
      patient_email: form.get("patient_email"),
      patient_phone: form.get("patient_phone"),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + duration).toISOString(),
    });
  }
  return (
    <section className="staff-section" id="agendamientos">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {scope === "center" ? "AGENDA DEL CENTRO" : "TU AGENDA"}
          </p>
          <h2>
            {scope === "center" ? "Agendamientos del centro" : "Agendamientos"}
          </h2>
          <p>
            {scope === "center"
              ? "Revisa los agendamientos de tu centro."
              : "Revisa los agendamientos asignados a ti."}
          </p>
        </div>
        <div className="agenda-actions">
          {role !== "limited" && (
            <Button
              className="button-primary"
              onClick={() => setCreating(true)}
            >
              + Agendar cita
            </Button>
          )}
        </div>
      </div>
      <section
        className="agenda-calendar"
        aria-labelledby="agenda-calendar-heading"
      >
        <div className="agenda-calendar-heading">
          <div>
            <h3 id="agenda-calendar-heading">Calendario de citas</h3>
            <p>Verde: citas activas · gris: citas pasadas.</p>
          </div>
          <div className="agenda-calendar-legend" aria-label="Leyenda">
            <span className="active">Activa</span>
            <span className="past">Pasada</span>
            <span className="clear">Libre</span>
          </div>
        </div>
        <div className="agenda-calendar-navigation">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() =>
              setCalendarMonth(
                (value) =>
                  new Date(
                    Date.UTC(
                      value.getUTCFullYear(),
                      value.getUTCMonth() - 1,
                      1,
                    ),
                  ),
              )
            }
          >
            ‹
          </button>
          <strong aria-live="polite">{monthLabel.format(calendarMonth)}</strong>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() =>
              setCalendarMonth(
                (value) =>
                  new Date(
                    Date.UTC(
                      value.getUTCFullYear(),
                      value.getUTCMonth() + 1,
                      1,
                    ),
                  ),
              )
            }
          >
            ›
          </button>
        </div>
        {calendarLoading ? (
          <p className="agenda-calendar-loading" aria-live="polite">
            Cargando calendario…
          </p>
        ) : calendarError ? (
          <p role="alert">
            {calendarError}{" "}
            <button type="button" onClick={refresh}>
              Reintentar
            </button>
          </p>
        ) : (
          <div
            className="agenda-calendar-grid"
            aria-label="Calendario de citas"
          >
            {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((day) => (
              <span key={day}>{day}</span>
            ))}
            {Array.from(
              { length: (firstCalendarDay.getUTCDay() + 6) % 7 },
              (_, index) => (
                <i key={`empty-${index}`} aria-hidden="true" />
              ),
            )}
            {calendarDays.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const dayAppointments = appointmentsByDay.get(key) ?? [];
              const active = dayAppointments.some(
                (appointment) => new Date(appointment.ends_at) > new Date(),
              );
              const pastDay = key < today;
              const status = active
                ? "active"
                : dayAppointments.length
                  ? "past"
                  : pastDay
                    ? "empty-past"
                    : "clear";
              const label = active
                ? "con citas activas"
                : dayAppointments.length
                  ? "con citas pasadas"
                  : pastDay
                    ? "sin citas, día pasado"
                    : "sin citas";
              return (
                <button
                  type="button"
                  key={key}
                  className={`agenda-calendar-day ${status}${selectedDay === key ? " selected" : ""}`}
                  aria-label={`${dateLabel.format(day)}, ${label}`}
                  aria-pressed={selectedDay === key}
                  onClick={() =>
                    setSelectedDay((value) => (value === key ? null : key))
                  }
                >
                  {day.getUTCDate()}
                </button>
              );
            })}
          </div>
        )}
        {selectedDay && (
          <div className="agenda-day-details" aria-live="polite">
            <strong>
              {dateLabel.format(new Date(`${selectedDay}T00:00:00Z`))}
            </strong>
            {selectedAppointments.length ? (
              <ul className="agenda-list">
                {selectedAppointments.map((appointment) => (
                  <li key={appointment.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(appointment);
                        setMessage("");
                      }}
                    >
                      <span className="appointment-row appointment-time">
                        {format(appointment.starts_at)}
                      </span>
                      {appointment.professional_name && (
                        <span className="appointment-row appointment-professional">
                          <small>Profesional</small>
                          {appointment.professional_name}
                        </span>
                      )}
                      <span className="appointment-row">
                        <small>Paciente</small>
                        {appointment.patient_name}
                      </span>
                      <span className="appointment-row">
                        <small>Motivo</small>
                        {appointment.service_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay citas este día.</p>
            )}
          </div>
        )}
      </section>
      <NewAppointment
        scope={scope}
        show={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
        centerId={centerId}
        token={token}
        apiUrl={apiUrl}
      />
      <Modal
        show={!!selected}
        onHide={close}
        enforceFocus={!confirmDelete}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Detalle de la cita</Modal.Title>
        </Modal.Header>
        {selected && (
          <>
            <Modal.Body>
              {message && <p role="alert">{message}</p>}
              {editing ? (
                <form
                  id="appointment-form"
                  onSubmit={save}
                  className="appointment-form"
                >
                  <label>
                    Nombre{" "}
                    <input
                      name="patient_name"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={selected.patient_name}
                    />
                  </label>
                  <label>
                    Correo{" "}
                    <input
                      name="patient_email"
                      type="email"
                      required
                      maxLength={254}
                      defaultValue={selected.patient_email}
                    />
                  </label>
                  <label>
                    Teléfono{" "}
                    <input
                      name="patient_phone"
                      required
                      pattern="\+?[0-9 ()-]{7,20}"
                      defaultValue={selected.patient_phone}
                    />
                  </label>
                  <label>
                    Fecha y hora (Santiago){" "}
                    <input
                      name="starts_at"
                      type="datetime-local"
                      required
                      defaultValue={localInput(selected.starts_at)}
                    />
                  </label>
                  <p>La duración de la cita se mantiene al cambiar la hora.</p>
                </form>
              ) : (
                <dl>
                  <dt>Paciente</dt>
                  <dd>{selected.patient_name}</dd>
                  <dt>Correo</dt>
                  <dd>
                    <a href={`mailto:${selected.patient_email}`}>
                      {selected.patient_email}
                    </a>
                  </dd>
                  <dt>Teléfono</dt>
                  <dd>
                    <a href={`tel:${selected.patient_phone}`}>
                      {selected.patient_phone}
                    </a>
                  </dd>
                  <dt>Fecha y hora</dt>
                  <dd>
                    {format(selected.starts_at)} –{" "}
                    {new Date(selected.ends_at).toLocaleTimeString("es-CL", {
                      timeStyle: "short",
                      timeZone: "America/Santiago",
                    })}
                  </dd>
                  <dt>Servicio</dt>
                  <dd>{selected.service_name}</dd>
                  {selected.professional_name && (
                    <>
                      <dt>Profesional</dt>
                      <dd>{selected.professional_name}</dd>
                    </>
                  )}
                </dl>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="outline-secondary"
                onClick={close}
                disabled={busy}
              >
                Cerrar
              </Button>
              {role !== "limited" &&
                (editing ? (
                  <>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setEditing(false)}
                      disabled={busy}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="button-primary"
                      type="submit"
                      form="appointment-form"
                      disabled={busy}
                    >
                      Guardar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      className="button-primary"
                      onClick={() => setEditing(true)}
                    >
                      Reagendar
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        setMessage("");
                        setConfirmDelete(true);
                      }}
                    >
                      Eliminar
                    </Button>
                  </>
                ))}
            </Modal.Footer>
          </>
        )}
      </Modal>
      <Modal
        show={confirmDelete}
        onHide={() => !busy && setConfirmDelete(false)}
        centered
        className="confirm-delete-modal"
        backdropClassName="confirm-delete-backdrop"
      >
        <Modal.Header closeButton={!busy}>
          <Modal.Title>Eliminar cita</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>¿Eliminar esta cita? Esta acción no se puede deshacer.</p>
          {message && (
            <p className="notice error" role="alert">
              {message}
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => void request("DELETE")}
            disabled={busy}
          >
            Confirmar eliminación
          </Button>
        </Modal.Footer>
      </Modal>
    </section>
  );
}
