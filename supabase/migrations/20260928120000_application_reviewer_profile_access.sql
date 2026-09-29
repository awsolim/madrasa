-- Pending applicants need not be enrolled or mosque members yet. Grant reviewers
-- access only to student/parent profiles attached to applications they can see.
create or replace function public.can_read_application_profile(check_profile_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.enrollment_requests er
    where (er.student_profile_id = check_profile_id or er.parent_profile_id = check_profile_id)
      and (public.can_view_program_applications(er.program_id, auth.uid())
        or public.can_decide_program_applications(er.program_id, auth.uid()))
  );
$$;
revoke all on function public.can_read_application_profile(uuid) from public;
grant execute on function public.can_read_application_profile(uuid) to authenticated;

drop policy if exists "application reviewers can read applicant profiles" on public.profiles;
create policy "application reviewers can read applicant profiles"
on public.profiles for select to authenticated
using (public.can_read_application_profile(id));
