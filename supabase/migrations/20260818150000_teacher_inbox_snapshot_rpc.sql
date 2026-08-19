-- Same pattern as the earlier snapshot RPCs: collapses fetchTeacherInboxSnapshot's five
-- sequential/parallel round-trip stages (notification-state -> mosque -> [programs+
-- assignments] -> [7-way request/withdrawal/instructor/track batch] -> [6-way profile/
-- subscription hydration batch]) into one call. Raw rows only -- the mapping into
-- announcements/requests/withdrawals/instructorNotifications stays in TypeScript unchanged.
create or replace function public.get_teacher_inbox_snapshot(p_slug text, p_selected_program_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_teacher_program_ids uuid[];
  v_director_program_ids uuid[];
  v_program_ids uuid[];
  v_active_program_id uuid;
  v_programs jsonb := '[]'::jsonb;
  v_announcements jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
  v_instructor_rows jsonb := '[]'::jsonb;
  v_instructor_event_rows jsonb := '[]'::jsonb;
  v_track_rows jsonb := '[]'::jsonb;
  v_track_switch_rows jsonb := '[]'::jsonb;
  v_students jsonb := '[]'::jsonb;
  v_parents jsonb := '[]'::jsonb;
  v_authors jsonb := '[]'::jsonb;
  v_instructor_profiles jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_request_track_links jsonb := '[]'::jsonb;
  v_student_ids uuid[];
  v_parent_ids uuid[];
  v_author_ids uuid[];
  v_instructor_ids uuid[];
  v_subscription_student_ids uuid[];
  v_request_ids uuid[];
  v_empty jsonb;
begin
  v_empty := jsonb_build_object(
    'error', null, 'currentUserId', v_user_id, 'programs', '[]'::jsonb, 'activeProgramId', null,
    'directorProgramIds', '[]'::jsonb, 'announcements', '[]'::jsonb, 'requests', '[]'::jsonb,
    'withdrawals', '[]'::jsonb, 'instructorEventRows', '[]'::jsonb, 'instructorRows', '[]'::jsonb,
    'trackRows', '[]'::jsonb, 'trackSwitchRows', '[]'::jsonb, 'students', '[]'::jsonb,
    'parents', '[]'::jsonb, 'authors', '[]'::jsonb, 'instructorProfiles', '[]'::jsonb,
    'subscriptions', '[]'::jsonb, 'requestTrackLinks', '[]'::jsonb
  );

  if v_user_id is null then
    return v_empty;
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return v_empty;
  end if;

  select array_agg(id) into v_teacher_program_ids
    from public.programs
    where mosque_id = v_mosque_id and is_active = true
      and (
        coalesce(director_profile_id, teacher_profile_id) = v_user_id
        or id in (select program_id from public.program_teachers where teacher_profile_id = v_user_id)
      );

  if v_teacher_program_ids is null then
    return v_empty;
  end if;

  select array_agg(id) into v_director_program_ids
    from public.programs
    where id = any(v_teacher_program_ids)
      and (
        coalesce(director_profile_id, teacher_profile_id) = v_user_id
        or id in (select program_id from public.program_teachers where teacher_profile_id = v_user_id and role = 'director')
      );

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_programs
    from public.programs p where p.id = any(v_teacher_program_ids);

  v_active_program_id := coalesce(p_selected_program_id, v_teacher_program_ids[1]);
  v_program_ids := v_teacher_program_ids;

  if v_active_program_id is not null then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_announcements
      from public.program_announcements a where a.program_id = v_active_program_id;
  end if;

  if v_director_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
      from public.enrollment_requests r where r.program_id = any(v_director_program_ids) and r.teacher_dismissed_at is null;

    select coalesce(jsonb_agg(to_jsonb(w) order by w.requested_at desc), '[]'::jsonb) into v_withdrawals
      from public.withdrawal_requests w where w.program_id = any(v_director_program_ids) and w.teacher_dismissed_at is null;

    select coalesce(jsonb_agg(to_jsonb(pt) order by pt.created_at desc), '[]'::jsonb) into v_instructor_rows
      from public.program_teachers pt where pt.program_id = any(v_director_program_ids) and pt.role = 'instructor' and pt.teacher_profile_id is not null;

    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb) into v_instructor_event_rows
      from public.program_instructor_events e where e.program_id = any(v_director_program_ids);

    select coalesce(jsonb_agg(to_jsonb(s) order by s.requested_at desc), '[]'::jsonb) into v_track_switch_rows
      from public.program_track_switch_requests s where s.program_id = any(v_director_program_ids);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_track_rows
    from public.program_tracks t where t.program_id = any(v_program_ids) and t.is_active = true;

  select array_agg(distinct student_profile_id) into v_student_ids
    from (
      select student_profile_id from public.enrollment_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null
      union
      select student_profile_id from public.withdrawal_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null
      union
      select student_profile_id from public.program_track_switch_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[]))
    ) x;

  select array_agg(distinct parent_profile_id) into v_parent_ids
    from (
      select parent_profile_id from public.enrollment_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null and parent_profile_id is not null
      union
      select parent_profile_id from public.withdrawal_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null and parent_profile_id is not null
    ) x;

  select array_agg(distinct author_profile_id) into v_author_ids
    from public.program_announcements where program_id = v_active_program_id and author_profile_id is not null;

  select array_agg(distinct teacher_profile_id) into v_instructor_ids
    from (
      select teacher_profile_id from public.program_teachers where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and role = 'instructor' and teacher_profile_id is not null
      union
      select teacher_profile_id from public.program_instructor_events where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_profile_id is not null
    ) x;

  select array_agg(distinct student_profile_id) into v_subscription_student_ids
    from public.withdrawal_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null;

  select array_agg(id) into v_request_ids
    from public.enrollment_requests where program_id = any(coalesce(v_director_program_ids, array[]::uuid[])) and teacher_dismissed_at is null;

  if v_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_students
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_student_ids)) p;
  end if;

  if v_parent_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_parents
      from (select id, full_name, email, phone_number, avatar_url from public.profiles where id = any(v_parent_ids)) p;
  end if;

  if v_author_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_authors from public.profiles p where p.id = any(v_author_ids);
  end if;

  if v_instructor_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_instructor_profiles from public.profiles p where p.id = any(v_instructor_ids);
  end if;

  if v_subscription_student_ids is not null and v_director_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_subscriptions
      from public.program_subscriptions s where s.program_id = any(v_director_program_ids) and s.student_profile_id = any(v_subscription_student_ids);
  end if;

  if v_request_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_request_track_links
      from public.enrollment_request_tracks l where l.enrollment_request_id = any(v_request_ids);
  end if;

  return jsonb_build_object(
    'error', null,
    'currentUserId', v_user_id,
    'programs', v_programs,
    'activeProgramId', v_active_program_id,
    'directorProgramIds', to_jsonb(coalesce(v_director_program_ids, array[]::uuid[])),
    'announcements', v_announcements,
    'requests', v_requests,
    'withdrawals', v_withdrawals,
    'instructorEventRows', v_instructor_event_rows,
    'instructorRows', v_instructor_rows,
    'trackRows', v_track_rows,
    'trackSwitchRows', v_track_switch_rows,
    'students', v_students,
    'parents', v_parents,
    'authors', v_authors,
    'instructorProfiles', v_instructor_profiles,
    'subscriptions', v_subscriptions,
    'requestTrackLinks', v_request_track_links
  );
end;
$$;

grant execute on function public.get_teacher_inbox_snapshot(text, uuid) to authenticated;
