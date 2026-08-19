-- Collapses loadInbox()'s waterfall (mosque -> profile -> children -> [enrollments+requests+
-- withdrawals] -> enrollment_tracks -> notes -> [8-way hydration batch] -> [note author/
-- recipient batch] -> announcements -> [author/receipt batch]) into one call. This also fixes
-- two genuine N+1 bugs: notes were fetched with one round-trip PER enrolled (program, student)
-- pair, and announcements with one round-trip PER enrolled program. Both are now a single
-- query each; the "keep the newest 25 per thread" trimming that used to be a per-thread SQL
-- LIMIT moves to TypeScript instead (same result, far lower risk than a window-function
-- rewrite for a query this size). Raw rows only -- all hydration/mapping logic is unchanged.
create or replace function public.get_student_inbox_snapshot(p_slug text)
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
  v_is_parent boolean := false;
  v_child_ids uuid[];
  v_children jsonb := '[]'::jsonb;
  v_target_student_ids uuid[];
  v_enrollments jsonb := '[]'::jsonb;
  v_enrollment_ids uuid[];
  v_enrollment_tracks jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_known_program_ids uuid[];
  v_request_student_ids uuid[];
  v_note_student_ids uuid[];
  v_request_ids uuid[];
  v_request_parent_ids uuid[];
  v_request_reviewer_ids uuid[];
  v_programs jsonb := '[]'::jsonb;
  v_request_students jsonb := '[]'::jsonb;
  v_note_students jsonb := '[]'::jsonb;
  v_request_parents jsonb := '[]'::jsonb;
  v_request_reviewers jsonb := '[]'::jsonb;
  v_request_track_links jsonb := '[]'::jsonb;
  v_program_tracks jsonb := '[]'::jsonb;
  v_request_subscriptions jsonb := '[]'::jsonb;
  v_note_author_ids uuid[];
  v_note_recipient_ids uuid[];
  v_note_authors jsonb := '[]'::jsonb;
  v_note_recipients jsonb := '[]'::jsonb;
  v_enrolled_program_ids uuid[];
  v_announcements jsonb := '[]'::jsonb;
  v_announcement_ids uuid[];
  v_announcement_author_ids uuid[];
  v_announcement_authors jsonb := '[]'::jsonb;
  v_announcement_receipts jsonb := '[]'::jsonb;
  v_empty jsonb;
begin
  v_empty := jsonb_build_object(
    'error', null, 'profile', null, 'accountType', null, 'requests', '[]'::jsonb,
    'withdrawals', '[]'::jsonb, 'notes', '[]'::jsonb, 'programs', '[]'::jsonb,
    'requestStudents', '[]'::jsonb, 'noteStudents', '[]'::jsonb, 'requestParents', '[]'::jsonb,
    'requestReviewers', '[]'::jsonb, 'requestTrackLinks', '[]'::jsonb, 'programTracks', '[]'::jsonb,
    'requestSubscriptions', '[]'::jsonb, 'noteAuthors', '[]'::jsonb, 'noteRecipients', '[]'::jsonb,
    'announcements', '[]'::jsonb, 'announcementAuthors', '[]'::jsonb, 'announcementReceipts', '[]'::jsonb,
    'children', '[]'::jsonb, 'enrolledTrackIdsByProgramId', '{}'::jsonb, 'enrolledJoinDatesByProgramId', '{}'::jsonb
  );

  if v_user_id is null then
    return v_empty;
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return v_empty;
  end if;

  select to_jsonb(p) into v_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;
  v_is_parent := lower(coalesce(v_account_type, '')) = 'parent';

  if v_is_parent then
    select array_agg(child_profile_id) into v_child_ids
      from public.parent_child_links where parent_profile_id = v_user_id and mosque_id = v_mosque_id;
    if v_child_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_children
        from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_child_ids)) c;
    end if;
    v_target_student_ids := coalesce(v_child_ids, array[]::uuid[]);
  else
    v_target_student_ids := array[v_user_id];
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_enrollments
    from (select id, program_id, student_profile_id, program_track_id, created_at, status from public.enrollments where student_profile_id = any(v_target_student_ids)) e;

  if v_is_parent then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
      from public.enrollment_requests r where r.mosque_id = v_mosque_id and r.parent_profile_id = v_user_id and r.student_dismissed_at is null;
    select coalesce(jsonb_agg(to_jsonb(w) order by w.requested_at desc), '[]'::jsonb) into v_withdrawals
      from public.withdrawal_requests w where w.mosque_id = v_mosque_id and (w.parent_profile_id = v_user_id or w.requested_by = v_user_id) and w.student_dismissed_at is null;
  else
    select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb) into v_requests
      from public.enrollment_requests r where r.mosque_id = v_mosque_id and r.student_profile_id = v_user_id and r.student_dismissed_at is null;
    select coalesce(jsonb_agg(to_jsonb(w) order by w.requested_at desc), '[]'::jsonb) into v_withdrawals
      from public.withdrawal_requests w where w.mosque_id = v_mosque_id and w.student_profile_id = v_user_id and w.student_dismissed_at is null;
  end if;

  select array_agg(id) into v_enrollment_ids from public.enrollments where student_profile_id = any(v_target_student_ids);
  if v_enrollment_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(et)), '[]'::jsonb) into v_enrollment_tracks
      from (select enrollment_id, program_track_id from public.enrollment_tracks where enrollment_id = any(v_enrollment_ids)) et;
  end if;

  -- Notes: one query for every (program, student) pair the target students are ACTIVELY
  -- enrolled in -- matches the exact set the old per-thread loop fetched, just in one call.
  select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) into v_notes
    from public.program_student_notes n
    where exists (
      select 1 from public.enrollments e
      where e.program_id = n.program_id and e.student_profile_id = n.student_profile_id
        and e.student_profile_id = any(v_target_student_ids)
        and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
    );

  select array_agg(distinct id) into v_known_program_ids
    from (
      select program_id as id from public.enrollments where student_profile_id = any(v_target_student_ids)
        and lower(coalesce(status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
      union
      select program_id from public.enrollment_requests where mosque_id = v_mosque_id and student_dismissed_at is null
        and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end)
      union
      select program_id from public.withdrawal_requests where mosque_id = v_mosque_id and student_dismissed_at is null
        and (case when v_is_parent then (parent_profile_id = v_user_id or requested_by = v_user_id) else student_profile_id = v_user_id end)
      union
      select program_id from public.program_student_notes n
      where exists (
        select 1 from public.enrollments e
        where e.program_id = n.program_id and e.student_profile_id = n.student_profile_id
          and e.student_profile_id = any(v_target_student_ids)
          and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
      )
    ) x;

  if v_known_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_programs from public.programs p where p.id = any(v_known_program_ids);
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb) into v_program_tracks
      from public.program_tracks t where t.program_id = any(v_known_program_ids) and t.is_active = true;
  end if;

  select array_agg(distinct student_profile_id) into v_request_student_ids
    from (
      select student_profile_id from public.enrollment_requests where mosque_id = v_mosque_id and student_dismissed_at is null
        and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end)
      union
      select student_profile_id from public.withdrawal_requests where mosque_id = v_mosque_id and student_dismissed_at is null
        and (case when v_is_parent then (parent_profile_id = v_user_id or requested_by = v_user_id) else student_profile_id = v_user_id end)
    ) x;

  select array_agg(distinct student_profile_id) into v_note_student_ids
    from public.program_student_notes n
    where exists (
      select 1 from public.enrollments e
      where e.program_id = n.program_id and e.student_profile_id = n.student_profile_id
        and e.student_profile_id = any(v_target_student_ids)
        and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
    );

  select array_agg(id) into v_request_ids from public.enrollment_requests where mosque_id = v_mosque_id and student_dismissed_at is null
    and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);
  select array_agg(distinct parent_profile_id) into v_request_parent_ids from public.enrollment_requests where mosque_id = v_mosque_id and student_dismissed_at is null and parent_profile_id is not null
    and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);
  select array_agg(distinct reviewed_by) into v_request_reviewer_ids from public.enrollment_requests where mosque_id = v_mosque_id and student_dismissed_at is null and reviewed_by is not null
    and (case when v_is_parent then parent_profile_id = v_user_id else student_profile_id = v_user_id end);

  if v_request_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_request_students
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_request_student_ids)) p;
    if v_known_program_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_request_subscriptions
        from public.program_subscriptions s where s.program_id = any(v_known_program_ids) and s.student_profile_id = any(v_request_student_ids);
    end if;
  end if;

  if v_note_student_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_note_students
      from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = any(v_note_student_ids)) p;
  end if;

  if v_request_parent_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_request_parents
      from (select id, full_name, email, phone_number, avatar_url from public.profiles where id = any(v_request_parent_ids)) p;
  end if;

  if v_request_reviewer_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_request_reviewers from public.profiles p where p.id = any(v_request_reviewer_ids);
  end if;

  if v_request_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_request_track_links
      from public.enrollment_request_tracks l where l.enrollment_request_id = any(v_request_ids);
  end if;

  select array_agg(distinct author_profile_id) into v_note_author_ids from public.program_student_notes n where author_profile_id is not null and exists (
    select 1 from public.enrollments e where e.program_id = n.program_id and e.student_profile_id = n.student_profile_id
      and e.student_profile_id = any(v_target_student_ids)
      and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
  );
  select array_agg(distinct recipient_profile_id) into v_note_recipient_ids from public.program_student_notes n where recipient_profile_id is not null and exists (
    select 1 from public.enrollments e where e.program_id = n.program_id and e.student_profile_id = n.student_profile_id
      and e.student_profile_id = any(v_target_student_ids)
      and lower(coalesce(e.status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled')
  );
  if v_note_author_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_note_authors from public.profiles p where p.id = any(v_note_author_ids);
  end if;
  if v_note_recipient_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_note_recipients from public.profiles p where p.id = any(v_note_recipient_ids);
  end if;

  -- Announcements: one query for every actively-enrolled program instead of one round-trip
  -- per program; TypeScript keeps only the newest 25 per program, same as the old per-thread LIMIT.
  select array_agg(distinct program_id) into v_enrolled_program_ids
    from public.enrollments where student_profile_id = any(v_target_student_ids)
      and lower(coalesce(status, 'active')) not in ('kicked', 'withdrawn', 'inactive', 'cancelled', 'canceled');

  if v_enrolled_program_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) into v_announcements
      from public.program_announcements a where a.program_id = any(v_enrolled_program_ids);

    select array_agg(id) into v_announcement_ids from public.program_announcements where program_id = any(v_enrolled_program_ids);
    select array_agg(distinct author_profile_id) into v_announcement_author_ids from public.program_announcements where program_id = any(v_enrolled_program_ids) and author_profile_id is not null;

    if v_announcement_author_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_announcement_authors from public.profiles p where p.id = any(v_announcement_author_ids);
    end if;
    if v_announcement_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_announcement_receipts
        from public.program_announcement_receipts r where r.profile_id = v_user_id and r.announcement_id = any(v_announcement_ids);
    end if;
  end if;

  return jsonb_build_object(
    'error', null,
    'profile', v_profile,
    'accountType', v_account_type,
    'children', v_children,
    'enrollments', v_enrollments,
    'enrollmentTracks', v_enrollment_tracks,
    'requests', v_requests,
    'withdrawals', v_withdrawals,
    'notes', v_notes,
    'programs', v_programs,
    'requestStudents', v_request_students,
    'noteStudents', v_note_students,
    'requestParents', v_request_parents,
    'requestReviewers', v_request_reviewers,
    'requestTrackLinks', v_request_track_links,
    'programTracks', v_program_tracks,
    'requestSubscriptions', v_request_subscriptions,
    'noteAuthors', v_note_authors,
    'noteRecipients', v_note_recipients,
    'announcements', v_announcements,
    'announcementAuthors', v_announcement_authors,
    'announcementReceipts', v_announcement_receipts
  );
end;
$$;

grant execute on function public.get_student_inbox_snapshot(text) to authenticated;
