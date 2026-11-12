-- Family identities use initials/default avatars. Enforce this for browser,
-- OAuth signup/completion, child creation and service-role profile writes alike.
-- Staff photographs and unrelated profile fields are retained.
create or replace function public.enforce_staff_profile_photos()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if lower(coalesce(new.account_type, '')) not in ('teacher', 'admin') then
    new.avatar_url := null;
  elsif tg_op = 'UPDATE' then
    -- OAuth profiles have no account type until completion. A person choosing
    -- a staff account can still use their Google photo after that choice.
    if lower(coalesce(old.account_type, '')) not in ('teacher', 'admin') and new.avatar_url is null then
      select coalesce(nullif(u.raw_user_meta_data->>'avatar_url', ''), nullif(u.raw_user_meta_data->>'picture', ''))
      into new.avatar_url from auth.users u where u.id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_staff_profile_photos() from public, anon, authenticated;
drop trigger if exists enforce_staff_profile_photos on public.profiles;
create trigger enforce_staff_profile_photos before insert or update on public.profiles
for each row execute function public.enforce_staff_profile_photos();

update public.profiles set avatar_url = null
where lower(coalesce(account_type, '')) not in ('teacher', 'admin') and avatar_url is not null;
