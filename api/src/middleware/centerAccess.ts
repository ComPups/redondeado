import type { RequestHandler } from "express";
import type { PoolClient } from "pg";

export const requireCenterAccess: RequestHandler<{ centerId: string }> = async (
  req,
  res,
  next,
) => {
  const { sql, userId, platformAdmin } = res.locals.staff;
  try {
    const role = await sql.transaction(
      { kind: "staff", userId },
      async (client: PoolClient) => {
        if (platformAdmin) {
          const result = await client.query(
            "select id from public.centers where id = $1",
            [req.params.centerId],
          );
          return result.rowCount ? "platform_administrator" : null;
        }
        const result = await client.query(
          "select role from public.center_memberships where center_id = $1 and user_id = $2",
          [req.params.centerId, userId],
        );
        return result.rows[0]?.role ?? null;
      },
    );
    if (!role) {
      res.status(403).json({ error: "Center access denied" });
      return;
    }
    res.locals.role = role;
    next();
  } catch {
    res
      .status(500)
      .json({
        error: platformAdmin
          ? "Could not check center"
          : "Could not check membership",
      });
  }
};
