-- The public director card defaults to the linked director's account email.
-- Replace Al Tarteel's obsolete wizard-era contact override without requiring
-- the class to be edited or republished.
with target_programs as (
  select
    program.id,
    coalesce(program.director_profile_id, program.teacher_profile_id) as director_profile_id
  from public.programs program
  join public.mosques mosque on mosque.id = program.mosque_id
  where mosque.slug = 'assiddiq'
    and lower(program.title) like '%tarteel%'
), account_emails as (
  select target.id as program_id, auth_user.email
  from target_programs target
  join auth.users auth_user on auth_user.id = target.director_profile_id
  where nullif(trim(auth_user.email), '') is not null
)
update public.programs program
set
  contact_email = account.email,
  updated_at = now()
from account_emails account
where program.id = account.program_id
  and program.contact_email is distinct from account.email;

with target_directors as (
  select distinct coalesce(program.director_profile_id, program.teacher_profile_id) as profile_id
  from public.programs program
  join public.mosques mosque on mosque.id = program.mosque_id
  where mosque.slug = 'assiddiq'
    and lower(program.title) like '%tarteel%'
)
update public.profiles profile
set
  email = auth_user.email,
  updated_at = now()
from target_directors target
join auth.users auth_user on auth_user.id = target.profile_id
where profile.id = target.profile_id
  and nullif(trim(auth_user.email), '') is not null
  and profile.email is distinct from auth_user.email;
