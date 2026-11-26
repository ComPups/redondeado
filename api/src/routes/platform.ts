import { Router, type Response } from "express";
import type { PoolClient } from "pg";

async function query(res: Response, text: string, values: unknown[] = []) {
  const { sql, userId } = res.locals.staff;
  try {
    const result = await sql.transaction(
      { kind: "staff", userId },
      (client: PoolClient) => client.query(text, values),
    );
    return { data: result.rows, error: null };
  } catch (error) {
    return { data: [], error: error as { code?: string } };
  }
}
import { requirePlatformAdmin } from "../middleware/platformAccess.js";

export const platformRoutes = Router();
const router = platformRoutes;
router.use(["/platform", "/platform-memberships"], requirePlatformAdmin);

router.post("/platform/centers", async (req, res) => {
  const {
    name,
    description = "",
    opens_at = "09:00",
    closes_at = "18:00",
  } = req.body ?? {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    typeof description !== "string" ||
    description.length > 400 ||
    typeof opens_at !== "string" ||
    typeof closes_at !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(opens_at) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(closes_at) ||
    opens_at >= closes_at
  ) {
    res
      .status(400)
      .json({
        error: "Revisa el nombre, la descripción y los horarios del centro.",
      });
    return;
  }
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug || slug === "staff") {
    res
      .status(400)
      .json({ error: "Elige un nombre que genere una dirección válida." });
    return;
  }
  const { data: rows, error } = await query(
    res,
    "insert into public.centers (name, slug, description, opens_at, closes_at) values ($1, $2, $3, $4, $5) returning id, name, slug, description, opens_at, closes_at",
    [name.trim(), slug, description.trim(), opens_at, closes_at],
  );
  const data = rows[0];
  if (error) {
    res
      .status(error.code === "23505" ? 409 : 400)
      .json({
        error:
          error.code === "23505"
            ? "Ya existe un centro con esa dirección."
            : "No se pudo crear el centro.",
      });
    return;
  }
  res.status(201).json(data);
});

type EditableEntity = {
  key: string;
  columns: string[];
  readOnlyColumns?: string[];
};
const editable = new Map<string, EditableEntity>([
  [
    "centers",
    {
      key: "id",
      columns: [
        "name",
        "slug",
        "description",
        "image_url",
        "opens_at",
        "closes_at",
      ],
    },
  ],
  [
    "services",
    {
      key: "id",
      readOnlyColumns: ["center_id"],
      columns: [
        "name",
        "description",
        "price_clp",
        "duration_minutes",
        "active",
      ],
    },
  ],
  [
    "appointments",
    {
      key: "id",
      readOnlyColumns: ["center_id"],
      columns: [
        "professional_user_id",
        "service_id",
        "service_name",
        "patient_name",
        "patient_email",
        "patient_phone",
        "starts_at",
        "ends_at",
      ],
    },
  ],
  [
    "staff_profiles",
    { key: "professional_id", columns: ["display_name", "description"] },
  ],
]);

function selectFields({ key, columns, readOnlyColumns = [] }: EditableEntity) {
  return [key, ...readOnlyColumns, ...columns].join(", ");
}

router.get("/platform/editable-fields", (_req, res) => {
  const fields = Object.fromEntries(
    Array.from(editable, ([entity, config]) => [entity, config.columns]),
  );
  res.json({ ...fields, memberships: ["role"] });
});

router.get("/platform/:entity", async (req, res) => {
  const config = editable.get(req.params.entity);
  if (!config) {
    res.status(404).json({ error: "Unknown entity" });
    return;
  }
  const { data, error } = await query(
    res,
    `select ${selectFields(config)} from public.${req.params.entity} limit 1000`,
  );
  if (error) {
    res.status(500).json({ error: "Could not load records" });
    return;
  }
  res.json(data);
});
router.patch("/platform/:entity/:id", async (req, res) => {
  const config = editable.get(req.params.entity);
  if (!config) {
    res.status(404).json({ error: "Unknown entity" });
    return;
  }
  const changes = req.body;
  if (
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).some((k) => !config.columns.includes(k))
  ) {
    res.status(400).json({ error: "Invalid fields" });
    return;
  }
  const keys = Object.keys(changes);
  const assignments = keys
    .map((key, index) => `${key} = $${index + 1}`)
    .join(", ");
  const { data: rows, error } = await query(
    res,
    `update public.${req.params.entity} set ${assignments} where ${config.key} = $${keys.length + 1} returning ${selectFields(config)}`,
    [...keys.map((key) => changes[key]), req.params.id],
  );
  const data = rows[0];
  if (error) {
    res.status(400).json({ error: "Could not update record" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.json(data);
});

router.get("/platform-memberships", async (_req, res) => {
  const { data, error } = await query(
    res,
    "select center_id, user_id, role from public.center_memberships limit 1000",
  );
  if (error) {
    res.status(500).json({ error: "Could not load memberships" });
    return;
  }
  res.json(data);
});
router.patch("/platform-memberships/:centerId/:userId", async (req, res) => {
  if (!["administrator", "member", "limited"].includes(req.body?.role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const { data: rows, error } = await query(
    res,
    "update public.center_memberships set role = $1 where center_id = $2 and user_id = $3 returning center_id, user_id, role",
    [req.body.role, req.params.centerId, req.params.userId],
  );
  const data = rows[0];
  if (error) {
    res.status(400).json({ error: "Could not update membership" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }
  res.json(data);
});
