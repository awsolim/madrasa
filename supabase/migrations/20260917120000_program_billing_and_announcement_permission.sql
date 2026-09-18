alter table public.programs
  add column if not exists monthly_billing_anchor text not null default 'signup_date';

alter table public.program_payment_terms
  add column if not exists monthly_billing_anchor text not null default 'signup_date',
  add column if not exists monthly_billing_timezone text;

alter table public.program_teachers
  add column if not exists can_announce boolean not null default true;

create or replace function public.can_view_program_applications(
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
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1 from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and (pt.can_view_applications or pt.can_decide_applications)))
  );
$$;

drop policy if exists "enrollment request tracks visible with request" on public.enrollment_request_tracks;
create policy "enrollment request tracks visible with request"
on public.enrollment_request_tracks for select
using (
  exists (
    select 1 from public.enrollment_requests er
    where er.id = enrollment_request_tracks.enrollment_request_id
      and (
        er.student_profile_id = auth.uid()
        or er.parent_profile_id = auth.uid()
        or public.can_view_program_applications(er.program_id)
      )
  )
);

create or replace function public.can_announce_program(
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
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1 from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_announce))
  );
$$;

grant execute on function public.can_announce_program(uuid, uuid) to authenticated;

drop policy if exists "teachers create announcements for assigned programs" on public.program_announcements;
create policy "authorized staff create announcements"
on public.program_announcements for insert
with check (author_profile_id = auth.uid() and public.can_announce_program(program_id));
