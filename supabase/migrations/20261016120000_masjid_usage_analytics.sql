-- Privacy-conscious masjid usage analytics. One row per profile and UTC day is
-- sufficient for adoption and daily-active-user reporting without retaining a
-- page-by-page browsing history.
create table if not exists public.mosque_user_activity_daily (
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null default current_date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (mosque_id, profile_id, activity_date)
);

create index if not exists mosque_user_activity_daily_profile_idx
  on public.mosque_user_activity_daily (mosque_id, profile_id, activity_date desc);

alter table public.mosque_user_activity_daily enable row level security;

drop policy if exists "mosque admins view daily usage" on public.mosque_user_activity_daily;
create policy "mosque admins view daily usage"
on public.mosque_user_activity_daily for select
to authenticated
using (
  public.is_platform_admin(auth.uid())
  or public.has_mosque_role(mosque_id, array['admin'], auth.uid())
);

create or replace function public.record_mosque_user_activity(p_slug text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
begin
  if v_user_id is null then
    return;
  end if;

  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return;
  end if;

  if not (
    exists (
      select 1 from public.mosque_memberships
      where mosque_id = v_mosque_id and profile_id = v_user_id and status = 'active'
    )
    or exists (
      select 1 from public.enrollments e
      join public.programs p on p.id = e.program_id
      where p.mosque_id = v_mosque_id and e.student_profile_id = v_user_id
    )
    or exists (
      select 1 from public.enrollment_requests r
      where r.mosque_id = v_mosque_id
        and (r.student_profile_id = v_user_id or r.parent_profile_id = v_user_id)
    )
    or exists (
      select 1 from public.parent_child_links l
      where l.mosque_id = v_mosque_id and l.parent_profile_id = v_user_id
    )
    or exists (
      select 1 from public.program_teachers t
      join public.programs p on p.id = t.program_id
      where p.mosque_id = v_mosque_id and t.teacher_profile_id = v_user_id
    )
  ) then
    return;
  end if;

  insert into public.mosque_user_activity_daily (
    mosque_id, profile_id, activity_date, first_seen_at, last_seen_at
  ) values (
    v_mosque_id, v_user_id, current_date, now(), now()
  )
  on conflict (mosque_id, profile_id, activity_date)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.record_mosque_user_activity(text) from public, anon;
grant execute on function public.record_mosque_user_activity(text) to authenticated;

create or replace function public.get_admin_masjid_usage(p_slug text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_mosque_id uuid;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_profile_ids uuid[] := array[]::uuid[];
  v_daily jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
begin
  select id into v_mosque_id from public.mosques where slug = p_slug limit 1;
  if v_mosque_id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'hasAccess', false);
  end if;

  if not (
    public.is_platform_admin(v_user_id)
    or public.has_mosque_role(v_mosque_id, array['admin'], v_user_id)
  ) then
    return jsonb_build_object('error', 'Admin access required.', 'hasAccess', false);
  end if;

  select coalesce(array_agg(distinct id), array[]::uuid[]) into v_profile_ids
  from (
    select profile_id as id from public.mosque_memberships
      where mosque_id = v_mosque_id and status = 'active'
    union
    select t.teacher_profile_id from public.program_teachers t
      join public.programs p on p.id = t.program_id
      where p.mosque_id = v_mosque_id and t.teacher_profile_id is not null
    union
    select e.student_profile_id from public.enrollments e
      join public.programs p on p.id = e.program_id
      where p.mosque_id = v_mosque_id
    union
    select l.parent_profile_id from public.parent_child_links l where l.mosque_id = v_mosque_id
    union
    select l.child_profile_id from public.parent_child_links l where l.mosque_id = v_mosque_id
  ) related;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'users', coalesce(activity.users, 0)
  ) order by day), '[]'::jsonb)
  into v_daily
  from generate_series(current_date - (v_days - 1), current_date, interval '1 day') day
  left join (
    select activity_date, count(distinct profile_id)::integer as users
    from public.mosque_user_activity_daily
    where mosque_id = v_mosque_id
      and activity_date >= current_date - (v_days - 1)
    group by activity_date
  ) activity on activity.activity_date = day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profileId', profile_id,
    'hasAccount', has_account,
    'lastActiveAt', last_active_at,
    'activeDays30', active_days_30
  )), '[]'::jsonb)
  into v_members
  from (
    select
      related.profile_id,
      exists (select 1 from auth.users u where u.id = related.profile_id) as has_account,
      max(a.last_seen_at) as last_active_at,
      count(distinct a.activity_date) filter (where a.activity_date >= current_date - 29)::integer as active_days_30
    from unnest(v_profile_ids) related(profile_id)
    left join public.mosque_user_activity_daily a
      on a.mosque_id = v_mosque_id and a.profile_id = related.profile_id
    group by related.profile_id
  ) member_activity;

  return jsonb_build_object(
    'error', null,
    'hasAccess', true,
    'registeredUsers', (
      select count(*) from unnest(v_profile_ids) related(profile_id)
      where exists (select 1 from auth.users u where u.id = related.profile_id)
    ),
    'activeToday', (
      select count(distinct profile_id) from public.mosque_user_activity_daily
      where mosque_id = v_mosque_id and activity_date = current_date
    ),
    'active7Days', (
      select count(distinct profile_id) from public.mosque_user_activity_daily
      where mosque_id = v_mosque_id and activity_date >= current_date - 6
    ),
    'active30Days', (
      select count(distinct profile_id) from public.mosque_user_activity_daily
      where mosque_id = v_mosque_id and activity_date >= current_date - 29
    ),
    'neverActive', (
      select count(*) from unnest(v_profile_ids) related(profile_id)
      where exists (select 1 from auth.users u where u.id = related.profile_id)
        and not exists (
          select 1 from public.mosque_user_activity_daily a
          where a.mosque_id = v_mosque_id and a.profile_id = related.profile_id
        )
    ),
    'notificationEnabled', (
      select count(distinct s.profile_id) from public.push_subscriptions s
      where s.profile_id = any(v_profile_ids)
    ),
    'pendingApplications', (
      select count(*) from public.enrollment_requests r
      where r.mosque_id = v_mosque_id and r.status = 'pending'
    ),
    'awaitingPayment', (
      select count(*) from public.enrollment_requests r
      where r.mosque_id = v_mosque_id
        and r.status = 'approved'
        and r.admission_completed_at is null
        and not coalesce(r.payment_bypassed, false)
        and r.payment_type in ('monthly', 'annual', 'one_time')
    ),
    'pendingWithdrawals', (
      select count(*) from public.withdrawal_requests w
      where w.mosque_id = v_mosque_id and w.status = 'pending'
    ),
    'dailyUsers', v_daily,
    'members', v_members
  );
end;
$$;

revoke all on function public.get_admin_masjid_usage(text, integer) from public, anon;
grant execute on function public.get_admin_masjid_usage(text, integer) to authenticated;
