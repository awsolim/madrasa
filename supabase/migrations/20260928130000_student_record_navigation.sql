-- Adds roster shortcut permissions without broadening row access.
create or replace function public.get_teacher_roster_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque public.mosques;
  v_program public.programs;
  v_can_decide boolean := false;
  v_enrollments jsonb := '[]'::jsonb;
  v_waitlist jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_track_ids uuid[];
  v_sessions jsonb := '[]'::jsonb;
  v_track_sessions jsonb := '[]'::jsonb;
  v_enrollment_ids uuid[];
  v_student_ids uuid[];
  v_enrollment_tracks jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_completed_requests jsonb := '[]'::jsonb;
  v_completed_request_ids uuid[];
  v_completed_request_tracks jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_parent_ids uuid[];
  v_parents jsonb := '[]'::jsonb;
  v_empty jsonb;
begin
  v_empty := jsonb_build_object(
    'error', 'Masjid not found.', 'mosque', null, 'program', null, 'enrollments', '[]'::jsonb,
    'waitlist', '[]'::jsonb, 'tracks', '[]'::jsonb, 'sessions', '[]'::jsonb, 'trackSessions', '[]'::jsonb,
    'enrollmentTracks', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'completedRequests', '[]'::jsonb,
    'completedRequestTracks', '[]'::jsonb, 'profiles', '[]'::jsonb, 'links', '[]'::jsonb, 'parents', '[]'::jsonb,
    'canDecideApplications', false
  );

  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return v_empty;
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;
  if v_program.id is null then
    return v_empty || jsonb_build_object('error', 'Class not found.', 'mosque', to_jsonb(v_mosque));
  end if;

  select public.can_decide_program_applications(p_program_id, auth.uid()) into v_can_decide;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at asc), '[]'::jsonb) into v_enrollments
    from public.enrollments e where e.program_id = v_program.id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.reviewed_at asc), '[]'::jsonb) into v_waitlist
    from public.enrollment_requests r where r.program_id = v_program.id and r.status = 'waitlisted' and r.student_dismissed_at is null;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
    from public.program_tracks t where t.program_id = v_program.id and t.is_active = true;
  select array_agg(id) into v_track_ids from public.program_tracks where program_id = v_program.id and is_active = true;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_sessions
    from public.program_sessions s where s.program_id = v_program.id;
  if v_track_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(ts)), '[]'::jsonb) into v_track_sessions
      from public.program_track_sessions ts where ts.program_track_id = any(v_track_ids);
  end if;

  select array_agg(id) into v_enrollment_ids from public.enrollments where program_id = v_program.id;
  select array_agg(distinct id) into v_student_ids
    from (
      select student_profile_id as id from public.enrollments where program_id = v_program.id
      union
      select student_profile_id from public.enrollment_requests where program_id = v_program.id and status = 'waitlisted' and student_dismissed_at is null
    ) x;

  if v_enrollment_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(et)), '[]'::jsonb) into v_enrollment_tracks
      from (select enrollment_id, program_track_id from public.enrollment_tracks where enrollment_id = any(v_enrollment_ids)) et;
  end if;

  if v_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_subscriptions
      from public.program_subscriptions s where s.program_id = v_program.id and s.student_profile_id = any(v_student_ids);

    select coalesce(jsonb_agg(to_jsonb(r) order by r.reviewed_at desc), '[]'::jsonb) into v_completed_requests
      from (
        select id, student_profile_id, program_track_id, reviewed_at, requested_at
        from public.enrollment_requests
        where program_id = v_program.id and status = 'approved' and student_profile_id = any(v_student_ids)
      ) r;

    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_student_ids)) p;

    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
      from (select child_profile_id, parent_profile_id from public.parent_child_links where mosque_id = v_mosque.id and child_profile_id = any(v_student_ids)) l;
  end if;

  select array_agg(id) into v_completed_request_ids from public.enrollment_requests
    where program_id = v_program.id and status = 'approved' and student_profile_id = any(coalesce(v_student_ids, array[]::uuid[]));
  if v_completed_request_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(rt)), '[]'::jsonb) into v_completed_request_tracks
      from (select enrollment_request_id, program_track_id from public.enrollment_request_tracks where enrollment_request_id = any(v_completed_request_ids)) rt;
  end if;

  select array_agg(distinct parent_profile_id) into v_parent_ids
    from public.parent_child_links where mosque_id = v_mosque.id and child_profile_id = any(coalesce(v_student_ids, array[]::uuid[]));
  if v_parent_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_parents
      from (select id, full_name, email, phone_number, avatar_url from public.profiles where id = any(v_parent_ids)) p;
  end if;

  return jsonb_build_object(
    'error', null,
    'mosque', to_jsonb(v_mosque),
    'program', to_jsonb(v_program),
    'enrollments', v_enrollments,
    'waitlist', v_waitlist,
    'tracks', v_tracks,
    'sessions', v_sessions,
    'trackSessions', v_track_sessions,
    'enrollmentTracks', v_enrollment_tracks,
    'subscriptions', v_subscriptions,
    'completedRequests', v_completed_requests,
    'completedRequestTracks', v_completed_request_tracks,
    'profiles', v_profiles,
    'links', v_links,
    'parents', v_parents,
    'canDecideApplications', v_can_decide,
    'canViewApplications', public.can_view_program_applications(p_program_id),
    'canManageFinances', public.can_manage_program_finances(p_program_id)
  );
end;
$$;

grant execute on function public.get_teacher_roster_snapshot(text, uuid) to authenticated;

