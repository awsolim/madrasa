-- Phase A of the full-app performance rollout: same pattern as every prior snapshot RPC in
-- this series (raw rows only, all business logic stays in TypeScript, security invoker so RLS
-- applies exactly as it already did). This migration covers the teacher/admin "daily tools"
-- pages: class roster, applications review, finances, announcements, and instructors.

-- Backs fetchTeacherRoster: mosque -> program -> [enrollments+waitlist+tracks] -> [sessions+
-- track_sessions] -> [enrollment_tracks+subscriptions+completed_requests] ->
-- completed_request_tracks -> profiles -> parent_child_links -> parents, as nine sequential
-- stages, collapsed to one call.
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
    'completedRequestTracks', '[]'::jsonb, 'profiles', '[]'::jsonb, 'links', '[]'::jsonb, 'parents', '[]'::jsonb
  );

  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return v_empty;
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;
  if v_program.id is null then
    return v_empty || jsonb_build_object('error', 'Class not found.', 'mosque', to_jsonb(v_mosque));
  end if;

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
    'parents', v_parents
  );
end;
$$;

grant execute on function public.get_teacher_roster_snapshot(text, uuid) to authenticated;

-- Backs loadApplications (ProgramApplicationsData): mosque -> program -> can_manage_program
-- check -> [6-way request/track/subscription/audit/switch/track-link batch] -> profiles, as
-- six sequential stages, collapsed to one call. Reuses the existing can_manage_program()
-- function for the permission check rather than re-deriving that logic in SQL.
create or replace function public.get_program_applications_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque_id uuid;
  v_program public.programs;
  v_can_manage boolean := false;
  v_requests jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_audit_events jsonb := '[]'::jsonb;
  v_switch_requests jsonb := '[]'::jsonb;
  v_request_ids uuid[];
  v_request_track_links jsonb := '[]'::jsonb;
  v_profile_ids uuid[];
  v_profiles jsonb := '[]'::jsonb;
begin
  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'program', null, 'canManage', false);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque_id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null, 'canManage', false);
  end if;

  select public.can_manage_program(p_program_id, auth.uid()) into v_can_manage;
  if not v_can_manage then
    return jsonb_build_object('error', null, 'program', to_jsonb(v_program), 'canManage', false, 'requests', '[]'::jsonb, 'tracks', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'auditEvents', '[]'::jsonb, 'switchRequests', '[]'::jsonb, 'profiles', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
    from public.enrollment_requests r where r.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tracks from public.program_tracks t where t.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_subscriptions from public.program_subscriptions s where s.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_audit_events
    from (select * from public.program_finance_audit_events where program_id = p_program_id order by created_at desc limit 20) a;
  select coalesce(jsonb_agg(to_jsonb(sw) order by sw.requested_at desc), '[]'::jsonb) into v_switch_requests
    from public.program_track_switch_requests sw where sw.program_id = p_program_id;

  select array_agg(id) into v_request_ids from public.enrollment_requests where program_id = p_program_id;
  if v_request_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_request_track_links
      from (select enrollment_request_id, program_track_id from public.enrollment_request_tracks where enrollment_request_id = any(v_request_ids)) l;
  end if;

  select array_agg(distinct id) into v_profile_ids
    from (
      select student_profile_id as id from public.enrollment_requests where program_id = p_program_id
      union
      select parent_profile_id from public.enrollment_requests where program_id = p_program_id and parent_profile_id is not null
      union
      select reviewed_by from public.enrollment_requests where program_id = p_program_id and reviewed_by is not null
      union
      select student_profile_id from public.program_track_switch_requests where program_id = p_program_id
      union
      select actor_profile_id from public.program_finance_audit_events where program_id = p_program_id and actor_profile_id is not null
        and id in (select id from public.program_finance_audit_events where program_id = p_program_id order by created_at desc limit 20)
    ) x;
  if v_profile_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_profile_ids)) p;
  end if;

  return jsonb_build_object(
    'error', null,
    'program', to_jsonb(v_program),
    'canManage', true,
    'requests', v_requests,
    'tracks', v_tracks,
    'subscriptions', v_subscriptions,
    'auditEvents', v_audit_events,
    'switchRequests', v_switch_requests,
    'requestTrackLinks', v_request_track_links,
    'profiles', v_profiles
  );
end;
$$;

grant execute on function public.get_program_applications_snapshot(text, uuid) to authenticated;

-- Backs loadFinanceRows (ProgramFinancesData): mosque+profile -> program -> [memberships+
-- director-assignment access check] -> [5-way enrollment/request/subscription/terms/audit
-- batch] -> parent_child_links -> profiles, as seven sequential stages, collapsed to one call.
create or replace function public.get_program_finances_snapshot(p_slug text, p_program_id uuid)
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
  v_program public.programs;
  v_is_admin boolean := false;
  v_has_director_finance_access boolean := false;
  v_enrollments jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_payment_terms jsonb := '[]'::jsonb;
  v_audit_events jsonb := '[]'::jsonb;
  v_student_ids uuid[];
  v_links jsonb := '[]'::jsonb;
  v_profile_ids uuid[];
  v_profiles jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Log in required.', 'program', null, 'hasAccess', false);
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'program', null, 'hasAccess', false);
  end if;
  select account_type into v_account_type from public.profiles where id = v_user_id;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque_id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null, 'hasAccess', false);
  end if;

  select exists (
    select 1 from public.mosque_memberships where mosque_id = v_mosque_id and profile_id = v_user_id and role = 'admin' and status = 'active'
  ) into v_is_admin;
  v_is_admin := v_is_admin and lower(coalesce(v_account_type, '')) = 'admin';

  select coalesce(can_manage_finances, false) into v_has_director_finance_access
    from public.program_teachers where program_id = p_program_id and teacher_profile_id = v_user_id and role = 'director' limit 1;

  if not v_is_admin and not coalesce(v_has_director_finance_access, false) then
    return jsonb_build_object('error', null, 'program', to_jsonb(v_program), 'hasAccess', false, 'enrollments', '[]'::jsonb, 'requests', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'paymentTerms', '[]'::jsonb, 'auditEvents', '[]'::jsonb, 'links', '[]'::jsonb, 'profiles', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at asc), '[]'::jsonb) into v_enrollments
    from public.enrollments e where e.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
    from public.enrollment_requests r where r.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb) into v_subscriptions
    from public.program_subscriptions s where s.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) into v_payment_terms
    from public.program_payment_terms t where t.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_audit_events
    from (select * from public.program_finance_audit_events where program_id = p_program_id order by created_at desc limit 20) a;

  select array_agg(distinct student_profile_id) into v_student_ids from public.enrollments where program_id = p_program_id;
  if v_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
      from (select child_profile_id, parent_profile_id from public.parent_child_links where mosque_id = v_mosque_id and child_profile_id = any(v_student_ids)) l;
  end if;

  select array_agg(distinct id) into v_profile_ids
    from (
      select unnest(coalesce(v_student_ids, array[]::uuid[])) as id
      union
      select parent_profile_id from public.parent_child_links where mosque_id = v_mosque_id and child_profile_id = any(coalesce(v_student_ids, array[]::uuid[])) and parent_profile_id is not null
      union
      select reviewed_by from public.enrollment_requests where program_id = p_program_id and reviewed_by is not null
      union
      select parent_profile_id from public.enrollment_requests where program_id = p_program_id and parent_profile_id is not null
      union
      select parent_profile_id from public.program_subscriptions where program_id = p_program_id and parent_profile_id is not null
      union
      select parent_profile_id from public.program_payment_terms where program_id = p_program_id and parent_profile_id is not null
      union
      select actor_profile_id from public.program_finance_audit_events where program_id = p_program_id and actor_profile_id is not null
        and id in (select id from public.program_finance_audit_events where program_id = p_program_id order by created_at desc limit 20)
    ) x;
  if v_profile_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_profile_ids)) p;
  end if;

  return jsonb_build_object(
    'error', null,
    'program', to_jsonb(v_program),
    'hasAccess', true,
    'enrollments', v_enrollments,
    'requests', v_requests,
    'subscriptions', v_subscriptions,
    'paymentTerms', v_payment_terms,
    'auditEvents', v_audit_events,
    'links', v_links,
    'profiles', v_profiles
  );
end;
$$;

grant execute on function public.get_program_finances_snapshot(text, uuid) to authenticated;

-- Backs loadAnnouncements (TeacherAnnouncementData): mosque -> program -> [announcements+
-- tracks] -> [authors+receipts] -> reader profiles, as six sequential stages, collapsed to one.
create or replace function public.get_teacher_announcements_snapshot(p_slug text, p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque_id uuid;
  v_program public.programs;
  v_announcements jsonb := '[]'::jsonb;
  v_tracks jsonb := '[]'::jsonb;
  v_author_ids uuid[];
  v_authors jsonb := '[]'::jsonb;
  v_announcement_ids uuid[];
  v_receipts jsonb := '[]'::jsonb;
  v_reader_ids uuid[];
  v_readers jsonb := '[]'::jsonb;
begin
  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'program', null);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque_id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_announcements
    from public.program_announcements a where a.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_tracks
    from public.program_tracks t where t.program_id = p_program_id and t.is_active = true;

  select array_agg(distinct author_profile_id) into v_author_ids from public.program_announcements where program_id = p_program_id and author_profile_id is not null;
  if v_author_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_authors from public.profiles p where p.id = any(v_author_ids);
  end if;

  select array_agg(id) into v_announcement_ids from public.program_announcements where program_id = p_program_id;
  if v_announcement_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_receipts
      from public.program_announcement_receipts r where r.announcement_id = any(v_announcement_ids);
  end if;

  select array_agg(distinct profile_id) into v_reader_ids from public.program_announcement_receipts
    where announcement_id = any(coalesce(v_announcement_ids, array[]::uuid[])) and read_at is not null;
  if v_reader_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_readers from public.profiles p where p.id = any(v_reader_ids);
  end if;

  return jsonb_build_object(
    'error', null,
    'program', to_jsonb(v_program),
    'announcements', v_announcements,
    'tracks', v_tracks,
    'authors', v_authors,
    'receipts', v_receipts,
    'readers', v_readers
  );
end;
$$;

grant execute on function public.get_teacher_announcements_snapshot(text, uuid) to authenticated;

-- Backs loadStaff (ProgramTeacherStaffTools, the child of TeacherInstructorsData): reuses
-- is_program_director() rather than re-deriving it, plus assignments+inactive-events+profiles
-- as one call instead of three sequential stages.
create or replace function public.get_program_staff_snapshot(p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_director boolean := false;
  v_assignments jsonb := '[]'::jsonb;
  v_inactive_events jsonb := '[]'::jsonb;
  v_profile_ids uuid[];
  v_profiles jsonb := '[]'::jsonb;
begin
  select public.is_program_director(p_program_id) into v_is_director;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at asc), '[]'::jsonb) into v_assignments
    from public.program_teachers a where a.program_id = p_program_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb) into v_inactive_events
    from public.program_instructor_events e where e.program_id = p_program_id and e.event_type = 'resigned';

  select array_agg(distinct id) into v_profile_ids
    from (
      select teacher_profile_id as id from public.program_teachers where program_id = p_program_id and teacher_profile_id is not null
      union
      select teacher_profile_id from public.program_instructor_events where program_id = p_program_id and event_type = 'resigned' and teacher_profile_id is not null
    ) x;
  if v_profile_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_profiles from public.profiles p where p.id = any(v_profile_ids);
  end if;

  return jsonb_build_object(
    'isDirector', v_is_director,
    'assignments', v_assignments,
    'inactiveEvents', v_inactive_events,
    'profiles', v_profiles
  );
end;
$$;

grant execute on function public.get_program_staff_snapshot(uuid) to authenticated;
