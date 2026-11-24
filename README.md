# Redondeado

A booking site and staff backoffice for the Encuadrado application process. This repository currently contains the initial application scaffold; booking, authentication, and database features are still to be implemented.

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

Open the public site at http://localhost:5173/centro-bienestar-arrayan and the staff sign-in at http://localhost:5173/staff/login. A signed-out visit to `/staff` redirects to sign-in. Both sections use the same API at http://localhost:3000/health. The frontend port is fixed; stop any process using it before starting the app. The API permits requests from this local origin. Restart local Supabase after changing its Auth configuration.

The routes are integration scaffolds: [COM-9](https://linear.app/compups/issue/COM-9) will implement sign-in and sessions; [COM-10](https://linear.app/compups/issue/COM-10) will implement public booking; [COM-11](https://linear.app/compups/issue/COM-11) and [COM-12](https://linear.app/compups/issue/COM-12) will add staff settings and appointments; [COM-16](https://linear.app/compups/issue/COM-16) and [COM-17](https://linear.app/compups/issue/COM-17) cover authorization and isolation tests. Until COM-9, staff routes redirect to login except the local-only center management baseline at `/staff/centers`. The `staff` slug is reserved for staff routes. Production hosting must rewrite frontend paths to `index.html` for direct navigation and refresh.

To build for production, run `npm run build` in each directory. The built API can be started with `npm start` in `api/`. The API reads its optional `.env` file at startup. Vite reads its `.env` files automatically; only variables prefixed `VITE_` are exposed to browser code, so never put secrets in them.

## Demo staff identities

A local `supabase db reset` applies the migrations and seeds the fictional Centro Bienestar Arrayán. **Reset deletes local database data.** The three fictional accounts share the local demo password `Demo-Arrayan-2026!`:

| Staff member | Email | Center role |
| --- | --- | --- |
| Camila Rojas | camila.rojas@example.com | Administrator (also a professional) |
| Matías Soto | matias.soto@example.com | Member |
| Valentina Muñoz | valentina.munoz@example.com | Limited |

These credentials are public and only for local development; do not use this seed for a production project. The authenticated user's rows in `center_memberships` provide the center ID and role for server-side authorization. A user can belong to multiple centers, so the server must select a center from those rows and check its role for each request. Staff professional IDs and display names are public; profile Auth user IDs, account email, and membership administration are not public. Signed-in staff can read their own Auth user ID in their memberships. Public queries on `staff_profiles` must select `professional_id` and `display_name` explicitly. Memberships continue to use the Auth user ID for authorization. Sign-in UI and role enforcement for appointments are subsequent work.

The demo center is open daily from 09:00 to 18:00 in `America/Santiago`, with three services priced in CLP and three fictional appointments. Appointments fall in the current month and can be in the past near month-end. Existing bookings retain their service name and end time when a service changes; deactivate services to remove them from the catalog. The database prevents overlapping appointments for the same professional, including across centers.

Services expose only active catalog data; appointments remain inaccessible to anonymous and authenticated clients until booking and staff access policies are implemented in later increments.

Run `supabase test db` after the local database is migrated and seeded. The authorization test creates its own fictional two-center fixtures inside a rolled-back transaction.

## Local center management

To try the temporary backoffice center list and creation flow, start local Supabase and copy its secret key from `supabase status` into `api/.env` as `SUPABASE_SECRET_KEY`. Set `ENABLE_LOCAL_CENTER_MANAGEMENT=true` and `SUPABASE_URL=http://127.0.0.1:54321`, then restart the API and open http://localhost:5173/staff/centers. The API binds to loopback and rejects this mode unless Supabase uses a loopback HTTP URL. Keep the secret key server-side and never commit it. This unauthenticated development baseline must be replaced by real staff authorization before hosting or exposing it to other users.
