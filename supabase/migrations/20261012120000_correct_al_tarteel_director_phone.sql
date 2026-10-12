-- Correct Al Tarteel's linked director profile and keep legacy program contact
-- fallbacks synchronized so every public-page data path shows the same number.
with target_programs as (
  select
    p.id,
    coalesce(p.director_profile_id, p.teacher_profile_id) as director_profile_id
  from public.programs p
  join public.mosques m on m.id = p.mosque_id
  where m.slug = 'assiddiq'
    and lower(p.title) like '%tarteel%'
)
update public.profiles profile
set
  phone_number = '+15875667545',
  updated_at = now()
where profile.id in (
  select director_profile_id
  from target_programs
  where director_profile_id is not null
);

update public.programs program
set
  contact_phone = '+15875667545',
  updated_at = now()
from public.mosques mosque
where mosque.id = program.mosque_id
  and mosque.slug = 'assiddiq'
  and lower(program.title) like '%tarteel%';

update public.program_details details
set instructor_contact_phone = '+15875667545'
where details.program_id in (
  select program.id
  from public.programs program
  join public.mosques mosque on mosque.id = program.mosque_id
  where mosque.slug = 'assiddiq'
    and lower(program.title) like '%tarteel%'
);
