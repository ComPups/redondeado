# Redondeado

A booking site and staff backoffice for the Encuadrado application process.

### 1. Plataforma para el profesional

#### Requisitos mínimos

- **Ingresar con usuario y contraseña — Cumplido.** La aplicación incluye login, logout, cuentas demo para Administrador, Miembro y Limitado, y redirección al login para rutas protegidas.
- **Manejo de permisos — Cumplido.** Cada cuenta ve su rol y obtiene un alcance distinto: el Administrador gestiona el centro, el Miembro gestiona sus propios agendamientos y el usuario Limitado solo visualiza.
- **Restricción de accesos — Cumplido.** La interfaz oculta acciones no permitidas y la API/RLS vuelve a validar autenticación, pertenencia al centro y permisos, incluyendo respuestas `401` y `403`.
- **Ver los agendamientos — Cumplido.** La agenda muestra paciente, datos de contacto, fecha, hora, servicio y profesional cuando corresponde, con filtros de próximas/pasadas y paginación.
- **Configuraciones del centro — Cumplido.** El Administrador puede editar nombre, descripción de hasta 400 caracteres, horario, servicios, precios y duración; los cambios se reflejan en el perfil público y la disponibilidad.

#### Requisitos deseables

- **Reagendamiento y cancelación — Cumplido.** El profesional puede modificar los datos y horario de una cita o eliminarla; el backend valida permisos, horario y conflictos.
- **Agregar un agendamiento — Cumplido.** El personal con permisos puede crear una cita eligiendo fecha, servicio, profesional y datos del paciente desde el backoffice.
- **Agenda en formato calendario — Cumplido.** La agenda incluye un calendario para seleccionar un día y ver sus citas.

### 2. Vista del paciente

#### Requisitos mínimos

- **Perfil público del centro — Cumplido.** El perfil es accesible sin autenticación desde una URL basada en el nombre del centro y muestra descripción, profesionales y servicios con precio en CLP y duración.
- **Proceso de agendamiento — Cumplido.** El paciente puede comenzar escogiendo servicio o profesional, consultar horas disponibles según duración, horario y conflictos, y confirmar con nombre, correo y teléfono.

#### Requisitos deseables

- **Términos y condiciones — Cumplido.** El paciente puede leer y aceptar los términos antes de reservar; el centro o profesional puede publicarlos y retirarlos desde el backoffice.

### 3. Bonus

- **Soporte para varios centros — Cumplido.** Una cuenta puede pertenecer a más de un centro, cambiar de contexto y conservar permisos independientes en cada uno.
- **Base de datos hospedada — Implementado.** Supabase Auth y Postgres mantienen las reservas y cambios disponibles al reiniciar la API o conectarse desde otro checkout al mismo proyecto.

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
supabase start
supabase status
```

The first start downloads the service images and applies the migrations and local demo seed. The CLI prints the local Auth URL (`http://127.0.0.1:54321`), the Postgres connection on port `54322`, and [Studio](http://127.0.0.1:54323). Use `supabase stop` when you are done.

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

In `api/.env`, set `SUPABASE_PUBLISHABLE_KEY` to the local publishable (or anon) key and `SUPABASE_SECRET_KEY` to the local service-role key shown by `supabase status`; the latter enables staff account creation. Replace the password in `DATABASE_URL` with the one just set for `redondeado_api`. Percent-encode any URL-special characters in the password. Keep `DB_SSL_MODE=disable` for the local database. In `web/.env`, set `VITE_SUPABASE_PUBLISHABLE_KEY` to the same key. Keep the database URL and password server-side; never put them in a `VITE_` variable.

Start the API and web app in separate terminals:

```sh

npm --prefix api run dev
npm --prefix web run dev
```

Open the landing page at http://localhost:5173/, the demo center at http://localhost:5173/centro-bienestar-arrayan, or staff sign-in at http://localhost:5173/staff/login. The API defaults to port 3000.

## Build and tests

```sh
npm --prefix api run build
npm --prefix web run build
npm --prefix web test
supabase test db
```

The API build is written to `api/dist` and can be started with `npm --prefix api start`; the web build is written to `web/dist`. Production hosting must rewrite frontend paths to `index.html` for direct navigation and refresh. Database tests require the local Supabase stack.

## Demo staff identities

A local `supabase db reset` applies the migrations and seeds the fictional Centro Bienestar Arrayán. **Reset deletes local database data.** The four fictional accounts share the local demo password `Demo-Arrayan-2026!`:

| Staff member           | Email                       | Center role                          |
| ---------------------- | --------------------------- | ------------------------------------ |
| Camila Rojas           | camila.rojas@example.com    | Administrator (also a professional)  |
| Matías Soto            | matias.soto@example.com     | Member                               |
| Valentina Muñoz        | valentina.munoz@example.com | Limited                              |
| Platform administrator | plataforma@example.com      | Platform administrator (all centers) |

These credentials are public and only for development; do not use this seed for a production project. The demo center is open daily from 09:00 to 18:00 in `America/Santiago` and includes services and fictional appointments.
