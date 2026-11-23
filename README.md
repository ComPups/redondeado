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

Each application has its own dependencies and lockfile. In three terminals, run:

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

```sh
cd backoffice
npm ci
cp .env.example .env
npm run dev
```

Open the public site at http://localhost:5173 and the backoffice at http://localhost:5174. Both display the result of a request to the API health endpoint at http://localhost:3000/health. The Vite ports are fixed; stop any process already using them before starting the apps. The API allows browser requests from these two local origins.

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
