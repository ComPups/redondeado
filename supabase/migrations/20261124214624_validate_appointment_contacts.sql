-- Contact edits follow the same rules as public booking, including direct API access.
create function private.validate_appointment_contacts() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.patient_name is distinct from old.patient_name or new.patient_email is distinct from old.patient_email or new.patient_phone is distinct from old.patient_phone then
    if new.patient_name is null or length(trim(new.patient_name)) not between 2 and 120
       or new.patient_email is null or length(new.patient_email) > 254 or new.patient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or new.patient_phone is null or new.patient_phone !~ '^\+?[0-9 ()-]{7,20}$' or length(regexp_replace(new.patient_phone, '[^0-9]', '', 'g')) < 7 then
      raise exception 'Invalid patient details' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_appointment_contacts() from public, anon, authenticated;
create trigger validate_appointment_contacts before update on public.appointments
for each row execute function private.validate_appointment_contacts();
