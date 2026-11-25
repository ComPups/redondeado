# Redondeado

A booking site and staff backoffice for the Encuadrado application process.

## Prerequisites

- Node.js 22.13 or later and npm.
- The `psql` command-line client for configuring the local database login.
- Registry access for installing dependencies.
- For the local database: Docker Desktop running and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). On macOS with Homebrew, install the CLI with `brew install supabase/tap/supabase`.

## Start local Supabase

Open Docker Desktop and wait for the engine to start. If `docker` returns `command not found` on macOS and Docker Desktop installed its CLI in `~/.docker/bin`, add it to the current terminal's `PATH`:

```sh
export PATH="$HOME/.docker/bin:$PATH"
```

From the repository root, run:

```sh
docker info --format '{{.ServerVersion}}'
supabase --version
npm ping
supabase start
supabase status
```

The first start downloads the service images and applies the migrations and local demo seed. The CLI prints the local Auth URL (`http://127.0.0.1:54321`), the Postgres connection on port `54322`, and [Studio](http://127.0.0.1:54323). Use `supabase stop` when you are done.

The API uses Postgres directly with transaction-scoped roles and RLS; Supabase Auth still handles staff sign-in and token verification. Local PostgREST is disabled in `supabase/config.toml`. This does not change the hosted Data API setting. Hosted migrations and rollout are described in [database migration and rollout](api/DATABASE-MIGRATION.md).


## Run locally

The migrations create a restricted Postgres login named `redondeado_api` without a password. Set a local-only password before starting the API. Connect as the local database administrator using the connection shown by `supabase status`, then run the interactive password command:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

```sql
\password redondeado_api
```

Exit `psql` with `\q`. Use a password suitable only for local development. A local `supabase db reset` recreates the role, so set its password again after a reset.

Each application has its own dependencies and environment file:

```sh

npm --prefix api ci
npm --prefix web ci
cp api/.env.example api/.env
cp web/.env.example web/.env
```

In `api/.env`, set `SUPABASE_PUBLISHABLE_KEY` to the local publishable (or anon) key shown by `supabase status`, and replace the password in `DATABASE_URL` with the one just set for `redondeado_api`. Percent-encode any URL-special characters in the password. Keep `DB_SSL_MODE=disable` for the local database. In `web/.env`, set `VITE_SUPABASE_PUBLISHABLE_KEY` to the same key. Keep the database URL and password server-side; never put them in a `VITE_` variable.

Start the API and web app in separate terminals:
```sh

npm --prefix api run dev
npm --prefix web run dev
```

Open the landing page at http://localhost:5173/, the demo center at http://localhost:5173/centro-bienestar-arrayan, or staff sign-in at http://localhost:5173/staff/login. The API defaults to port 3000. For another worktree, use the alternate-port commands below.

To run the frontend against the production API, use `npm --prefix web run dev:prod` and open http://localhost:5173/centro-bienestar-arrayan. Vite proxies `/api` requests to production; no local API is needed. For staff sign-in, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the production project's URL and publishable key in `web/.env.local`. This command uses production data, and actions can change it. Use only a publishable (or legacy anon) key in frontend environment files, never a secret or service-role key.

To connect to a hosted Supabase project, configure its Auth URL, publishable key, restricted runtime database URL, and verified TLS certificate in the local environment files. Use separate credentials for migrations; see [database migration and rollout](api/DATABASE-MIGRATION.md) for the connection settings and deployment order.


The staff interface supports sign-in, center selection, a role-scoped appointment agenda with contact details, manual booking, editing, rescheduling and deletion. Administrators can book for center professionals; members can book for themselves, and limited users have read-only access. Manual bookings use the public booking availability and validation rules. Center administrators see their center's appointments; members and limited staff see their own. Platform administrators can create centers and edit center, service, appointment, profile and membership records across centers. The platform editor is an initial JSON-based interface; changes remain subject to database constraints. The public profile lets patients book in the current and next calendar months in America/Santiago, with start times every 30 minutes during center hours. Center administrators manage the shared service catalog. Professionals choose which services to offer and set their own prices and durations; removing an offering does not affect colleagues. Bookings retain the agreed price, service name and duration. [COM-11](https://linear.app/compups/issue/COM-11) and [COM-12](https://linear.app/compups/issue/COM-12) will add settings and fuller appointment management. The `staff` slug is reserved for staff routes. Production hosting must rewrite frontend paths to `index.html` for direct navigation and refresh.

To build for production, run `npm run build` in each directory. The built API can be started with `npm start` in `api/`. The API reads its optional `.env` file at startup. Vite reads its `.env` files automatically; only variables prefixed `VITE_` are exposed to browser code, so never put secrets in them.

## Frontend loading and caching

The browser shares successful API reads in a bounded, in-memory cache across client-side navigation. Public center profiles stay fresh for five minutes, staff catalogs/services/booking options for one minute, and appointment pages for 15 seconds. Keys include the full URL (including center, filters, scope and page) and request headers so staff sessions remain separate. Simultaneous readers share one request; unmounting one reader does not cancel the others.

Writes invalidate the cache before and after the request. Signing out, changing accounts, and “Actualizar centros” clear it too. Access checks, booking availability and terms always use the server; changed-price recovery also bypasses the cache. Errors are never cached. Nothing is saved to local storage, so a full reload starts fresh and patient data remains session-only. The cache policy lives in `web/src/shared/requestCache.ts`.

Public pages and staff lists/calendars use shared skeletons while data loads, with screen-reader status text and reduced-motion support. Staff code is loaded separately when entering `/staff`.

## Demo staff identities

A local `supabase db reset` applies the migrations and seeds the fictional Centro Bienestar Arrayán. **Reset deletes local database data.** The four fictional accounts share the local demo password `Demo-Arrayan-2026!`:

| Staff member | Email | Center role |
| --- | --- | --- |
| Camila Rojas | camila.rojas@example.com | Administrator (also a professional) |
| Matías Soto | matias.soto@example.com | Member |
| Valentina Muñoz | valentina.munoz@example.com | Limited |
| Platform administrator | plataforma@example.com | Platform administrator (all centers) |

These credentials are public and only for development; do not use this seed for a production project. The authenticated user's rows in `center_memberships` provide the center ID and role for server-side authorization. A user can belong to multiple centers, so the server must select a center from those rows and check its role for each request. Staff professional IDs and display names are public; profile Auth user IDs, account email, and membership administration are not public. Signed-in staff can read their own Auth user ID in their memberships. Public queries on `staff_profiles` must select `professional_id` and `display_name` explicitly. Memberships continue to use the Auth user ID for authorization. The API checks membership for the requested center on each protected request.


The demo center is open daily from 09:00 to 18:00 in `America/Santiago`, with three services priced in CLP and three fictional appointments. Appointments fall in the current month and can be in the past near month-end. Existing bookings retain their service name and end time when a service changes; deactivate services to remove them from the catalog. The database prevents overlapping appointments for the same professional, including across centers.

Services expose only active catalog data publicly. Public booking functions expose catalog details and availability without patient records; the database validates booking details and prevents overlaps. Appointment access is constrained by membership or the separate platform administrator role through row-level security. Platform roles must be provisioned by a trusted operator; clients cannot assign them. Auth account administration and the center administrator's settings interface are not implemented yet.

Run `supabase test db` after the local database is migrated and seeded. The authorization test creates its own fictional two-center fixtures inside a rolled-back transaction. This command needs the local Supabase stack and works without either application's `.env`.

Fresh worktrees start without the ignored `.env` files. With local Supabase running and `jq` installed, load the local connection settings into the shell from the repository root:

```sh
redondeado_local_config="$(supabase status --output-format json)"
export SUPABASE_URL="$(printf '%s' "$redondeado_local_config" | jq -er '.API_URL')"
export SUPABASE_PUBLISHABLE_KEY="$(printf '%s' "$redondeado_local_config" | jq -er '.PUBLISHABLE_KEY // .ANON_KEY')"
unset redondeado_local_config
# Set DATABASE_URL to the local redondeado_api login and DB_SSL_MODE=disable.
```

Run `npm --prefix api run dev` in that shell to start the API. In a second shell, repeat the exports and run `(cd api && node test/staff.mjs)` to check sign-in and role-scoped appointment access.

For the web app, load the same settings in its terminal, then run `VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY" npm --prefix web run dev`.

### Run the frontend and API in a second worktree

Use the same running local Supabase stack. In two terminals at the worktree root, load the local Supabase exports above in both, then start the API and frontend on an unused pair of ports:

```sh
# Terminal 1
PORT=3014 WEB_ORIGIN=http://localhost:5174 npm --prefix api run dev

# Terminal 2
VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY" \
  VITE_API_URL=http://localhost:3014 npm --prefix web run dev -- --port 5174
```

Open http://localhost:5174/ for the landing page or http://localhost:5174/staff/login to sign in. If you run the staff tests against this API, set `TEST_API_URL=http://localhost:3014` in the test terminal.

Staff appointment lists use `GET /staff/centers/:centerId/appointments?scope=personal|center&period=upcoming|past&page=1` and return up to 50 records per page with `page` and `has_more`. Center-wide access is restricted to administrators.
