# Database access migration

The existing public, staff and platform routes use parameterized Postgres through
`createDatabase().transaction`; Supabase Auth remains responsible for sign-in,
refresh, sign-out and server-side token verification. This branch is not ready
for deployment or a PR: the final service CRUD endpoints are being developed in
another worktree and must be integrated and tested here, and the full isolation
and hosted verification matrix remains outstanding.

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
certificate and hostname with the Node trust store; configure an appropriate CA
through Node's trust configuration where needed. `DB_SSL_MODE=disable` is for
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
Data API until service CRUD integration and the acceptance gates pass.

## Evidence and remaining gates

An isolated local stack with branch migrations and Data API disabled passed the
existing 100 SQL checks, API build, Auth/staff/platform/availability/terms HTTP
checks, public booking and table/RPC/GraphQL denial checks. The runtime login was
used for pooled identity reuse, rollback, timeout, public-role table denial and
unfiltered RLS read checks for two seeded staff users. The frontend build and 21
tests passed. No hosted setting or verification has been changed or performed.

Still required: integrate final service CRUD; test successful and forbidden
writes, deletions, bookings and reassignment across two ordinary same-center
staff and different centers, including all admin
permissions; verify acceptance rows and booking atomicity; test pooled reuse
under concurrent failures; audit all definer functions and effective grants;
run all checks against a fresh isolated
stack. Record hosted denial and Auth/REST evidence separately after rollout.
