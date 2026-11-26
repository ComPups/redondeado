import type { PoolClient } from "pg";

export async function publicCenterProfile(client: PoolClient, slug: string) {
  const center = (
    await client.query<{
      id: string;
      name: string;
      description: string;
      image_url: string | null;
      opens_at: string;
      closes_at: string;
    }>(
      "select id, name, description, image_url, opens_at, closes_at from public.centers where slug = $1",
      [slug],
    )
  ).rows[0];
  if (!center) return null;
  const services = (
    await client.query<{
      id: string;
      name: string;
      description: string;
      duration_minutes: number;
      price_clp: number;
      professional_id: string;
      display_name: string;
    }>(
      `select s.id, s.name, s.description, ps.duration_minutes, ps.price_clp, p.professional_id, p.display_name
    from public.services s join public.professional_services ps on ps.center_id=s.center_id and ps.service_id=s.id and ps.active
    join public.staff_profiles p on p.user_id=ps.professional_user_id
    where s.center_id=$1 and s.active order by s.name, p.display_name`,
      [center.id],
    )
  ).rows;
  const professionals = (
    await client.query<{
      user_id: string;
      professional_id: string;
      display_name: string;
      description: string;
    }>(
      `select p.user_id, p.professional_id, p.display_name, p.description
    from public.center_memberships m join public.staff_profiles p on p.user_id=m.user_id
    where m.center_id=$1 order by p.display_name, p.professional_id`,
      [center.id],
    )
  ).rows;
  const offerings = (
    await client.query<{ professional_user_id: string; service_id: string }>(
      `select ps.professional_user_id, ps.service_id
    from public.professional_services ps join public.services s on s.center_id=ps.center_id and s.id=ps.service_id and s.active
    where ps.center_id=$1 and ps.active order by ps.professional_user_id, ps.service_id`,
      [center.id],
    )
  ).rows;
  const serviceIdsByUser = new Map<string, string[]>();
  for (const offering of offerings)
    serviceIdsByUser.set(offering.professional_user_id, [
      ...(serviceIdsByUser.get(offering.professional_user_id) ?? []),
      offering.service_id,
    ]);
  return {
    name: center.name,
    description: center.description,
    image_url: center.image_url,
    opens_at: center.opens_at,
    closes_at: center.closes_at,
    services: services.map(
      ({ display_name: _displayName, ...service }) => service,
    ),
    professionals: professionals.map(
      ({ user_id, professional_id, display_name, description }) => ({
        id: professional_id,
        name: display_name,
        description,
        service_ids: serviceIdsByUser.get(user_id) ?? [],
      }),
    ),
  };
}
