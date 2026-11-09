-- Class lifecycle is a durable operation: Stripe work must finish before the
-- class is marked paused/ended/archived. No live class is changed by migration.
alter table public.programs add column if not exists access_ends_at timestamptz;
alter table public.programs add column if not exists lifecycle_operation_id uuid;

create table if not exists public.program_lifecycle_operations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  actor_profile_id uuid not null references public.profiles(id),
  action text not null check (action in ('pause', 'resume', 'end', 'archive')),
  status text not null default 'processing' check (status in ('processing', 'scheduled', 'completed')),
  plan jsonb not null,
  completed_steps text[] not null default '{}',
  lease_until timestamptz,
  last_error text,
  notifications_sent_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists program_lifecycle_one_operation_idx
  on public.program_lifecycle_operations(program_id) where status = 'processing';
alter table public.program_lifecycle_operations enable row level security;
drop policy if exists "class managers read lifecycle operations" on public.program_lifecycle_operations;
create policy "class managers read lifecycle operations" on public.program_lifecycle_operations
  for select to authenticated using (public.can_manage_program(program_id, auth.uid()));
revoke all on public.program_lifecycle_operations from anon, authenticated;
grant select on public.program_lifecycle_operations to authenticated;
grant all on public.program_lifecycle_operations to service_role;

create or replace function public.begin_program_lifecycle_operation(p_program_id uuid, p_actor uuid, p_plan jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_program public.programs;
begin
  select * into v_program from public.programs where id = p_program_id for update;
  if v_program.id is null then raise exception 'Class not found.'; end if;
  if not public.can_manage_program(p_program_id, p_actor) then raise exception 'Director access required.'; end if;
  if v_program.lifecycle_operation_id is not null then raise exception 'A class operation is already in progress. Resume it first.'; end if;
  if exists(select 1 from public.enrollments e where e.program_id = p_program_id and e.status = 'active'
    and not exists(select 1 from jsonb_array_elements(p_plan->'students') s where s->>'id' = e.student_profile_id::text and (s->>'active')::boolean)) then
    raise exception 'Enrollment changed. Review a fresh preview.';
  end if;
  insert into public.program_lifecycle_operations(program_id, actor_profile_id, action, plan)
  values (p_program_id, p_actor, p_plan->>'action', p_plan) returning id into v_id;
  perform set_config('app.class_lifecycle', 'approved', true);
  update public.programs set lifecycle_operation_id = v_id, application_status = 'closed',
    accepting_applications = false, updated_at = now() where id = p_program_id;
  return v_id;
end;
$$;

create or replace function public.finish_program_lifecycle_operation(p_operation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_op public.program_lifecycle_operations; v_ends timestamptz; v_step text;
begin
  select * into v_op from public.program_lifecycle_operations where id = p_operation_id for update;
  if v_op.id is null then raise exception 'Class operation not found.'; end if;
  if v_op.status <> 'processing' then return; end if;
  for v_step in
    select 'subscription:' || (item->>'id') from jsonb_array_elements(v_op.plan->'subscriptions') item
    union all select 'checkout:' || (item->>'id') from jsonb_array_elements(v_op.plan->'checkouts') item
  loop
    if not v_step = any(v_op.completed_steps) then raise exception 'Billing work is unfinished.'; end if;
  end loop;
  perform set_config('app.class_lifecycle', 'approved', true);
  if v_op.action = 'end' then
    v_ends := coalesce((v_op.plan->>'accessEndsAt')::timestamptz, now());
    update public.programs set access_ends_at = v_ends, lifecycle_operation_id = null,
      application_status = 'closed', accepting_applications = false, updated_at = now()
      where id = v_op.program_id;
    update public.program_payment_terms set status = 'ended', updated_at = now()
      where program_id = v_op.program_id and status not in ('ended', 'superseded');
    update public.enrollment_requests set status = 'cancelled', reviewed_by = v_op.actor_profile_id,
      reviewed_at = now(), review_note = 'The class is ending. No further admissions are being accepted.', student_dismissed_at = null
      where program_id = v_op.program_id and admission_completed_at is null and status in ('pending', 'waitlisted', 'approved');
    update public.withdrawal_requests set status = 'approved', reviewed_by = v_op.actor_profile_id,
      reviewed_at = now(), decision_note = 'Class is ending. Future billing has stopped; class access ends on the announced date.'
      where program_id = v_op.program_id and status = 'pending';
    update public.program_student_invites set revoked_at = now() where program_id = v_op.program_id and revoked_at is null;
  elsif v_op.action = 'pause' then
    update public.programs set lifecycle_status = 'paused', lifecycle_operation_id = null,
      application_status = 'closed', accepting_applications = false, updated_at = now() where id = v_op.program_id;
  elsif v_op.action = 'resume' then
    update public.programs set lifecycle_status = 'active', is_active = true, lifecycle_operation_id = null,
      application_status = 'closed', accepting_applications = false, updated_at = now() where id = v_op.program_id;
  else
    if exists(select 1 from public.enrollments where program_id = v_op.program_id and status = 'active') then
      raise exception 'End active enrollments before archiving.';
    end if;
    if exists(select 1 from public.program_subscriptions where program_id = v_op.program_id
      and stripe_subscription_id is not null and status not in ('canceled', 'incomplete_expired')) then
      raise exception 'End all recurring subscriptions before archiving.';
    end if;
    if exists(select 1 from public.enrollment_requests where program_id = v_op.program_id
      and admission_completed_at is null and status in ('pending', 'waitlisted', 'approved')) or
      exists(select 1 from public.withdrawal_requests where program_id = v_op.program_id and status = 'pending') then
      raise exception 'Resolve pending applications and withdrawals before archiving.';
    end if;
    update public.programs set publication_status = 'archived', lifecycle_status = 'archived', is_active = false,
      application_status = 'closed', accepting_applications = false, lifecycle_operation_id = null, updated_at = now()
      where id = v_op.program_id;
  end if;
  insert into public.program_finance_audit_events(program_id, actor_profile_id, event_type, summary, metadata)
  values (v_op.program_id, v_op.actor_profile_id, 'class_' || v_op.action,
    'Class operation completed by staff: ' || v_op.action || '. Reason: ' || (v_op.plan->>'reason'),
    jsonb_build_object('operationId', v_op.id, 'accessEndsAt', v_ends, 'billingStopsImmediately', v_op.action = 'end'));
  insert into public.program_finance_audit_events(program_id, student_profile_id, actor_profile_id, event_type, summary, metadata)
  select v_op.program_id, (s->>'studentId')::uuid, v_op.actor_profile_id, 'class_' || v_op.action,
    case v_op.action when 'end' then 'A staff member ended future billing because the class is ending. Refunds are reviewed separately.'
      when 'pause' then 'A staff member paused the class. Monthly collection is suspended; enrollment is retained.'
      else 'A staff member resumed the class. Billing continues on the existing cycle.' end,
    jsonb_build_object('operationId', v_op.id, 'reason', v_op.plan->>'reason', 'accessEndsAt', v_ends)
  from jsonb_array_elements(v_op.plan->'subscriptions') s;
  update public.program_lifecycle_operations set status = case when v_op.action = 'end' then 'scheduled' else 'completed' end,
    completed_at = now(), lease_until = null, last_error = null where id = v_op.id;
end;
$$;

create or replace function public.finalize_ended_classes()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_program record;
begin
  perform set_config('app.class_lifecycle', 'approved', true);
  for v_program in select id from public.programs where access_ends_at <= now()
    and lifecycle_status not in ('cancelled', 'archived') and lifecycle_operation_id is null for update
  loop
    update public.enrollments set status = 'withdrawn' where program_id = v_program.id and status = 'active';
    update public.programs set lifecycle_status = 'cancelled', application_status = 'closed', accepting_applications = false,
      updated_at = now() where id = v_program.id;
    update public.program_lifecycle_operations set status = 'completed' where program_id = v_program.id and status = 'scheduled';
  end loop;
end;
$$;

-- Serializes admission against lifecycle changes, including old checkout links,
-- invites and the webhook activation RPC. Service-role writes also obey this.
create or replace function public.guard_class_admission()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_program public.programs;
begin
  select * into v_program from public.programs where id = new.program_id for share;
  if v_program.lifecycle_operation_id is not null or v_program.access_ends_at is not null
    or v_program.publication_status = 'archived' or v_program.lifecycle_status in ('paused', 'cancelled', 'archived', 'completed') then
    if tg_table_name = 'enrollments' then
      if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
        raise exception 'This class is not accepting enrollments.';
      end if;
    elsif tg_table_name = 'enrollment_requests' then
      if tg_op = 'INSERT' or (new.status = 'approved' and old.status is distinct from 'approved') or
        (new.admission_completed_at is not null and old.admission_completed_at is null) then
        raise exception 'This class is not accepting admissions.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_class_enrollment on public.enrollments;
create trigger guard_class_enrollment before insert or update on public.enrollments for each row execute function public.guard_class_admission();
drop trigger if exists guard_class_application on public.enrollment_requests;
create trigger guard_class_application before insert or update on public.enrollment_requests for each row execute function public.guard_class_admission();

create or replace function public.guard_class_checkout_creation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_program public.programs;
begin
  select * into v_program from public.programs where id = new.program_id for share;
  if v_program.lifecycle_operation_id is not null or v_program.access_ends_at is not null or
    v_program.publication_status = 'archived' or v_program.lifecycle_status in ('paused', 'cancelled', 'archived', 'completed') then
    if new.stripe_checkout_session_id is not null and
      (tg_op = 'INSERT' or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id) then
      raise exception 'This class is not accepting payments.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_class_checkout_creation on public.program_subscriptions;
create trigger guard_class_checkout_creation before insert or update on public.program_subscriptions for each row execute function public.guard_class_checkout_creation();

-- The old delete/builder routes cannot bypass a managed lifecycle operation.
create or replace function public.guard_program_lifecycle_changes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.class_lifecycle', true), '') = 'approved' then return new; end if;
  if new.access_ends_at is distinct from old.access_ends_at or new.lifecycle_operation_id is distinct from old.lifecycle_operation_id then
    raise exception 'Use Class lifecycle to change access or billing.';
  end if;
  if old.lifecycle_operation_id is not null or old.access_ends_at is not null or old.publication_status = 'archived' then
    raise exception 'This class is ending, archived, or has an unfinished lifecycle operation.';
  end if;
  if (new.lifecycle_status is distinct from old.lifecycle_status and
      (new.lifecycle_status in ('paused', 'cancelled', 'archived', 'completed') or old.lifecycle_status = 'paused'))
      or (new.publication_status = 'archived' and old.publication_status <> 'archived') then
    raise exception 'Use Class lifecycle to pause, end, resume, or archive this class.';
  end if;
  if (new.publication_status = 'draft' or not new.is_active) and exists(select 1 from public.enrollments
    where program_id = old.id and status = 'active') then
    raise exception 'Use Class lifecycle before removing an active class from student access.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_program_lifecycle_changes on public.programs;
create trigger guard_program_lifecycle_changes before update on public.programs for each row execute function public.guard_program_lifecycle_changes();

-- Archive is retained operational history. Financial ledger/refund/audit writes
-- remain available for settling accounts, while class content stays read-only.
create or replace function public.guard_archived_class_records()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_program_id uuid;
begin
  if tg_op = 'DELETE' then v_program_id := old.program_id; else v_program_id := new.program_id; end if;
  if tg_op = 'UPDATE' then
    if exists(select 1 from public.programs where id = old.program_id and publication_status = 'archived') then
      raise exception 'Archived class records are read-only.';
    end if;
  end if;
  if exists(select 1 from public.programs where id = v_program_id and publication_status = 'archived') then
    raise exception 'Archived class records are read-only.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
do $$
declare v_table text;
begin
  foreach v_table in array array['enrollments', 'enrollment_requests', 'program_teachers', 'program_tracks',
    'program_sessions', 'program_announcements', 'program_student_notes', 'program_attendance_records', 'program_student_invites',
    'program_details', 'program_outcomes', 'program_faqs', 'program_media', 'program_content_sections', 'program_session_cancellations']
  loop
    execute format('drop trigger if exists guard_archived_records on public.%I', v_table);
    execute format('create trigger guard_archived_records before insert or update or delete on public.%I for each row execute function public.guard_archived_class_records()', v_table);
  end loop;
end;
$$;

revoke all on function public.begin_program_lifecycle_operation(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_program_lifecycle_operation(uuid) from public, anon, authenticated;
revoke all on function public.finalize_ended_classes() from public, anon, authenticated;
grant execute on function public.begin_program_lifecycle_operation(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_program_lifecycle_operation(uuid) to service_role;
grant execute on function public.finalize_ended_classes() to service_role;

-- All billing changes are made at confirmation. This job only closes access.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('finalize-ended-classes', '* * * * *', 'select public.finalize_ended_classes()');
