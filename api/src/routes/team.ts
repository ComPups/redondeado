import { Router, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PoolClient } from "pg";
import { requireCenterAccess } from "../middleware/centerAccess.js";

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const assignableRoles = ["administrator", "member"];
const membershipRoles = [...assignableRoles, "limited"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Member = {
  user_id: string;
  display_name: string;
  role: string;
  active: boolean;
  upcoming_appointments: number;
  services: string[];
};
type QueryError = { code?: string; message?: string };

async function transaction<T>(
  res: Response,
  run: (client: PoolClient) => Promise<T>,
) {
  const { sql, userId } = res.locals.staff;
  let commitStarted = false;
  try {
    return await sql.transaction(
      { kind: "staff", userId },
      async (client: PoolClient) => {
        const result = await run(client);
        commitStarted = true;
        return result;
      },
    );
  } catch (error) {
    if (commitStarted)
      Object.assign(error as object, { transactionOutcomeUnknown: true });
    throw error;
  }
}
async function members(
  client: PoolClient,
  centerId: string,
  userId?: string,
): Promise<Member[]> {
  const rows = await client.query(
    `select m.user_id, p.display_name, m.role, m.active,
    (select count(*)::integer from public.appointments a where a.center_id=m.center_id and a.professional_user_id=m.user_id and a.starts_at>now()) as upcoming_appointments
    from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id
    where m.center_id=$1 order by p.display_name`,
    [centerId],
  );
  const offerings = await client.query(
    `select ps.professional_user_id, coalesce(array_agg(s.name order by s.name),'{}') as services
    from public.professional_services ps join public.services s on s.id=ps.service_id and s.center_id=ps.center_id
    where ps.center_id=$1 and ps.active and s.active group by ps.professional_user_id`,
    [centerId],
  );
  const byUser = new Map<string, string[]>(
    offerings.rows.map((row) => [row.professional_user_id, row.services]),
  );
  return rows.rows.map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    upcoming_appointments: Number(row.upcoming_appointments),
    services: byUser.get(row.user_id) ?? [],
  }));
}
export async function updateMember(
  res: Response,
  centerId: string,
  userId: string,
  role: string,
  active: boolean | null,
) {
  return transaction(res, async (client) => {
    const current = await client.query(
      "select role from public.center_memberships where center_id=$1 and user_id=$2 for update",
      [centerId, userId],
    );
    if (!current.rowCount) {
      const error = new Error("Membership not found") as Error & {
        code: string;
      };
      error.code = "P0002";
      throw error;
    }
    if (
      !assignableRoles.includes(role) &&
      !(role === "limited" && current.rows[0].role === "limited")
    ) {
      const error = new Error("Invalid role") as Error & { code: string };
      error.code = "22023";
      throw error;
    }
    const result = await client.query(
      `update public.center_memberships set role=$1, active=coalesce($2::boolean,active) where center_id=$3 and user_id=$4 returning user_id,role,active`,
      [role, active, centerId, userId],
    );
    if (!result.rowCount) {
      const error = new Error("Membership not found") as Error & {
        code: string;
      };
      error.code = "P0002";
      throw error;
    }
    return result.rows[0];
  });
}
function failure(res: Response, error: unknown) {
  const { code, message } = error as QueryError;
  if (code === "42501")
    return res
      .status(403)
      .json({ error: "No tienes permiso para administrar este equipo." });
  if (code === "P0002")
    return res.status(404).json({ error: "La membresía no existe." });
  if (code === "P0003")
    return res
      .status(409)
      .json({
        error:
          "Hay una provisión incompleta para este intento. Reintenta después de resolver la limpieza de la cuenta.",
      });
  if (code === "23505")
    return res
      .status(409)
      .json({ error: "Esta cuenta ya pertenece al centro." });
  if (code === "23514")
    return res
      .status(409)
      .json({ error: "El centro debe conservar un administrador activo." });
  if (code === "22023")
    return res
      .status(400)
      .json({ error: message || "Datos de equipo inválidos." });
  return res
    .status(400)
    .json({ error: "No se pudo completar la operación de equipo." });
}
async function recordCleanup(
  res: Response,
  centerId: string,
  email: string,
  userId: string,
  requestId: string,
) {
  return transaction(res, async (client) => {
    const found = await client.query(
      "select state from public.team_provisioning_requests where request_id=$1",
      [requestId],
    );
    if (found.rowCount) return found.rows[0].state as string;
    await client.query(
      "insert into public.team_provisioning_requests(request_id,center_id,email,user_id,state) values($1,$2,$3,$4,$5)",
      [requestId, centerId, email, userId, "cleanup_pending"],
    );
    return "cleanup_pending";
  });
}
async function markCleaned(res: Response, requestId: string) {
  await transaction(res, (client) =>
    client
      .query(
        "update public.team_provisioning_requests set state='cleaned',user_id=null where request_id=$1 and state='cleanup_pending'",
        [requestId],
      )
      .then(() => undefined),
  );
}
async function compensateAuth(
  res: Response,
  admin: SupabaseClient,
  centerId: string,
  email: string,
  userId: string,
  requestId: string,
  uncertain: boolean,
) {
  const state = await recordCleanup(res, centerId, email, userId, requestId);
  if (state === "committed" || uncertain) return false;
  try {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) return false;
    await markCleaned(res, requestId);
    return true;
  } catch {
    return false;
  }
}

export function teamRoutes(
  url: string,
  secret: string | undefined,
  _webOrigin: string,
  injectedAdmin?: SupabaseClient,
) {
  const admin =
    injectedAdmin ??
    (secret
      ? createClient(url, secret, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null);
  const router = Router();
  router.use(
    "/centers/:centerId/team",
    requireCenterAccess,
    (_req, res, next) => {
      if (
        !["administrator", "platform_administrator"].includes(res.locals.role)
      ) {
        res
          .status(403)
          .json({ error: "Se requiere ser administrador del centro." });
        return;
      }
      next();
    },
  );
  router.get("/centers/:centerId/team", async (req, res) => {
    try {
      res.json({
        members: await transaction(res, (client) =>
          members(client, req.params.centerId),
        ),
      });
    } catch (error) {
      failure(res, error);
    }
  });
  router.post("/centers/:centerId/team/members", async (req, res) => {
    const {
      email,
      password,
      display_name,
      role = "member",
      service_ids = [],
    } = req.body ?? {};
    const requestId = req.get("idempotency-key");
    if (
      !uuid(requestId) ||
      typeof email !== "string" ||
      email.length > 254 ||
      !emailPattern.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128 ||
      typeof display_name !== "string" ||
      display_name.trim().length < 2 ||
      display_name.trim().length > 120 ||
      !assignableRoles.includes(role) ||
      !Array.isArray(service_ids) ||
      service_ids.length > 100 ||
      !service_ids.every(uuid)
    ) {
      res
        .status(400)
        .json({ error: "Revisa nombre, correo, contraseña, rol y servicios." });
      return;
    }
    if (!admin) {
      res
        .status(503)
        .json({ error: "La administración de cuentas no está configurada." });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const existing = await transaction(res, async (client) => {
        const result = await client.query(
          "select center_id,email,user_id,state from public.team_provisioning_requests where request_id=$1",
          [requestId],
        );
        if (!result.rowCount) return null;
        const row = result.rows[0];
        if (
          row.center_id !== req.params.centerId ||
          row.email !== normalizedEmail
        ) {
          const error = new Error("Idempotency key already used") as Error & {
            code: string;
          };
          error.code = "22023";
          throw error;
        }
        if (row.state === "cleanup_pending") {
          const error = new Error(
            "Provisioning cleanup is pending",
          ) as Error & { code: string };
          error.code = "P0003";
          throw error;
        }
        if (row.state === "cleaned") return null;
        return (
          (await members(client, req.params.centerId)).find(
            (member) => member.user_id === row.user_id,
          ) ?? null
        );
      });
      if (existing) {
        res.status(200).json(existing);
        return;
      }
      const created = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        if (
          ["email_exists", "user_already_exists"].includes(
            created.error?.code ?? "",
          )
        ) {
          res
            .status(409)
            .json({
              error:
                "Este correo ya está registrado. No se vinculó ninguna cuenta existente.",
            });
          return;
        }
        res
          .status(400)
          .json({ error: "No se pudo crear la cuenta de acceso." });
        return;
      }
      const authUserId = created.data.user.id;
      try {
        const result = await transaction(res, async (client) => {
          await client.query(
            "select id from public.centers where id=$1 for update",
            [req.params.centerId],
          );
          const membership = await client.query(
            "select 1 from public.center_memberships where center_id=$1 and user_id=$2",
            [req.params.centerId, authUserId],
          );
          if (membership.rowCount) {
            const error = new Error("Membership already exists") as Error & {
              code: string;
            };
            error.code = "23505";
            throw error;
          }
          const services = await client.query(
            "select id,price_clp,duration_minutes from public.services where center_id=$1 and id=any($2::uuid[]) and active",
            [req.params.centerId, service_ids],
          );
          const uniqueIds = new Set(service_ids);
          if (services.rowCount !== uniqueIds.size) {
            const error = new Error(
              "Selecciona servicios activos del centro.",
            ) as Error & { code: string };
            error.code = "22023";
            throw error;
          }
          await client.query("savepoint staff_profile_insert");
          try {
            await client.query(
              "insert into public.staff_profiles(user_id,display_name) values($1,$2)",
              [authUserId, display_name.trim()],
            );
          } catch (error) {
            if ((error as QueryError).code !== "23505") throw error;
            await client.query("rollback to savepoint staff_profile_insert");
          }
          await client.query("release savepoint staff_profile_insert");
          await client.query(
            "insert into public.center_memberships(center_id,user_id,role) values($1,$2,$3)",
            [req.params.centerId, authUserId, role],
          );
          for (const service of services.rows)
            await client.query(
              "insert into public.professional_services(center_id,professional_user_id,service_id,price_clp,duration_minutes) values($1,$2,$3,$4,$5)",
              [
                req.params.centerId,
                authUserId,
                service.id,
                service.price_clp,
                service.duration_minutes,
              ],
            );
          await client.query(
            "insert into public.team_provisioning_requests(request_id,center_id,email,user_id) values($1,$2,$3,$4)",
            [requestId, req.params.centerId, normalizedEmail, authUserId],
          );
          return (await members(client, req.params.centerId)).find(
            (member) => member.user_id === authUserId,
          );
        });
        res.status(201).json(result);
      } catch (error) {
        const recovered = await compensateAuth(
          res,
          admin,
          req.params.centerId,
          normalizedEmail,
          authUserId,
          requestId,
          Boolean(
            (error as { transactionOutcomeUnknown?: boolean })
              .transactionOutcomeUnknown,
          ),
        );
        if (!recovered) {
          res
            .status(500)
            .json({
              error:
                "La provisión quedó pendiente de limpieza; conserva el identificador de intento para recuperación.",
            });
          return;
        }
        throw error;
      }
    } catch (error) {
      failure(res, error);
    }
  });
  router.patch("/centers/:centerId/team/members/:id", async (req, res) => {
    if (
      !uuid(req.params.id) ||
      !membershipRoles.includes(req.body?.role) ||
      typeof req.body?.active !== "boolean" ||
      Object.keys(req.body).some((key) => !["role", "active"].includes(key))
    ) {
      res.status(400).json({ error: "Rol o estado inválido." });
      return;
    }
    try {
      res.json(
        await updateMember(
          res,
          req.params.centerId,
          req.params.id,
          req.body.role,
          req.body.active,
        ),
      );
    } catch (error) {
      failure(res, error);
    }
  });
  return router;
}
