


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."approve_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_id uuid := auth.uid();
  req record;
begin
  if actor_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into req from public.program_track_switch_requests where id = target_request_id;
  if req.id is null then
    raise exception 'Switch request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request has already been decided';
  end if;
  if not public.can_manage_program(req.program_id, actor_id) then
    raise exception 'Not authorized to manage this class';
  end if;

  delete from public.enrollment_tracks where enrollment_id = req.enrollment_id;
  insert into public.enrollment_tracks (enrollment_id, program_track_id)
  select req.enrollment_id, track_id from unnest(req.to_track_ids) as track_id;

  update public.enrollments
  set program_track_id = req.to_track_ids[1]
  where id = req.enrollment_id;

  update public.program_track_switch_requests
  set status = 'approved', decided_at = now(), decided_by = actor_id, decision_note = decision_note_text
  where id = target_request_id;
end;
$$;


ALTER FUNCTION "public"."approve_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_announce_program"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1 from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_announce))
  );
$$;


ALTER FUNCTION "public"."can_announce_program"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_create_program_in_mosque"("check_mosque_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.has_mosque_role(check_mosque_id, array['admin'], check_profile_id)
  or exists (
    select 1
    from public.profiles p
    join public.mosque_memberships mm on mm.profile_id = p.id
    where mm.mosque_id = check_mosque_id
      and mm.profile_id = check_profile_id
      and mm.role = 'teacher'
      and mm.status = 'active'
      and mm.can_create_programs = true
      and p.account_type = 'teacher'
  );
$$;


ALTER FUNCTION "public"."can_create_program_in_mosque"("check_mosque_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_decide_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (
        pt.role = 'director'
        or (pt.role = 'instructor' and pt.can_decide_applications = true)
      )
  );
$$;


ALTER FUNCTION "public"."can_decide_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_program_details"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (
        pt.role = 'director'
        or (pt.role = 'instructor' and pt.can_edit_class = true)
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_program_details"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_parent_profile"("check_parent_profile_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.parent_child_links pcl
    join public.enrollments e on e.student_profile_id = pcl.child_profile_id
    where pcl.parent_profile_id = check_parent_profile_id
      and public.can_manage_program(e.program_id, check_profile_id)
  )
  or exists (
    select 1
    from public.parent_child_links pcl
    join public.enrollment_requests er on er.student_profile_id = pcl.child_profile_id
    where pcl.parent_profile_id = check_parent_profile_id
      and public.can_manage_program(er.program_id, check_profile_id)
  );
$$;


ALTER FUNCTION "public"."can_manage_parent_profile"("check_parent_profile_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_program"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_program_director(check_program_id, check_profile_id);
$$;


ALTER FUNCTION "public"."can_manage_program"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_program_enrollments"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_manage_enrollments))
  );
$$;


ALTER FUNCTION "public"."can_manage_program_enrollments"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_program_finances"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_program_director(check_program_id, check_profile_id)
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and pt.can_manage_finances = true
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  );
$$;


ALTER FUNCTION "public"."can_manage_program_finances"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select auth.uid() is not null and exists (
    select 1 from public.enrollment_requests er
    where (er.student_profile_id = check_profile_id or er.parent_profile_id = check_profile_id)
      and (public.can_view_program_applications(er.program_id, auth.uid())
        or public.can_decide_program_applications(er.program_id, auth.uid()))
  );
$$;


ALTER FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_program_direct_invitations"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.programs p
    join public.mosque_memberships mm
      on mm.mosque_id = p.mosque_id
     and mm.profile_id = check_profile_id
     and mm.status = 'active'
    where p.id = check_program_id
      and mm.role = 'admin'
  ) or exists (
    select 1
    from public.program_teachers pt
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and (
        pt.role = 'director'
        or (pt.role = 'instructor' and pt.can_send_direct_invitations = true)
      )
  );
$$;


ALTER FUNCTION "public"."can_send_program_direct_invitations"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_child_guardian_link"("check_child_profile_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.enrollment_requests er
    where er.student_profile_id = check_child_profile_id
      and public.can_manage_program(er.program_id, check_profile_id)
  )
  or exists (
    select 1
    from public.enrollments e
    where e.student_profile_id = check_child_profile_id
      and public.can_manage_program(e.program_id, check_profile_id)
  );
$$;


ALTER FUNCTION "public"."can_view_child_guardian_link"("check_child_profile_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1 from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and (pt.can_view_applications or pt.can_decide_applications)))
  );
$$;


ALTER FUNCTION "public"."can_view_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_program_student_records"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(check_profile_id)
  or exists (
    select 1 from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
      and (pt.role = 'director' or (pt.role = 'instructor' and pt.can_view_student_records))
  );
$$;


ALTER FUNCTION "public"."can_view_program_student_records"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_program_instructor_code"("invite" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  normalized_invite text := upper(trim(invite));
  target_program_id uuid;
  target_mosque_id uuid;
  target_assignment_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = current_profile_id
      and p.account_type = 'teacher'
  ) then
    raise exception 'Only teacher accounts can use instructor codes';
  end if;

  select pt.program_id, p.mosque_id
  into target_program_id, target_mosque_id
  from public.program_teachers pt
  join public.programs p on p.id = pt.program_id
  where pt.invite_code = normalized_invite
    and pt.role = 'instructor'
    and pt.teacher_profile_id is null
  limit 1;

  if target_program_id is null then
    raise exception 'Invalid or already used instructor code';
  end if;

  if not public.has_verified_teacher_membership(target_mosque_id, current_profile_id) then
    raise exception 'A teacher account for this masjid is required before joining a class';
  end if;

  if exists (
    select 1
    from public.programs p
    where p.id = target_program_id
      and (
        p.director_profile_id = current_profile_id
        or p.teacher_profile_id = current_profile_id
      )
  )
  or exists (
    select 1
    from public.program_teachers existing
    where existing.program_id = target_program_id
      and existing.teacher_profile_id = current_profile_id
      and existing.role in ('director', 'instructor')
  ) then
    raise exception 'You are already a teacher for this class';
  end if;

  update public.program_teachers pt
  set teacher_profile_id = current_profile_id
  where pt.program_id = target_program_id
    and pt.role = 'instructor'
    and pt.invite_code = normalized_invite
    and pt.teacher_profile_id is null
  returning pt.id into target_assignment_id;

  if target_assignment_id is null then
    raise exception 'Invalid or already used instructor code';
  end if;

  insert into public.program_instructor_events (program_id, assignment_id, teacher_profile_id, event_type)
  values (target_program_id, target_assignment_id, current_profile_id, 'joined');

  return target_program_id;
end;
$$;


ALTER FUNCTION "public"."claim_program_instructor_code"("invite" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_program_student_invite_code"("invite" "text", "target_student_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  normalized_invite text := upper(trim(invite));
  inv public.program_student_invites%rowtype;
  target_mosque_id uuid;
  program_monthly_cents integer;
  program_annual_cents integer;
  result_request_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_student_profile_id <> current_profile_id and not exists (
    select 1 from public.parent_child_links pcl
    where pcl.parent_profile_id = current_profile_id
      and pcl.child_profile_id = target_student_profile_id
  ) then
    raise exception 'Not authorized to register this student';
  end if;

  select psi.* into inv
  from public.program_student_invites psi
  where psi.invite_code = normalized_invite
    and psi.claimed_at is null
  limit 1;

  if inv.id is null then
    raise exception 'Invalid or already used registration code';
  end if;

  select p.mosque_id, p.price_monthly_cents, p.price_annual_cents
  into target_mosque_id, program_monthly_cents, program_annual_cents
  from public.programs p
  where p.id = inv.program_id;

  insert into public.enrollment_requests (
    mosque_id, program_id, student_profile_id, parent_profile_id,
    status, requested_at, reviewed_by, reviewed_at, review_note, decision_note,
    payment_type, approved_price_monthly_cents, approved_price_annual_cents,
    payment_bypassed, payment_bypass_external
  )
  values (
    target_mosque_id, inv.program_id, target_student_profile_id,
    case when target_student_profile_id <> current_profile_id then current_profile_id else null end,
    'approved', now(), inv.created_by, now(), inv.comment, inv.comment,
    inv.payment_type,
    case
      when inv.payment_bypassed then 0
      when inv.payment_type = 'monthly' then coalesce(inv.custom_price_monthly_cents, program_monthly_cents)
      else null
    end,
    case
      when inv.payment_bypassed then 0
      when inv.payment_type = 'annual' then coalesce(inv.custom_price_annual_cents, program_annual_cents)
      else null
    end,
    inv.payment_bypassed, inv.payment_bypass_external
  )
  on conflict (program_id, student_profile_id)
  do update set
    status = 'approved',
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    decision_note = excluded.decision_note,
    payment_type = excluded.payment_type,
    approved_price_monthly_cents = excluded.approved_price_monthly_cents,
    approved_price_annual_cents = excluded.approved_price_annual_cents,
    payment_bypassed = excluded.payment_bypassed,
    payment_bypass_external = excluded.payment_bypass_external,
    admission_completed_at = null,
    teacher_dismissed_at = null
  returning id into result_request_id;

  update public.program_student_invites
  set claimed_by_profile_id = target_student_profile_id, claimed_at = now()
  where id = inv.id;

  return result_request_id;
end;
$$;


ALTER FUNCTION "public"."claim_program_student_invite_code"("invite" "text", "target_student_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_oauth_profile"("signup_account_type" "text", "signup_full_name" "text", "signup_phone" "text", "signup_gender" "text", "signup_date_of_birth" "date", "signup_mosque_slug" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  target_mosque_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.validate_signup_profile_details(signup_account_type, signup_gender, signup_date_of_birth);

  select id
  into target_mosque_id
  from public.mosques
  where slug = signup_mosque_slug
  limit 1;

  if target_mosque_id is null then
    raise exception 'Masjid not found';
  end if;

  update public.profiles
  set
    full_name = coalesce(nullif(trim(signup_full_name), ''), full_name),
    phone_number = nullif(trim(signup_phone), ''),
    account_type = signup_account_type,
    gender = case when signup_account_type in ('student', 'parent') then nullif(signup_gender, '') else null end,
    date_of_birth = case when signup_account_type in ('student', 'parent') then signup_date_of_birth else null end,
    updated_at = now()
  where id = current_profile_id;

  if not found then
    insert into public.profiles (id, full_name, phone_number, account_type, gender, date_of_birth)
    values (
      current_profile_id,
      nullif(trim(signup_full_name), ''),
      nullif(trim(signup_phone), ''),
      signup_account_type,
      case when signup_account_type in ('student', 'parent') then nullif(signup_gender, '') else null end,
      case when signup_account_type in ('student', 'parent') then signup_date_of_birth else null end
    );
  end if;

  update public.mosque_memberships
  set status = 'active',
      teacher_approval_status = null,
      updated_at = now()
  where mosque_id = target_mosque_id
    and profile_id = current_profile_id
    and role = signup_account_type;

  if not found then
    insert into public.mosque_memberships (mosque_id, profile_id, role, status, teacher_approval_status)
    values (target_mosque_id, current_profile_id, signup_account_type, 'active', null);
  end if;
end;
$$;


ALTER FUNCTION "public"."complete_oauth_profile"("signup_account_type" "text", "signup_full_name" "text", "signup_phone" "text", "signup_gender" "text", "signup_date_of_birth" "date", "signup_mosque_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_parent_child_profile"("child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent_id uuid := auth.uid();
  child_id uuid := gen_random_uuid();
  target_mosque_id uuid;
begin
  if parent_id is null then
    raise exception 'Not authenticated';
  end if;

  select id
  into target_mosque_id
  from public.mosques
  where slug = child_mosque_slug
  limit 1;

  if target_mosque_id is null then
    raise exception 'Masjid not found';
  end if;

  if not public.has_mosque_role(target_mosque_id, array['parent'], parent_id) then
    raise exception 'Parent membership required';
  end if;

  insert into public.profiles (id, full_name, account_type, gender, date_of_birth)
  values (
    child_id,
    nullif(trim(child_full_name), ''),
    'student',
    nullif(child_gender, ''),
    child_date_of_birth
  );

  insert into public.parent_child_links (parent_profile_id, child_profile_id, mosque_id)
  values (parent_id, child_id, target_mosque_id);

  update public.mosque_memberships
  set status = 'active',
      updated_at = now()
  where mosque_id = target_mosque_id
    and profile_id = child_id
    and role = 'student';

  if not found then
    insert into public.mosque_memberships (mosque_id, profile_id, role, status)
    values (target_mosque_id, child_id, 'student', 'active');
  end if;

  return child_id;
end;
$$;


ALTER FUNCTION "public"."create_parent_child_profile"("child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_first_of_month_subscription_alignment"("target_subscription_id" "uuid", "target_period_start" timestamp with time zone, "target_period_end" timestamp with time zone, "target_status" "text", "target_paid_through" timestamp with time zone, "target_next_charge" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_row public.program_subscriptions;
begin
  select * into v_row from public.program_subscriptions where id = target_subscription_id for update;
  if v_row.id is null then raise exception 'Subscription record not found.'; end if;
  update public.program_subscriptions
  set current_period_start = target_period_start, current_period_end = target_period_end,
      status = target_status, updated_at = now()
  where id = target_subscription_id;
  if v_row.payment_terms_id is not null then
    update public.program_payment_terms
    set current_period_start = target_period_start, current_period_end = target_period_end, updated_at = now()
    where id = v_row.payment_terms_id;
  end if;
  insert into public.program_finance_audit_events(program_id, student_profile_id, actor_profile_id, event_type, summary, metadata)
  values (v_row.program_id, v_row.student_profile_id, null, 'billing_aligned_to_first_of_month',
    'Monthly billing was aligned to the first of the month without changing the already paid period.',
    jsonb_build_object('stripe_subscription_id', v_row.stripe_subscription_id, 'previous_paid_through', target_paid_through, 'next_charge', target_next_charge));
end;
$$;


ALTER FUNCTION "public"."finalize_first_of_month_subscription_alignment"("target_subscription_id" "uuid", "target_period_start" timestamp with time zone, "target_period_end" timestamp with time zone, "target_status" "text", "target_paid_through" timestamp with time zone, "target_next_charge" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_no_payment_program_enrollment"("p_enrollment_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests;
  v_program public.programs;
  v_terms public.program_payment_terms;
  v_enrollment_id uuid;
  v_track_ids uuid[];
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;

  select * into v_request from public.enrollment_requests where id = p_enrollment_request_id for update;
  if v_request.id is null or v_request.status <> 'approved' then
    raise exception 'Approved enrollment request required.';
  end if;
  select * into v_program from public.programs where id = v_request.program_id;
  if v_request.payment_terms_id is not null then
    select * into v_terms from public.program_payment_terms where id = v_request.payment_terms_id for update;
  end if;
  if v_program.is_paid
     and not coalesce(v_request.payment_bypassed, false)
     and coalesce(v_terms.payment_type, '') not in ('free', 'waived')
     and coalesce(v_terms.status, '') <> 'waived' then
    raise exception 'Payment or an explicit waiver is required.';
  end if;

  select coalesce(array_agg(program_track_id order by program_track_id), array[]::uuid[])
  into v_track_ids from public.enrollment_request_tracks where enrollment_request_id = v_request.id;
  if cardinality(v_track_ids) = 0 and v_request.program_track_id is not null then
    v_track_ids := array[v_request.program_track_id];
  end if;

  insert into public.enrollments (program_id, student_profile_id, program_track_id, status, created_at)
  values (v_request.program_id, v_request.student_profile_id, v_track_ids[1], 'active', v_now)
  on conflict (program_id, student_profile_id) do update set
    program_track_id = excluded.program_track_id, status = 'active', created_at = excluded.created_at
  returning id into v_enrollment_id;

  delete from public.enrollment_tracks where enrollment_id = v_enrollment_id;
  insert into public.enrollment_tracks (enrollment_id, program_track_id)
  select v_enrollment_id, unnest(v_track_ids);

  update public.enrollment_requests set admission_completed_at = coalesce(admission_completed_at, v_now),
    student_dismissed_at = coalesce(student_dismissed_at, v_now), teacher_dismissed_at = null
  where id = v_request.id;

  if v_terms.id is not null then
    update public.program_payment_terms set enrollment_id = v_enrollment_id,
      status = case when payment_type = 'waived' then 'waived' else 'active' end,
      updated_at = v_now where id = v_terms.id;
  end if;
  return jsonb_build_object('enrollmentId', v_enrollment_id, 'trackIds', to_jsonb(v_track_ids));
end;
$$;


ALTER FUNCTION "public"."finalize_no_payment_program_enrollment"("p_enrollment_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_paid_program_enrollment"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests;
  v_terms public.program_payment_terms;
  v_subscription_id uuid;
  v_enrollment_id uuid;
  v_track_ids uuid[];
  v_is_recurring boolean := coalesce((p_payload->>'isRecurring')::boolean, false);
  v_stripe_subscription_id text := nullif(p_payload->>'stripeSubscriptionId', '');
  v_stripe_payment_intent_id text := nullif(p_payload->>'stripePaymentIntentId', '');
  v_stripe_status text := nullif(p_payload->>'status', '');
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = (p_payload->>'enrollmentRequestId')::uuid
  for update;

  if v_request.id is null
     or v_request.program_id <> (p_payload->>'programId')::uuid
     or v_request.student_profile_id <> (p_payload->>'studentProfileId')::uuid
     or v_request.status <> 'approved' then
    raise exception 'Approved enrollment request does not match the checkout.';
  end if;

  if nullif(p_payload->>'paymentTermsId', '') is not null then
    select * into v_terms
    from public.program_payment_terms
    where id = (p_payload->>'paymentTermsId')::uuid
      and enrollment_request_id = v_request.id
      and program_id = v_request.program_id
      and student_profile_id = v_request.student_profile_id
    for update;
    if v_terms.id is null then
      raise exception 'Payment terms do not match the enrollment request.';
    end if;
  end if;

  if nullif(p_payload->>'stripeCheckoutSessionId', '') is null then
    raise exception 'A completed Stripe checkout session is required.';
  end if;
  if v_is_recurring and (v_stripe_subscription_id is null or v_stripe_status not in ('active', 'trialing', 'past_due')) then
    raise exception 'A valid Stripe subscription is required for recurring enrollment.';
  end if;
  if not v_is_recurring and v_stripe_payment_intent_id is null then
    raise exception 'A paid Stripe payment intent is required for one-time enrollment.';
  end if;

  select coalesce(array_agg(program_track_id order by program_track_id), array[]::uuid[])
  into v_track_ids
  from public.enrollment_request_tracks
  where enrollment_request_id = v_request.id;
  if cardinality(v_track_ids) = 0 and v_request.program_track_id is not null then
    v_track_ids := array[v_request.program_track_id];
  end if;

  insert into public.program_subscriptions (
    mosque_id, program_id, student_profile_id, parent_profile_id, program_track_id,
    enrollment_request_id, payment_terms_id, stripe_account_id, stripe_customer_id,
    stripe_subscription_id, stripe_subscription_schedule_id, stripe_checkout_session_id,
    stripe_price_id, payment_type, amount_cents, billing_months, currency, status,
    current_period_start, current_period_end, cancel_at_period_end, updated_at
  ) values (
    (p_payload->>'mosqueId')::uuid, v_request.program_id, v_request.student_profile_id,
    nullif(p_payload->>'parentProfileId', '')::uuid, v_track_ids[1], v_request.id, v_terms.id,
    nullif(p_payload->>'stripeAccountId', ''), nullif(p_payload->>'stripeCustomerId', ''),
    v_stripe_subscription_id, nullif(p_payload->>'stripeSubscriptionScheduleId', ''),
    p_payload->>'stripeCheckoutSessionId', nullif(p_payload->>'stripePriceId', ''),
    p_payload->>'paymentType', nullif(p_payload->>'amountCents', '')::integer,
    nullif(p_payload->>'billingMonths', '')::integer, coalesce(nullif(p_payload->>'currency', ''), 'cad'),
    v_stripe_status, nullif(p_payload->>'currentPeriodStart', '')::timestamptz,
    nullif(p_payload->>'currentPeriodEnd', '')::timestamptz,
    coalesce((p_payload->>'cancelAtPeriodEnd')::boolean, false), v_now
  )
  on conflict (program_id, student_profile_id) do update set
    parent_profile_id = excluded.parent_profile_id,
    program_track_id = excluded.program_track_id,
    enrollment_request_id = excluded.enrollment_request_id,
    payment_terms_id = excluded.payment_terms_id,
    stripe_account_id = excluded.stripe_account_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_subscription_schedule_id = excluded.stripe_subscription_schedule_id,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_price_id = excluded.stripe_price_id,
    payment_type = excluded.payment_type,
    amount_cents = excluded.amount_cents,
    billing_months = excluded.billing_months,
    currency = excluded.currency,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = excluded.updated_at
  returning id into v_subscription_id;

  delete from public.program_subscription_tracks where program_subscription_id = v_subscription_id;
  insert into public.program_subscription_tracks (program_subscription_id, program_track_id)
  select v_subscription_id, unnest(v_track_ids);

  insert into public.enrollments (program_id, student_profile_id, program_track_id, status, created_at)
  values (v_request.program_id, v_request.student_profile_id, v_track_ids[1], 'active', v_now)
  on conflict (program_id, student_profile_id) do update set
    program_track_id = excluded.program_track_id, status = 'active', created_at = excluded.created_at
  returning id into v_enrollment_id;

  delete from public.enrollment_tracks where enrollment_id = v_enrollment_id;
  insert into public.enrollment_tracks (enrollment_id, program_track_id)
  select v_enrollment_id, unnest(v_track_ids);

  update public.enrollment_requests set
    admission_completed_at = coalesce(admission_completed_at, v_now),
    student_dismissed_at = coalesce(student_dismissed_at, v_now),
    teacher_dismissed_at = null
  where id = v_request.id;

  if v_terms.id is not null then
    update public.program_payment_terms set
      enrollment_id = v_enrollment_id,
      status = case when v_is_recurring then 'active' else 'paid' end,
      stripe_customer_id = nullif(p_payload->>'stripeCustomerId', ''),
      stripe_checkout_session_id = p_payload->>'stripeCheckoutSessionId',
      stripe_subscription_id = v_stripe_subscription_id,
      stripe_subscription_schedule_id = nullif(p_payload->>'stripeSubscriptionScheduleId', ''),
      stripe_payment_intent_id = v_stripe_payment_intent_id,
      current_period_start = nullif(p_payload->>'currentPeriodStart', '')::timestamptz,
      current_period_end = nullif(p_payload->>'currentPeriodEnd', '')::timestamptz,
      updated_at = v_now
    where id = v_terms.id;
  end if;

  return jsonb_build_object('subscriptionId', v_subscription_id, 'enrollmentId', v_enrollment_id, 'trackIds', to_jsonb(v_track_ids));
end;
$$;


ALTER FUNCTION "public"."finalize_paid_program_enrollment"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_members_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_admin_members_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_programs_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_admin_programs_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_teacher_requests_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_admin_teacher_requests_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_applicant_applications_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_applicant_applications_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mosque_programs_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_mosque_programs_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_applications_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_mosque_id uuid;
  v_program public.programs;
  v_can_view boolean := false;
  v_can_decide boolean := false;
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
    return jsonb_build_object('error', 'Masjid not found.', 'program', null, 'canManage', false, 'canView', false, 'canDecide', false);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque_id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null, 'canManage', false, 'canView', false, 'canDecide', false);
  end if;

  select public.can_view_program_applications(p_program_id, auth.uid()) into v_can_view;
  if not v_can_view then
    return jsonb_build_object('error', null, 'program', to_jsonb(v_program), 'canManage', false, 'canView', false, 'canDecide', false, 'requests', '[]'::jsonb, 'tracks', '[]'::jsonb, 'subscriptions', '[]'::jsonb, 'auditEvents', '[]'::jsonb, 'switchRequests', '[]'::jsonb, 'profiles', '[]'::jsonb);
  end if;

  select public.can_decide_program_applications(p_program_id, auth.uid()) into v_can_decide;

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
    'canManage', v_can_view,
    'canView', v_can_view,
    'canDecide', v_can_decide,
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


ALTER FUNCTION "public"."get_program_applications_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_apply_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_program_apply_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_create_defaults_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_account_type text;
  v_mosque jsonb;
  v_mosque_id uuid;
  v_teacher_ids uuid[];
  v_teachers jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('profile', null, 'mosque', null, 'teachers', '[]'::jsonb);
  end if;

  select to_jsonb(p) into v_profile
    from (select full_name, phone_number, teacher_whatsapp_number, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;

  select id, to_jsonb(m) into v_mosque_id, v_mosque from public.mosques m where m.slug = p_slug limit 1;

  if lower(coalesce(v_account_type, '')) = 'admin' and v_mosque_id is not null then
    select array_agg(profile_id) into v_teacher_ids
      from public.mosque_memberships where mosque_id = v_mosque_id and role = 'teacher' and status = 'active';
    if v_teacher_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb) into v_teachers
        from (
          select id, full_name, email, phone_number, teacher_credentials, teacher_whatsapp_number
          from public.profiles where account_type = 'teacher' and id = any(v_teacher_ids)
        ) t;
    end if;
  end if;

  return jsonb_build_object('profile', v_profile, 'mosque', v_mosque, 'teachers', v_teachers);
end;
$$;


ALTER FUNCTION "public"."get_program_create_defaults_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_detail_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_section" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_program_detail_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_section" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_finance_analytics"("p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_program public.programs;
  v_months jsonb;
  v_transactions jsonb;
  v_current_month_start timestamptz := date_trunc('month', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton';
  v_launch_date date;
  v_reporting_end_date date;
begin
  select * into v_program from public.programs where id = p_program_id;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'hasAccess', false);
  end if;
  if not public.can_manage_program_finances(p_program_id, auth.uid()) then
    return jsonb_build_object('error', null, 'hasAccess', false);
  end if;
  v_launch_date := coalesce(v_program.start_date, v_program.created_at::date);
  v_reporting_end_date := least(coalesce(v_program.end_date, current_date), current_date);

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'amountCents', coalesce(amount_cents, 0)
  ) order by month_start), '[]'::jsonb)
  into v_months
  from (
    select series.month_start, sum(payments.amount_cents)::bigint as amount_cents
    from generate_series(
      date_trunc('year', v_launch_date::timestamp),
      date_trunc('year', v_reporting_end_date::timestamp) + interval '11 months', interval '1 month'
    ) series(month_start)
    left join public.program_payments payments
      on payments.program_id = p_program_id
      and payments.paid_at >= series.month_start
      and payments.paid_at < series.month_start + interval '1 month'
    group by series.month_start
  ) monthly;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payment.id, 'studentProfileId', payment.student_profile_id, 'studentName', profile.full_name, 'amountCents', payment.amount_cents,
    'currency', payment.currency, 'paidAt', payment.paid_at, 'receiptUrl', payment.receipt_url
  ) order by payment.paid_at desc), '[]'::jsonb)
  into v_transactions
  from public.program_payments payment
  left join public.profiles profile on profile.id = payment.student_profile_id
  where payment.program_id = p_program_id;

  return jsonb_build_object(
    'error', null,
    'hasAccess', true,
    'launchedAt', v_launch_date,
    'reportingEndsAt', v_reporting_end_date,
    'currency', coalesce((select currency from public.program_payments where program_id = p_program_id order by paid_at desc limit 1), 'cad'),
    'paymentRecordCount', (select count(*) from public.program_payments where program_id = p_program_id),
    'totalCollectedCents', coalesce((select sum(amount_cents) from public.program_payments where program_id = p_program_id), 0),
    'collectedThisMonthCents', coalesce((select sum(amount_cents) from public.program_payments where program_id = p_program_id and paid_at >= v_current_month_start), 0),
    'activeStudents', (select count(distinct student_profile_id) from public.enrollments where program_id = p_program_id and status = 'active'),
    'pendingApplications', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'pending'),
    'waitlistedStudents', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'waitlisted' and student_dismissed_at is null),
    'activePaidSubscriptions', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and stripe_subscription_id is not null and status in ('active', 'trialing', 'past_due')),
    'projectedMonthlyCents', coalesce((select sum(case when payment_type = 'monthly' then amount_cents when payment_type = 'annual' then round(amount_cents / 12.0)::integer else 0 end) from public.program_subscriptions where program_id = p_program_id and status in ('active', 'trialing', 'past_due') and not coalesce(payment_waived, false)), 0),
    'needsAttention', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and status in ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')),
    'waivedStudents', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and (payment_waived = true or payment_type = 'waived')),
    'monthlyRevenue', v_months,
    'transactions', v_transactions
  );
end;
$$;


ALTER FUNCTION "public"."get_program_finance_analytics"("p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_finances_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_program public.programs;
  v_has_access boolean := false;
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

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque_id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'program', null, 'hasAccess', false);
  end if;

  select public.can_manage_program_finances(p_program_id, v_user_id) into v_has_access;

  if not coalesce(v_has_access, false) then
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


ALTER FUNCTION "public"."get_program_finances_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_program_staff_snapshot"("p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_program_staff_snapshot"("p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_registration_confirmation_snapshot"("p_slug" "text", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_registration_confirmation_snapshot"("p_slug" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_enrollments_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_student_enrollments_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_inbox_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_student_inbox_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_schedule_options_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_student_schedule_options_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_withdrawal_options_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_student_withdrawal_options_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_announcements_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_teacher_announcements_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_inbox_snapshot"("p_slug" "text", "p_selected_program_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_teacher_inbox_snapshot"("p_slug" "text", "p_selected_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_programs_snapshot"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_teacher_programs_snapshot"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_roster_snapshot"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
  v_can_view_records boolean := false;
  v_can_view_applications boolean := false;
  v_can_decide_applications boolean := false;
  v_can_manage_finances boolean := false;
  v_can_manage_enrollments boolean := false;
  v_safe_profiles jsonb := '[]'::jsonb;
begin
  if not (
    public.is_platform_admin(auth.uid())
    or public.is_program_teacher(p_program_id, auth.uid())
    or exists (
      select 1 from public.programs p
      where p.id = p_program_id
        and public.has_mosque_role(p.mosque_id, array['admin'], auth.uid())
    )
  ) then
    return jsonb_build_object('error', 'You are not assigned to this class.', 'program', null);
  end if;

  v_result := public.get_teacher_roster_snapshot_unfiltered(p_slug, p_program_id);
  select public.can_view_program_student_records(p_program_id) into v_can_view_records;
  select public.can_view_program_applications(p_program_id) into v_can_view_applications;
  select public.can_decide_program_applications(p_program_id) into v_can_decide_applications;
  select public.can_manage_program_finances(p_program_id) into v_can_manage_finances;
  select public.can_manage_program_enrollments(p_program_id) into v_can_manage_enrollments;

  if not coalesce(v_can_view_records, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile_row.value->'id',
      'full_name', profile_row.value->'full_name',
      'avatar_url', profile_row.value->'avatar_url',
      'account_type', profile_row.value->'account_type'
    )), '[]'::jsonb)
    into v_safe_profiles
    from jsonb_array_elements(coalesce(v_result->'profiles', '[]'::jsonb)) as profile_row(value);

    v_result := jsonb_set(v_result, '{profiles}', v_safe_profiles, true);
    v_result := jsonb_set(v_result, '{parents}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{links}', '[]'::jsonb, true);
  end if;

  if not coalesce(v_can_manage_finances, false) then
    v_result := jsonb_set(v_result, '{subscriptions}', '[]'::jsonb, true);
  end if;

  if not (coalesce(v_can_view_applications, false) or coalesce(v_can_decide_applications, false)) then
    v_result := jsonb_set(v_result, '{waitlist}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{completedRequests}', '[]'::jsonb, true);
    v_result := jsonb_set(v_result, '{completedRequestTracks}', '[]'::jsonb, true);
  end if;

  return v_result || jsonb_build_object(
    'canViewStudentRecords', coalesce(v_can_view_records, false),
    'canManageEnrollments', coalesce(v_can_manage_enrollments, false),
    'canViewApplications', coalesce(v_can_view_applications, false),
    'canDecideApplications', coalesce(v_can_decide_applications, false),
    'canManageFinances', coalesce(v_can_manage_finances, false)
  );
end;
$$;


ALTER FUNCTION "public"."get_teacher_roster_snapshot"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_roster_snapshot_unfiltered"("p_slug" "text", "p_program_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_teacher_roster_snapshot_unfiltered"("p_slug" "text", "p_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_teacher_student_notes_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_student_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_mosque public.mosques;
  v_program public.programs;
  v_enrollment public.enrollments;
  v_profile jsonb;
  v_parent_profile_id uuid;
  v_parent jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_author_ids uuid[];
  v_authors jsonb := '[]'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'mosque', null, 'program', null);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'mosque', to_jsonb(v_mosque), 'program', null);
  end if;

  select * into v_enrollment from public.enrollments where program_id = v_program.id and student_profile_id = p_student_id limit 1;
  if v_enrollment.id is null then
    return jsonb_build_object('error', 'Student enrollment not found.', 'mosque', to_jsonb(v_mosque), 'program', to_jsonb(v_program));
  end if;

  select to_jsonb(p) into v_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = p_student_id) p;

  select parent_profile_id into v_parent_profile_id from public.parent_child_links where mosque_id = v_mosque.id and child_profile_id = p_student_id limit 1;
  if v_parent_profile_id is not null then
    select to_jsonb(p) into v_parent from (select id, full_name, email, phone_number, avatar_url from public.profiles where id = v_parent_profile_id) p;
  end if;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at asc), '[]'::jsonb) into v_notes
    from public.program_student_notes n where n.program_id = v_program.id and n.student_profile_id = p_student_id;

  select array_agg(distinct author_profile_id) into v_author_ids
    from public.program_student_notes where program_id = v_program.id and student_profile_id = p_student_id and author_profile_id is not null;
  if v_author_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_authors from public.profiles p where p.id = any(v_author_ids);
  end if;

  return jsonb_build_object(
    'error', null,
    'mosque', to_jsonb(v_mosque),
    'program', to_jsonb(v_program),
    'enrollment', to_jsonb(v_enrollment),
    'profile', v_profile,
    'parent', v_parent,
    'notes', v_notes,
    'authors', v_authors
  );
end;
$$;


ALTER FUNCTION "public"."get_teacher_student_notes_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email = COALESCE(EXCLUDED.email, profiles.email);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  signup_account_type text := nullif(new.raw_user_meta_data->>'account_type', '');
  signup_mosque_slug text := nullif(new.raw_user_meta_data->>'mosque_slug', '');
  signup_mosque_id uuid;
  signup_full_name text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', '')
  );
  signup_avatar_url text := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );
  signup_gender text := nullif(new.raw_user_meta_data->>'gender', '');
  signup_date_of_birth date := null;
begin
  if nullif(new.raw_user_meta_data->>'date_of_birth', '') is not null then
    signup_date_of_birth := (new.raw_user_meta_data->>'date_of_birth')::date;
  end if;

  perform public.validate_signup_profile_details(signup_account_type, signup_gender, signup_date_of_birth);

  insert into public.profiles (id, full_name, email, phone_number, avatar_url, account_type, age, gender, date_of_birth)
  values (
    new.id,
    signup_full_name,
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    signup_avatar_url,
    signup_account_type,
    case when signup_account_type = 'student' then nullif(new.raw_user_meta_data->>'age', '') else null end,
    case when signup_account_type in ('student', 'parent') then signup_gender else null end,
    case when signup_account_type in ('student', 'parent') then signup_date_of_birth else null end
  )
  on conflict (id) do update
  set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    account_type = coalesce(excluded.account_type, public.profiles.account_type),
    age = coalesce(excluded.age, public.profiles.age),
    gender = coalesce(excluded.gender, public.profiles.gender),
    date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth),
    updated_at = now();

  if signup_mosque_slug is not null and signup_account_type in ('student', 'parent', 'teacher') then
    select id
    into signup_mosque_id
    from public.mosques
    where slug = signup_mosque_slug
    limit 1;

    if signup_mosque_id is not null then
      update public.mosque_memberships
      set status = 'active',
          teacher_approval_status = null,
          updated_at = now()
      where mosque_id = signup_mosque_id
        and profile_id = new.id
        and role = signup_account_type;

      if not found then
        insert into public.mosque_memberships (mosque_id, profile_id, role, status, teacher_approval_status)
        values (signup_mosque_id, new.id, signup_account_type, 'active', null);
      end if;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_mosque_role"("check_mosque_id" "uuid", "allowed_roles" "text"[], "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.mosque_memberships mm
    join public.profiles p on p.id = mm.profile_id
    where mm.mosque_id = check_mosque_id
      and mm.profile_id = check_profile_id
      and mm.status = 'active'
      and mm.role = any(allowed_roles)
      and p.account_type = mm.role
  );
$$;


ALTER FUNCTION "public"."has_mosque_role"("check_mosque_id" "uuid", "allowed_roles" "text"[], "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_verified_teacher_membership"("check_mosque_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    join public.mosque_memberships mm on mm.profile_id = p.id
    where mm.mosque_id = check_mosque_id
      and mm.profile_id = check_profile_id
      and mm.role = 'teacher'
      and mm.status = 'active'
      and p.account_type = 'teacher'
  );
$$;


ALTER FUNCTION "public"."has_verified_teacher_membership"("check_mosque_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_mosque_admin"("check_mosque_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM mosque_memberships
    WHERE profile_id = auth.uid()
      AND mosque_id = check_mosque_id
      AND role = 'mosque_admin'
  );
$$;


ALTER FUNCTION "public"."is_mosque_admin"("check_mosque_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_parent_of_child"("check_child_profile_id" "uuid", "check_parent_profile_id" "uuid" DEFAULT "auth"."uid"(), "check_mosque_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.parent_child_links pcl
    where pcl.parent_profile_id = check_parent_profile_id
      and pcl.child_profile_id = check_child_profile_id
      and (check_mosque_id is null or pcl.mosque_id = check_mosque_id)
  );
$$;


ALTER FUNCTION "public"."is_parent_of_child"("check_child_profile_id" "uuid", "check_parent_profile_id" "uuid", "check_mosque_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select false;
$$;


ALTER FUNCTION "public"."is_platform_admin"("check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_program_billing_policy_locked"("check_program_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.program_subscriptions ps
    where ps.program_id = check_program_id
      and ps.stripe_subscription_id is not null
  );
$$;


ALTER FUNCTION "public"."is_program_billing_policy_locked"("check_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_program_director"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and pt.role = 'director'
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  )
  or exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and p.director_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  );
$$;


ALTER FUNCTION "public"."is_program_director"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_program_teacher"("check_program_id" "uuid", "check_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and public.has_mosque_role(p.mosque_id, array['admin'], check_profile_id)
  )
  or exists (
    select 1
    from public.program_teachers pt
    join public.programs p on p.id = pt.program_id
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and pt.role in ('director', 'instructor')
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  )
  or exists (
    select 1
    from public.programs p
    where p.id = check_program_id
      and p.director_profile_id = check_profile_id
      and public.has_verified_teacher_membership(p.mosque_id, check_profile_id)
  );
$$;


ALTER FUNCTION "public"."is_program_teacher"("check_program_id" "uuid", "check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff_account"("check_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_profile_id
      and p.account_type in ('teacher', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_staff_account"("check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_teacher_account"("check_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_profile_id
      and p.account_type = 'teacher'
  );
$$;


ALTER FUNCTION "public"."is_teacher_account"("check_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_program_instructor_code"("invite" "text") RETURNS TABLE("program_id" "uuid", "title" "text", "director_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  normalized_invite text := upper(trim(invite));
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = current_profile_id
      and p.account_type = 'teacher'
  ) then
    raise exception 'Only teacher accounts can preview instructor codes';
  end if;

  return query
  select
    p.id as program_id,
    p.title,
    coalesce(director.full_name, director.email, 'Program director') as director_name
  from public.program_teachers pt
  join public.programs p on p.id = pt.program_id
  left join public.profiles director on director.id = coalesce(p.director_profile_id, p.teacher_profile_id)
  where pt.invite_code = normalized_invite
    and pt.role = 'instructor'
    and pt.teacher_profile_id is null
  limit 1;
end;
$$;


ALTER FUNCTION "public"."lookup_program_instructor_code"("invite" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_program_student_invite_code"("invite" "text") RETURNS TABLE("invite_id" "uuid", "program_id" "uuid", "program_track_id" "uuid", "title" "text", "track_name" "text", "director_name" "text", "teacher_comment" "text", "max_students" integer, "expires_at" timestamp with time zone, "bypass_eligibility" boolean, "payment_bypassed" boolean, "payment_type" "text", "price_cents" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  normalized_invite text := upper(trim(invite));
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    psi.id,
    p.id,
    psi.program_track_id,
    p.title,
    coalesce(pt.name, 'General admission'),
    coalesce(director.full_name, director.email, 'Class director'),
    psi.comment,
    psi.max_students,
    psi.expires_at,
    psi.bypass_eligibility,
    psi.payment_bypassed or not p.is_paid,
    psi.payment_type,
    case
      when psi.payment_bypassed or not p.is_paid then 0
      when psi.payment_type = 'annual' then coalesce(psi.custom_price_annual_cents, pt.price_annual_cents, p.price_annual_cents)
      else coalesce(psi.custom_price_monthly_cents, pt.price_monthly_cents, p.price_monthly_cents)
    end
  from public.program_student_invites psi
  join public.programs p on p.id = psi.program_id
  left join public.program_tracks pt on pt.id = psi.program_track_id
  left join public.profiles director on director.id = coalesce(p.director_profile_id, p.teacher_profile_id)
  where psi.invite_code = normalized_invite
    and psi.claimed_at is null
    and psi.revoked_at is null
    and (psi.expires_at is null or psi.expires_at > now())
  limit 1;
end;
$$;


ALTER FUNCTION "public"."lookup_program_student_invite_code"("invite" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_program_student_notes_seen"("note_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.program_student_notes psn
  set seen_at = coalesce(psn.seen_at, now()),
      seen_by = coalesce(psn.seen_by, current_profile_id),
      updated_at = now()
  where psn.id = any(note_ids)
    and psn.seen_at is null
    and (
      psn.recipient_profile_id = current_profile_id
      or psn.student_profile_id = current_profile_id
      or (
        psn.parent_profile_id = current_profile_id
        and public.is_parent_of_child(psn.student_profile_id, current_profile_id, psn.mosque_id)
      )
    );
end;
$$;


ALTER FUNCTION "public"."mark_program_student_notes_seen"("note_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."populate_program_subscription_legacy_profile_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
      begin
        new.profile_id := coalesce(new.profile_id, new.parent_profile_id, new.student_profile_id);
        return new;
      end;
      $$;


ALTER FUNCTION "public"."populate_program_subscription_legacy_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_locked_program_billing_policy_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.monthly_billing_anchor is distinct from old.monthly_billing_anchor
     and public.is_program_billing_policy_locked(old.id)
     and coalesce(current_setting('app.approved_billing_alignment', true), '') <> 'first_of_month' then
    raise exception 'The monthly billing date is locked because recurring billing has already begun for this class.' using errcode = '23514';
  end if;
  if new.annual_billing_anchor is distinct from old.annual_billing_anchor
     and exists (
       select 1 from public.program_subscriptions ps
       where ps.program_id = old.id
         and ps.payment_type = 'annual'
         and ps.stripe_subscription_id is not null
     )
     and coalesce(current_setting('app.approved_annual_billing_alignment', true), '') <> 'first_of_year' then
    raise exception 'The annual billing date is locked because annual billing has already begun for this class.' using errcode = '23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_locked_program_billing_policy_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_teacher_enrollment_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_staff_account(new.student_profile_id) then
    raise exception 'Staff accounts cannot request enrollment';
  end if;

  if new.parent_profile_id is not null and public.is_staff_account(new.parent_profile_id) then
    raise exception 'Staff accounts cannot request enrollment';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_teacher_enrollment_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_id uuid := auth.uid();
  req record;
begin
  if actor_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into req from public.program_track_switch_requests where id = target_request_id;
  if req.id is null then
    raise exception 'Switch request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request has already been decided';
  end if;
  if not public.can_manage_program(req.program_id, actor_id) then
    raise exception 'Not authorized to manage this class';
  end if;

  update public.program_track_switch_requests
  set status = 'rejected', decided_at = now(), decided_by = actor_id, decision_note = decision_note_text
  where id = target_request_id;
end;
$$;


ALTER FUNCTION "public"."reject_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_program_withdrawal"("target_program_id" "uuid", "target_student_profile_id" "uuid", "withdrawal_reason" "text" DEFAULT NULL::"text", "understands_no_refund" boolean DEFAULT false, "understands_immediate_exit" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  target_enrollment_id uuid;
  target_mosque_id uuid;
  requester_parent_id uuid := null;
  request_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if understands_no_refund is not true or understands_immediate_exit is not true then
    raise exception 'Withdrawal acknowledgements are required';
  end if;

  select e.id, p.mosque_id
  into target_enrollment_id, target_mosque_id
  from public.enrollments e
  join public.programs p on p.id = e.program_id
  where e.program_id = target_program_id
    and e.student_profile_id = target_student_profile_id
  limit 1;

  if target_enrollment_id is null then
    raise exception 'Enrollment not found';
  end if;

  if target_student_profile_id <> current_profile_id then
    if not exists (
      select 1
      from public.parent_child_links pcl
      where pcl.parent_profile_id = current_profile_id
        and pcl.child_profile_id = target_student_profile_id
        and pcl.mosque_id = target_mosque_id
    ) then
      raise exception 'Not authorized to request this withdrawal';
    end if;
    requester_parent_id := current_profile_id;
  end if;

  insert into public.withdrawal_requests (
    mosque_id,
    program_id,
    enrollment_id,
    student_profile_id,
    parent_profile_id,
    requested_by,
    status,
    reason,
    understands_no_refund,
    understands_immediate_exit,
    teacher_dismissed_at,
    student_dismissed_at
  )
  values (
    target_mosque_id,
    target_program_id,
    target_enrollment_id,
    target_student_profile_id,
    requester_parent_id,
    current_profile_id,
    'pending',
    nullif(trim(withdrawal_reason), ''),
    true,
    true,
    null,
    null
  )
  on conflict (enrollment_id) where status = 'pending'
  do update set
    requested_at = now(),
    requested_by = excluded.requested_by,
    parent_profile_id = excluded.parent_profile_id,
    reason = excluded.reason,
    understands_no_refund = true,
    understands_immediate_exit = true,
    teacher_dismissed_at = null,
    student_dismissed_at = null
  returning id into request_id;

  return request_id;
end;
$$;


ALTER FUNCTION "public"."request_program_withdrawal"("target_program_id" "uuid", "target_student_profile_id" "uuid", "withdrawal_reason" "text", "understands_no_refund" boolean, "understands_immediate_exit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resign_program_instructor"("target_program_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_profile_id uuid := auth.uid();
  target_assignment_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select pt.id
  into target_assignment_id
  from public.program_teachers pt
  where pt.program_id = target_program_id
    and pt.teacher_profile_id = current_profile_id
    and pt.role = 'instructor'
  limit 1;

  if target_assignment_id is null then
    raise exception 'Instructor assignment not found';
  end if;

  insert into public.program_instructor_events (program_id, assignment_id, teacher_profile_id, event_type)
  values (target_program_id, target_assignment_id, current_profile_id, 'resigned');

  delete from public.program_teachers pt
  where pt.id = target_assignment_id;
end;
$$;


ALTER FUNCTION "public"."resign_program_instructor"("target_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_program_first_of_month_after_alignment"("target_program_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('app.approved_billing_alignment', 'first_of_month', true);
  update public.programs set monthly_billing_anchor = 'first_of_month', updated_at = now() where id = target_program_id;
end;
$$;


ALTER FUNCTION "public"."set_program_first_of_month_after_alignment"("target_program_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_enrollment_track_selection"("target_enrollment_id" "uuid", "selected_track_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  current_profile_id uuid := auth.uid();
  target_program_id uuid;
  target_student_id uuid;
  target_mosque_id uuid;
  target_track_mode text;
  target_track_count integer;
  target_age_range text;
  target_audience_gender text;
  target_student_age integer;
  target_student_gender text;
  target_switch_policy text;
  target_switch_allow_all boolean;
  active_track_count integer;
  selected_count integer;
  required_count integer;
  normalized_track_ids uuid[] := coalesce(selected_track_ids, '{}'::uuid[]);
  normalized_age_range text;
  min_age integer;
  max_age integer;
  current_track_ids uuid[];
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select e.program_id,
         e.student_profile_id,
         p.mosque_id,
         coalesce(p.track_selection_mode, 'exact'),
         greatest(coalesce(p.track_selection_count, 1), 1),
         p.age_range_text,
         p.audience_gender,
         case
           when pr.date_of_birth is not null then extract(year from age(current_date, pr.date_of_birth))::integer
           when pr.age ~ '^[0-9]+$' then pr.age::integer
           else null
         end,
         lower(nullif(trim(pr.gender), '')),
         p.track_switch_policy,
         p.track_switch_allow_all
  into target_program_id,
       target_student_id,
       target_mosque_id,
       target_track_mode,
       target_track_count,
       target_age_range,
       target_audience_gender,
       target_student_age,
       target_student_gender,
       target_switch_policy,
       target_switch_allow_all
  from public.enrollments e
  join public.programs p on p.id = e.program_id
  join public.profiles pr on pr.id = e.student_profile_id
  where e.id = target_enrollment_id;

  if target_program_id is null then
    raise exception 'Enrollment not found';
  end if;

  if target_student_id <> current_profile_id and not exists (
    select 1
    from public.parent_child_links pcl
    where pcl.parent_profile_id = current_profile_id
      and pcl.child_profile_id = target_student_id
      and pcl.mosque_id = target_mosque_id
  ) then
    raise exception 'Not authorized to update this enrollment';
  end if;

  if target_switch_policy is distinct from 'allowed' then
    raise exception 'Self-service schedule changes are not enabled for this class';
  end if;

  if lower(coalesce(target_audience_gender, '')) in ('brothers', 'brothers only', 'male', 'boys')
     and target_student_gender <> 'male' then
    raise exception 'Student no longer matches the audience requirement';
  end if;

  if lower(coalesce(target_audience_gender, '')) in ('sisters', 'sisters only', 'female', 'girls')
     and target_student_gender <> 'female' then
    raise exception 'Student no longer matches the audience requirement';
  end if;

  normalized_age_range := lower(trim(coalesce(target_age_range, '')));
  if normalized_age_range <> '' and normalized_age_range not in ('all', 'all ages') then
    normalized_age_range := regexp_replace(normalized_age_range, '^ages?\s+', '');

    if normalized_age_range ~ '^[0-9]+\s*[-–]\s*[0-9]+$' then
      min_age := (regexp_match(normalized_age_range, '^([0-9]+)'))[1]::integer;
      max_age := (regexp_match(normalized_age_range, '([0-9]+)$'))[1]::integer;
    elsif normalized_age_range ~ '^[0-9]+\s*\+$' then
      min_age := (regexp_match(normalized_age_range, '^([0-9]+)'))[1]::integer;
      max_age := null;
    elsif normalized_age_range ~ '^[0-9]+$' then
      min_age := normalized_age_range::integer;
      max_age := normalized_age_range::integer;
    end if;

    if min_age is not null and target_student_age is null then
      raise exception 'Student is missing the age requirement for this class';
    end if;
    if min_age is not null and target_student_age < min_age then
      raise exception 'Student is outside of the class age range';
    end if;
    if max_age is not null and target_student_age > max_age then
      raise exception 'Student is outside of the class age range';
    end if;
  end if;

  select count(*)
  into active_track_count
  from public.program_tracks pt
  where pt.program_id = target_program_id
    and pt.is_active = true;

  select count(distinct track_id)
  into selected_count
  from unnest(normalized_track_ids) as track_id;

  if active_track_count = 0 then
    selected_count := 0;
  else
    if selected_count = 0 then
      raise exception 'Choose at least one schedule option';
    end if;

    if exists (
      select 1
      from unnest(normalized_track_ids) as track_id
      left join public.program_tracks pt
        on pt.id = track_id
       and pt.program_id = target_program_id
       and pt.is_active = true
      where pt.id is null
    ) then
      raise exception 'One or more selected schedule options are invalid';
    end if;

    required_count := least(target_track_count, active_track_count);
    if target_track_mode = 'minimum' and selected_count < required_count then
      raise exception 'Choose at least % schedule option(s)', required_count;
    elsif target_track_mode = 'maximum' and selected_count > required_count then
      raise exception 'Choose no more than % schedule option(s)', required_count;
    elsif target_track_mode = 'exact' and selected_count <> required_count then
      raise exception 'Choose exactly % schedule option(s)', required_count;
    end if;

    -- Per-track eligibility override: a track's own age/gender override (if set) wins
    -- over the program-level requirement already checked above.
    if exists (
      select 1
      from unnest(normalized_track_ids) as track_id
      join public.program_tracks pt on pt.id = track_id
      where (pt.age_min is not null and (target_student_age is null or target_student_age < pt.age_min))
         or (pt.age_max is not null and (target_student_age is null or target_student_age > pt.age_max))
         or (pt.gender_override = 'brothers' and target_student_gender <> 'male')
         or (pt.gender_override = 'sisters' and target_student_gender <> 'female')
    ) then
      raise exception 'Student does not meet the eligibility requirements for the selected schedule option';
    end if;

    -- Transfer-rule check: every currently-held track -> newly-selected track pair must
    -- be an explicitly allowed transfer, unless the program allows all switches.
    if not target_switch_allow_all then
      select array_agg(program_track_id) into current_track_ids
      from public.enrollment_tracks
      where enrollment_id = target_enrollment_id;

      if exists (
        select 1
        from unnest(coalesce(current_track_ids, '{}'::uuid[])) as from_id
        cross join unnest(normalized_track_ids) as to_id
        where from_id <> to_id
          and not exists (
            select 1 from public.program_track_transfer_rules r
            where r.program_id = target_program_id
              and r.from_track_id = from_id
              and r.to_track_id = to_id
          )
      ) then
        raise exception 'That schedule change is not allowed for this class';
      end if;
    end if;
  end if;

  delete from public.enrollment_tracks
  where enrollment_id = target_enrollment_id;

  if active_track_count > 0 then
    insert into public.enrollment_tracks (enrollment_id, program_track_id)
    select target_enrollment_id, track_id
    from (
      select distinct track_id
      from unnest(normalized_track_ids) as track_id
    ) selected;
  end if;

  update public.enrollments
  set program_track_id = case when active_track_count > 0 then normalized_track_ids[1] else null end
  where id = target_enrollment_id;
end;
$_$;


ALTER FUNCTION "public"."update_enrollment_track_selection"("target_enrollment_id" "uuid", "selected_track_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_parent_child_profile"("child_profile_id" "uuid", "child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent_id uuid := auth.uid();
  target_mosque_id uuid;
  target_child_profile_id uuid := child_profile_id;
begin
  if parent_id is null then
    raise exception 'Not authenticated';
  end if;

  select id
  into target_mosque_id
  from public.mosques
  where slug = child_mosque_slug
  limit 1;

  if target_mosque_id is null then
    raise exception 'Masjid not found';
  end if;

  if nullif(trim(child_full_name), '') is null then
    raise exception 'Child name is required';
  end if;

  if child_gender not in ('male', 'female') then
    raise exception 'Invalid gender';
  end if;

  if child_date_of_birth is null then
    raise exception 'Date of birth is required';
  end if;

  if not exists (
    select 1
    from public.parent_child_links pcl
    where pcl.parent_profile_id = parent_id
      and pcl.child_profile_id = target_child_profile_id
      and pcl.mosque_id = target_mosque_id
  ) then
    raise exception 'Child profile not found or not authorized';
  end if;

  update public.profiles
  set full_name = nullif(trim(child_full_name), ''),
      gender = child_gender,
      date_of_birth = child_date_of_birth,
      age = null,
      updated_at = now()
  where id = target_child_profile_id
    and account_type = 'student';

  if not found then
    raise exception 'Child profile not found';
  end if;
end;
$$;


ALTER FUNCTION "public"."update_parent_child_profile"("child_profile_id" "uuid", "child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_signup_profile_details"("signup_account_type" "text", "signup_gender" "text", "signup_date_of_birth" "date") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  minimum_birth_date date;
begin
  if signup_account_type not in ('student', 'parent', 'teacher') then
    raise exception 'Invalid account type';
  end if;

  if signup_account_type in ('student', 'parent') then
    if nullif(trim(coalesce(signup_gender, '')), '') is null then
      raise exception 'Gender is required';
    end if;

    if signup_gender not in ('male', 'female') then
      raise exception 'Invalid gender';
    end if;

    if signup_date_of_birth is null then
      raise exception 'Date of birth is required';
    end if;

    if signup_date_of_birth > current_date then
      raise exception 'Date of birth cannot be in the future';
    end if;

    minimum_birth_date := case
      when signup_account_type = 'student' then current_date - interval '13 years'
      else current_date - interval '18 years'
    end;

    if signup_date_of_birth > minimum_birth_date then
      raise exception '% accounts require date of birth to be at least % years old',
        initcap(signup_account_type),
        case when signup_account_type = 'student' then 13 else 18 end;
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_signup_profile_details"("signup_account_type" "text", "signup_gender" "text", "signup_date_of_birth" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."enrollment_request_tracks" (
    "enrollment_request_id" "uuid" NOT NULL,
    "program_track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."enrollment_request_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "student_dismissed_at" timestamp with time zone,
    "program_track_id" "uuid",
    "approved_price_monthly_cents" integer,
    "payment_bypassed" boolean DEFAULT false NOT NULL,
    "decision_note" "text",
    "teacher_dismissed_at" timestamp with time zone,
    "admission_completed_at" timestamp with time zone,
    "payment_type" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "approved_price_annual_cents" integer,
    "payment_bypass_external" boolean DEFAULT false NOT NULL,
    "payment_terms_id" "uuid",
    "admission_source" "text" DEFAULT 'application'::"text" NOT NULL,
    "source_student_invite_id" "uuid",
    CONSTRAINT "enrollment_requests_admission_source_check" CHECK (("admission_source" = ANY (ARRAY['application'::"text", 'direct_invitation'::"text", 'manual'::"text"]))),
    CONSTRAINT "enrollment_requests_approved_price_annual_cents_check" CHECK ((("approved_price_annual_cents" IS NULL) OR ("approved_price_annual_cents" >= 0))),
    CONSTRAINT "enrollment_requests_approved_price_monthly_cents_check" CHECK ((("approved_price_monthly_cents" IS NULL) OR ("approved_price_monthly_cents" >= 0))),
    CONSTRAINT "enrollment_requests_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "enrollment_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'waitlisted'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."enrollment_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollment_tracks" (
    "enrollment_id" "uuid" NOT NULL,
    "program_track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."enrollment_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_track_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'kicked'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mosque_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "can_manage_programs" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "teacher_approval_status" "text",
    "teacher_approval_reviewed_by" "uuid",
    "teacher_approval_reviewed_at" timestamp with time zone,
    "can_create_programs" boolean DEFAULT false NOT NULL,
    CONSTRAINT "mosque_memberships_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'parent'::"text", 'teacher'::"text", 'admin'::"text"]))),
    CONSTRAINT "mosque_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'suspended'::"text"]))),
    CONSTRAINT "mosque_memberships_teacher_approval_status_check" CHECK ((("teacher_approval_status" IS NULL) OR ("teacher_approval_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"]))))
);


ALTER TABLE "public"."mosque_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mosques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "stripe_account_id" "text",
    "welcome_title" "text",
    "welcome_description" "text",
    "features" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "picture_url" "text",
    "address" "text",
    "pwa_name" "text",
    "short_name" "text",
    "app_icon_url" "text",
    "annual_billing_anchor" "text" DEFAULT 'signup_anniversary'::"text" NOT NULL,
    CONSTRAINT "mosques_annual_billing_anchor_check" CHECK (("annual_billing_anchor" = ANY (ARRAY['signup_anniversary'::"text", 'first_of_year'::"text"])))
);


ALTER TABLE "public"."mosques" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_child_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_profile_id" "uuid" NOT NULL,
    "child_profile_id" "uuid" NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_child_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone_number" "text",
    "avatar_url" "text",
    "age" "text",
    "gender" "text",
    "global_role" "text",
    "date_of_birth" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_type" "text",
    "teacher_credentials" "text",
    "teacher_whatsapp_number" "text",
    CONSTRAINT "profiles_account_type_check" CHECK ((("account_type" IS NULL) OR ("account_type" = ANY (ARRAY['student'::"text", 'parent'::"text", 'teacher'::"text", 'admin'::"text"])))),
    CONSTRAINT "profiles_global_role_check" CHECK (("global_role" = 'platform_admin'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_announcement_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_announcement_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "author_profile_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_program_track_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "program_announcements_attachments_array_check" CHECK (("jsonb_typeof"("attachments") = 'array'::"text"))
);


ALTER TABLE "public"."program_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "joined_at" timestamp with time zone,
    CONSTRAINT "program_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'joined'::"text"])))
);


ALTER TABLE "public"."program_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "program_session_id" "uuid",
    "enrollment_id" "uuid",
    "student_profile_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "day_of_week" "text",
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "status" "text" NOT NULL,
    "absence_reason" "text",
    "marked_by" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_attendance_records_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text"])))
);


ALTER TABLE "public"."program_attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_content_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "duration_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_content_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_details" (
    "program_id" "uuid" NOT NULL,
    "learning_intro" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "learning_title" "text" DEFAULT 'What You Will Learn'::"text" NOT NULL,
    "instructor_display_name" "text",
    "instructor_credentials" "text",
    "instructor_contact_url" "text",
    "instructor_contact_phone" "text",
    "requirements_text" "text",
    "what_to_bring_text" "text",
    "policies_text" "text",
    "topics_intro" "text",
    "cover_director_visibility" "text" DEFAULT 'name_and_photo'::"text" NOT NULL,
    CONSTRAINT "program_details_cover_director_visibility_check" CHECK (("cover_director_visibility" = ANY (ARRAY['name_and_photo'::"text", 'name_only'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."program_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_finance_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "student_profile_id" "uuid",
    "actor_profile_id" "uuid",
    "event_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_finance_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_instructor_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "assignment_id" "uuid",
    "teacher_profile_id" "uuid",
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_instructor_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['joined'::"text", 'resigned'::"text"])))
);


ALTER TABLE "public"."program_instructor_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "media_type" "text" DEFAULT 'photo'::"text" NOT NULL,
    "url" "text" NOT NULL,
    "thumbnail_url" "text",
    "title" "text",
    "short_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caption" "text",
    "alt_text" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    CONSTRAINT "program_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['photo'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."program_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_payment_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "enrollment_request_id" "uuid",
    "enrollment_id" "uuid",
    "student_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid",
    "payment_type" "text" NOT NULL,
    "amount_cents" integer,
    "currency" "text" DEFAULT 'cad'::"text" NOT NULL,
    "billing_months" integer,
    "billing_start_behavior" "text" DEFAULT 'on_payment'::"text" NOT NULL,
    "billing_end_behavior" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "program_start_date_snapshot" "date",
    "program_end_date_snapshot" "date",
    "status" "text" DEFAULT 'pending_confirmation'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_checkout_session_id" "text",
    "stripe_subscription_id" "text",
    "stripe_subscription_schedule_id" "text",
    "stripe_invoice_id" "text",
    "stripe_payment_intent_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "superseded_by_payment_terms_id" "uuid",
    "internal_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "monthly_billing_anchor" "text" DEFAULT 'signup_date'::"text" NOT NULL,
    "monthly_billing_timezone" "text",
    CONSTRAINT "program_payment_terms_amount_cents_check" CHECK ((("amount_cents" IS NULL) OR ("amount_cents" >= 0))),
    CONSTRAINT "program_payment_terms_billing_end_behavior_check" CHECK (("billing_end_behavior" = ANY (ARRAY['fixed_month_count'::"text", 'ongoing_until_cancelled'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "program_payment_terms_billing_months_check" CHECK ((("billing_months" IS NULL) OR ("billing_months" > 0))),
    CONSTRAINT "program_payment_terms_billing_start_behavior_check" CHECK (("billing_start_behavior" = ANY (ARRAY['on_payment'::"text", 'program_start'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "program_payment_terms_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['free'::"text", 'waived'::"text", 'monthly'::"text", 'pay_in_full'::"text", 'annual'::"text"]))),
    CONSTRAINT "program_payment_terms_status_check" CHECK (("status" = ANY (ARRAY['pending_confirmation'::"text", 'payment_required'::"text", 'checkout_pending'::"text", 'active'::"text", 'paid'::"text", 'waived'::"text", 'ended'::"text", 'superseded'::"text", 'cancelled'::"text", 'failed'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."program_payment_terms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mosque_id" "uuid",
    "program_id" "uuid",
    "program_subscription_id" "uuid",
    "student_profile_id" "uuid",
    "parent_profile_id" "uuid",
    "stripe_charge_id" "text",
    "stripe_payment_intent_id" "text",
    "stripe_invoice_id" "text",
    "amount_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'cad'::"text" NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receipt_url" "text",
    "tax_receipt_status" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "tax_receipt_eligible_amount_cents" integer,
    "tax_receipt_number" "text",
    "tax_receipt_issued_at" timestamp with time zone,
    "tax_receipt_issued_by" "uuid",
    "tax_receipt_note" "text",
    "payment_terms_id" "uuid",
    CONSTRAINT "program_payments_tax_receipt_status_check" CHECK (("tax_receipt_status" = ANY (ARRAY['not_applicable'::"text", 'admin_review_required'::"text", 'eligible_pending_issue'::"text", 'issued'::"text", 'partial_issued'::"text", 'not_eligible'::"text", 'contact_admin'::"text"])))
);


ALTER TABLE "public"."program_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_session_cancellations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text",
    "cancelled_by" "uuid",
    "announcement_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_session_cancellations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "program_track_id" "uuid",
    "session_date" "date",
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone,
    "title" "text",
    "location" "text",
    "room" "text",
    "notes" "text",
    "capacity" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_of_week" "text",
    CONSTRAINT "program_sessions_day_of_week_check" CHECK ((("day_of_week" IS NULL) OR ("day_of_week" = ANY (ARRAY['Monday'::"text", 'Tuesday'::"text", 'Wednesday'::"text", 'Thursday'::"text", 'Friday'::"text", 'Saturday'::"text", 'Sunday'::"text"])))),
    CONSTRAINT "program_sessions_day_or_date_check" CHECK ((("session_date" IS NOT NULL) OR ("day_of_week" IS NOT NULL)))
);


ALTER TABLE "public"."program_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_student_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "invite_code" "text" NOT NULL,
    "invite_code_created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comment" "text",
    "payment_bypassed" boolean DEFAULT false NOT NULL,
    "payment_bypass_external" boolean DEFAULT false NOT NULL,
    "payment_type" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "custom_price_monthly_cents" integer,
    "custom_price_annual_cents" integer,
    "claimed_by_profile_id" "uuid",
    "claimed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_track_id" "uuid",
    "max_students" integer DEFAULT 1 NOT NULL,
    "expires_at" timestamp with time zone,
    "bypass_eligibility" boolean DEFAULT true NOT NULL,
    "revoked_at" timestamp with time zone,
    "selected_student_profile_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "program_student_invites_max_students_check" CHECK ((("max_students" >= 1) AND ("max_students" <= 25))),
    CONSTRAINT "program_student_invites_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['monthly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."program_student_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_student_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "recipient_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid",
    "author_profile_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "category" "text" DEFAULT 'note'::"text" NOT NULL,
    "seen_at" timestamp with time zone,
    "seen_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "program_student_notes_attachments_array_check" CHECK (("jsonb_typeof"("attachments") = 'array'::"text")),
    CONSTRAINT "program_student_notes_category_check" CHECK (("category" = ANY (ARRAY['note'::"text", 'homework'::"text", 'feedback'::"text", 'progress'::"text"]))),
    CONSTRAINT "program_student_notes_message_check" CHECK ((("length"(TRIM(BOTH FROM "message")) > 0) OR ("jsonb_array_length"("attachments") > 0)))
);


ALTER TABLE "public"."program_student_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_subscription_tracks" (
    "program_subscription_id" "uuid" NOT NULL,
    "program_track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_subscription_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "mosque_id" "uuid",
    "student_profile_id" "uuid",
    "parent_profile_id" "uuid",
    "enrollment_request_id" "uuid",
    "stripe_account_id" "text",
    "stripe_customer_id" "text",
    "stripe_checkout_session_id" "text",
    "stripe_price_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "program_track_id" "uuid",
    "payment_type" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "payment_paused" boolean DEFAULT false NOT NULL,
    "payment_paused_until" timestamp with time zone,
    "payment_waived" boolean DEFAULT false NOT NULL,
    "payment_waived_reason" "text",
    "payment_waived_at" timestamp with time zone,
    "payment_terms_id" "uuid",
    "stripe_subscription_schedule_id" "text",
    "amount_cents" integer,
    "billing_months" integer,
    "currency" "text" DEFAULT 'cad'::"text" NOT NULL,
    CONSTRAINT "program_subscriptions_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "program_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."program_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "teacher_profile_id" "uuid",
    "role" "text" DEFAULT 'lead'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invite_code" "text",
    "invite_code_created_at" timestamp with time zone,
    "can_manage_finances" boolean DEFAULT false NOT NULL,
    "can_view_applications" boolean DEFAULT false NOT NULL,
    "can_send_direct_invitations" boolean DEFAULT false NOT NULL,
    "can_decide_applications" boolean DEFAULT false NOT NULL,
    "can_edit_class" boolean DEFAULT false NOT NULL,
    "can_announce" boolean DEFAULT true NOT NULL,
    "can_view_student_records" boolean DEFAULT false NOT NULL,
    "can_manage_enrollments" boolean DEFAULT false NOT NULL,
    CONSTRAINT "program_teachers_role_check" CHECK (("role" = ANY (ARRAY['director'::"text", 'instructor'::"text"])))
);


ALTER TABLE "public"."program_teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_track_sessions" (
    "program_track_id" "uuid" NOT NULL,
    "program_session_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."program_track_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_track_switch_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "student_profile_id" "uuid" NOT NULL,
    "from_track_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "to_track_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "decision_note" "text",
    CONSTRAINT "program_track_switch_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."program_track_switch_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_track_transfer_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "from_track_id" "uuid" NOT NULL,
    "to_track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_track_transfer_rules_distinct" CHECK (("from_track_id" <> "to_track_id"))
);


ALTER TABLE "public"."program_track_transfer_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "schedule" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gender_override" "text",
    "age_min" integer,
    "age_max" integer,
    "location" "text",
    "room" "text",
    "capacity" integer,
    "pricing_override_enabled" boolean DEFAULT false NOT NULL,
    "price_monthly_cents" integer,
    "price_annual_cents" integer,
    "eligibility_comment" "text"
);


ALTER TABLE "public"."program_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "teacher_profile_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_paid" boolean DEFAULT false NOT NULL,
    "thumbnail_url" "text",
    "price_monthly_cents" integer,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "audience_gender" "text",
    "age_range_text" "text",
    "schedule" "jsonb",
    "schedule_timezone" "text",
    "schedule_notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "director_profile_id" "uuid",
    "track_selection_mode" "text" DEFAULT 'exact'::"text" NOT NULL,
    "track_selection_count" integer DEFAULT 1 NOT NULL,
    "offers_monthly_payment" boolean DEFAULT true NOT NULL,
    "offers_annual_payment" boolean DEFAULT false NOT NULL,
    "price_annual_cents" integer,
    "stripe_annual_price_id" "text",
    "internal_name" "text",
    "summary" "text",
    "category" "text",
    "program_type" "text" DEFAULT 'recurring'::"text" NOT NULL,
    "publication_status" "text" DEFAULT 'published'::"text" NOT NULL,
    "application_status" "text" DEFAULT 'accepting'::"text" NOT NULL,
    "lifecycle_status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "application_mode" "text" DEFAULT 'application_required'::"text" NOT NULL,
    "accepting_applications" boolean DEFAULT true NOT NULL,
    "application_open_at" timestamp with time zone,
    "application_close_at" timestamp with time zone,
    "waitlist_enabled" boolean DEFAULT true NOT NULL,
    "capacity_behavior" "text" DEFAULT 'manual_review'::"text" NOT NULL,
    "default_capacity" integer,
    "payment_kind" "text" DEFAULT 'free'::"text" NOT NULL,
    "billing_end_behavior" "text" DEFAULT 'fixed_months'::"text" NOT NULL,
    "billing_duration_months" integer DEFAULT 10,
    "allow_custom_prices" boolean DEFAULT true NOT NULL,
    "allow_waived_payments" boolean DEFAULT true NOT NULL,
    "manual_payment_note" "text",
    "financial_assistance_note" "text",
    "receipt_note" "text",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "duration_type" "text" DEFAULT 'ongoing'::"text" NOT NULL,
    "start_now" boolean DEFAULT false NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "duration_months" integer,
    "is_ongoing" boolean DEFAULT false NOT NULL,
    "schedule_pattern" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "registration_deadline_at" timestamp with time zone,
    "location" "text",
    "room" "text",
    "billing_start_behavior" "text" DEFAULT 'on_payment'::"text" NOT NULL,
    "cover_price_label_enabled" boolean DEFAULT true NOT NULL,
    "cover_price_label" "text",
    "room_area" "text",
    "tax_receipt_policy" "text" DEFAULT 'not_applicable'::"text" NOT NULL,
    "track_switch_policy" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "track_switch_allow_all" boolean DEFAULT false NOT NULL,
    "monthly_billing_anchor" "text" DEFAULT 'signup_date'::"text" NOT NULL,
    "annual_billing_anchor" "text" DEFAULT 'signup_anniversary'::"text" NOT NULL,
    CONSTRAINT "programs_annual_billing_anchor_check" CHECK (("annual_billing_anchor" = ANY (ARRAY['signup_anniversary'::"text", 'first_of_year'::"text"]))),
    CONSTRAINT "programs_application_mode_check" CHECK (("application_mode" = ANY (ARRAY['application_required'::"text", 'open_enrollment'::"text", 'invite_only'::"text", 'hidden_private'::"text"]))),
    CONSTRAINT "programs_application_status_check" CHECK (("application_status" = ANY (ARRAY['accepting'::"text", 'not_accepting'::"text", 'opens_later'::"text", 'waitlist_only'::"text", 'closed'::"text", 'invite_only'::"text"]))),
    CONSTRAINT "programs_billing_end_behavior_check" CHECK (("billing_end_behavior" = ANY (ARRAY['manual_cancel'::"text", 'program_end'::"text", 'fixed_months'::"text"]))),
    CONSTRAINT "programs_billing_start_behavior_check" CHECK (("billing_start_behavior" = ANY (ARRAY['on_payment'::"text", 'program_start'::"text"]))),
    CONSTRAINT "programs_capacity_behavior_check" CHECK (("capacity_behavior" = ANY (ARRAY['manual_review'::"text", 'close_when_full'::"text", 'allow_waitlist'::"text"]))),
    CONSTRAINT "programs_duration_type_check" CHECK (("duration_type" = ANY (ARRAY['ongoing'::"text", 'fixed_months'::"text"]))),
    CONSTRAINT "programs_lifecycle_status_check" CHECK (("lifecycle_status" = ANY (ARRAY['upcoming'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "programs_payment_kind_check" CHECK (("payment_kind" = ANY (ARRAY['free'::"text", 'tareeqah'::"text", 'manual'::"text"]))),
    CONSTRAINT "programs_price_annual_cents_check" CHECK ((("price_annual_cents" IS NULL) OR ("price_annual_cents" >= 0))),
    CONSTRAINT "programs_program_type_check" CHECK (("program_type" = ANY (ARRAY['recurring'::"text", 'event'::"text"]))),
    CONSTRAINT "programs_publication_status_check" CHECK (("publication_status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'hidden'::"text", 'archived'::"text"]))),
    CONSTRAINT "programs_schedule_pattern_check" CHECK (("schedule_pattern" = ANY (ARRAY['weekly'::"text", 'custom_dates'::"text"]))),
    CONSTRAINT "programs_tax_receipt_policy_check" CHECK (("tax_receipt_policy" = ANY (ARRAY['not_applicable'::"text", 'admin_review_required'::"text", 'eligible_confirmed'::"text"]))),
    CONSTRAINT "programs_track_selection_count_check" CHECK (("track_selection_count" >= 1)),
    CONSTRAINT "programs_track_selection_mode_check" CHECK (("track_selection_mode" = ANY (ARRAY['exact'::"text", 'minimum'::"text", 'maximum'::"text"]))),
    CONSTRAINT "programs_track_switch_policy_check" CHECK (("track_switch_policy" = ANY (ARRAY['disabled'::"text", 'request_only'::"text", 'allowed'::"text"])))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "message" "text" NOT NULL,
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_error_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "teacher_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."teacher_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_notification_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_key" "text" NOT NULL,
    "seen_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teacher_notification_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withdrawal_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mosque_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "student_profile_id" "uuid" NOT NULL,
    "parent_profile_id" "uuid",
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "decision_note" "text",
    "teacher_dismissed_at" timestamp with time zone,
    "student_dismissed_at" timestamp with time zone,
    "reason" "text",
    "understands_no_refund" boolean DEFAULT false NOT NULL,
    "understands_immediate_exit" boolean DEFAULT false NOT NULL,
    CONSTRAINT "withdrawal_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."withdrawal_requests" OWNER TO "postgres";


ALTER TABLE ONLY "public"."enrollment_request_tracks"
    ADD CONSTRAINT "enrollment_request_tracks_pkey" PRIMARY KEY ("enrollment_request_id", "program_track_id");



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_program_id_student_profile_id_key" UNIQUE ("program_id", "student_profile_id");



ALTER TABLE ONLY "public"."enrollment_tracks"
    ADD CONSTRAINT "enrollment_tracks_pkey" PRIMARY KEY ("enrollment_id", "program_track_id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_student_profile_id_key" UNIQUE ("program_id", "student_profile_id");



ALTER TABLE ONLY "public"."mosque_memberships"
    ADD CONSTRAINT "mosque_memberships_mosque_id_profile_id_key" UNIQUE ("mosque_id", "profile_id");



ALTER TABLE ONLY "public"."mosque_memberships"
    ADD CONSTRAINT "mosque_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mosques"
    ADD CONSTRAINT "mosques_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mosques"
    ADD CONSTRAINT "mosques_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_parent_profile_id_child_profile_id_mosqu_key" UNIQUE ("parent_profile_id", "child_profile_id", "mosque_id");



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_announcement_receipts"
    ADD CONSTRAINT "program_announcement_receipts_announcement_id_profile_id_key" UNIQUE ("announcement_id", "profile_id");



ALTER TABLE ONLY "public"."program_announcement_receipts"
    ADD CONSTRAINT "program_announcement_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_announcements"
    ADD CONSTRAINT "program_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_applications"
    ADD CONSTRAINT "program_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_applications"
    ADD CONSTRAINT "program_applications_program_id_student_profile_id_key" UNIQUE ("program_id", "student_profile_id");



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_content_sections"
    ADD CONSTRAINT "program_content_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_content_sections"
    ADD CONSTRAINT "program_content_sections_program_id_sort_order_key" UNIQUE ("program_id", "sort_order");



ALTER TABLE ONLY "public"."program_details"
    ADD CONSTRAINT "program_details_pkey" PRIMARY KEY ("program_id");



ALTER TABLE ONLY "public"."program_faqs"
    ADD CONSTRAINT "program_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_faqs"
    ADD CONSTRAINT "program_faqs_program_id_sort_order_key" UNIQUE ("program_id", "sort_order");



ALTER TABLE ONLY "public"."program_finance_audit_events"
    ADD CONSTRAINT "program_finance_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_instructor_events"
    ADD CONSTRAINT "program_instructor_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_media"
    ADD CONSTRAINT "program_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_media"
    ADD CONSTRAINT "program_media_program_id_sort_order_key" UNIQUE ("program_id", "sort_order");



ALTER TABLE ONLY "public"."program_outcomes"
    ADD CONSTRAINT "program_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_outcomes"
    ADD CONSTRAINT "program_outcomes_program_id_sort_order_key" UNIQUE ("program_id", "sort_order");



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_session_cancellations"
    ADD CONSTRAINT "program_session_cancellations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_session_cancellations"
    ADD CONSTRAINT "program_session_cancellations_program_id_session_date_start_key" UNIQUE ("program_id", "session_date", "start_time");



ALTER TABLE ONLY "public"."program_sessions"
    ADD CONSTRAINT "program_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_student_invites"
    ADD CONSTRAINT "program_student_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_subscription_tracks"
    ADD CONSTRAINT "program_subscription_tracks_pkey" PRIMARY KEY ("program_subscription_id", "program_track_id");



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_teachers"
    ADD CONSTRAINT "program_teachers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_teachers"
    ADD CONSTRAINT "program_teachers_program_id_teacher_profile_id_key" UNIQUE ("program_id", "teacher_profile_id");



ALTER TABLE ONLY "public"."program_track_sessions"
    ADD CONSTRAINT "program_track_sessions_pkey" PRIMARY KEY ("program_track_id", "program_session_id");



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_track_transfer_rules"
    ADD CONSTRAINT "program_track_transfer_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_tracks"
    ADD CONSTRAINT "program_tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_tracks"
    ADD CONSTRAINT "program_tracks_program_id_sort_order_key" UNIQUE ("program_id", "sort_order");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_error_logs"
    ADD CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_join_requests"
    ADD CONSTRAINT "teacher_join_requests_mosque_id_profile_id_key" UNIQUE ("mosque_id", "profile_id");



ALTER TABLE ONLY "public"."teacher_join_requests"
    ADD CONSTRAINT "teacher_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_notification_state"
    ADD CONSTRAINT "teacher_notification_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_notification_state"
    ADD CONSTRAINT "teacher_notification_state_user_id_notification_key_key" UNIQUE ("user_id", "notification_key");



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "enrollment_requests_admission_completed_idx" ON "public"."enrollment_requests" USING "btree" ("program_id", "admission_completed_at" DESC) WHERE ("admission_completed_at" IS NOT NULL);



CREATE INDEX "enrollment_requests_program_status_idx" ON "public"."enrollment_requests" USING "btree" ("program_id", "status");



CREATE INDEX "enrollment_requests_source_invite_idx" ON "public"."enrollment_requests" USING "btree" ("source_student_invite_id");



CREATE INDEX "enrollment_requests_student_idx" ON "public"."enrollment_requests" USING "btree" ("student_profile_id");



CREATE INDEX "enrollments_program_status_idx" ON "public"."enrollments" USING "btree" ("program_id", "status");



CREATE UNIQUE INDEX "enrollments_program_student_unique" ON "public"."enrollments" USING "btree" ("program_id", "student_profile_id");



CREATE INDEX "mosque_memberships_mosque_profile_idx" ON "public"."mosque_memberships" USING "btree" ("mosque_id", "profile_id");



CREATE INDEX "mosque_memberships_profile_idx" ON "public"."mosque_memberships" USING "btree" ("profile_id");



CREATE INDEX "parent_child_links_child_idx" ON "public"."parent_child_links" USING "btree" ("child_profile_id", "mosque_id");



CREATE INDEX "parent_child_links_parent_idx" ON "public"."parent_child_links" USING "btree" ("parent_profile_id", "mosque_id");



CREATE INDEX "program_announcement_receipts_profile_idx" ON "public"."program_announcement_receipts" USING "btree" ("profile_id", "dismissed_at", "read_at");



CREATE INDEX "program_announcements_program_created_at_idx" ON "public"."program_announcements" USING "btree" ("program_id", "created_at" DESC);



CREATE INDEX "program_announcements_target_tracks_idx" ON "public"."program_announcements" USING "gin" ("target_program_track_ids");



CREATE INDEX "program_attendance_records_program_session_idx" ON "public"."program_attendance_records" USING "btree" ("program_id", "session_date" DESC, "start_time");



CREATE UNIQUE INDEX "program_attendance_records_session_student_unique" ON "public"."program_attendance_records" USING "btree" ("program_id", "session_date", "start_time", "student_profile_id");



CREATE INDEX "program_attendance_records_student_idx" ON "public"."program_attendance_records" USING "btree" ("student_profile_id", "session_date" DESC);



CREATE INDEX "program_content_sections_program_idx" ON "public"."program_content_sections" USING "btree" ("program_id", "sort_order");



CREATE INDEX "program_faqs_program_idx" ON "public"."program_faqs" USING "btree" ("program_id", "sort_order");



CREATE INDEX "program_finance_audit_program_created_idx" ON "public"."program_finance_audit_events" USING "btree" ("program_id", "created_at" DESC);



CREATE INDEX "program_instructor_events_program_created_idx" ON "public"."program_instructor_events" USING "btree" ("program_id", "created_at" DESC);



CREATE INDEX "program_media_program_idx" ON "public"."program_media" USING "btree" ("program_id", "sort_order");



CREATE INDEX "program_outcomes_program_idx" ON "public"."program_outcomes" USING "btree" ("program_id", "sort_order");



CREATE UNIQUE INDEX "program_payment_terms_checkout_session_unique" ON "public"."program_payment_terms" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "program_payment_terms_current_request_unique" ON "public"."program_payment_terms" USING "btree" ("enrollment_request_id") WHERE (("enrollment_request_id" IS NOT NULL) AND ("status" <> ALL (ARRAY['superseded'::"text", 'cancelled'::"text", 'ended'::"text"])));



CREATE INDEX "program_payment_terms_program_status_idx" ON "public"."program_payment_terms" USING "btree" ("program_id", "status");



CREATE INDEX "program_payment_terms_program_student_idx" ON "public"."program_payment_terms" USING "btree" ("program_id", "student_profile_id", "created_at" DESC);



CREATE UNIQUE INDEX "program_payment_terms_subscription_unique" ON "public"."program_payment_terms" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "program_payments_parent_idx" ON "public"."program_payments" USING "btree" ("parent_profile_id", "paid_at" DESC);



CREATE INDEX "program_payments_program_idx" ON "public"."program_payments" USING "btree" ("program_id", "paid_at" DESC);



CREATE UNIQUE INDEX "program_payments_stripe_charge_unique" ON "public"."program_payments" USING "btree" ("stripe_charge_id");



CREATE UNIQUE INDEX "program_payments_stripe_invoice_unique" ON "public"."program_payments" USING "btree" ("stripe_invoice_id");



CREATE INDEX "program_payments_student_idx" ON "public"."program_payments" USING "btree" ("student_profile_id", "paid_at" DESC);



CREATE INDEX "program_session_cancellations_lookup_idx" ON "public"."program_session_cancellations" USING "btree" ("program_id", "session_date");



CREATE INDEX "program_sessions_program_date_idx" ON "public"."program_sessions" USING "btree" ("program_id", "session_date", "start_time");



CREATE INDEX "program_sessions_track_date_idx" ON "public"."program_sessions" USING "btree" ("program_track_id", "session_date", "start_time");



CREATE UNIQUE INDEX "program_student_invites_code_unique" ON "public"."program_student_invites" USING "btree" ("invite_code");



CREATE INDEX "program_student_invites_program_idx" ON "public"."program_student_invites" USING "btree" ("program_id");



CREATE INDEX "program_student_invites_track_idx" ON "public"."program_student_invites" USING "btree" ("program_track_id");



CREATE INDEX "program_student_notes_program_student_idx" ON "public"."program_student_notes" USING "btree" ("program_id", "student_profile_id", "created_at" DESC);



CREATE INDEX "program_student_notes_recipient_seen_idx" ON "public"."program_student_notes" USING "btree" ("recipient_profile_id", "seen_at", "created_at" DESC);



CREATE UNIQUE INDEX "program_subscriptions_checkout_session_unique" ON "public"."program_subscriptions" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "program_subscriptions_program_idx" ON "public"."program_subscriptions" USING "btree" ("program_id", "status");



CREATE UNIQUE INDEX "program_subscriptions_program_student_conflict_idx" ON "public"."program_subscriptions" USING "btree" ("program_id", "student_profile_id");



CREATE UNIQUE INDEX "program_subscriptions_program_student_unique" ON "public"."program_subscriptions" USING "btree" ("program_id", "student_profile_id") WHERE (("program_id" IS NOT NULL) AND ("student_profile_id" IS NOT NULL));



CREATE UNIQUE INDEX "program_subscriptions_stripe_subscription_unique" ON "public"."program_subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "program_subscriptions_student_idx" ON "public"."program_subscriptions" USING "btree" ("student_profile_id", "status");



CREATE UNIQUE INDEX "program_teachers_invite_code_idx" ON "public"."program_teachers" USING "btree" ("invite_code") WHERE ("invite_code" IS NOT NULL);



CREATE UNIQUE INDEX "program_teachers_one_director_idx" ON "public"."program_teachers" USING "btree" ("program_id") WHERE ("role" = 'director'::"text");



CREATE INDEX "program_teachers_program_idx" ON "public"."program_teachers" USING "btree" ("program_id");



CREATE INDEX "program_teachers_teacher_idx" ON "public"."program_teachers" USING "btree" ("teacher_profile_id");



CREATE INDEX "program_track_sessions_session_idx" ON "public"."program_track_sessions" USING "btree" ("program_session_id");



CREATE INDEX "program_track_switch_requests_program_idx" ON "public"."program_track_switch_requests" USING "btree" ("program_id", "status");



CREATE UNIQUE INDEX "program_track_transfer_rules_unique" ON "public"."program_track_transfer_rules" USING "btree" ("program_id", "from_track_id", "to_track_id");



CREATE INDEX "program_tracks_program_idx" ON "public"."program_tracks" USING "btree" ("program_id", "sort_order");



CREATE INDEX "programs_public_listing_idx" ON "public"."programs" USING "btree" ("mosque_id", "publication_status", "lifecycle_status", "application_status");



CREATE INDEX "push_subscriptions_profile_id_idx" ON "public"."push_subscriptions" USING "btree" ("profile_id");



CREATE INDEX "system_error_logs_created_at_idx" ON "public"."system_error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "teacher_notification_state_user_id_idx" ON "public"."teacher_notification_state" USING "btree" ("user_id");



CREATE UNIQUE INDEX "withdrawal_requests_active_unique" ON "public"."withdrawal_requests" USING "btree" ("enrollment_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "withdrawal_requests_program_status_idx" ON "public"."withdrawal_requests" USING "btree" ("program_id", "status", "requested_at" DESC);



CREATE OR REPLACE TRIGGER "populate_program_subscription_legacy_profile_id" BEFORE INSERT OR UPDATE ON "public"."program_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."populate_program_subscription_legacy_profile_id"();



CREATE OR REPLACE TRIGGER "prevent_locked_program_billing_policy_change" BEFORE UPDATE OF "monthly_billing_anchor", "annual_billing_anchor" ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_program_billing_policy_change"();



CREATE OR REPLACE TRIGGER "prevent_teacher_enrollment_request_trigger" BEFORE INSERT OR UPDATE OF "student_profile_id", "parent_profile_id" ON "public"."enrollment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_teacher_enrollment_request"();



ALTER TABLE ONLY "public"."enrollment_request_tracks"
    ADD CONSTRAINT "enrollment_request_tracks_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "public"."enrollment_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_request_tracks"
    ADD CONSTRAINT "enrollment_request_tracks_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "public"."program_payment_terms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_source_student_invite_id_fkey" FOREIGN KEY ("source_student_invite_id") REFERENCES "public"."program_student_invites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollment_requests"
    ADD CONSTRAINT "enrollment_requests_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_tracks"
    ADD CONSTRAINT "enrollment_tracks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment_tracks"
    ADD CONSTRAINT "enrollment_tracks_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mosque_memberships"
    ADD CONSTRAINT "mosque_memberships_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mosque_memberships"
    ADD CONSTRAINT "mosque_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mosque_memberships"
    ADD CONSTRAINT "mosque_memberships_teacher_approval_reviewed_by_fkey" FOREIGN KEY ("teacher_approval_reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_child_profile_id_fkey" FOREIGN KEY ("child_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_child_links"
    ADD CONSTRAINT "parent_child_links_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_announcement_receipts"
    ADD CONSTRAINT "program_announcement_receipts_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."program_announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_announcement_receipts"
    ADD CONSTRAINT "program_announcement_receipts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_announcements"
    ADD CONSTRAINT "program_announcements_author_profile_id_fkey" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_announcements"
    ADD CONSTRAINT "program_announcements_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_applications"
    ADD CONSTRAINT "program_applications_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_applications"
    ADD CONSTRAINT "program_applications_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_program_session_id_fkey" FOREIGN KEY ("program_session_id") REFERENCES "public"."program_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_attendance_records"
    ADD CONSTRAINT "program_attendance_records_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_content_sections"
    ADD CONSTRAINT "program_content_sections_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_details"
    ADD CONSTRAINT "program_details_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_faqs"
    ADD CONSTRAINT "program_faqs_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_finance_audit_events"
    ADD CONSTRAINT "program_finance_audit_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_finance_audit_events"
    ADD CONSTRAINT "program_finance_audit_events_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_finance_audit_events"
    ADD CONSTRAINT "program_finance_audit_events_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_instructor_events"
    ADD CONSTRAINT "program_instructor_events_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_instructor_events"
    ADD CONSTRAINT "program_instructor_events_teacher_profile_id_fkey" FOREIGN KEY ("teacher_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_media"
    ADD CONSTRAINT "program_media_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_outcomes"
    ADD CONSTRAINT "program_outcomes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "public"."enrollment_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payment_terms"
    ADD CONSTRAINT "program_payment_terms_superseded_by_payment_terms_id_fkey" FOREIGN KEY ("superseded_by_payment_terms_id") REFERENCES "public"."program_payment_terms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "public"."program_payment_terms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_program_subscription_id_fkey" FOREIGN KEY ("program_subscription_id") REFERENCES "public"."program_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_payments"
    ADD CONSTRAINT "program_payments_tax_receipt_issued_by_fkey" FOREIGN KEY ("tax_receipt_issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_session_cancellations"
    ADD CONSTRAINT "program_session_cancellations_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."program_announcements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_session_cancellations"
    ADD CONSTRAINT "program_session_cancellations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_session_cancellations"
    ADD CONSTRAINT "program_session_cancellations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_sessions"
    ADD CONSTRAINT "program_sessions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_sessions"
    ADD CONSTRAINT "program_sessions_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_invites"
    ADD CONSTRAINT "program_student_invites_claimed_by_profile_id_fkey" FOREIGN KEY ("claimed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_student_invites"
    ADD CONSTRAINT "program_student_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_student_invites"
    ADD CONSTRAINT "program_student_invites_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_invites"
    ADD CONSTRAINT "program_student_invites_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_author_profile_id_fkey" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_seen_by_fkey" FOREIGN KEY ("seen_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_student_notes"
    ADD CONSTRAINT "program_student_notes_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscription_tracks"
    ADD CONSTRAINT "program_subscription_tracks_program_subscription_id_fkey" FOREIGN KEY ("program_subscription_id") REFERENCES "public"."program_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscription_tracks"
    ADD CONSTRAINT "program_subscription_tracks_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_enrollment_request_id_fkey" FOREIGN KEY ("enrollment_request_id") REFERENCES "public"."enrollment_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_payment_terms_id_fkey" FOREIGN KEY ("payment_terms_id") REFERENCES "public"."program_payment_terms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_subscriptions"
    ADD CONSTRAINT "program_subscriptions_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_teachers"
    ADD CONSTRAINT "program_teachers_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_teachers"
    ADD CONSTRAINT "program_teachers_teacher_profile_id_fkey" FOREIGN KEY ("teacher_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_sessions"
    ADD CONSTRAINT "program_track_sessions_program_session_id_fkey" FOREIGN KEY ("program_session_id") REFERENCES "public"."program_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_sessions"
    ADD CONSTRAINT "program_track_sessions_program_track_id_fkey" FOREIGN KEY ("program_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_track_switch_requests"
    ADD CONSTRAINT "program_track_switch_requests_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_transfer_rules"
    ADD CONSTRAINT "program_track_transfer_rules_from_track_id_fkey" FOREIGN KEY ("from_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_transfer_rules"
    ADD CONSTRAINT "program_track_transfer_rules_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_track_transfer_rules"
    ADD CONSTRAINT "program_track_transfer_rules_to_track_id_fkey" FOREIGN KEY ("to_track_id") REFERENCES "public"."program_tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_tracks"
    ADD CONSTRAINT "program_tracks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_director_profile_id_fkey" FOREIGN KEY ("director_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_teacher_profile_id_fkey" FOREIGN KEY ("teacher_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_join_requests"
    ADD CONSTRAINT "teacher_join_requests_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_join_requests"
    ADD CONSTRAINT "teacher_join_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_join_requests"
    ADD CONSTRAINT "teacher_join_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teacher_notification_state"
    ADD CONSTRAINT "teacher_notification_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_mosque_id_fkey" FOREIGN KEY ("mosque_id") REFERENCES "public"."mosques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_parent_profile_id_fkey" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Mosque admins can update teacher requests" ON "public"."teacher_join_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships"
  WHERE (("mosque_memberships"."mosque_id" = "teacher_join_requests"."mosque_id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "Mosque admins can view teacher requests" ON "public"."teacher_join_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships"
  WHERE (("mosque_memberships"."mosque_id" = "teacher_join_requests"."mosque_id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "Users can create their own teacher requests" ON "public"."teacher_join_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can delete their own rejected requests" ON "public"."teacher_join_requests" FOR DELETE USING ((("auth"."uid"() = "profile_id") AND ("status" = 'rejected'::"text")));



CREATE POLICY "Users can view their own teacher requests" ON "public"."teacher_join_requests" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "admins_select_mosque_links" ON "public"."parent_child_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships"
  WHERE (("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."mosque_id" = "parent_child_links"."mosque_id") AND ("mosque_memberships"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "admins_select_teacher_requester_profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."teacher_join_requests"
     JOIN "public"."mosque_memberships" ON (("teacher_join_requests"."mosque_id" = "mosque_memberships"."mosque_id")))
  WHERE (("teacher_join_requests"."profile_id" = "profiles"."id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "announcement receipts visible to owner and program teachers" ON "public"."program_announcement_receipts" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."program_announcements" "pa"
  WHERE (("pa"."id" = "program_announcement_receipts"."announcement_id") AND "public"."is_program_teacher"("pa"."program_id"))))));



CREATE POLICY "announcements_insert_teacher" ON "public"."program_announcements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_announcements"."program_id") AND ("p"."teacher_profile_id" = "auth"."uid"())))));



CREATE POLICY "announcements_select" ON "public"."program_announcements" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."program_id" = "program_announcements"."program_id") AND ("e"."student_profile_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_announcements"."program_id") AND ("p"."teacher_profile_id" = "auth"."uid"()))))));



CREATE POLICY "anyone can view transfer rules" ON "public"."program_track_transfer_rules" FOR SELECT USING (true);



CREATE POLICY "application reviewers can read applicant profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."can_read_application_profile"("id"));



CREATE POLICY "applications_insert_own" ON "public"."program_applications" FOR INSERT WITH CHECK (("student_profile_id" = "auth"."uid"()));



CREATE POLICY "applications_select_own" ON "public"."program_applications" FOR SELECT USING (("student_profile_id" = "auth"."uid"()));



CREATE POLICY "applications_select_teacher" ON "public"."program_applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_applications"."program_id") AND ("p"."teacher_profile_id" = "auth"."uid"())))));



CREATE POLICY "applications_update_teacher" ON "public"."program_applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_applications"."program_id") AND ("p"."teacher_profile_id" = "auth"."uid"())))));



CREATE POLICY "authenticated_users_can_create_mosques" ON "public"."mosques" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authorized staff create announcements" ON "public"."program_announcements" FOR INSERT WITH CHECK ((("author_profile_id" = "auth"."uid"()) AND "public"."can_announce_program"("program_id")));



CREATE POLICY "authorized staff manage student invites" ON "public"."program_student_invites" USING ("public"."can_send_program_direct_invitations"("program_id")) WITH CHECK ("public"."can_send_program_direct_invitations"("program_id"));



CREATE POLICY "authorized staff review enrollment requests" ON "public"."enrollment_requests" FOR UPDATE USING ("public"."can_decide_program_applications"("program_id")) WITH CHECK ("public"."can_decide_program_applications"("program_id"));



CREATE POLICY "authorized staff update enrollments" ON "public"."enrollments" FOR UPDATE USING ("public"."can_manage_program_enrollments"("program_id")) WITH CHECK ("public"."can_manage_program_enrollments"("program_id"));



CREATE POLICY "directors and admins manage program sessions" ON "public"."program_sessions" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "directors and admins manage program track sessions" ON "public"."program_track_sessions" USING ((EXISTS ( SELECT 1
   FROM "public"."program_sessions" "ps"
  WHERE (("ps"."id" = "program_track_sessions"."program_session_id") AND "public"."can_manage_program"("ps"."program_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."program_sessions" "ps"
  WHERE (("ps"."id" = "program_track_sessions"."program_session_id") AND "public"."can_manage_program"("ps"."program_id")))));



CREATE POLICY "enrolled students and teachers view cancelled sessions" ON "public"."program_session_cancellations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."program_id" = "program_session_cancellations"."program_id") AND ("e"."student_profile_id" = "auth"."uid"())))) OR "public"."is_program_teacher"("program_id")));



CREATE POLICY "enrolled students parents and teachers view announcements" ON "public"."program_announcements" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."program_id" = "program_announcements"."program_id") AND (("e"."student_profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM ("public"."parent_child_links" "pcl"
             JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
          WHERE (("pcl"."parent_profile_id" = "auth"."uid"()) AND ("pcl"."child_profile_id" = "e"."student_profile_id") AND ("pcl"."mosque_id" = "p"."mosque_id")))))))) OR "public"."is_program_teacher"("program_id")));



CREATE POLICY "enrollment request tracks visible with request" ON "public"."enrollment_request_tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."enrollment_requests" "er"
  WHERE (("er"."id" = "enrollment_request_tracks"."enrollment_request_id") AND (("er"."student_profile_id" = "auth"."uid"()) OR ("er"."parent_profile_id" = "auth"."uid"()) OR "public"."can_view_program_applications"("er"."program_id"))))));



CREATE POLICY "enrollment requests require an accepting program" ON "public"."enrollment_requests" AS RESTRICTIVE FOR INSERT WITH CHECK (("public"."can_manage_program"("program_id") OR (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "enrollment_requests"."program_id") AND ("p"."publication_status" <> ALL (ARRAY['draft'::"text", 'archived'::"text"])) AND ("p"."lifecycle_status" <> ALL (ARRAY['completed'::"text", 'cancelled'::"text", 'archived'::"text"])) AND ("p"."application_status" = ANY (ARRAY['accepting'::"text", 'waitlist_only'::"text"])) AND (("p"."application_open_at" IS NULL) OR ("p"."application_open_at" <= "now"())) AND (("p"."application_close_at" IS NULL) OR ("p"."application_close_at" >= "now"())))))));



CREATE POLICY "enrollment requests visible to owner and authorized staff" ON "public"."enrollment_requests" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR "public"."can_view_program_applications"("program_id") OR "public"."can_decide_program_applications"("program_id")));



CREATE POLICY "enrollment tracks visible to enrolled users and staff" ON "public"."enrollment_tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."id" = "enrollment_tracks"."enrollment_id") AND (("e"."student_profile_id" = "auth"."uid"()) OR "public"."can_manage_program"("e"."program_id"))))));



ALTER TABLE "public"."enrollment_request_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollment_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollment_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enrollments_delete_own" ON "public"."enrollments" FOR DELETE USING (("student_profile_id" = "auth"."uid"()));



CREATE POLICY "enrollments_insert_own" ON "public"."enrollments" FOR INSERT WITH CHECK (("student_profile_id" = "auth"."uid"()));



CREATE POLICY "enrollments_select_admin" ON "public"."enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."programs" "p"
     JOIN "public"."mosque_memberships" "mm" ON (("mm"."mosque_id" = "p"."mosque_id")))
  WHERE (("p"."id" = "enrollments"."program_id") AND ("mm"."profile_id" = "auth"."uid"()) AND ("mm"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "enrollments_select_own" ON "public"."enrollments" FOR SELECT USING (("student_profile_id" = "auth"."uid"()));



CREATE POLICY "enrollments_select_teacher" ON "public"."enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "enrollments"."program_id") AND ("p"."teacher_profile_id" = "auth"."uid"())))));



CREATE POLICY "finance managers manage payment terms" ON "public"."program_payment_terms" USING ("public"."can_manage_program_finances"("program_id")) WITH CHECK ("public"."can_manage_program_finances"("program_id"));



CREATE POLICY "finance managers update tax receipt fields" ON "public"."program_payments" FOR UPDATE USING ("public"."can_manage_program_finances"("program_id")) WITH CHECK ("public"."can_manage_program_finances"("program_id"));



CREATE POLICY "finance managers view program payments" ON "public"."program_payments" FOR SELECT USING ("public"."can_manage_program_finances"("program_id"));



CREATE POLICY "memberships visible to member and mosque admins" ON "public"."mosque_memberships" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."has_mosque_role"("mosque_id", ARRAY['admin'::"text"])));



CREATE POLICY "memberships_insert" ON "public"."mosque_memberships" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "memberships_select_admin" ON "public"."mosque_memberships" FOR SELECT USING ("public"."is_mosque_admin"("mosque_id"));



CREATE POLICY "memberships_select_own" ON "public"."mosque_memberships" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "memberships_update_admin" ON "public"."mosque_memberships" FOR UPDATE USING ("public"."is_mosque_admin"("mosque_id"));



CREATE POLICY "mosque admins manage memberships" ON "public"."mosque_memberships" USING ("public"."has_mosque_role"("mosque_id", ARRAY['admin'::"text"])) WITH CHECK ("public"."has_mosque_role"("mosque_id", ARRAY['admin'::"text"]));



CREATE POLICY "mosque admins view mosque member profiles" ON "public"."profiles" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships" "mm"
  WHERE (("mm"."profile_id" = "profiles"."id") AND "public"."has_mosque_role"("mm"."mosque_id", ARRAY['admin'::"text"])))) OR (EXISTS ( SELECT 1
   FROM ("public"."program_teachers" "pt"
     JOIN "public"."programs" "p" ON (("p"."id" = "pt"."program_id")))
  WHERE (("pt"."teacher_profile_id" = "profiles"."id") AND "public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"]))))));



CREATE POLICY "mosque_admins_can_update_mosque" ON "public"."mosques" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships"
  WHERE (("mosque_memberships"."mosque_id" = "mosques"."id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "mosque_members_select_profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."mosque_memberships" "my_membership"
     JOIN "public"."mosque_memberships" "their_membership" ON (("my_membership"."mosque_id" = "their_membership"."mosque_id")))
  WHERE (("my_membership"."profile_id" = "auth"."uid"()) AND ("my_membership"."role" = ANY (ARRAY['mosque_admin'::"text", 'teacher'::"text", 'lead_teacher'::"text"])) AND ("their_membership"."profile_id" = "profiles"."id")))));



ALTER TABLE "public"."mosque_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mosques" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mosques_select_all" ON "public"."mosques" FOR SELECT USING (true);



ALTER TABLE "public"."parent_child_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parents can view child profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_parent_of_child"("id"));



CREATE POLICY "parents manage their child links" ON "public"."parent_child_links" USING (("parent_profile_id" = "auth"."uid"())) WITH CHECK ((("parent_profile_id" = "auth"."uid"()) AND "public"."has_mosque_role"("mosque_id", ARRAY['parent'::"text"], "auth"."uid"())));



CREATE POLICY "parents_delete_own_links" ON "public"."parent_child_links" FOR DELETE USING (("parent_profile_id" = "auth"."uid"()));



CREATE POLICY "parents_insert_child_applications" ON "public"."program_applications" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parent_child_links"
  WHERE (("parent_child_links"."parent_profile_id" = "auth"."uid"()) AND ("parent_child_links"."child_profile_id" = "program_applications"."student_profile_id")))));



CREATE POLICY "parents_insert_child_enrollments" ON "public"."enrollments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parent_child_links"
  WHERE (("parent_child_links"."parent_profile_id" = "auth"."uid"()) AND ("parent_child_links"."child_profile_id" = "enrollments"."student_profile_id")))));



CREATE POLICY "parents_insert_own_links" ON "public"."parent_child_links" FOR INSERT WITH CHECK (("parent_profile_id" = "auth"."uid"()));



CREATE POLICY "parents_select_child_applications" ON "public"."program_applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."parent_child_links"
  WHERE (("parent_child_links"."parent_profile_id" = "auth"."uid"()) AND ("parent_child_links"."child_profile_id" = "program_applications"."student_profile_id")))));



CREATE POLICY "parents_select_child_enrollments" ON "public"."enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."parent_child_links"
  WHERE (("parent_child_links"."parent_profile_id" = "auth"."uid"()) AND ("parent_child_links"."child_profile_id" = "enrollments"."student_profile_id")))));



CREATE POLICY "parents_select_child_profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."parent_child_links"
  WHERE (("parent_child_links"."parent_profile_id" = "auth"."uid"()) AND ("parent_child_links"."child_profile_id" = "profiles"."id")))));



CREATE POLICY "parents_select_own_links" ON "public"."parent_child_links" FOR SELECT USING (("parent_profile_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "program directors and admins manage program teachers" ON "public"."program_teachers" USING ("public"."is_program_director"("program_id")) WITH CHECK ("public"."is_program_director"("program_id"));



CREATE POLICY "program finance audit insertable by admins and finance staff" ON "public"."program_finance_audit_events" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_finance_audit_events"."program_id") AND "public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"])))) OR (EXISTS ( SELECT 1
   FROM "public"."program_teachers" "pt"
  WHERE (("pt"."program_id" = "program_finance_audit_events"."program_id") AND ("pt"."teacher_profile_id" = "auth"."uid"()) AND ("pt"."can_manage_finances" = true))))));



CREATE POLICY "program finance audit visible to admins and finance staff" ON "public"."program_finance_audit_events" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_finance_audit_events"."program_id") AND "public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"])))) OR (EXISTS ( SELECT 1
   FROM "public"."program_teachers" "pt"
  WHERE (("pt"."program_id" = "program_finance_audit_events"."program_id") AND ("pt"."teacher_profile_id" = "auth"."uid"()) AND ("pt"."can_manage_finances" = true))))));



CREATE POLICY "program instructor events visible to directors and admins" ON "public"."program_instructor_events" FOR SELECT USING (("public"."is_program_director"("program_id") OR (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_instructor_events"."program_id") AND "public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"]))))));



CREATE POLICY "program managers manage attendance records" ON "public"."program_attendance_records" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "program managers manage transfer rules" ON "public"."program_track_transfer_rules" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "program managers view attendance records" ON "public"."program_attendance_records" FOR SELECT USING ("public"."can_manage_program"("program_id"));



CREATE POLICY "program staff manage withdrawal requests" ON "public"."withdrawal_requests" FOR UPDATE USING (("public"."can_manage_program"("program_id") OR ("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR ("requested_by" = "auth"."uid"()))) WITH CHECK (("public"."can_manage_program"("program_id") OR ("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR ("requested_by" = "auth"."uid"())));



CREATE POLICY "program staff profiles visible to assigned staff and mosque adm" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."program_teachers" "pt"
     JOIN "public"."programs" "p" ON (("p"."id" = "pt"."program_id")))
  WHERE (("pt"."teacher_profile_id" = "profiles"."id") AND ("public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"]) OR "public"."is_program_teacher"("pt"."program_id"))))));



CREATE POLICY "program teachers and admins delete enrollments" ON "public"."enrollments" FOR DELETE USING ("public"."is_program_teacher"("program_id"));



CREATE POLICY "program teachers can view request and enrolled student profiles" ON "public"."profiles" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."enrollment_requests" "er"
  WHERE (("er"."student_profile_id" = "profiles"."id") AND "public"."is_program_director"("er"."program_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."student_profile_id" = "profiles"."id") AND "public"."is_program_teacher"("e"."program_id"))))));



CREATE POLICY "program teachers create student notes" ON "public"."program_student_notes" FOR INSERT WITH CHECK ((("author_profile_id" = "auth"."uid"()) AND "public"."is_program_teacher"("program_id") AND (("recipient_profile_id" = "student_profile_id") OR (("parent_profile_id" = "recipient_profile_id") AND "public"."is_parent_of_child"("student_profile_id", "parent_profile_id", "mosque_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."program_id" = "program_student_notes"."program_id") AND ("e"."student_profile_id" = "program_student_notes"."student_profile_id"))))));



CREATE POLICY "program teachers view student notes" ON "public"."program_student_notes" FOR SELECT USING ("public"."is_program_teacher"("program_id"));



CREATE POLICY "program teachers visible to program staff and mosque admins" ON "public"."program_teachers" FOR SELECT USING ((("teacher_profile_id" = "auth"."uid"()) OR "public"."is_program_teacher"("program_id") OR (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_teachers"."program_id") AND "public"."has_mosque_role"("p"."mosque_id", ARRAY['admin'::"text"]))))));



ALTER TABLE "public"."program_announcement_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_attendance_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_content_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_finance_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_instructor_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_payment_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_session_cancellations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_student_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_student_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_subscription_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_teachers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_track_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_track_switch_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_track_transfer_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs visibility restriction" ON "public"."programs" AS RESTRICTIVE FOR SELECT USING ((("is_active" = true) OR "public"."can_manage_program"("id")));



CREATE POLICY "programs_delete_admin" ON "public"."programs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships" "mm"
  WHERE (("mm"."profile_id" = "auth"."uid"()) AND ("mm"."mosque_id" = "programs"."mosque_id") AND ("mm"."role" = 'mosque_admin'::"text")))));



CREATE POLICY "programs_insert_admin" ON "public"."programs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships" "mm"
  WHERE (("mm"."profile_id" = "auth"."uid"()) AND ("mm"."mosque_id" = "programs"."mosque_id") AND (("mm"."role" = 'mosque_admin'::"text") OR ("mm"."can_manage_programs" = true))))));



CREATE POLICY "programs_select_all" ON "public"."programs" FOR SELECT USING (true);



CREATE POLICY "programs_update_admin" ON "public"."programs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."mosque_memberships" "mm"
  WHERE (("mm"."profile_id" = "auth"."uid"()) AND ("mm"."mosque_id" = "programs"."mosque_id") AND (("mm"."role" = 'mosque_admin'::"text") OR ("mm"."can_manage_programs" = true))))));



CREATE POLICY "public can view active program content sections" ON "public"."program_content_sections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_content_sections"."program_id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program details" ON "public"."program_details" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_details"."program_id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program director display profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."director_profile_id" = "profiles"."id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program faqs" ON "public"."program_faqs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_faqs"."program_id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program media" ON "public"."program_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_media"."program_id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program outcomes" ON "public"."program_outcomes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_outcomes"."program_id") AND ("p"."is_active" = true)))));



CREATE POLICY "public can view active program tracks" ON "public"."program_tracks" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_tracks"."program_id") AND ("p"."is_active" = true))))));



CREATE POLICY "public can view visible program sessions" ON "public"."program_sessions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "program_sessions"."program_id") AND ("p"."publication_status" = ANY (ARRAY['published'::"text", 'hidden'::"text"])) AND ("p"."lifecycle_status" <> ALL (ARRAY['cancelled'::"text", 'archived'::"text"]))))) OR "public"."can_manage_program"("program_id")));



CREATE POLICY "public can view visible program track sessions" ON "public"."program_track_sessions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."program_sessions" "ps"
     JOIN "public"."programs" "p" ON (("p"."id" = "ps"."program_id")))
  WHERE (("ps"."id" = "program_track_sessions"."program_session_id") AND ("p"."publication_status" = ANY (ARRAY['published'::"text", 'hidden'::"text"])) AND ("p"."lifecycle_status" <> ALL (ARRAY['cancelled'::"text", 'archived'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."program_sessions" "ps"
  WHERE (("ps"."id" = "program_track_sessions"."program_session_id") AND "public"."can_manage_program"("ps"."program_id"))))));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff manage enrollment tracks" ON "public"."enrollment_tracks" USING ((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."id" = "enrollment_tracks"."enrollment_id") AND "public"."can_manage_program"("e"."program_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."enrollments" "e"
     JOIN "public"."program_tracks" "pt" ON (("pt"."id" = "enrollment_tracks"."program_track_id")))
  WHERE (("e"."id" = "enrollment_tracks"."enrollment_id") AND ("pt"."program_id" = "e"."program_id") AND "public"."can_manage_program"("e"."program_id")))));



CREATE POLICY "student and parent view own program notes" ON "public"."program_student_notes" FOR SELECT USING ((("recipient_profile_id" = "auth"."uid"()) OR ("student_profile_id" = "auth"."uid"()) OR (("parent_profile_id" = "auth"."uid"()) AND "public"."is_parent_of_child"("student_profile_id", "auth"."uid"(), "mosque_id"))));



CREATE POLICY "students and parents cancel and dismiss own enrollment requests" ON "public"."enrollment_requests" FOR UPDATE USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()))) WITH CHECK ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"())));



CREATE POLICY "students and parents create enrollment requests" ON "public"."enrollment_requests" FOR INSERT WITH CHECK (((NOT "public"."is_staff_account"("auth"."uid"())) AND (NOT "public"."is_staff_account"("student_profile_id")) AND ((("student_profile_id" = "auth"."uid"()) AND ("parent_profile_id" IS NULL)) OR (("parent_profile_id" = "auth"."uid"()) AND "public"."is_parent_of_child"("student_profile_id", "auth"."uid"(), "mosque_id")))));



CREATE POLICY "students and parents create switch requests" ON "public"."program_track_switch_requests" FOR INSERT WITH CHECK ((("student_profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."parent_child_links" "pcl"
  WHERE (("pcl"."child_profile_id" = "program_track_switch_requests"."student_profile_id") AND ("pcl"."parent_profile_id" = "auth"."uid"()))))));



CREATE POLICY "students and parents create withdrawal requests" ON "public"."withdrawal_requests" FOR INSERT WITH CHECK ((("requested_by" = "auth"."uid"()) AND (("student_profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."parent_child_links" "pcl"
  WHERE (("pcl"."parent_profile_id" = "auth"."uid"()) AND ("pcl"."child_profile_id" = "withdrawal_requests"."student_profile_id") AND ("pcl"."mosque_id" = "withdrawal_requests"."mosque_id")))))));



CREATE POLICY "students and parents view own payments" ON "public"."program_payments" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"())));



CREATE POLICY "students and parents view own switch requests" ON "public"."program_track_switch_requests" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."parent_child_links" "pcl"
  WHERE (("pcl"."child_profile_id" = "program_track_switch_requests"."student_profile_id") AND ("pcl"."parent_profile_id" = "auth"."uid"())))) OR "public"."can_manage_program"("program_id")));



CREATE POLICY "students manage own announcement receipts" ON "public"."program_announcement_receipts" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "students parents and finance managers view payment terms" ON "public"."program_payment_terms" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR "public"."can_manage_program_finances"("program_id")));



CREATE POLICY "students parents and staff manage enrollment request tracks" ON "public"."enrollment_request_tracks" USING ((EXISTS ( SELECT 1
   FROM "public"."enrollment_requests" "er"
  WHERE (("er"."id" = "enrollment_request_tracks"."enrollment_request_id") AND (("er"."student_profile_id" = "auth"."uid"()) OR ("er"."parent_profile_id" = "auth"."uid"()) OR "public"."can_manage_program"("er"."program_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."enrollment_requests" "er"
     JOIN "public"."program_tracks" "pt" ON (("pt"."id" = "enrollment_request_tracks"."program_track_id")))
  WHERE (("er"."id" = "enrollment_request_tracks"."enrollment_request_id") AND ("pt"."program_id" = "er"."program_id") AND (("er"."student_profile_id" = "auth"."uid"()) OR ("er"."parent_profile_id" = "auth"."uid"()) OR "public"."can_manage_program"("er"."program_id"))))));



CREATE POLICY "students parents and teachers view program subscriptions" ON "public"."program_subscriptions" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR "public"."is_program_teacher"("program_id")));



CREATE POLICY "students parents and teachers view relevant enrollments" ON "public"."enrollments" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."parent_child_links" "pcl"
     JOIN "public"."programs" "p" ON (("p"."id" = "enrollments"."program_id")))
  WHERE (("pcl"."parent_profile_id" = "auth"."uid"()) AND ("pcl"."child_profile_id" = "enrollments"."student_profile_id") AND ("pcl"."mosque_id" = "p"."mosque_id")))) OR "public"."is_program_teacher"("program_id")));



CREATE POLICY "subscription tracks visible to subscription users and staff" ON "public"."program_subscription_tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."program_subscriptions" "ps"
  WHERE (("ps"."id" = "program_subscription_tracks"."program_subscription_id") AND (("ps"."student_profile_id" = "auth"."uid"()) OR ("ps"."parent_profile_id" = "auth"."uid"()) OR "public"."can_manage_program"("ps"."program_id"))))));



CREATE POLICY "subscriptions_select_own" ON "public"."program_subscriptions" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."system_error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teacher_join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teacher_notification_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teachers and admins create enrollments" ON "public"."enrollments" FOR INSERT WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins create returned enrollment notices" ON "public"."enrollment_requests" FOR INSERT WITH CHECK ((("status" = ANY (ARRAY['cancelled'::"text", 'rejected'::"text", 'waitlisted'::"text"])) AND "public"."can_manage_program"("program_id")));



CREATE POLICY "teachers and admins manage program content sections" ON "public"."program_content_sections" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins manage program details" ON "public"."program_details" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins manage program faqs" ON "public"."program_faqs" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins manage program media" ON "public"."program_media" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins manage program outcomes" ON "public"."program_outcomes" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers and admins manage program tracks" ON "public"."program_tracks" USING ("public"."can_manage_program"("program_id")) WITH CHECK ("public"."can_manage_program"("program_id"));



CREATE POLICY "teachers can view request enrolled student and parent profiles" ON "public"."profiles" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."enrollment_requests" "er"
  WHERE (("er"."student_profile_id" = "profiles"."id") AND "public"."can_manage_program"("er"."program_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."enrollment_requests" "er"
  WHERE (("er"."parent_profile_id" = "profiles"."id") AND "public"."can_manage_program"("er"."program_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."student_profile_id" = "profiles"."id") AND "public"."can_manage_program"("e"."program_id")))) OR "public"."can_manage_parent_profile"("id")));



CREATE POLICY "teachers cancel assigned program sessions" ON "public"."program_session_cancellations" FOR INSERT WITH CHECK ((("cancelled_by" = "auth"."uid"()) AND "public"."is_program_teacher"("program_id")));



CREATE POLICY "teachers update assigned program cancellations" ON "public"."program_session_cancellations" FOR UPDATE USING ("public"."is_program_teacher"("program_id")) WITH CHECK ("public"."is_program_teacher"("program_id"));



CREATE POLICY "teachers view linked guardians for their students" ON "public"."parent_child_links" FOR SELECT USING ("public"."can_view_child_guardian_link"("child_profile_id"));



CREATE POLICY "teachers_select_applicant_profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."program_applications"
     JOIN "public"."programs" ON (("program_applications"."program_id" = "programs"."id")))
     JOIN "public"."mosque_memberships" ON (("programs"."mosque_id" = "mosque_memberships"."mosque_id")))
  WHERE (("program_applications"."student_profile_id" = "profiles"."id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = ANY (ARRAY['mosque_admin'::"text", 'teacher'::"text", 'lead_teacher'::"text"]))))));



CREATE POLICY "teachers_select_applications" ON "public"."program_applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."programs"
     JOIN "public"."mosque_memberships" ON (("programs"."mosque_id" = "mosque_memberships"."mosque_id")))
  WHERE (("programs"."id" = "program_applications"."program_id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND ("mosque_memberships"."role" = ANY (ARRAY['mosque_admin'::"text", 'teacher'::"text", 'lead_teacher'::"text"]))))));



CREATE POLICY "teachers_update_applications" ON "public"."program_applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."programs"
     JOIN "public"."mosque_memberships" ON (("programs"."mosque_id" = "mosque_memberships"."mosque_id")))
  WHERE (("programs"."id" = "program_applications"."program_id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND (("programs"."teacher_profile_id" = "auth"."uid"()) OR ("mosque_memberships"."role" = 'mosque_admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."programs"
     JOIN "public"."mosque_memberships" ON (("programs"."mosque_id" = "mosque_memberships"."mosque_id")))
  WHERE (("programs"."id" = "program_applications"."program_id") AND ("mosque_memberships"."profile_id" = "auth"."uid"()) AND (("programs"."teacher_profile_id" = "auth"."uid"()) OR ("mosque_memberships"."role" = 'mosque_admin'::"text"))))));



CREATE POLICY "users manage their own notification state" ON "public"."teacher_notification_state" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users manage their own push subscriptions" ON "public"."push_subscriptions" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "users update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "withdrawal requests visible to owner parent and staff" ON "public"."withdrawal_requests" FOR SELECT USING ((("student_profile_id" = "auth"."uid"()) OR ("parent_profile_id" = "auth"."uid"()) OR ("requested_by" = "auth"."uid"()) OR "public"."can_manage_program"("program_id")));



ALTER TABLE "public"."withdrawal_requests" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."approve_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_announce_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_announce_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_announce_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_create_program_in_mosque"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_create_program_in_mosque"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_create_program_in_mosque"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_decide_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_decide_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_decide_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_program_details"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_program_details"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_program_details"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_parent_profile"("check_parent_profile_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_parent_profile"("check_parent_profile_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_parent_profile"("check_parent_profile_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_program"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_program_enrollments"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_program_enrollments"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_program_enrollments"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_program_finances"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_program_finances"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_program_finances"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_application_profile"("check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_send_program_direct_invitations"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_send_program_direct_invitations"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_program_direct_invitations"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_child_guardian_link"("check_child_profile_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_child_guardian_link"("check_child_profile_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_child_guardian_link"("check_child_profile_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_program_applications"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_program_student_records"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_program_student_records"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_program_student_records"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_program_instructor_code"("invite" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_program_instructor_code"("invite" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_program_instructor_code"("invite" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_program_student_invite_code"("invite" "text", "target_student_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_program_student_invite_code"("invite" "text", "target_student_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_program_student_invite_code"("invite" "text", "target_student_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_oauth_profile"("signup_account_type" "text", "signup_full_name" "text", "signup_phone" "text", "signup_gender" "text", "signup_date_of_birth" "date", "signup_mosque_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_oauth_profile"("signup_account_type" "text", "signup_full_name" "text", "signup_phone" "text", "signup_gender" "text", "signup_date_of_birth" "date", "signup_mosque_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_oauth_profile"("signup_account_type" "text", "signup_full_name" "text", "signup_phone" "text", "signup_gender" "text", "signup_date_of_birth" "date", "signup_mosque_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_parent_child_profile"("child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_parent_child_profile"("child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_parent_child_profile"("child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_first_of_month_subscription_alignment"("target_subscription_id" "uuid", "target_period_start" timestamp with time zone, "target_period_end" timestamp with time zone, "target_status" "text", "target_paid_through" timestamp with time zone, "target_next_charge" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_first_of_month_subscription_alignment"("target_subscription_id" "uuid", "target_period_start" timestamp with time zone, "target_period_end" timestamp with time zone, "target_status" "text", "target_paid_through" timestamp with time zone, "target_next_charge" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_no_payment_program_enrollment"("p_enrollment_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_no_payment_program_enrollment"("p_enrollment_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_paid_program_enrollment"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_paid_program_enrollment"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_members_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_members_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_members_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_programs_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_programs_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_programs_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_teacher_requests_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_teacher_requests_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_teacher_requests_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_applicant_applications_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_applicant_applications_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_applicant_applications_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_mosque_programs_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_mosque_programs_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_mosque_programs_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_applications_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_applications_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_applications_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_apply_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_apply_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_apply_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_create_defaults_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_create_defaults_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_create_defaults_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_detail_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_section" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_detail_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_section" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_detail_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_section" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_finance_analytics"("p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_finance_analytics"("p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_finance_analytics"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_finances_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_finances_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_finances_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_program_staff_snapshot"("p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_program_staff_snapshot"("p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_program_staff_snapshot"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_registration_confirmation_snapshot"("p_slug" "text", "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_registration_confirmation_snapshot"("p_slug" "text", "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_registration_confirmation_snapshot"("p_slug" "text", "p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_enrollments_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_enrollments_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_enrollments_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_inbox_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_inbox_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_inbox_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_schedule_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_schedule_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_schedule_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_withdrawal_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_withdrawal_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_withdrawal_options_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_teacher_announcements_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_announcements_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_announcements_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_teacher_inbox_snapshot"("p_slug" "text", "p_selected_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_inbox_snapshot"("p_slug" "text", "p_selected_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_inbox_snapshot"("p_slug" "text", "p_selected_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_teacher_programs_snapshot"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_programs_snapshot"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_programs_snapshot"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_teacher_roster_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_roster_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_roster_snapshot"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_teacher_roster_snapshot_unfiltered"("p_slug" "text", "p_program_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_teacher_roster_snapshot_unfiltered"("p_slug" "text", "p_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_roster_snapshot_unfiltered"("p_slug" "text", "p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_teacher_student_notes_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_teacher_student_notes_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_teacher_student_notes_snapshot"("p_slug" "text", "p_program_id" "uuid", "p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_mosque_role"("check_mosque_id" "uuid", "allowed_roles" "text"[], "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_mosque_role"("check_mosque_id" "uuid", "allowed_roles" "text"[], "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_mosque_role"("check_mosque_id" "uuid", "allowed_roles" "text"[], "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_verified_teacher_membership"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_verified_teacher_membership"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_verified_teacher_membership"("check_mosque_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_mosque_admin"("check_mosque_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_mosque_admin"("check_mosque_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_mosque_admin"("check_mosque_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_parent_of_child"("check_child_profile_id" "uuid", "check_parent_profile_id" "uuid", "check_mosque_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_parent_of_child"("check_child_profile_id" "uuid", "check_parent_profile_id" "uuid", "check_mosque_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_parent_of_child"("check_child_profile_id" "uuid", "check_parent_profile_id" "uuid", "check_mosque_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_program_billing_policy_locked"("check_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_program_billing_policy_locked"("check_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_program_billing_policy_locked"("check_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_program_director"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_program_director"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_program_director"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_program_teacher"("check_program_id" "uuid", "check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_program_teacher"("check_program_id" "uuid", "check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_program_teacher"("check_program_id" "uuid", "check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff_account"("check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff_account"("check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff_account"("check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_teacher_account"("check_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_teacher_account"("check_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_teacher_account"("check_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_program_instructor_code"("invite" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_program_instructor_code"("invite" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_program_instructor_code"("invite" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lookup_program_student_invite_code"("invite" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_program_student_invite_code"("invite" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_program_student_invite_code"("invite" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_program_student_notes_seen"("note_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_program_student_notes_seen"("note_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_program_student_notes_seen"("note_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_program_subscription_legacy_profile_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."populate_program_subscription_legacy_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_program_subscription_legacy_profile_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_locked_program_billing_policy_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_locked_program_billing_policy_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_locked_program_billing_policy_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_teacher_enrollment_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_teacher_enrollment_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_teacher_enrollment_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_track_switch_request"("target_request_id" "uuid", "decision_note_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_program_withdrawal"("target_program_id" "uuid", "target_student_profile_id" "uuid", "withdrawal_reason" "text", "understands_no_refund" boolean, "understands_immediate_exit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."request_program_withdrawal"("target_program_id" "uuid", "target_student_profile_id" "uuid", "withdrawal_reason" "text", "understands_no_refund" boolean, "understands_immediate_exit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_program_withdrawal"("target_program_id" "uuid", "target_student_profile_id" "uuid", "withdrawal_reason" "text", "understands_no_refund" boolean, "understands_immediate_exit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."resign_program_instructor"("target_program_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resign_program_instructor"("target_program_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resign_program_instructor"("target_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_program_first_of_month_after_alignment"("target_program_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_program_first_of_month_after_alignment"("target_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_enrollment_track_selection"("target_enrollment_id" "uuid", "selected_track_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_enrollment_track_selection"("target_enrollment_id" "uuid", "selected_track_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_enrollment_track_selection"("target_enrollment_id" "uuid", "selected_track_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_parent_child_profile"("child_profile_id" "uuid", "child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_parent_child_profile"("child_profile_id" "uuid", "child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_parent_child_profile"("child_profile_id" "uuid", "child_full_name" "text", "child_gender" "text", "child_date_of_birth" "date", "child_mosque_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_signup_profile_details"("signup_account_type" "text", "signup_gender" "text", "signup_date_of_birth" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_signup_profile_details"("signup_account_type" "text", "signup_gender" "text", "signup_date_of_birth" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_signup_profile_details"("signup_account_type" "text", "signup_gender" "text", "signup_date_of_birth" "date") TO "service_role";


















GRANT ALL ON TABLE "public"."enrollment_request_tracks" TO "anon";
GRANT ALL ON TABLE "public"."enrollment_request_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment_request_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."enrollment_requests" TO "anon";
GRANT ALL ON TABLE "public"."enrollment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."enrollment_tracks" TO "anon";
GRANT ALL ON TABLE "public"."enrollment_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."mosque_memberships" TO "anon";
GRANT ALL ON TABLE "public"."mosque_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."mosque_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."mosques" TO "anon";
GRANT ALL ON TABLE "public"."mosques" TO "authenticated";
GRANT ALL ON TABLE "public"."mosques" TO "service_role";



GRANT ALL ON TABLE "public"."parent_child_links" TO "anon";
GRANT ALL ON TABLE "public"."parent_child_links" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_child_links" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."program_announcement_receipts" TO "anon";
GRANT ALL ON TABLE "public"."program_announcement_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."program_announcement_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."program_announcements" TO "anon";
GRANT ALL ON TABLE "public"."program_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."program_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."program_applications" TO "anon";
GRANT ALL ON TABLE "public"."program_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."program_applications" TO "service_role";



GRANT ALL ON TABLE "public"."program_attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."program_attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."program_attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."program_content_sections" TO "anon";
GRANT ALL ON TABLE "public"."program_content_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."program_content_sections" TO "service_role";



GRANT ALL ON TABLE "public"."program_details" TO "anon";
GRANT ALL ON TABLE "public"."program_details" TO "authenticated";
GRANT ALL ON TABLE "public"."program_details" TO "service_role";



GRANT ALL ON TABLE "public"."program_faqs" TO "anon";
GRANT ALL ON TABLE "public"."program_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."program_faqs" TO "service_role";



GRANT ALL ON TABLE "public"."program_finance_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."program_finance_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."program_finance_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."program_instructor_events" TO "anon";
GRANT ALL ON TABLE "public"."program_instructor_events" TO "authenticated";
GRANT ALL ON TABLE "public"."program_instructor_events" TO "service_role";



GRANT ALL ON TABLE "public"."program_media" TO "anon";
GRANT ALL ON TABLE "public"."program_media" TO "authenticated";
GRANT ALL ON TABLE "public"."program_media" TO "service_role";



GRANT ALL ON TABLE "public"."program_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."program_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."program_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."program_payment_terms" TO "anon";
GRANT ALL ON TABLE "public"."program_payment_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."program_payment_terms" TO "service_role";



GRANT ALL ON TABLE "public"."program_payments" TO "anon";
GRANT ALL ON TABLE "public"."program_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."program_payments" TO "service_role";



GRANT ALL ON TABLE "public"."program_session_cancellations" TO "anon";
GRANT ALL ON TABLE "public"."program_session_cancellations" TO "authenticated";
GRANT ALL ON TABLE "public"."program_session_cancellations" TO "service_role";



GRANT ALL ON TABLE "public"."program_sessions" TO "anon";
GRANT ALL ON TABLE "public"."program_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."program_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."program_student_invites" TO "anon";
GRANT ALL ON TABLE "public"."program_student_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."program_student_invites" TO "service_role";



GRANT ALL ON TABLE "public"."program_student_notes" TO "anon";
GRANT ALL ON TABLE "public"."program_student_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."program_student_notes" TO "service_role";



GRANT ALL ON TABLE "public"."program_subscription_tracks" TO "anon";
GRANT ALL ON TABLE "public"."program_subscription_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."program_subscription_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."program_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."program_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."program_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."program_teachers" TO "anon";
GRANT ALL ON TABLE "public"."program_teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."program_teachers" TO "service_role";



GRANT ALL ON TABLE "public"."program_track_sessions" TO "anon";
GRANT ALL ON TABLE "public"."program_track_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."program_track_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."program_track_switch_requests" TO "anon";
GRANT ALL ON TABLE "public"."program_track_switch_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."program_track_switch_requests" TO "service_role";



GRANT ALL ON TABLE "public"."program_track_transfer_rules" TO "anon";
GRANT ALL ON TABLE "public"."program_track_transfer_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."program_track_transfer_rules" TO "service_role";



GRANT ALL ON TABLE "public"."program_tracks" TO "anon";
GRANT ALL ON TABLE "public"."program_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."program_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_error_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_error_logs" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_join_requests" TO "anon";
GRANT ALL ON TABLE "public"."teacher_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_notification_state" TO "anon";
GRANT ALL ON TABLE "public"."teacher_notification_state" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_notification_state" TO "service_role";



GRANT ALL ON TABLE "public"."withdrawal_requests" TO "anon";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































