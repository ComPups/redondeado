import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const api = process.env.TEST_API_URL || "http://localhost:3000";
if (!url || !key)
  throw new Error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY");
const center = "10000000-0000-4000-8000-000000000001";
const serviceIds = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
  "70000000-0000-4000-8000-000000000003",
];
const base = `/staff/centers/${center}/terms`;
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
async function request(path, token, method = "GET", body) {
  return fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const member = await login("matias.soto@example.com");
const other = await login("valentina.munoz@example.com");
let created = false;
let path;
try {
  assert.equal((await request(base)).status, 401);
  assert.equal(
    (
      await request(
        "/staff/centers/00000000-0000-4000-8000-000000000099/terms",
        member.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/center`, member.token, "POST", {
        body: "No autorizado",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/${serviceIds[0]}`, other.token, "POST", {
        body: "No autorizado",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`${base}/invalid`, member.token, "POST", { body: "Texto" }))
      .status,
    400,
  );
  const initialResponse = await request(base, member.token);
  assert.equal(
    initialResponse.status,
    200,
    "terms endpoint must load; check that the database migrations are applied",
  );
  const before = await initialResponse.json();
  const service = serviceIds.find(
    (id) => !before.some((term) => term.service_id === id),
  );
  if (!service)
    throw new Error(
      "No unused demo service is available for an isolated terms API test",
    );
  path = `${base}/${service}`;
  assert.equal(
    (await request(path, member.token, "POST", { body: " " })).status,
    400,
  );
  const published = await request(path, member.token, "POST", {
    body: "Términos de prueba de API",
  });
  assert.equal(published.status, 201);
  created = true;
  const first = await published.json();
  assert.ok(first.id);
  const query = new URLSearchParams({
    service,
    professional: "50000000-0000-4000-8000-000000000002",
  });
  const publicPath = `/public/centers/centro-bienestar-arrayan`;
  const publicTermsResponse = await request(`${publicPath}/terms?${query}`);
  assert.equal(publicTermsResponse.status, 200);
  const publicTerms = await publicTermsResponse.json();
  assert.ok(publicTerms.some((term) => term.id === first.id));
  const booking = {
    service,
    professional: "50000000-0000-4000-8000-000000000002",
    start: new Date(Date.now() + 86400000).toISOString(),
    name: "Paciente Demo",
    email: "p@example.com",
    phone: "+56912345678",
    expected_price_clp: 35000,
  };
  const missing = await request(`${publicPath}/bookings`, undefined, "POST", {
    ...booking,
    terms: [],
  });
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, "TERMS_CHANGED");
  assert.ok(
    (await (await request(base, member.token)).json()).some(
      (term) => term.service_id === service && term.body === first.body,
    ),
  );
  assert.ok(
    !(await (await request(base, other.token)).json()).some(
      (term) => term.body === first.body,
    ),
  );
  const update = await request(path, member.token, "PUT", {
    body: "Términos de prueba actualizados",
  });
  assert.equal(update.status, 200);
  const second = await update.json();
  assert.notEqual(first.id, second.id);
  const stale = await request(`${publicPath}/bookings`, undefined, "POST", {
    ...booking,
    terms: publicTerms.map((term) => term.id),
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "TERMS_CHANGED");
  assert.ok(
    (await (await request(base, member.token)).json()).some(
      (term) => term.service_id === service && term.body === second.body,
    ),
  );
  assert.equal((await request(path, member.token, "DELETE")).status, 204);
  created = false;
  assert.ok(
    !(await (await request(base, member.token)).json()).some(
      (term) => term.service_id === service,
    ),
  );
  console.log("Booking terms API CRUD and authorization passed");
} finally {
  if (created) await request(path, member.token, "DELETE");
  await member.client.auth.signOut();
  await other.client.auth.signOut();
}
