# Database migration in progress

This branch is not ready for deployment or a PR: the existing routes still use
the Supabase Data API and the service-role key. Do not disable the Data API yet.

Service CRUD is being developed separately. Its final routes must be integrated
before this migration is complete. They must use `createDatabase().transaction`
with the staff identity obtained from server-verified Supabase Auth, issue
parameterized SQL through the supplied client, and rely on database RLS and
grants for authorization. A request body must never determine the database role
or user ID. Related membership checks and writes should share a transaction.
The pool client must not escape the callback, and statements must not use named
prepared statements or depend on session state.

The runtime role migration intentionally leaves the login password unset and
retains the old service-role function grants for rollback. It is not deployed.
Provision credentials separately; validate grants and role membership against
the actual hosted database and chosen pooler before rollout.

Local preliminary checks: API TypeScript build and transaction identity reuse,
rollback and statement-timeout checks passed against the existing local stack;
frontend build and 21 tests passed. The pool test used a local postgres login to
exercise the transaction machinery, not the proposed runtime login. The local
SQL suite failed because the shared stack's data and permissions differ from
this checkout's expected fixtures. Re-run all acceptance tests against an
isolated stack with this branch's migrations and fixtures, including the new
runtime role and Data API disabled. No hosted verification has been performed.
