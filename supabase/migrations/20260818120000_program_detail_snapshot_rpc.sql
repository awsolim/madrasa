-- Collapses the ~5 sequential round-trips fetchProgramDetailSnapshot() used to make
-- (mosque -> program -> teacher -> [7-way batch] -> [5-way user batch] -> parent batch)
-- into a single RPC call. Purely additive: no schema changes, and security invoker so the
-- exact same RLS policies that already govern the equivalent client-side .from() calls still
-- apply -- this function does not see anything a direct client query couldn't already see.
create or replace function public.get_program_detail_snapshot(
  p_slug text,
  p_program_id uuid,
  p_section text
)
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
  v_teacher_id uuid;
  v_teacher jsonb;
  v_details jsonb;
  v_outcomes jsonb;
  v_content jsonb;
  v_faqs jsonb;
  v_media jsonb;
  v_tracks jsonb;
  v_active_enrollment_ids uuid[];
  v_enrolled_count int := 0;
  v_track_counts jsonb := '{}'::jsonb;
  v_result jsonb;
  v_account_type text;
  v_is_mosque_admin boolean := false;
  v_enrollment_status text;
  v_is_enrolled boolean := false;
  v_request_status text;
  v_is_staff boolean := false;
  v_child_ids uuid[];
  v_child_statuses jsonb := '{}'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object(
      'mosque', null, 'program', null, 'details', null, 'outcomes', '[]'::jsonb,
      'contentSections', '[]'::jsonb, 'faqs', '[]'::jsonb, 'mediaItems', '[]'::jsonb,
      'tracks', '[]'::jsonb, 'accountType', null, 'childStatuses', '{}'::jsonb,
      'requestStatus', null, 'isEnrolled', false, 'isStaffForProgram', false,
      'enrolledCount', null, 'enrolledCountByTrackId', '{}'::jsonb, 'error', null
    );
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;

  if v_program.id is null then
    return jsonb_build_object(
      'mosque', to_jsonb(v_mosque), 'program', null, 'details', null, 'outcomes', '[]'::jsonb,
      'contentSections', '[]'::jsonb, 'faqs', '[]'::jsonb, 'mediaItems', '[]'::jsonb,
      'tracks', '[]'::jsonb, 'accountType', null, 'childStatuses', '{}'::jsonb,
      'requestStatus', null, 'isEnrolled', false, 'isStaffForProgram', false,
      'enrolledCount', null, 'enrolledCountByTrackId', '{}'::jsonb, 'error', null
    );
  end if;

  if p_section = 'public' and coalesce(v_program.publication_status, 'published') not in ('published', 'hidden') then
    return jsonb_build_object(
      'mosque', to_jsonb(v_mosque), 'program', null, 'details', null, 'outcomes', '[]'::jsonb,
      'contentSections', '[]'::jsonb, 'faqs', '[]'::jsonb, 'mediaItems', '[]'::jsonb,
      'tracks', '[]'::jsonb, 'accountType', null, 'childStatuses', '{}'::jsonb,
      'requestStatus', null, 'isEnrolled', false, 'isStaffForProgram', false,
      'enrolledCount', null, 'enrolledCountByTrackId', '{}'::jsonb,
      'error', 'This class is not published yet.'
    );
  end if;

  v_teacher_id := coalesce(v_program.director_profile_id, v_program.teacher_profile_id);
  if v_teacher_id is not null then
    select to_jsonb(t) into v_teacher
    from (
      select id, full_name, avatar_url, teacher_credentials, teacher_whatsapp_number
      from public.profiles
      where id = v_teacher_id
    ) t;
  end if;

  select to_jsonb(d) into v_details from public.program_details d where d.program_id = v_program.id limit 1;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.sort_order), '[]'::jsonb) into v_outcomes
    from public.program_outcomes o where o.program_id = v_program.id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb) into v_content
    from public.program_content_sections c where c.program_id = v_program.id;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order), '[]'::jsonb) into v_faqs
    from public.program_faqs f where f.program_id = v_program.id;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order), '[]'::jsonb) into v_media
    from public.program_media m where m.program_id = v_program.id;
  select coalesce(jsonb_agg(to_jsonb(tr) order by tr.sort_order), '[]'::jsonb) into v_tracks
    from public.program_tracks tr where tr.program_id = v_program.id and tr.is_active = true;

  select array_agg(e.id) into v_active_enrollment_ids
    from public.enrollments e where e.program_id = v_program.id and e.status = 'active';
  v_enrolled_count := coalesce(array_length(v_active_enrollment_ids, 1), 0);

  if v_active_enrollment_ids is not null then
    select coalesce(jsonb_object_agg(et.program_track_id, et.cnt), '{}'::jsonb) into v_track_counts
    from (
      select program_track_id, count(*) as cnt
      from public.enrollment_tracks
      where enrollment_id = any(v_active_enrollment_ids)
      group by program_track_id
    ) et;
  end if;

  v_result := jsonb_build_object(
    'mosque', to_jsonb(v_mosque),
    'program', to_jsonb(v_program) || jsonb_build_object('teacher', v_teacher),
    'details', v_details,
    'outcomes', v_outcomes,
    'contentSections', v_content,
    'faqs', v_faqs,
    'mediaItems', v_media,
    'tracks', v_tracks,
    'enrolledCount', v_enrolled_count,
    'enrolledCountByTrackId', v_track_counts,
    'accountType', null,
    'childStatuses', '{}'::jsonb,
    'requestStatus', null,
    'isEnrolled', false,
    'isStaffForProgram', false,
    'error', null
  );

  if v_user_id is null then
    return v_result;
  end if;

  select p.account_type into v_account_type from public.profiles p where p.id = v_user_id;
  if v_account_type is null then
    v_account_type := auth.jwt() -> 'user_metadata' ->> 'account_type';
  end if;

  select status into v_enrollment_status
    from public.enrollments
    where program_id = v_program.id and student_profile_id = v_user_id
    limit 1;
  v_is_enrolled := v_enrollment_status is not null
    and lower(coalesce(v_enrollment_status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled');

  select status into v_request_status
    from public.enrollment_requests
    where program_id = v_program.id and student_profile_id = v_user_id and student_dismissed_at is null
    order by requested_at desc
    limit 1;

  v_is_staff := exists (
    select 1 from public.program_teachers where program_id = v_program.id and teacher_profile_id = v_user_id
  ) or v_program.director_profile_id = v_user_id;

  if not v_is_staff and lower(coalesce(v_account_type, '')) = 'admin' then
    select exists (
      select 1 from public.mosque_memberships
      where mosque_id = v_mosque.id and profile_id = v_user_id and role = 'admin' and status = 'active'
    ) into v_is_mosque_admin;
    v_is_staff := v_is_mosque_admin;
  end if;

  v_result := v_result
    || jsonb_build_object('accountType', v_account_type)
    || jsonb_build_object('isEnrolled', v_is_enrolled)
    || jsonb_build_object('requestStatus', v_request_status)
    || jsonb_build_object('isStaffForProgram', v_is_staff);

  if lower(coalesce(v_account_type, '')) = 'parent' then
    select array_agg(child_profile_id) into v_child_ids
    from public.parent_child_links
    where parent_profile_id = v_user_id and mosque_id = v_mosque.id;

    if v_child_ids is not null and array_length(v_child_ids, 1) > 0 then
      select coalesce(
        jsonb_object_agg(
          child_id,
          jsonb_build_object(
            'enrolled', coalesce(enrolled_map.enrolled, false),
            'requestStatus', request_map.status
          )
        ),
        '{}'::jsonb
      ) into v_child_statuses
      from unnest(v_child_ids) as child_id
      left join (
        select student_profile_id, bool_or(lower(coalesce(status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')) as enrolled
        from public.enrollments
        where program_id = v_program.id and student_profile_id = any(v_child_ids)
        group by student_profile_id
      ) enrolled_map on enrolled_map.student_profile_id = child_id
      left join lateral (
        select status
        from public.enrollment_requests
        where program_id = v_program.id
          and parent_profile_id = v_user_id
          and student_profile_id = child_id
          and student_dismissed_at is null
        order by requested_at desc
        limit 1
      ) request_map on true;

      v_result := v_result || jsonb_build_object('childStatuses', v_child_statuses);
    end if;
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_program_detail_snapshot(text, uuid, text) to anon, authenticated;
