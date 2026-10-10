-- The public-schema baseline cannot include triggers owned by auth.users.
-- Restore the signup trigger locally and repair users created before it existed.
insert into public.mosques (name, slug, pwa_name, short_name)
values ('Assiddiq Islamic Center', 'assiddiq', 'Assiddiq Islamic Center', 'Assiddiq')
on conflict (slug) do nothing;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.profiles (
  id, full_name, email, phone_number, avatar_url, account_type, age, gender, date_of_birth
)
select
  au.id,
  coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), nullif(au.raw_user_meta_data->>'name', '')),
  au.email,
  nullif(au.raw_user_meta_data->>'phone', ''),
  coalesce(nullif(au.raw_user_meta_data->>'avatar_url', ''), nullif(au.raw_user_meta_data->>'picture', '')),
  nullif(au.raw_user_meta_data->>'account_type', ''),
  case when au.raw_user_meta_data->>'account_type' = 'student' then nullif(au.raw_user_meta_data->>'age', '') else null end,
  case when au.raw_user_meta_data->>'account_type' in ('student', 'parent') then nullif(au.raw_user_meta_data->>'gender', '') else null end,
  case
    when au.raw_user_meta_data->>'account_type' in ('student', 'parent')
      then nullif(au.raw_user_meta_data->>'date_of_birth', '')::date
    else null
  end
from auth.users au
on conflict (id) do update set
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  email = coalesce(excluded.email, public.profiles.email),
  phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  account_type = coalesce(excluded.account_type, public.profiles.account_type),
  age = coalesce(excluded.age, public.profiles.age),
  gender = coalesce(excluded.gender, public.profiles.gender),
  date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth),
  updated_at = now();

update public.mosque_memberships mm
set status = 'active', teacher_approval_status = null, updated_at = now()
from auth.users au, public.mosques m
where mm.profile_id = au.id
  and mm.mosque_id = m.id
  and m.slug = au.raw_user_meta_data->>'mosque_slug'
  and mm.role = au.raw_user_meta_data->>'account_type';

insert into public.mosque_memberships (mosque_id, profile_id, role, status, teacher_approval_status)
select m.id, au.id, au.raw_user_meta_data->>'account_type', 'active', null
from auth.users au
join public.mosques m on m.slug = au.raw_user_meta_data->>'mosque_slug'
where au.raw_user_meta_data->>'account_type' in ('student', 'parent', 'teacher')
  and not exists (
    select 1 from public.mosque_memberships mm
    where mm.mosque_id = m.id
      and mm.profile_id = au.id
      and mm.role = au.raw_user_meta_data->>'account_type'
  );
