-- Collapses the multi-round-trip waterfalls behind the teacher/admin/director "Classes" and
-- "Home" lists into one RPC call each. Both return the same *raw* rows the client used to
-- fetch across several sequential .from() calls -- all the business logic (role assignment,
-- draft filtering, per-program counting, session/track linking) stays in TypeScript exactly
-- as it was; these functions only change how many round-trips it takes to get the raw data.
-- security invoker so RLS applies exactly as it already did for the equivalent client queries.

create or replace function public.get_teacher_programs_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_account_type text;
  v_program_ids uuid[];
  v_track_ids uuid[];
  v_programs jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_memberships jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_active_enrollments jsonb := '[]'::jsonb;
  v_pending_requests jsonb := '[]'::jsonb;
  v_instructor_rows jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Log in required.', 'accountType', null, 'mosqueId', null);
  end if;

  select account_type into v_account_type from public.profiles where id = v_user_id;
  if lower(coalesce(v_account_type, '')) not in ('teacher', 'admin') then
    return jsonb_build_object('error', 'Teacher account required.', 'accountType', v_account_type, 'mosqueId', null);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', null, 'accountType', v_account_type, 'mosqueId', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.title), '[]'::jsonb) into v_programs
    from public.programs p where p.mosque_id = v_mosque_id;
  select array_agg(id) into v_program_ids from public.programs where mosque_id = v_mosque_id;

  select coalesce(jsonb_agg(jsonb_build_object('program_id', pt.program_id, 'role', pt.role, 'can_manage_finances', pt.can_manage_finances)), '[]'::jsonb) into v_assignments
    from public.program_teachers pt where pt.teacher_profile_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('role', mm.role, 'status', mm.status, 'can_create_programs', mm.can_create_programs)), '[]'::jsonb) into v_memberships
    from public.mosque_memberships mm where mm.mosque_id = v_mosque_id and mm.profile_id = v_user_id;

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
      from public.program_tracks t where t.program_id = any(v_program_ids) and t.is_active = true;
    select array_agg(id) into v_track_ids from public.program_tracks where program_id = any(v_program_ids) and is_active = true;

    select coalesce(jsonb_agg(jsonb_build_object('program_id', e.program_id)), '[]'::jsonb) into v_active_enrollments
      from public.enrollments e where e.program_id = any(v_program_ids) and e.status = 'active';

    select coalesce(jsonb_agg(jsonb_build_object('program_id', r.program_id)), '[]'::jsonb) into v_pending_requests
      from public.enrollment_requests r where r.program_id = any(v_program_ids) and r.status = 'pending';

    select coalesce(jsonb_agg(jsonb_build_object('program_id', pt.program_id)), '[]'::jsonb) into v_instructor_rows
      from public.program_teachers pt where pt.program_id = any(v_program_ids) and pt.role = 'instructor' and pt.teacher_profile_id is not null;

    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_sessions
      from public.program_sessions s where s.program_id = any(v_program_ids);

    if v_track_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
        from public.program_track_sessions l where l.program_track_id = any(v_track_ids);
    end if;
  end if;

  return jsonb_build_object(
    'error', null,
    'accountType', v_account_type,
    'mosqueId', v_mosque_id,
    'programs', v_programs,
    'assignments', v_assignments,
    'memberships', v_memberships,
    'tracks', v_tracks,
    'activeEnrollments', v_active_enrollments,
    'pendingRequests', v_pending_requests,
    'instructorRows', v_instructor_rows,
    'sessions', v_sessions,
    'links', v_links
  );
end;
$$;

grant execute on function public.get_teacher_programs_snapshot(text) to authenticated;

create or replace function public.get_admin_programs_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_account_type text;
  v_is_admin boolean := false;
  v_program_ids uuid[];
  v_track_ids uuid[];
  v_programs jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Log in required.', 'programs', '[]'::jsonb);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'programs', '[]'::jsonb);
  end if;

  select account_type into v_account_type from public.profiles where id = v_user_id;

  select exists (
    select 1 from public.mosque_memberships
    where mosque_id = v_mosque_id and profile_id = v_user_id and role = 'admin' and status = 'active'
  ) into v_is_admin;

  if lower(coalesce(v_account_type, '')) <> 'admin' or not v_is_admin then
    return jsonb_build_object('error', 'Admin account required.', 'programs', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.title), '[]'::jsonb) into v_programs
    from public.programs p where p.mosque_id = v_mosque_id and p.is_active = true;
  select array_agg(id) into v_program_ids from public.programs where mosque_id = v_mosque_id and is_active = true;

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
      from public.program_tracks t where t.program_id = any(v_program_ids) and t.is_active = true;
    select array_agg(id) into v_track_ids from public.program_tracks where program_id = any(v_program_ids) and is_active = true;

    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_sessions
      from public.program_sessions s where s.program_id = any(v_program_ids);

    if v_track_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
        from public.program_track_sessions l where l.program_track_id = any(v_track_ids);
    end if;
  end if;

  return jsonb_build_object('error', null, 'programs', v_programs, 'tracks', v_tracks, 'sessions', v_sessions, 'links', v_links);
end;
$$;

grant execute on function public.get_admin_programs_snapshot(text) to authenticated;
