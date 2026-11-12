-- Badge queries return counts, not entire inbox histories. Invoker rights retain
-- the same RLS boundaries as the browser queries they replace.
create or replace function public.get_notification_counts(p_slug text, p_audience text)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_mosque uuid;
  v_parent boolean;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_audience not in ('student', 'teacher') or p_audience is null then
    raise exception 'Invalid notification audience.';
  end if;
  select id into v_mosque from public.mosques where slug = p_slug;
  select account_type = 'parent' into v_parent from public.profiles where id = v_user;

  if p_audience = 'student' then
    with targets as materialized (
      select child_profile_id as id from public.parent_child_links
        where mosque_id = v_mosque and parent_profile_id = v_user and coalesce(v_parent, false)
      union select v_user where not coalesce(v_parent, false)
    ), state as materialized (
      select notification_key from public.teacher_notification_state where user_id = v_user and seen_at is not null
    ), requests as materialized (
      select r.status, r.reviewed_at, (r.status = 'approved' and r.admission_completed_at is null) as needs_action,
        r.id::text || ':' || r.status || ':' || coalesce(to_jsonb(coalesce(r.reviewed_at, r.requested_at)) #>> '{}', '') as notification_key
      from public.enrollment_requests r
      where r.mosque_id = v_mosque and r.student_dismissed_at is null
        and case when coalesce(v_parent, false) then r.parent_profile_id = v_user else r.student_profile_id = v_user end
    ), enrollments as materialized (
      select e.* from public.enrollments e join public.programs p on p.id = e.program_id
      where e.student_profile_id in (select id from targets) and p.mosque_id = v_mosque
        and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
    ), visible_announcements as (
      select a.id from public.program_announcements a
      where a.deleted_at is null and exists (
        select 1 from enrollments e where e.program_id = a.program_id
      ) and a.created_at >= (select min(e.created_at) from enrollments e where e.program_id = a.program_id)
      and (
        coalesce(cardinality(a.target_program_track_ids), 0) = 0
        or not exists (
          select 1 from enrollments e where e.program_id = a.program_id and (e.program_track_id is not null
            or exists (select 1 from public.enrollment_tracks t where t.enrollment_id = e.id))
        )
        or exists (
          select 1 from enrollments e where e.program_id = a.program_id and (
            e.program_track_id = any(a.target_program_track_ids)
            or exists (select 1 from public.enrollment_tracks t where t.enrollment_id = e.id and t.program_track_id = any(a.target_program_track_ids))
          )
        )
      )
    )
    select jsonb_build_object(
      'announcementCount', (select count(*) from visible_announcements a where not exists (
        select 1 from public.program_announcement_receipts r where r.announcement_id = a.id and r.profile_id = v_user
          and (r.read_at is not null or r.dismissed_at is not null)
      )),
      'noteCount', (select count(*) from public.program_student_notes n where n.mosque_id = v_mosque
        and n.student_profile_id in (select id from targets) and n.seen_at is null),
      'requestCount', (select count(*) from requests r where (r.status <> 'pending' or r.reviewed_at is not null)
        and (r.needs_action or not exists (select 1 from state s where s.notification_key = r.notification_key)))
        + (select count(*) from public.withdrawal_requests w where w.mosque_id = v_mosque and w.student_dismissed_at is null
          and case when coalesce(v_parent, false) then w.parent_profile_id = v_user or w.requested_by = v_user else w.student_profile_id = v_user end
          and not exists (select 1 from state s where s.notification_key = 'withdrawal:' || w.id::text || ':' || w.status || ':' || coalesce(to_jsonb(coalesce(w.reviewed_at, w.requested_at)) #>> '{}', ''))),
      'actionRequired', exists(select 1 from requests where needs_action)
    ) into v_result;
  else
    with programs as materialized (
      select p.id,
        coalesce(p.director_profile_id, p.teacher_profile_id) = v_user or exists (
          select 1 from public.program_teachers t where t.program_id = p.id and t.teacher_profile_id = v_user and t.role = 'director'
        ) as director
      from public.programs p where p.mosque_id = v_mosque and p.is_active = true and (
        coalesce(p.director_profile_id, p.teacher_profile_id) = v_user or exists (
          select 1 from public.program_teachers t where t.program_id = p.id and t.teacher_profile_id = v_user
            and (t.role = 'director' or t.can_view_applications or t.can_decide_applications)
        )
      )
    ), state as materialized (
      select notification_key, seen_at, dismissed_at from public.teacher_notification_state where user_id = v_user
    ), requests as materialized (
      select r.status, r.admission_completed_at, case when r.admission_completed_at is not null
        then 'admission-complete:' || r.id::text || ':' || (to_jsonb(r.admission_completed_at) #>> '{}')
        else 'application:' || r.id::text || ':' || coalesce(to_jsonb(r.requested_at) #>> '{}', '') end as notification_key
      from public.enrollment_requests r where r.program_id in (select id from programs) and r.teacher_dismissed_at is null
    ), withdrawals as materialized (
      select 'withdrawal:' || w.id::text || ':' || w.status || ':' || coalesce(to_jsonb(coalesce(w.reviewed_at, w.requested_at)) #>> '{}', '') as notification_key
      from public.withdrawal_requests w where w.program_id in (select id from programs where director)
        and w.status = 'pending' and w.teacher_dismissed_at is null
    ), instructor_events as materialized (
      select e.* from public.program_instructor_events e where e.program_id in (select id from programs where director)
    ), instructors as (
      select 'instructor:' || case when event_type = 'resigned' then 'resigned' else 'joined' end || ':' || id::text || ':' || coalesce(teacher_profile_id::text, '') as notification_key
      from instructor_events
      union all
      select 'instructor:joined:' || t.id::text || ':' || t.teacher_profile_id::text
      from public.program_teachers t where t.program_id in (select id from programs where director)
        and t.role = 'instructor' and t.teacher_profile_id is not null
        and not exists (select 1 from instructor_events e where e.event_type = 'joined' and e.assignment_id = t.id)
    ), switches as materialized (
      select t.status, 'track-switch:' || t.id::text || ':' || t.status || ':' || coalesce(to_jsonb(t.requested_at) #>> '{}', '') as notification_key
      from public.program_track_switch_requests t where t.program_id in (select id from programs where director)
    )
    select jsonb_build_object(
      'announcementCount', 0, 'noteCount', 0,
      'requestCount', (select count(*) from requests r where (r.admission_completed_at is not null or r.status = 'pending')
        and not exists (select 1 from state s where s.notification_key = r.notification_key and s.seen_at is not null))
        + (select count(*) from withdrawals w where not exists (select 1 from state s where s.notification_key = w.notification_key and s.seen_at is not null))
        + (select count(*) from instructors i where not exists (select 1 from state s where s.notification_key = i.notification_key and (s.seen_at is not null or s.dismissed_at is not null)))
        + (select count(*) from switches t where not exists (select 1 from state s where s.notification_key = t.notification_key and s.seen_at is not null)),
      'actionRequired', exists(select 1 from requests where status = 'pending') or exists(select 1 from withdrawals) or exists(select 1 from switches where status = 'pending')
    ) into v_result;
  end if;
  return v_result;
end;
$$;
revoke all on function public.get_notification_counts(text, text) from public, anon;
grant execute on function public.get_notification_counts(text, text) to authenticated;
