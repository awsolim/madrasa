-- Phase B: masjid-wide admin pages. Same pattern as every prior snapshot RPC in this series.

-- Backs loadMembers (AdminMembersData): mosque -> memberships -> programs -> teacher-
-- assignments -> enrollments -> enrollment_tracks -> tracks -> parent_child_links -> profiles,
-- as nine FULLY sequential stages with almost none batched -- the worst offender found in the
-- full-app audit. Collapsed to one call; all the context-building logic (teacher/enrollment/
-- parent-child maps, the membership-vs-synthetic-teacher split) stays in TypeScript unchanged.
create or replace function public.get_admin_members_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque_id uuid;
  v_memberships jsonb := '[]'::jsonb;
  v_programs jsonb := '[]'::jsonb;
  v_program_ids uuid[];
  v_teacher_assignments jsonb := '[]'::jsonb;
  v_enrollments jsonb := '[]'::jsonb;
  v_enrollment_ids uuid[];
  v_enrollment_tracks jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_profile_ids uuid[];
  v_profiles jsonb := '[]'::jsonb;
begin
  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', null, 'mosqueId', null, 'memberships', '[]'::jsonb, 'programs', '[]'::jsonb, 'teacherAssignments', '[]'::jsonb, 'enrollments', '[]'::jsonb, 'enrollmentTracks', '[]'::jsonb, 'tracks', '[]'::jsonb, 'links', '[]'::jsonb, 'profiles', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb) into v_memberships
    from public.mosque_memberships m where m.mosque_id = v_mosque_id and m.status = 'active';

  select coalesce(jsonb_agg(to_jsonb(p) order by p.title), '[]'::jsonb) into v_programs
    from public.programs p where p.mosque_id = v_mosque_id;
  select array_agg(id) into v_program_ids from public.programs where mosque_id = v_mosque_id;

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at asc), '[]'::jsonb) into v_teacher_assignments
      from public.program_teachers a where a.program_id = any(v_program_ids) and a.teacher_profile_id is not null;

    select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_enrollments
      from public.enrollments e where e.program_id = any(v_program_ids);
    select array_agg(id) into v_enrollment_ids from public.enrollments where program_id = any(v_program_ids);

    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
      from public.program_tracks t where t.program_id = any(v_program_ids) and t.is_active = true;
  end if;

  if v_enrollment_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(et)), '[]'::jsonb) into v_enrollment_tracks
      from (select enrollment_id, program_track_id from public.enrollment_tracks where enrollment_id = any(v_enrollment_ids)) et;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
    from public.parent_child_links l where l.mosque_id = v_mosque_id;

  select array_agg(distinct id) into v_profile_ids
    from (
      select profile_id as id from public.mosque_memberships where mosque_id = v_mosque_id and status = 'active'
      union
      select teacher_profile_id from public.program_teachers where program_id = any(coalesce(v_program_ids, array[]::uuid[])) and teacher_profile_id is not null
      union
      select student_profile_id from public.enrollments where program_id = any(coalesce(v_program_ids, array[]::uuid[]))
      union
      select parent_profile_id from public.parent_child_links where mosque_id = v_mosque_id
      union
      select child_profile_id from public.parent_child_links where mosque_id = v_mosque_id
    ) x;
  if v_profile_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles from public.profiles p where p.id = any(v_profile_ids);
  end if;

  return jsonb_build_object(
    'error', null,
    'mosqueId', v_mosque_id,
    'memberships', v_memberships,
    'programs', v_programs,
    'teacherAssignments', v_teacher_assignments,
    'enrollments', v_enrollments,
    'enrollmentTracks', v_enrollment_tracks,
    'tracks', v_tracks,
    'links', v_links,
    'profiles', v_profiles
  );
end;
$$;

grant execute on function public.get_admin_members_snapshot(text) to authenticated;

-- Backs loadRequests (AdminTeacherRequestsData): mosque -> memberships -> profiles, as three
-- sequential stages, collapsed to one.
create or replace function public.get_admin_teacher_requests_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque public.mosques;
  v_memberships jsonb := '[]'::jsonb;
  v_profile_ids uuid[];
  v_profiles jsonb := '[]'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', null, 'mosque', null, 'memberships', '[]'::jsonb, 'profiles', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at asc), '[]'::jsonb) into v_memberships
    from public.mosque_memberships m where m.mosque_id = v_mosque.id and m.role = 'teacher' and m.status = 'active';

  select array_agg(profile_id) into v_profile_ids from public.mosque_memberships where mosque_id = v_mosque.id and role = 'teacher' and status = 'active';
  if v_profile_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles from public.profiles p where p.id = any(v_profile_ids);
  end if;

  return jsonb_build_object('error', null, 'mosque', to_jsonb(v_mosque), 'memberships', v_memberships, 'profiles', v_profiles);
end;
$$;

grant execute on function public.get_admin_teacher_requests_snapshot(text) to authenticated;
