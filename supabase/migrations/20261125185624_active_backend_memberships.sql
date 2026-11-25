-- The backend workflow role must honor the staff membership lifecycle too.
alter policy "Backend workflow reads memberships" on public.center_memberships
  using (active and current_setting('request.redondeado.context', true) in ('public', 'staff'));

alter policy "Backend workflow reads offerings" on public.professional_services
  using (
    current_setting('request.redondeado.context', true) in ('public', 'staff')
    and exists (
      select 1 from public.center_memberships m
      where m.center_id = professional_services.center_id
        and m.user_id = professional_services.professional_user_id and m.active
    )
  );
