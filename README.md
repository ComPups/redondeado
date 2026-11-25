# Redondeado

A booking site and staff backoffice for the Encuadrado application process.

## Prerequisites

- Node.js 22.13 or later and npm.
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

The first start downloads the service images. The CLI prints the local API and Auth URL (`http://127.0.0.1:54321`), the Postgres connection on port `54322`, and [Studio](http://127.0.0.1:54323). Use `supabase stop` when you are done. This setup runs independently of the application scaffold while the database schema and demo accounts are being built.

The hosted demo will use the same migrations in a separate Supabase project. Verify migrations locally before using the [hosted migration workflow](https://supabase.com/docs/guides/deployment/database-migrations). Keep project credentials in local environment files and use fictional patient and staff data for the demo.

## Run locally

Each application has its own dependencies and lockfile. In two terminals, run:

```sh
cd api
npm ci
cp .env.example .env
npm run dev
```

```sh
cd web
npm ci
cp .env.example .env
npm run dev
```

Set `SUPABASE_PUBLISHABLE_KEY` in `api/.env` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `web/.env` to the local publishable (or anon) key shown by `supabase status`. Configure the dedicated runtime role and `DATABASE_URL` as described in [database migration and rollout](api/DATABASE-MIGRATION.md); keep the database credential server-side. Open the landing page at http://localhost:5173/, the demo center profile at http://localhost:5173/centro-bienestar-arrayan, and staff sign-in at http://localhost:5173/staff/login. Signed-out staff routes redirect to sign-in. The frontend defaults to port 5173, which the API allows by default. For a second worktree, use the alternate-port commands below. Restart local Supabase after changing its Auth configuration.

The staff interface supports sign-in, center selection, a role-scoped appointment agenda with contact details, manual booking, editing, rescheduling and deletion. Administrators can book for center professionals; members can book for themselves, and limited users have read-only access. Manual bookings use the public booking availability and validation rules. Center administrators see their center's appointments; members and limited staff see their own. Platform administrators can create centers and edit center, service, appointment, profile and membership records across centers. The platform editor is an initial JSON-based interface; changes remain subject to database constraints. The public profile lets patients book in the current and next calendar months in America/Santiago, with start times every 30 minutes during center hours. Center administrators manage the shared service catalog. Professionals choose which services to offer and set their own prices and durations; removing an offering does not affect colleagues. Bookings retain the agreed price, service name and duration. [COM-11](https://linear.app/compups/issue/COM-11) and [COM-12](https://linear.app/compups/issue/COM-12) will add settings and fuller appointment management. The `staff` slug is reserved for staff routes. Production hosting must rewrite frontend paths to `index.html` for direct navigation and refresh.

To build for production, run `npm run build` in each directory. The built API can be started with `npm start` in `api/`. The API reads its optional `.env` file at startup. Vite reads its `.env` files automatically; only variables prefixed `VITE_` are exposed to browser code, so never put secrets in them.

## Demo staff identities

A local `supabase db reset` applies the migrations and seeds the fictional Centro Bienestar Arrayán. **Reset deletes local database data.** The four fictional accounts share the local demo password `Demo-Arrayan-2026!`:

| Staff member | Email | Center role |
| --- | --- | --- |
| Camila Rojas | camila.rojas@example.com | Administrator (also a professional) |
| Matías Soto | matias.soto@example.com | Member |
| Valentina Muñoz | valentina.munoz@example.com | Limited |
| Platform administrator | plataforma@example.com | Platform administrator (all centers) |

These credentials are public and only for local development; do not use this seed for a production project. The authenticated user's rows in `center_memberships` provide the center ID and role for server-side authorization. A user can belong to multiple centers, so the server must select a center from those rows and check its role for each request. Staff professional IDs and display names are public; profile Auth user IDs, account email, and membership administration are not public. Signed-in staff can read their own Auth user ID in their memberships. Public queries on `staff_profiles` must select `professional_id` and `display_name` explicitly. Memberships continue to use the Auth user ID for authorization. The API checks membership for the requested center on each protected request.

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
