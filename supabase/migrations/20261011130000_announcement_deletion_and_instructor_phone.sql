-- Preserve announcement history while removing test content. Deleted messages
-- remain visible as tombstones so recipients are not left with unexplained gaps.
alter table public.program_announcements
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists program_announcements_deleted_at_idx
  on public.program_announcements (deleted_at)
  where deleted_at is not null;

drop policy if exists "authorized staff delete announcements" on public.program_announcements;
create policy "authorized staff delete announcements"
on public.program_announcements for update
using (public.can_announce_program(program_id))
with check (public.can_announce_program(program_id));

-- The existing announcements were confirmed to be test messages. Soft-delete
-- them while retaining delivery/read history.
update public.program_announcements
set
  message = '',
  attachments = '[]'::jsonb,
  deleted_at = coalesce(deleted_at, now()),
  updated_at = now()
where deleted_at is null;

-- Keep the instructor profile as the single source of truth for the public
-- contact number. Scope the correction to the named Assiddiq Al Tarteel staff
-- member so similarly named profiles elsewhere are untouched.
update public.profiles profile
set phone_number = '+15875667545', updated_at = now()
where lower(trim(profile.full_name)) = 'sheikh mohamed moamen'
  and exists (
    select 1
    from public.program_teachers staff
    join public.programs program on program.id = staff.program_id
    join public.mosques mosque on mosque.id = program.mosque_id
    where staff.teacher_profile_id = profile.id
      and mosque.slug = 'assiddiq'
      and lower(program.title) like '%tarteel%'
  );
