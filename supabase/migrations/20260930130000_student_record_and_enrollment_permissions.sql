-- Separates access to private student records from permission to change enrollment.
-- Directors, mosque admins, and platform admins retain implicit full access.
alter table public.program_teachers
  add column if not exists can_view_student_records boolean not null default false,
  add column if not exists can_manage_enrollments boolean not null default false;

create or replace function public.can_view_program_student_records(
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
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_view_student_records))
  );
$$;

create or replace function public.can_manage_program_enrollments(
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
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_manage_enrollments))
  );
$$;

grant execute on function public.can_view_program_student_records(uuid, uuid) to authenticated;
grant execute on function public.can_manage_program_enrollments(uuid, uuid) to authenticated;

-- Enrollment status changes must use the dedicated enrollment permission.
drop policy if exists "program teachers and admins update enrollments" on public.enrollments;
drop policy if exists "program staff update enrollments" on public.enrollments;
create policy "authorized staff update enrollments"
on public.enrollments for update
using (public.can_manage_program_enrollments(program_id))
with check (public.can_manage_program_enrollments(program_id));

-- Keep the mature roster query, but put a permission-aware response boundary in
-- front of it. The browser never receives private fields that its user cannot see.
do $$
begin
  if to_regprocedure('public.get_teacher_roster_snapshot_unfiltered(text,uuid)') is null then
    alter function public.get_teacher_roster_snapshot(text, uuid)
      rename to get_teacher_roster_snapshot_unfiltered;
  end if;
end;
$$;

revoke all on function public.get_teacher_roster_snapshot_unfiltered(text, uuid) from public;
revoke all on function public.get_teacher_roster_snapshot_unfiltered(text, uuid) from authenticated;

create or replace function public.get_teacher_roster_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_can_view_records boolean := false;
  v_can_view_applications boolean := false;
  v_can_decide_applications boolean := false;
  v_can_manage_finances boolean := false;
  v_can_manage_enrollments boolean := false;
  v_safe_profiles jsonb := '[]'::jsonb;
begin
  if not (
    public.is_platform_admin(auth.uid())
    or public.is_program_teacher(p_program_id, auth.uid())
    or exists (
      select 1 from public.programs p
      where p.id = p_program_id
        and public.has_mosque_role(p.mosque_id, array['admin'], auth.uid())
    )
  ) then
    return jsonb_build_object('error', 'You are not assigned to this class.', 'program', null);
  end if;

  v_result := public.get_teacher_roster_snapshot_unfiltered(p_slug, p_program_id);
  select public.can_view_program_student_records(p_program_id) into v_can_view_records;
  select public.can_view_program_applications(p_program_id) into v_can_view_applications;
  select public.can_decide_program_applications(p_program_id) into v_can_decide_applications;
  select public.can_manage_program_finances(p_program_id) into v_can_manage_finances;
  select public.can_manage_program_enrollments(p_program_id) into v_can_manage_enrollments;

  if not coalesce(v_can_view_records, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile_row.value->'id',
      'full_name', profile_row.value->'full_name',
      'avatar_url', profile_row.value->'avatar_url',
      'account_type', profile_row.value->'account_type'
    )), '[]'::jsonb)
    into v_safe_profiles
    from jsonb_array_elements(coalesce(v_result->'profiles', '[]'::jsonb)) as profile_row(value);

    v_result := jsonb_set(v_result, '{profiles}', v_safe_profiles, true);
    v_result := jsonb_set(v_result, '{parents}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{links}', '[]'::jsonb, true);
  end if;

  if not coalesce(v_can_manage_finances, false) then
    v_result := jsonb_set(v_result, '{subscriptions}', '[]'::jsonb, true);
  end if;

  if not (coalesce(v_can_view_applications, false) or coalesce(v_can_decide_applications, false)) then
    v_result := jsonb_set(v_result, '{waitlist}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{completedRequests}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{completedRequestTracks}', '[]'::jsonb, true);
  end if;

  return v_result || jsonb_build_object(
    'canViewStudentRecords', coalesce(v_can_view_records, false),
    'canManageEnrollments', coalesce(v_can_manage_enrollments, false),
    'canViewApplications', coalesce(v_can_view_applications, false),
    'canDecideApplications', coalesce(v_can_decide_applications, false),
    'canManageFinances', coalesce(v_can_manage_finances, false)
  );
end;
$$;

grant execute on function public.get_teacher_roster_snapshot(text, uuid) to authenticated;
