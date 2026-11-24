-- Direct Data API updates must obey the same restrictions as the staff UI.
create function private.validate_staff_appointment_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_local timestamp; v_open time; v_close time;
begin
  -- Trusted database operations and platform administration retain their existing privileges.
  if (select auth.uid()) is null or exists (select 1 from public.platform_administrators where user_id = (select auth.uid())) then
    return new;
  end if;
  if new.center_id is distinct from old.center_id or new.professional_user_id is distinct from old.professional_user_id
     or new.service_id is distinct from old.service_id or new.service_name is distinct from old.service_name then
    raise exception 'Staff cannot change appointment service or professional' using errcode = '42501';
  end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    select opens_at, closes_at into strict v_open, v_close from public.centers where id = old.center_id;
    v_local := new.starts_at at time zone 'America/Santiago';
    if new.ends_at - new.starts_at <> old.ends_at - old.starts_at
       or new.starts_at <= now()
       or v_local < date_trunc('month', now() at time zone 'America/Santiago')
       or v_local >= date_trunc('month', now() at time zone 'America/Santiago') + interval '2 months'
       or v_local::time < v_open
       or (new.ends_at at time zone 'America/Santiago')::date <> v_local::date
       or (new.ends_at at time zone 'America/Santiago')::time > v_close
       or mod(extract(epoch from (v_local::time - v_open))::numeric, 1800) <> 0 then
      raise exception 'Appointment time unavailable' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_staff_appointment_update() from public, anon, authenticated;
create trigger validate_staff_appointment_update before update on public.appointments
for each row execute function private.validate_staff_appointment_update();
