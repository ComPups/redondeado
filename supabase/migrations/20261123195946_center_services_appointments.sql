-- Each center has one daily schedule, interpreted in America/Santiago.
alter table public.centers
  add column description text not null default '' check (char_length(description) <= 400),
  add column opens_at time not null default '09:00',
  add column closes_at time not null default '18:00',
  add constraint centers_valid_hours check (closes_at > opens_at);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  price_clp integer not null check (price_clp >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  active boolean not null default true,
  unique (center_id, id)
);
create index services_center_id_idx on public.services (center_id);

create extension if not exists btree_gist with schema extensions;

-- Store the booked service name and end time so later service edits do not
-- change existing bookings. Deactivate services rather than deleting history.
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null,
  professional_user_id uuid not null,
  service_id uuid not null,
  service_name text not null check (length(trim(service_name)) > 0),
  patient_name text not null check (length(trim(patient_name)) > 0),
  patient_email text not null check (length(trim(patient_email)) > 0),
  patient_phone text not null check (length(trim(patient_phone)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint appointments_valid_time check (ends_at > starts_at),
  constraint appointments_professional_membership_fk foreign key (center_id, professional_user_id)
    references public.center_memberships (center_id, user_id) on delete restrict,
  constraint appointments_service_center_fk foreign key (center_id, service_id)
    references public.services (center_id, id) on delete restrict,
  constraint appointments_no_professional_overlap exclude using gist (
    professional_user_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);
create index appointments_center_professional_idx on public.appointments (center_id, professional_user_id);
create index appointments_center_service_idx on public.appointments (center_id, service_id);

alter table public.services enable row level security;
alter table public.appointments enable row level security;

-- Only active catalog entries are publicly visible. Appointment access is
-- denied until staff and booking policies are added in their own increments.
create policy "Read active services" on public.services
  for select to anon, authenticated using (active);
revoke all on public.services, public.appointments from anon, authenticated;
grant select on public.services to anon, authenticated;
