-- The /staff namespace belongs to the staff application.
alter table public.centers add constraint centers_slug_not_staff check (lower(slug) <> 'staff');
