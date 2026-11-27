-- Keep the existing read permissions; stop expanding their combined joins into
-- every caller's query plan. These are SECURITY INVOKER helpers: underlying
-- table privileges and RLS still apply, including every restrictive policy.
-- No write policy, grant on an application table, or managed Auth table changes.
create schema if not exists madrasa_rls;
revoke create on schema madrasa_rls from public, anon, authenticated;
grant usage on schema madrasa_rls to public;

do $migration$
declare
  target record;
  old_policy record;
  own_policy record;
  role_check text;
  own_role_check text;
  predicates text[];
  body text;
  helper_name text;
  consolidated_name text;
  backup jsonb;
begin
  for target in select * from (values
    ('profiles', 'id', 'profiles_select_own'),
    ('mosque_memberships', 'profile_id', 'memberships_select_own'),
    ('enrollments', 'student_profile_id', 'enrollments_select_own')
  ) as targets(table_name, self_column, self_policy)
  loop
    helper_name := 'can_select_' || target.table_name;
    consolidated_name := 'consolidated ' || target.table_name || ' read access';
    -- A rerun must never capture its own policy and create a recursive helper.
    if exists(select 1 from pg_policies where schemaname='public'
      and tablename=target.table_name and policyname=consolidated_name) then
      continue;
    end if;
    select * into own_policy from pg_policies where schemaname='public'
      and tablename=target.table_name and policyname=target.self_policy
      and cmd='SELECT' and permissive='PERMISSIVE';
    if own_policy.policyname is null or own_policy.qual is null or
      regexp_replace(own_policy.qual, '[()[:space:]]', '', 'g') not in
        (target.self_column || '=auth.uid', 'auth.uid=' || target.self_column) then
      raise exception 'Unexpected own-row policy on %. Review permissions before applying this migration.', target.table_name;
    end if;
    select case when 'public'=any(own_policy.roles) then 'true'
      else '(' || string_agg(format('pg_catalog.pg_has_role(current_user, %L, ''USAGE'')', role_name), ' OR ') || ')' end
    into own_role_check from unnest(own_policy.roles) role_name;

    predicates := array[]::text[];
    for old_policy in select * from pg_policies where schemaname='public'
      and tablename=target.table_name and cmd='SELECT' and permissive='PERMISSIVE'
      order by length(coalesce(qual,'')), policyname
    loop
      select case when 'public'=any(old_policy.roles) then 'true'
        else '(' || string_agg(format('pg_catalog.pg_has_role(current_user, %L, ''USAGE'')', role_name), ' OR ') || ')' end
      into role_check from unnest(old_policy.roles) role_name;
      -- Separate PL/pgSQL branches are deliberate. A CASE in one combined SQL
      -- statement still checks function EXECUTE privileges when planning, even
      -- for branches unavailable to anon. Prepare only applicable policy SQL.
      predicates := array_append(predicates, format(
        'if %s then if (select coalesce((%s), false) from (select (p_row).*) as %I) then return true; end if; end if;',
        role_check, coalesce(old_policy.qual, 'true'), target.table_name));
    end loop;
    if cardinality(predicates)=0 then raise exception 'No read policies for %.', target.table_name; end if;

    body := format($body$
begin
  if (%s) and p_row.%I = (select auth.uid()) then return true; end if;
  %s
  return false;
end;
$body$, own_role_check, target.self_column, array_to_string(predicates, E'\n'));
    execute format('create or replace function madrasa_rls.%I(p_row public.%I) returns boolean language plpgsql stable security invoker set search_path = public, pg_temp as %L',
      helper_name, target.table_name, body);
    -- This private-schema helper grants no access: it evaluates the original
    -- expressions with the caller's own permissions, never the owner's.
    execute format('grant execute on function madrasa_rls.%I(public.%I) to public', helper_name, target.table_name);
    -- Save the exact policies captured at application time, rather than relying
    -- on a potentially stale development snapshot for rollback.
    select jsonb_build_object('kind','madrasa_read_policy_backup_v1','table',target.table_name,
      'policies',jsonb_agg(to_jsonb(p) order by p.policyname)) into backup
    from pg_policies p where schemaname='public' and tablename=target.table_name
      and cmd='SELECT' and permissive='PERMISSIVE';
    execute format('comment on function madrasa_rls.%I(public.%I) is %L', helper_name, target.table_name, backup::text);
    for old_policy in select policyname from pg_policies where schemaname='public'
      and tablename=target.table_name and cmd='SELECT' and permissive='PERMISSIVE'
    loop
      execute format('drop policy %I on public.%I', old_policy.policyname, target.table_name);
    end loop;
    execute format('create policy %I on public.%I for select to public using (madrasa_rls.%I(%I))',
      consolidated_name, target.table_name, helper_name, target.table_name);
    -- ALL policies intentionally remain as-is: their SELECT contribution and
    -- INSERT/UPDATE/DELETE behavior are unchanged. Restrictive rules also remain.
  end loop;
end;
$migration$;
