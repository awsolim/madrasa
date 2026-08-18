-- Configurable student registration codes ("Direct Invitations").
-- This extends the existing invite rows and enrollment workflow in place so historic
-- codes and applications continue to work. It intentionally does not create a second
-- enrollment system.

alter table public.program_teachers
  add column if not exists can_review_applications boolean not null default false,
  add column if not exists can_send_direct_invitations boolean not null default false;

alter table public.program_student_invites
  add column if not exists program_track_id uuid references public.program_tracks(id) on delete cascade,
  add column if not exists max_students integer not null default 1,
  add column if not exists expires_at timestamptz,
  add column if not exists bypass_eligibility boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists selected_student_profile_ids uuid[] not null default '{}';

update public.program_student_invites
set expires_at = invite_code_created_at + interval '7 days'
where expires_at is null and claimed_at is null;

alter table public.program_student_invites
  drop constraint if exists program_student_invites_max_students_check,
  add constraint program_student_invites_max_students_check check (max_students between 1 and 25);

alter table public.enrollment_requests
  add column if not exists admission_source text not null default 'application',
  add column if not exists source_student_invite_id uuid references public.program_student_invites(id) on delete set null;

alter table public.enrollment_requests
  drop constraint if exists enrollment_requests_admission_source_check,
  add constraint enrollment_requests_admission_source_check
  check (admission_source in ('application', 'direct_invitation', 'manual'));

create index if not exists program_student_invites_track_idx
  on public.program_student_invites(program_track_id);
create index if not exists enrollment_requests_source_invite_idx
  on public.enrollment_requests(source_student_invite_id);

create or replace function public.can_send_program_direct_invitations(
  check_program_id uuid,
  check_profile_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.programs p
    join public.mosque_memberships mm
      on mm.mosque_id = p.mosque_id
     and mm.profile_id = check_profile_id
     and mm.status = 'active'
    where p.id = check_program_id
      and mm.role = 'admin'
  ) or exists (
    select 1
    from public.program_teachers pt
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and (
        pt.role = 'director'
        or (pt.role = 'instructor' and pt.can_send_direct_invitations = true)
      )
  );
$$;

create or replace function public.can_review_program_applications(
  check_program_id uuid,
  check_profile_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.programs p
    join public.mosque_memberships mm
      on mm.mosque_id = p.mosque_id
     and mm.profile_id = check_profile_id
     and mm.status = 'active'
    where p.id = check_program_id
      and mm.role = 'admin'
  ) or exists (
    select 1
    from public.program_teachers pt
    where pt.program_id = check_program_id
      and pt.teacher_profile_id = check_profile_id
      and (
        pt.role = 'director'
        or (pt.role = 'instructor' and pt.can_review_applications = true)
      )
  );
$$;

grant execute on function public.can_send_program_direct_invitations(uuid, uuid) to authenticated;
grant execute on function public.can_review_program_applications(uuid, uuid) to authenticated;

drop policy if exists "program managers manage student invites" on public.program_student_invites;
drop policy if exists "authorized staff manage student invites" on public.program_student_invites;
create policy "authorized staff manage student invites"
on public.program_student_invites for all
using (public.can_send_program_direct_invitations(program_id))
with check (public.can_send_program_direct_invitations(program_id));

-- The pre-existing version of this function returned a narrower column set (program_id,
-- title, director_name); create or replace can't widen a function's return columns, so the
-- old signature has to be dropped before it can be redefined below.
drop function if exists public.lookup_program_student_invite_code(text);

create or replace function public.lookup_program_student_invite_code(invite text)
returns table (
  invite_id uuid,
  program_id uuid,
  program_track_id uuid,
  title text,
  track_name text,
  director_name text,
  teacher_comment text,
  max_students integer,
  expires_at timestamptz,
  bypass_eligibility boolean,
  payment_bypassed boolean,
  payment_type text,
  price_cents integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  current_profile_id uuid := auth.uid();
  normalized_invite text := upper(trim(invite));
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    psi.id,
    p.id,
    psi.program_track_id,
    p.title,
    coalesce(pt.name, 'General admission'),
    coalesce(director.full_name, director.email, 'Class director'),
    psi.comment,
    psi.max_students,
    psi.expires_at,
    psi.bypass_eligibility,
    psi.payment_bypassed or not p.is_paid,
    psi.payment_type,
    case
      when psi.payment_bypassed or not p.is_paid then 0
      when psi.payment_type = 'annual' then coalesce(psi.custom_price_annual_cents, pt.price_annual_cents, p.price_annual_cents)
      else coalesce(psi.custom_price_monthly_cents, pt.price_monthly_cents, p.price_monthly_cents)
    end
  from public.program_student_invites psi
  join public.programs p on p.id = psi.program_id
  left join public.program_tracks pt on pt.id = psi.program_track_id
  left join public.profiles director on director.id = coalesce(p.director_profile_id, p.teacher_profile_id)
  where psi.invite_code = normalized_invite
    and psi.claimed_at is null
    and psi.revoked_at is null
    and (psi.expires_at is null or psi.expires_at > now())
  limit 1;
end;
$$;

grant execute on function public.lookup_program_student_invite_code(text) to authenticated;
