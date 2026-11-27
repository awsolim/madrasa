-- Optional rollback for the read-policy cleanup. No business records, write
-- rules or tables are removed. Uses the original policies saved at application.
do $rollback$
declare
  target text;
  backup jsonb;
  old_policy jsonb;
  roles_sql text;
begin
  foreach target in array array['profiles','mosque_memberships','enrollments'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=target
      and policyname='consolidated ' || target || ' read access') then continue; end if;
    select obj_description(to_regprocedure(format('madrasa_rls.can_select_%I(public.%I)',target,target)), 'pg_proc')::jsonb into backup;
    if backup->>'kind' is distinct from 'madrasa_read_policy_backup_v1'
      or backup->>'table' is distinct from target or jsonb_typeof(backup->'policies') is distinct from 'array' then
      raise exception 'No verified policy backup for %. Stop and review.',target;
    end if;
    for old_policy in select * from jsonb_array_elements(backup->'policies') loop
      if old_policy->>'cmd' <> 'SELECT' or old_policy->>'permissive' <> 'PERMISSIVE'
        or old_policy->>'schemaname' <> 'public' or old_policy->>'tablename' <> target then
        raise exception 'Unexpected policy backup for %.',target;
      end if;
      if exists(select 1 from pg_policies where schemaname='public' and tablename=target and policyname=old_policy->>'policyname') then
        raise exception 'Policy % already exists. Review later policy changes before rollback.',old_policy->>'policyname';
      end if;
      select string_agg(format('%I',value),',') into roles_sql from jsonb_array_elements_text(old_policy->'roles');
      execute format('create policy %I on public.%I as permissive for select to %s using (%s)',
        old_policy->>'policyname',target,roles_sql,coalesce(old_policy->>'qual','true'));
    end loop;
    execute format('drop policy %I on public.%I','consolidated ' || target || ' read access',target);
  end loop;
end;
$rollback$;
