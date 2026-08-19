-- Phase C: student/parent auxiliary flows (apply, registration confirmation, schedule
-- options, withdrawal request). Same pattern as every prior snapshot RPC in this series.

-- Backs fetchProgramApplyDetail (ProgramApplyData): mosque -> program -> tracks ->
-- active-enrollments -> enrollment_tracks -> [user-scoped batch] -> [parent-scoped batch],
-- as up to eight sequential stages for a parent account. Same shape as the very first
-- get_program_detail_snapshot RPC in this series, applied to the apply-flow's own fetch.
create or replace function public.get_program_apply_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque public.mosques;
  v_program public.programs;
  v_tracks jsonb := '[]'::jsonb;
  v_active_enrollment_ids uuid[];
  v_enrolled_count_by_track jsonb := '{}'::jsonb;
  v_account_type text;
  v_self_profile jsonb;
  v_is_enrolled boolean := false;
  v_request_status text;
  v_children jsonb := '[]'::jsonb;
  v_child_statuses jsonb := '{}'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'mosque', null, 'program', null);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'This class could not be loaded.', 'mosque', to_jsonb(v_mosque), 'program', null);
  end if;
  if coalesce(v_program.publication_status, 'published') not in ('published', 'hidden') then
    return jsonb_build_object('error', 'This class is not published yet.', 'mosque', to_jsonb(v_mosque), 'program', to_jsonb(v_program));
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
    from public.program_tracks t where t.program_id = v_program.id and t.is_active = true;

  select array_agg(id) into v_active_enrollment_ids from public.enrollments where program_id = v_program.id and status = 'active';
  if v_active_enrollment_ids is not null then
    select coalesce(jsonb_object_agg(program_track_id, cnt), '{}'::jsonb) into v_enrolled_count_by_track
      from (select program_track_id, count(*) as cnt from public.enrollment_tracks where enrollment_id = any(v_active_enrollment_ids) group by program_track_id) x;
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'error', null, 'mosque', to_jsonb(v_mosque), 'program', to_jsonb(v_program), 'tracks', v_tracks,
      'enrolledCountByTrackId', v_enrolled_count_by_track, 'accountType', null, 'selfProfile', null,
      'isEnrolled', false, 'requestStatus', null, 'children', '[]'::jsonb, 'childStatuses', '{}'::jsonb
    );
  end if;

  select to_jsonb(p) into v_self_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;

  select exists (
    select 1 from public.enrollments where program_id = v_program.id and student_profile_id = v_user_id
      and lower(coalesce(status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
  ) into v_is_enrolled;

  select status into v_request_status
    from public.enrollment_requests
    where program_id = v_program.id and student_profile_id = v_user_id and student_dismissed_at is null
    order by requested_at desc limit 1;

  if lower(coalesce(v_account_type, '')) = 'parent' then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
      from (
        select p.id, p.full_name, p.email, p.phone_number, p.avatar_url, p.age, p.gender, p.date_of_birth, p.account_type
        from public.parent_child_links l join public.profiles p on p.id = l.child_profile_id
        where l.parent_profile_id = v_user_id and l.mosque_id = v_mosque.id
      ) c;

    select coalesce(
      jsonb_object_agg(
        child.id,
        jsonb_build_object(
          'enrolled', exists (
            select 1 from public.enrollments where program_id = v_program.id and student_profile_id = child.id
              and lower(coalesce(status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
          ),
          'requestStatus', (
            select status from public.enrollment_requests
            where program_id = v_program.id and parent_profile_id = v_user_id and student_profile_id = child.id and student_dismissed_at is null
            order by requested_at desc limit 1
          )
        )
      ),
      '{}'::jsonb
    ) into v_child_statuses
    from (select child_profile_id as id from public.parent_child_links where parent_profile_id = v_user_id and mosque_id = v_mosque.id) child;
  end if;

  return jsonb_build_object(
    'error', null,
    'mosque', to_jsonb(v_mosque),
    'program', to_jsonb(v_program),
    'tracks', v_tracks,
    'enrolledCountByTrackId', v_enrolled_count_by_track,
    'accountType', v_account_type,
    'selfProfile', v_self_profile,
    'isEnrolled', v_is_enrolled,
    'requestStatus', v_request_status,
    'children', v_children,
    'childStatuses', v_child_statuses
  );
end;
$$;

grant execute on function public.get_program_apply_snapshot(text, uuid) to authenticated;

-- Backs loadRegistration (RegistrationConfirmationData): mosque -> request -> can_manage_program
-- check -> [program+track+student+parent batch], as four sequential stages, collapsed to one.
create or replace function public.get_registration_confirmation_snapshot(p_slug text, p_request_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque public.mosques;
  v_request public.enrollment_requests;
  v_owns_request boolean := false;
  v_can_manage boolean := false;
  v_program jsonb;
  v_track jsonb;
  v_student jsonb;
  v_parent jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Log in required.', 'mosque', null, 'request', null);
  end if;

  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'mosque', null, 'request', null);
  end if;

  select * into v_request from public.enrollment_requests where id = p_request_id and mosque_id = v_mosque.id limit 1;
  if v_request.id is null then
    return jsonb_build_object('error', 'This registration could not be found.', 'mosque', to_jsonb(v_mosque), 'request', null);
  end if;

  v_owns_request := v_request.student_profile_id = v_user_id or v_request.parent_profile_id = v_user_id;
  if not v_owns_request then
    select public.can_manage_program(v_request.program_id, v_user_id) into v_can_manage;
    if not v_can_manage then
      return jsonb_build_object('error', 'You do not have access to this registration.', 'mosque', to_jsonb(v_mosque), 'request', null);
    end if;
  end if;

  select to_jsonb(p) into v_program from public.programs p where p.id = v_request.program_id limit 1;
  if v_program is null then
    return jsonb_build_object('error', 'This class is no longer available.', 'mosque', to_jsonb(v_mosque), 'request', null);
  end if;

  if v_request.program_track_id is not null then
    select to_jsonb(t) into v_track from public.program_tracks t where t.id = v_request.program_track_id limit 1;
  end if;

  select to_jsonb(p) into v_student from (select id, full_name, email from public.profiles where id = v_request.student_profile_id) p;
  if v_request.parent_profile_id is not null then
    select to_jsonb(p) into v_parent from (select id, full_name, email from public.profiles where id = v_request.parent_profile_id) p;
  end if;

  return jsonb_build_object(
    'error', null,
    'mosque', to_jsonb(v_mosque),
    'request', to_jsonb(v_request),
    'program', v_program,
    'track', v_track,
    'student', v_student,
    'parent', v_parent
  );
end;
$$;

grant execute on function public.get_registration_confirmation_snapshot(text, uuid) to authenticated;

-- Backs the load() effect in StudentScheduleOptionsData: mosque -> profile -> [children] ->
-- [program+tracks+enrollments] -> enrollment_tracks, as up to six sequential stages.
create or replace function public.get_student_schedule_options_snapshot(p_slug text, p_program_id uuid)
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
  v_self_profile jsonb;
  v_child_ids uuid[];
  v_children jsonb := '[]'::jsonb;
  v_student_ids uuid[];
  v_program jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_enrollments jsonb := '[]'::jsonb;
  v_enrollment_ids uuid[];
  v_enrollment_tracks jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Please sign in to manage schedule options.', 'program', null);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'program', null);
  end if;

  select to_jsonb(p) into v_self_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;
  if lower(coalesce(v_account_type, '')) = 'parent' then
    select array_agg(child_profile_id) into v_child_ids from public.parent_child_links where parent_profile_id = v_user_id and mosque_id = v_mosque_id;
    if v_child_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
        from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_child_ids)) c;
    end if;
  end if;
  v_student_ids := array(select distinct unnest(array[v_user_id] || coalesce(v_child_ids, array[]::uuid[])));

  select to_jsonb(p) into v_program from public.programs p where p.id = p_program_id and p.mosque_id = v_mosque_id limit 1;
  if v_program is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
    from public.program_tracks t where t.program_id = p_program_id and t.is_active = true;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_enrollments
    from public.enrollments e where e.program_id = p_program_id and e.student_profile_id = any(v_student_ids);
  select array_agg(id) into v_enrollment_ids from public.enrollments where program_id = p_program_id and student_profile_id = any(v_student_ids);

  if v_enrollment_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(et)), '[]'::jsonb) into v_enrollment_tracks
      from (select enrollment_id, program_track_id from public.enrollment_tracks where enrollment_id = any(v_enrollment_ids)) et;
  end if;

  return jsonb_build_object(
    'error', null,
    'program', v_program,
    'tracks', v_tracks,
    'selfProfile', v_self_profile,
    'children', v_children,
    'enrollments', v_enrollments,
    'enrollmentTracks', v_enrollment_tracks
  );
end;
$$;

grant execute on function public.get_student_schedule_options_snapshot(text, uuid) to authenticated;

-- Backs loadOptions in StudentWithdrawalRequestData: mosque -> program -> profile ->
-- [children] -> enrollments -> withdrawal_requests, as up to six sequential stages.
create or replace function public.get_student_withdrawal_options_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_program jsonb;
  v_account_type text;
  v_self_profile jsonb;
  v_child_ids uuid[];
  v_children jsonb := '[]'::jsonb;
  v_student_ids uuid[];
  v_enrolled_student_ids uuid[];
  v_requests jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Please sign in to request withdrawal.', 'program', null);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'program', null);
  end if;

  select to_jsonb(p) into v_program from public.programs p where p.id = p_program_id and p.mosque_id = v_mosque_id limit 1;
  if v_program is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null);
  end if;

  select to_jsonb(p) into v_self_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;
  if lower(coalesce(v_account_type, '')) = 'parent' then
    select array_agg(child_profile_id) into v_child_ids from public.parent_child_links where parent_profile_id = v_user_id and mosque_id = v_mosque_id;
    if v_child_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
        from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_child_ids)) c;
    end if;
  end if;
  v_student_ids := array(select distinct unnest(array[v_user_id] || coalesce(v_child_ids, array[]::uuid[])));

  select array_agg(distinct student_profile_id) into v_enrolled_student_ids
    from public.enrollments where program_id = p_program_id and student_profile_id = any(v_student_ids);

  if v_enrolled_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_requests
      from public.withdrawal_requests r where r.program_id = p_program_id and r.student_profile_id = any(v_enrolled_student_ids) and r.status = 'pending';
  end if;

  return jsonb_build_object(
    'error', null,
    'program', v_program,
    'selfProfile', v_self_profile,
    'children', v_children,
    'enrolledStudentIds', to_jsonb(coalesce(v_enrolled_student_ids, array[]::uuid[])),
    'requests', v_requests
  );
end;
$$;

grant execute on function public.get_student_withdrawal_options_snapshot(text, uuid) to authenticated;
