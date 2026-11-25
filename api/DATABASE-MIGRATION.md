# Database access migration

The existing public, staff and platform routes use parameterized Postgres through
`createDatabase().transaction`; Supabase Auth remains responsible for sign-in,
refresh, sign-out and server-side token verification. Service CRUD uses the transaction interface below. Hosted verification remains a deployment step.

Service CRUD must call `transaction` with the staff user ID obtained from
server-verified Auth, issue parameterized SQL through its callback client, and
rely on RLS and grants. Never take role or user ID from request data. Related
membership checks and writes should share a transaction. The client must not
escape the callback; do not use named prepared statements or session state.

## Configuration and deployment

The migration creates `redondeado_api` with LOGIN, NOINHERIT, no superuser or
BYPASSRLS privileges and no password. Provision its password separately using a
privileged migration/administration connection; store the runtime URL in the
deployment secret manager, not in source or logs. Rotate the password in the
secret manager and database together, roll API instances, and verify new
connections. Shared Supavisor can briefly cache old credentials; use bounded
retries and verify the new credential through a direct connection first.

For local development, use a local database URL such as the one in `.env.example`
after setting the runtime role's local-only password. Connect to local Postgres
as its administrator with `psql` and use the interactive `\password redondeado_api`
command; put the password only in the ignored API `.env`. Hosted direct URLs use the
custom role as username; shared-pooler URLs use `redondeado_api.<project-ref>`.
Copy the hostname and port from the project's Connect dialog; select a connection
mode appropriate for the deployment. Use separate privileged credentials for
migrations, never the runtime URL. The default TLS mode verifies the server
certificate and hostname with the Node trust store; set `DB_CA_CERT_PATH` to the
Supabase CA certificate when the certificate is not in the trust store.
`DB_SSL_MODE=disable` is for
local development only. TLS parameters in the URL are rejected to prevent them
overriding verification.

Set `DB_POOL_MAX`, `DB_ACQUIRE_TIMEOUT_MS`, and `DB_STATEMENT_TIMEOUT_MS` for
the deployment. Budget the maximum pool size times the maximum number of API
instances alongside migration, operational and other service connections, and
monitor queueing and connection limits. Transaction pooling is supported without
named prepared statements or session state. Graceful shutdown drains HTTP and
the pool; the platform's termination grace period must allow that drain.

Deployment order: apply compatible migrations and provision roles; configure and
rotate credentials; deploy the migrated API; verify REST and Auth; disable the
hosted Data API in project settings; repeat Auth, REST, table, RPC and GraphQL
denial checks. `supabase/config.toml` only disables local PostgREST. It does not
change the hosted project. The migration retains existing service-role grants
for rollback; re-enable the hosted Data API before rolling back to the old API,
which also requires its previous service-role secret. Do not disable the hosted
Data API until the deployed backend and its applicable endpoints pass verification.

## Security-definer audit

The fresh local database has 12 application SECURITY DEFINER functions, all
owned by `postgres`, with empty search paths and no EXECUTE grant to PUBLIC.
Their purposes and authorization are:

- `private.center_profile` returns the public catalog projection; only the
  public operation role and the legacy service role can execute it. Its invoker
  wrapper uses the same grants. Public availability and terms expose only
  booking projections, and `book_public_appointment` checks selection, slot,
  patient details and exact accepted terms before atomically writing the booking
  and acceptances. These public operations are granted to the public operation
  role and the legacy service role, not to `authenticated` or `anon`.
- `staff_display_name` and `staff_own_professional_id` return only the identity
  associated with `auth.uid()`. `appointment_professional_names`,
  `staff_booking_professionals` and `staff_booking_terms` check the caller's
  identity and applicable membership or platform-administrator status.
- `book_staff_appointment` delegates professional authorization to
  `staff_booking_professionals` before validating and writing. `manage_booking_terms`
  checks membership and scope before changing version pointers. Both are granted
  to `authenticated`, plus the legacy service role for compatibility.
- `private.validate_staff_appointment_update` is a trigger, not callable by
  application roles. It prevents staff reassignment and constrains schedule
  changes; the trigger retains its existing trusted-operation behavior.

The runtime login has no table ownership, superuser or BYPASSRLS capability; it
cannot assume `service_role`. The public operation role has no application table
privileges. Automated checks assert these properties and function grant/search
path constraints. Security Advisor reported no issues on the local stack. Re-run
this audit if later migrations, including service CRUD, add privileged functions.

## Verification evidence

A fresh isolated stack was started with this branch's migrations and `[api]
enabled = false`; no shared development database was reset. CLI version 3.3.0
ran `supabase test db` (120 assertions across 10 files) and
`supabase db advisors --type security` (no issues). The API build passed.
Using the dedicated runtime login and two pool connections,
`node test/db-transaction.mjs` and `node test/db-concurrency.mjs` passed reuse,
identity isolation, timeouts and concurrent failure/rollback checks.

Against that stack, these API scripts passed sequentially:
`staff.mjs`, `staff-availability.mjs`, `booking-terms.mjs`,
`staff-appointments-routes.mjs`, `staff-isolation.mjs` and
`data-api-disabled.mjs`. They cover Auth, staff and platform operations, two
ordinary same-center staff and a different center, limited and administrator
roles, denied reads/writes/bookings, successful staff and public bookings,
booking acceptance records and duplicate booking, invalid/forged/expired
tokens, and table/RPC/GraphQL denial. HTTP fixture tests require isolated local
admin credentials; see their environment checks. Frontend build and 21 tests
also passed.

Hosted development project, 25 November 2026:

- `supabase migration list --remote=ayiwjpbqedrrllcxonns` confirmed all 21
  migrations applied. The fictional demo seed was loaded separately at the
  user's request; its publicly documented passwords are for development only.
- A local API connected using the restricted runtime login and verified TLS.
  `curl http://localhost:3014/health` and
  `curl http://localhost:3014/public/centers/centro-bienestar-arrayan` returned
  HTTP 200. Supabase Auth sign-in and the corresponding API role checks passed
  for the center administrator, member, limited user and platform administrator.
- `supabase db advisors --remote=ayiwjpbqedrrllcxonns --type security` reported
  warnings for authenticated SECURITY DEFINER functions exposed through the
  still-enabled Data API. Hosted Data API shutdown has not been performed.

Disable the hosted Data API only after the deployed API is verified, then repeat
Auth, REST, table, RPC and GraphQL checks.

After hosted deployment, record the separate hosted Data API denial, Auth, and
REST evidence. Run the same authorization and contract checks for service CRUD
when it is integrated later.

Service offerings use the center catalog and transaction-scoped staff identity; the
`staff_booking_offerings` projection validates membership through
`staff_booking_professionals`. The `private.deactivate_service_offerings` trigger
retires linked offerings when an administrator deactivates a catalog entry. The
`private.check_offering_catalog_active` trigger locks and checks the catalog when
an offering is created or reactivated. These functions use fixed search paths;
the triggers are not directly executable by staff.
