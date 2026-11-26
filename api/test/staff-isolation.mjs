// Creates and removes fictional fixtures. Run only against an isolated stack.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const {
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: key,
  TEST_API_URL: api,
  TEST_ADMIN_DATABASE_URL: adminUrl,
} = process.env;
if (!url || !key || !api || !adminUrl)
  throw new Error(
    "Configure the isolated test stack and TEST_ADMIN_DATABASE_URL",
  );
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const center = "10000000-0000-4000-8000-000000000001";
const own = "20000000-0000-4000-8000-000000000002";
const other = randomUUID(),
  outside = randomUUID(),
  outsideCenter = randomUUID();
const otherProfessional = randomUUID(),
  outsideProfessional = randomUUID(),
  outsideService = randomUUID();
const otherAppointment = randomUUID(),
  outsideAppointment = randomUUID();
const emails = [`${other}@example.com`, `${outside}@example.com`];
const password = `Test-${randomUUID()}!`;
const clients = [];
async function login(email, pass = "Demo-Arrayan-2026!") {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pass,
  });
  assert.ifError(error);
  clients.push(client);
  return data.session.access_token;
}
const request = (path, token, method = "GET", body) =>
  fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
try {
  await admin.query(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
    select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email, extensions.crypt($3, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '' from (values ($1::uuid,$4::text),($2::uuid,$5::text)) x(id,email)`,
    [other, outside, password, ...emails],
  );
  await admin.query(
    `insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at) select gen_random_uuid(),id,jsonb_build_object('sub',id::text,'email',email),'email',id::text,now(),now(),now() from auth.users where id=any($1::uuid[])`,
    [[other, outside]],
  );
  await admin.query(
    "insert into public.centers(id,name,slug) values($1,$2,$3)",
    [outsideCenter, "Isolation test", `isolation-${outside}`],
  );
  await admin.query(
    "insert into public.staff_profiles(user_id,professional_id,display_name) values ($1,$2,$3),($4,$5,$6)",
    [
      other,
      otherProfessional,
      "Member Two",
      outside,
      outsideProfessional,
      "Outside Member",
    ],
  );
  await admin.query(
    "insert into public.center_memberships(center_id,user_id,role) values ($1,$2,'member'),($3,$4,'member')",
    [center, other, outsideCenter, outside],
  );
  await admin.query(
    "insert into public.services(id,center_id,name,price_clp,duration_minutes) values ($1,$2,'Test service',100,30)",
    [outsideService, outsideCenter],
  );
  await admin.query(
    `insert into public.appointments(id,center_id,professional_user_id,service_id,service_name,patient_name,patient_email,patient_phone,starts_at,ends_at) values
    ($1,$2,$3,'70000000-0000-4000-8000-000000000001','Service','Same Center','same@example.com','+56912345678','2099-01-01 12:00+00','2099-01-01 13:00+00'),
    ($4,$5,$6,$7,'Service','Other Center','outside@example.com','+56912345678','2099-01-01 12:00+00','2099-01-01 12:30+00')`,
    [
      otherAppointment,
      center,
      other,
      outsideAppointment,
      outsideCenter,
      outside,
      outsideService,
    ],
  );
  const member = await login("matias.soto@example.com");
  const memberTwo = await login(emails[0], password);
  const outsideToken = await login(emails[1], password);
  const administrator = await login("camila.rojas@example.com");
  const limited = await login("valentina.munoz@example.com");
  const base = `/staff/centers/${center}/appointments`;
  const rows = async (token) => {
    const response = await request(
      `${base}?scope=center&period=upcoming`,
      token,
    );
    assert.equal(response.status, 200);
    return (await response.json()).appointments;
  };
  assert.ok(!(await rows(member)).some((row) => row.id === otherAppointment));
  assert.ok((await rows(memberTwo)).some((row) => row.id === otherAppointment));
  assert.ok(
    (await rows(administrator)).some((row) => row.id === otherAppointment),
  );
  assert.equal((await request(base, outsideToken)).status, 403);
  const update = {
    patient_name: "Tampered",
    patient_email: "valid@example.com",
    patient_phone: "+56912345678",
    starts_at: "2099-01-01T12:00:00Z",
    ends_at: "2099-01-01T13:00:00Z",
  };
  assert.equal(
    (await request(`${base}/${otherAppointment}`, member, "PATCH", update))
      .status,
    404,
  );
  assert.equal(
    (await request(`${base}/${otherAppointment}`, member, "DELETE")).status,
    404,
  );
  assert.equal(
    (await request(`${base}/${otherAppointment}`, limited, "PATCH", update))
      .status,
    403,
  );
  const booking = {
    service_id: "70000000-0000-4000-8000-000000000001",
    professional_id: otherProfessional,
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    patient_name: "Test Patient",
    patient_email: "valid@example.com",
    patient_phone: "+56912345678",
  };
  assert.equal((await request(base, member, "POST", booking)).status, 403);
  assert.equal(
    (await request(base, outsideToken, "POST", booking)).status,
    403,
  );
  assert.equal((await request(base, limited, "POST", booking)).status, 403);
  const params = new URLSearchParams({
    service_id: booking.service_id,
    professional_id: otherProfessional,
  });
  const available = await request(
    `/staff/centers/${center}/availability?${params}`,
    memberTwo,
  );
  assert.equal(available.status, 200);
  const slot = (await available.json())[0];
  assert.ok(slot);
  const created = await request(base, memberTwo, "POST", {
    ...booking,
    starts_at: slot.starts_at,
  });
  assert.equal(created.status, 201);
  const createdId = (await created.json()).id;
  const createdRow = (
    await admin.query(
      "select starts_at, ends_at from public.appointments where id=$1",
      [createdId],
    )
  ).rows[0];
  assert.ok(createdRow);
  const ownUpdate = {
    patient_name: "Updated Patient",
    patient_email: "valid@example.com",
    patient_phone: "+56912345678",
    starts_at: createdRow.starts_at.toISOString(),
    ends_at: createdRow.ends_at.toISOString(),
  };
  assert.equal(
    (await request(`${base}/${createdId}`, memberTwo, "PATCH", ownUpdate))
      .status,
    200,
  );
  assert.equal(
    (await request(`${base}/${createdId}`, administrator, "DELETE")).status,
    200,
  );
  const unchanged = await admin.query(
    "select patient_name, professional_user_id from public.appointments where id=$1",
    [otherAppointment],
  );
  assert.equal(unchanged.rows.length, 1);
  assert.deepEqual(unchanged.rows[0], {
    patient_name: "Same Center",
    professional_user_id: other,
  });
  assert.equal(
    (
      await admin.query(
        "select count(*)::int as count from public.appointments where patient_email=$1",
        ["valid@example.com"],
      )
    ).rows[0].count,
    0,
  );
  console.log(
    "HTTP cross-user isolation, booking, update and administrator deletion passed",
  );
} finally {
  for (const client of clients) await client.auth.signOut();
  await admin.query(
    "delete from public.appointments where professional_user_id=any($1::uuid[])",
    [[other, outside]],
  );
  await admin.query(
    "delete from public.center_memberships where user_id=any($1::uuid[])",
    [[other, outside]],
  );
  await admin.query(
    "delete from public.staff_profiles where user_id=any($1::uuid[])",
    [[other, outside]],
  );
  await admin.query("delete from public.services where id=$1", [
    outsideService,
  ]);
  await admin.query("delete from public.centers where id=$1", [outsideCenter]);
  await admin.query("delete from auth.users where id=any($1::uuid[])", [
    [other, outside],
  ]);
  await admin.end();
}
