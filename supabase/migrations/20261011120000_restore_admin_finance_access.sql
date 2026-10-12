-- Mosque and platform admins retain finance authority, program directors have
-- full authority for their class, and instructors require an explicit grant.
create or replace function public.can_manage_program_finances(
  check_program_id uuid,
  check_profile_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or public.is_program_director(check_program_id, check_profile_id)
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and pt.role = 'instructor'
      and pt.can_manage_finances = true
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  );
$$;

grant execute on function public.can_manage_program_finances(uuid, uuid) to authenticated;
