import type { PoolClient } from 'pg';
import { WorkflowError } from './workflowErrors.js';

export async function publicBookingTerms(client: PoolClient, slug: string, serviceId: string, professionalId: string) {
  return (await client.query<{ id: string; kind: string; body: string }>(`select v.id, case when t.professional_user_id is null then 'center' else 'professional' end as kind, v.body
    from public.centers c join public.services s on s.center_id=c.id and s.id=$2 and s.active
    join public.center_memberships m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=$3
    join public.booking_terms_current t on t.center_id=c.id and (t.professional_user_id is null or (t.professional_user_id=m.user_id and t.service_id=s.id))
    join public.booking_terms_versions v on v.id=t.version_id where c.slug=$1 order by t.professional_user_id nulls first`, [slug, serviceId, professionalId])).rows;
}
export async function staffBookingTerms(client: PoolClient, centerId: string, userId: string) {
  return (await client.query<{ service_id: string | null; body: string }>(`select t.service_id, v.body from public.booking_terms_current t join public.booking_terms_versions v on v.id=t.version_id
    join public.center_memberships m on m.center_id=t.center_id and m.user_id=$2
    where t.center_id=$1 and (t.professional_user_id=m.user_id or (t.professional_user_id is null and m.role='administrator'))`, [centerId, userId])).rows;
}

export async function changeBookingTerms(client: PoolClient, centerId: string, userId: string, serviceId: string | null, body: string | null) {
  const membership = (await client.query<{ role: string }>('select role from public.center_memberships where center_id=$1 and user_id=$2', [centerId, userId])).rows[0];
  if (!membership || (serviceId === null ? membership.role !== 'administrator' : !['administrator', 'member'].includes(membership.role))) throw new WorkflowError('42501', 'Forbidden');
  if (serviceId !== null) {
    const service = (await client.query('select 1 from public.services where center_id=$1 and id=$2 and active', [centerId, serviceId])).rowCount;
    if (!service) throw new WorkflowError('22023', 'Invalid service');
  }
  if (body !== null && (body.trim().length < 1 || body.length > 30000)) throw new WorkflowError('22023', 'Invalid terms');
  await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [centerId]);
  const professionalUserId = serviceId === null ? null : userId;
  await client.query(`delete from public.booking_terms_current where center_id=$1 and professional_user_id is not distinct from $2 and service_id is not distinct from $3`, [centerId, professionalUserId, serviceId]);
  if (body === null) return null;
  const version = (await client.query<{ id: string }>('insert into public.booking_terms_versions(center_id, professional_user_id, service_id, body) values($1,$2,$3,$4) returning id', [centerId, professionalUserId, serviceId, body])).rows[0];
  await client.query('insert into public.booking_terms_current(center_id, professional_user_id, service_id, version_id) values($1,$2,$3,$4)', [centerId, professionalUserId, serviceId, version.id]);
  return version.id;
}
