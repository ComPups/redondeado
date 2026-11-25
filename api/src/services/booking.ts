import type { PoolClient } from 'pg';
import { availability, isValidSlot, offeringForBooking } from './availability.js';
import { publicBookingTerms } from './bookingTerms.js';
import { WorkflowError } from './workflowErrors.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const phonePattern = /^\+56[0-9]{8,18}$/;

function validatePatient(name: string, email: string, phone: string) {
  if (name.trim().length < 2 || name.trim().length > 120 || email.length > 254 || !emailPattern.test(email) || !phonePattern.test(phone)) {
    throw new WorkflowError('22023', 'Invalid patient details');
  }
}
function sameIds(expected: string[], actual: string[]) {
  return expected.length === actual.length && expected.every(id => actual.includes(id));
}

async function lockPublicBookingContext(client: PoolClient, slug: string, serviceId: string, professionalId: string) {
  const context = (await client.query<{ center_id: string; professional_user_id: string }>(`select c.id as center_id, m.user_id as professional_user_id
    from public.centers c join public.services s on s.center_id=c.id and s.id=$2 and s.active
    join public.center_memberships m on m.center_id=c.id join public.staff_profiles p on p.user_id=m.user_id and p.professional_id=$3
    where c.slug=$1`, [slug, serviceId, professionalId])).rows[0];
  if (!context) throw new WorkflowError('P0001', 'Slot unavailable');
  await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [context.center_id]);
  return context;
}

async function insertBooking(client: PoolClient, context: { center_id: string; professional_user_id: string }, serviceId: string, start: string, name: string, email: string, phone: string, terms: string[] | null) {
  const resolved = (await client.query<{ service_name: string; price_clp: number; duration_minutes: number }>(`select s.name as service_name, ps.price_clp, ps.duration_minutes
    from public.professional_services ps join public.services s on s.center_id=ps.center_id and s.id=ps.service_id and s.active
    where ps.center_id=$1 and ps.service_id=$2 and ps.professional_user_id=$3 and ps.active`, [context.center_id, serviceId, context.professional_user_id])).rows[0];
  if (!resolved) throw new WorkflowError('P0001', 'Slot unavailable');
  const id = (await client.query<{ id: string }>(`insert into public.appointments(center_id, professional_user_id, service_id, service_name, patient_name, patient_email, patient_phone, starts_at, ends_at, price_clp)
    values($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$8::timestamptz + ($9 * interval '1 minute'),$10) returning id`, [context.center_id, context.professional_user_id, serviceId, resolved.service_name, name.trim(), email.trim(), phone.trim(), start, resolved.duration_minutes, resolved.price_clp])).rows[0].id;
  if (terms) for (const versionId of terms) await client.query('insert into public.appointment_terms_acceptances(appointment_id, version_id) values($1,$2)', [id, versionId]);
  return id;
}

export async function bookPublicAppointment(client: PoolClient, input: { slug: string; serviceId: string; professionalId: string; start: string; name: string; email: string; phone: string; expectedPrice: number; terms: string[] }) {
  validatePatient(input.name, input.email, input.phone);
  if (!Number.isSafeInteger(input.expectedPrice) || input.expectedPrice < 0) throw new WorkflowError('22023', 'Invalid price');
  const context = await lockPublicBookingContext(client, input.slug, input.serviceId, input.professionalId);
  const resolved = await offeringForBooking(client, context.center_id, input.serviceId, input.professionalId);
  if (!resolved) throw new WorkflowError('P0001', 'Slot unavailable');
  if (resolved.price_clp !== input.expectedPrice) throw new WorkflowError('P0002', 'Price changed');
  const currentTerms = await publicBookingTerms(client, input.slug, input.serviceId, input.professionalId);
  if (!sameIds(input.terms, currentTerms.map(term => term.id))) throw new WorkflowError('PT409', 'Terms changed or not accepted');
  if (!isValidSlot(await availability(client, input.slug, input.serviceId, input.professionalId), input.start)) throw new WorkflowError('P0001', 'Slot unavailable');
  return insertBooking(client, context, input.serviceId, input.start, input.name, input.email, input.phone, currentTerms.map(term => term.id));
}

export async function bookStaffAppointment(client: PoolClient, input: { centerId: string; serviceId: string; professionalId: string; staffUserId: string; start: string; name: string; email: string; phone: string }) {
  validatePatient(input.name, input.email, input.phone);
  const access = (await client.query<{ user_id: string; role: string }>(`select target.user_id, target.role from public.center_memberships target join public.staff_profiles p on p.user_id=target.user_id and p.professional_id=$3
    where target.center_id=$1 and ($2 = target.user_id or exists(select 1 from public.center_memberships actor where actor.center_id=$1 and actor.user_id=$2 and actor.role='administrator') or exists(select 1 from public.platform_administrators a where a.user_id=$2))`, [input.centerId, input.staffUserId, input.professionalId])).rows[0];
  if (!access) throw new WorkflowError('42501', 'Access denied');
  const center = (await client.query<{ slug: string }>('select slug from public.centers where id=$1', [input.centerId])).rows[0];
  if (!center) throw new WorkflowError('P0001', 'Slot unavailable');
  await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [input.centerId]);
  if (!await offeringForBooking(client, input.centerId, input.serviceId, input.professionalId)) throw new WorkflowError('P0001', 'Slot unavailable');
  if (!isValidSlot(await availability(client, center.slug, input.serviceId, input.professionalId), input.start)) throw new WorkflowError('P0001', 'Slot unavailable');
  return insertBooking(client, { center_id: input.centerId, professional_user_id: access.user_id }, input.serviceId, input.start, input.name, input.email, input.phone, null);
}
