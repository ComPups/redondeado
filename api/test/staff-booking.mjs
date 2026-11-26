import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: key,
  TEST_API_URL: api,
  TEST_ADMIN_DATABASE_URL: adminUrl,
} = process.env;
if (!url || !key || !api || !adminUrl)
  throw Error(
    "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_API_URL and TEST_ADMIN_DATABASE_URL for an isolated seeded stack",
  );
const center = "10000000-0000-4000-8000-000000000001";
const otherProfessional = "50000000-0000-4000-8000-000000000001";
const memberProfessional = "50000000-0000-4000-8000-000000000002";
const service = "70000000-0000-4000-8000-000000000002";
const emails = [
  `staff-booking-${randomUUID()}@example.com`,
  `staff-booking-admin-${randomUUID()}@example.com`,
];

async function login(email) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "Demo-Arrayan-2026!",
  });
  assert.ifError(error);
  return { client, token: data.session.access_token };
}
async function request(path, token, body) {
  return fetch(`${api}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const member = await login("matias.soto@example.com");
const admin = await login("camila.rojas@example.com");
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();
try {
  const memberOptions = await (
    await fetch(
      `${api}/staff/centers/${center}/availability?service_id=${service}&professional_id=${memberProfessional}`,
      { headers: { Authorization: `Bearer ${member.token}` } },
    )
  ).json();
  assert.ok(memberOptions.length);
  const memberBooking = await request(
    `/staff/centers/${center}/appointments`,
    member.token,
    {
      scope: "personal",
      service_id: service,
      starts_at: memberOptions[0].starts_at,
      patient_name: "Paciente Staff",
      patient_email: emails[0],
      patient_phone: "+56912345678",
    },
  );
  assert.equal(memberBooking.status, 201, await memberBooking.text());

  const forbidden = await request(
    `/staff/centers/${center}/appointments`,
    member.token,
    {
      professional_id: otherProfessional,
      service_id: service,
      starts_at: memberOptions[1]?.starts_at ?? memberOptions[0].starts_at,
      patient_name: "Paciente Staff",
      patient_email: `${randomUUID()}@example.com`,
      patient_phone: "+56912345678",
    },
  );
  assert.equal(forbidden.status, 403);

  const adminOptions = await (
    await fetch(
      `${api}/staff/centers/${center}/availability?service_id=${service}&professional_id=${otherProfessional}`,
      { headers: { Authorization: `Bearer ${admin.token}` } },
    )
  ).json();
  assert.ok(adminOptions.length);
  const adminBooking = await request(
    `/staff/centers/${center}/appointments`,
    admin.token,
    {
      professional_id: otherProfessional,
      service_id: service,
      starts_at: adminOptions[0].starts_at,
      patient_name: "Paciente Admin",
      patient_email: emails[1],
      patient_phone: "+56912345678",
    },
  );
  assert.equal(adminBooking.status, 201, await adminBooking.text());
  console.log("Staff booking authorization and workflow integration passed");
} finally {
  await db.query(
    "delete from public.appointments where patient_email = any($1::text[])",
    [emails],
  );
  await db.end();
  await member.client.auth.signOut();
  await admin.client.auth.signOut();
}
