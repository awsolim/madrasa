-- Some early production databases created program_subscriptions.profile_id as
-- required before the current student_profile_id / parent_profile_id model was
-- introduced. Keep that legacy field populated for every current write path.
-- Fresh databases without the legacy column do not need this compatibility trigger.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'program_subscriptions'
      and column_name = 'profile_id'
  ) then
    execute $function$
      create or replace function public.populate_program_subscription_legacy_profile_id()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $body$
      begin
        new.profile_id := coalesce(new.profile_id, new.parent_profile_id, new.student_profile_id);
        return new;
      end;
      $body$
    $function$;

    execute 'drop trigger if exists populate_program_subscription_legacy_profile_id on public.program_subscriptions';
    execute 'create trigger populate_program_subscription_legacy_profile_id before insert or update on public.program_subscriptions for each row execute function public.populate_program_subscription_legacy_profile_id()';
  end if;
end;
$$;
