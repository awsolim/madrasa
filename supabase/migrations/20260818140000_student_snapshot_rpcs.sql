-- Same pattern as the two earlier snapshot RPCs (20260818120000, 20260818130000): collapse a
-- multi-round-trip waterfall into one call, returning raw rows only -- all business logic
-- (owner-label computation, active-status filtering, track hydration) stays in TypeScript
-- exactly as it was. security invoker so RLS applies exactly as it already did.

-- Backs fetchMosqueProgramsSnapshot: the guest/public browse list AND the student/parent
-- portal's "Browse Classes" tab both go through this.
create or replace function public.get_mosque_programs_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque public.mosques;
  v_program_ids uuid[];
  v_teacher_ids uuid[];
  v_programs jsonb := '[]'::jsonb;
  v_teachers jsonb := '[]'::jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'mosque', null, 'programs', '[]'::jsonb, 'teachers', '[]'::jsonb, 'details', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb) into v_programs
    from public.programs p where p.mosque_id = v_mosque.id and p.is_active = true;
  select array_agg(id) into v_program_ids from public.programs where mosque_id = v_mosque.id and is_active = true;

  select array_agg(distinct coalesce(director_profile_id, teacher_profile_id)) into v_teacher_ids
    from public.programs where mosque_id = v_mosque.id and is_active = true and coalesce(director_profile_id, teacher_profile_id) is not null;

  if v_teacher_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_teachers
      from (select id, full_name, avatar_url, teacher_credentials, teacher_whatsapp_number from public.profiles where id = any(v_teacher_ids)) t;
  end if;

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_details
      from (select program_id, instructor_display_name, cover_director_visibility from public.program_details where program_id = any(v_program_ids)) d;
  end if;

  return jsonb_build_object('error', null, 'mosque', to_jsonb(v_mosque), 'programs', v_programs, 'teachers', v_teachers, 'details', v_details);
end;
$$;

grant execute on function public.get_mosque_programs_snapshot(text) to anon, authenticated;

-- Backs fetchStudentEnrollments: the student/parent Home "Upcoming" list and Classes "My
-- Classes" tab both key off this -- which of the mosque's programs is this viewer (or their
-- children) actually enrolled in, and under which track.
create or replace function public.get_student_enrollments_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_profile jsonb;
  v_account_type text;
  v_child_ids uuid[];
  v_children jsonb := '[]'::jsonb;
  v_student_ids uuid[];
  v_enrollments jsonb := '[]'::jsonb;
  v_enrollment_ids uuid[];
  v_enrollment_tracks jsonb := '[]'::jsonb;
  v_track_ids uuid[];
  v_tracks jsonb := '[]'::jsonb;
  v_program_ids uuid[];
  v_sessions jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', null, 'profile', null, 'accountType', null, 'children', '[]'::jsonb, 'enrollments', '[]'::jsonb, 'enrollmentTracks', '[]'::jsonb, 'tracks', '[]'::jsonb, 'sessions', '[]'::jsonb, 'links', '[]'::jsonb);
  end if;

  select to_jsonb(p) into v_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;

  if lower(coalesce(v_account_type, '')) = 'parent' and v_mosque_id is not null then
    select array_agg(child_profile_id) into v_child_ids
      from public.parent_child_links where parent_profile_id = v_user_id and mosque_id = v_mosque_id;

    if v_child_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
        from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_child_ids)) c;
    end if;

    v_student_ids := array(select distinct unnest(array[v_user_id] || coalesce(v_child_ids, array[]::uuid[])));
  else
    v_student_ids := array[v_user_id];
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_enrollments
    from (select id, program_id, student_profile_id, program_track_id, created_at, status from public.enrollments where student_profile_id = any(v_student_ids)) e;
  select array_agg(id) into v_enrollment_ids
    from public.enrollments where student_profile_id = any(v_student_ids);

  if v_enrollment_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(et)), '[]'::jsonb) into v_enrollment_tracks
      from (select enrollment_id, program_track_id from public.enrollment_tracks where enrollment_id = any(v_enrollment_ids)) et;
  end if;

  select array_agg(distinct program_track_id) into v_track_ids
    from public.enrollment_tracks where enrollment_id = any(coalesce(v_enrollment_ids, array[]::uuid[])) and program_track_id is not null;

  if v_track_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
      from public.program_tracks t where t.id = any(v_track_ids) and t.is_active = true;
  end if;

  select array_agg(distinct program_id) into v_program_ids from public.enrollments where student_profile_id = any(v_student_ids);

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_sessions
      from public.program_sessions s where s.program_id = any(v_program_ids);
    if v_track_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
        from public.program_track_sessions l where l.program_track_id = any(v_track_ids);
    end if;
  end if;

  return jsonb_build_object(
    'error', null,
    'profile', v_profile,
    'accountType', v_account_type,
    'children', v_children,
    'enrollments', v_enrollments,
    'enrollmentTracks', v_enrollment_tracks,
    'tracks', v_tracks,
    'sessions', v_sessions,
    'links', v_links
  );
end;
$$;

grant execute on function public.get_student_enrollments_snapshot(text) to authenticated;

-- Backs fetchApplicantApplications: the student/parent "Applications" tab and Home's
-- action-required banner both depend on this -- every enrollment_requests row for the viewer
-- (or their children), joined with its program/track/subscription context.
create or replace function public.get_applicant_applications_snapshot(p_slug text)
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
  v_is_parent boolean := false;
  v_children jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_program_ids uuid[];
  v_track_ids uuid[];
  v_student_ids uuid[];
  v_programs jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_extra_students jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', null, 'requests', '[]'::jsonb, 'programs', '[]'::jsonb, 'tracks', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'children', '[]'::jsonb, 'extraStudents', '[]'::jsonb);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'requests', '[]'::jsonb, 'programs', '[]'::jsonb, 'tracks', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'children', '[]'::jsonb, 'extraStudents', '[]'::jsonb);
  end if;

  select account_type into v_account_type from public.profiles where id = v_user_id;
  v_is_parent := lower(coalesce(v_account_type, '')) = 'parent';

  if v_is_parent then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
      from (
        select p.id, p.full_name, p.email, p.phone_number, p.avatar_url, p.age, p.gender, p.date_of_birth, p.account_type
        from public.parent_child_links l join public.profiles p on p.id = l.child_profile_id
        where l.parent_profile_id = v_user_id and l.mosque_id = v_mosque_id
      ) c;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
      from public.enrollment_requests r where r.mosque_id = v_mosque_id and r.parent_profile_id = v_user_id;
  else
    select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
      from public.enrollment_requests r where r.mosque_id = v_mosque_id and r.student_profile_id = v_user_id;
  end if;

  select array_agg(distinct program_id) into v_program_ids from public.enrollment_requests where mosque_id = v_mosque_id and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);
  select array_agg(distinct program_track_id) into v_track_ids from public.enrollment_requests where mosque_id = v_mosque_id and program_track_id is not null and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);
  select array_agg(distinct student_profile_id) into v_student_ids from public.enrollment_requests where mosque_id = v_mosque_id and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);

  if v_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_programs from public.programs p where p.id = any(v_program_ids);
    if v_student_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_subscriptions
        from public.program_subscriptions s where s.program_id = any(v_program_ids) and s.student_profile_id = any(v_student_ids);
    end if;
  end if;

  if v_track_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tracks from public.program_tracks t where t.id = any(v_track_ids);
  end if;

  if v_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_extra_students
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_student_ids)) p;
  end if;

  return jsonb_build_object(
    'error', null,
    'requests', v_requests,
    'programs', v_programs,
    'tracks', v_tracks,
    'subscriptions', v_subscriptions,
    'children', v_children,
    'extraStudents', v_extra_students
  );
end;
$$;

grant execute on function public.get_applicant_applications_snapshot(text) to authenticated;
