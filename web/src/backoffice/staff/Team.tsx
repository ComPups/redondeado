import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { apiUrl } from "../../shared/api";
type Role = "administrator" | "member";
type MembershipRole = Role | "limited";
type Member = {
  user_id: string;
  display_name: string;
  role: MembershipRole;
  active: boolean;
  upcoming_appointments: number;
  services: string[];
};
type Service = {
  id: string;
  name: string;
  price_clp: number;
  duration_minutes: number;
};
const labels: Record<Role, string> = {
  administrator: "Administrador",
  member: "Miembro",
};
function RoleOptions() {
  return (
    <>
      {Object.entries(labels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}
export function Team({
  centerId,
  token,
  onMembershipChanged,
}: {
  centerId: string;
  token: string;
  onMembershipChanged?: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, refresh] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const requestKey = useRef<string | null>(null);
  const requestFingerprint = useRef<string | null>(null);
  const base = `/staff/centers/${encodeURIComponent(centerId)}`;
  useEffect(() => {
    const controller = new AbortController();
    setMembers(null);
    setError("");
    Promise.all([
      fetch(`${apiUrl}${base}/team`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
      fetch(`${apiUrl}${base}/service-catalog`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
    ])
      .then(async (responses) => {
        if (responses.some((r) => !r.ok))
          throw new Error("No se pudo cargar el equipo.");
        const [team, catalog] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (!controller.signal.aborted) {
          setMembers(team.members);
          setServices(catalog);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [base, token, revision]);
  function resetInvite() {
    setName("");
    setEmail("");
    setPassword("");
    setSelected([]);
    setRole("member");
    requestKey.current = null;
    requestFingerprint.current = null;
  }
  function cancelInvite() {
    resetInvite();
    setFormOpen(false);
    setError("");
    setNotice("");
  }
  async function createMember(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify({
      name,
      email,
      password,
      role,
      selected,
    });
    if (requestFingerprint.current !== fingerprint || !requestKey.current) {
      requestFingerprint.current = fingerprint;
      requestKey.current = crypto.randomUUID();
    }
    try {
      const response = await fetch(`${apiUrl}${base}/team/members`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify({
          display_name: name,
          email,
          password,
          role,
          service_ids: selected,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se pudo crear la cuenta.");
      setNotice(
        "Cuenta creada. La persona puede iniciar sesión inmediatamente.",
      );
      resetInvite();
      setFormOpen(false);
      refresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(
    member: Member,
    nextRole: MembershipRole,
    active: boolean,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${apiUrl}${base}/team/members/${member.user_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: nextRole, active }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
      setNotice("Cambios guardados.");
      refresh((v) => v + 1);
      onMembershipChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="team-page" aria-labelledby="team-title">
      <h1 id="team-title">Equipo</h1>
      <p>
        Administra el acceso y los servicios de las personas de este centro.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!formOpen ? (
        <button
          type="button"
          disabled={busy || !members}
          onClick={() => {
            setError("");
            setNotice("");
            setFormOpen(true);
          }}
        >
          Agregar staff
        </button>
      ) : (
        <form className="form-card team-invite-form" onSubmit={createMember}>
          <h2>Crear persona</h2>
          <label>
            Nombre{" "}
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>{" "}
          <label>
            Correo{" "}
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>{" "}
          <label>
            Contraseña{" "}
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>{" "}
          <label>
            Rol{" "}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <RoleOptions />
            </select>
          </label>
          <fieldset>
            <legend>Servicios iniciales</legend>
            <p>
              Se copian los precios y duraciones actuales como valores iniciales
              editables por el profesional.
            </p>
            {services.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((id) => id !== s.id),
                    )
                  }
                />{" "}
                {s.name} · ${s.price_clp.toLocaleString("es-CL")} ·{" "}
                {s.duration_minutes} min
              </label>
            ))}
          </fieldset>
          <button disabled={busy || !members} type="submit">
            Crear cuenta
          </button>{" "}
          <button disabled={busy} type="button" onClick={cancelInvite}>
            Cancelar
          </button>
        </form>
      )}
      {!members ? (
        <p role="status">Cargando equipo…</p>
      ) : (
        <>
          <h2>Personas con acceso</h2>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Acceso</th>
                  <th>Servicios</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.display_name}</td>
                    <td>
                      <select
                        aria-label={`Rol de ${m.display_name}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          void update(
                            m,
                            e.target.value as MembershipRole,
                            m.active,
                          )
                        }
                      >
                        {m.role === "limited" && (
                          <option value="limited" disabled>
                            Acceso limitado
                          </option>
                        )}
                        <RoleOptions />
                      </select>
                    </td>
                    <td>{m.active ? "Activo" : "Inactivo"}</td>
                    <td>{m.services.join(", ") || "Sin servicios"}</td>
                    <td>
                      {m.upcoming_appointments > 0 && (
                        <p>
                          {m.upcoming_appointments} citas próximas. Se
                          conservarán al desactivar.
                        </p>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            !m.active ||
                            window.confirm(
                              `Desactivar a ${m.display_name}: perderá acceso y nuevas reservas en este centro. Se conservarán sus ${m.upcoming_appointments} citas próximas.`,
                            )
                          )
                            void update(m, m.role, !m.active);
                        }}
                      >
                        {m.active ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
