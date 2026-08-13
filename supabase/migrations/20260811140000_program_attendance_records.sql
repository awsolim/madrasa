create table if not exists public.program_attendance_records (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  program_session_id uuid references public.program_sessions(id) on delete set null,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  day_of_week text,
  start_time time not null,
  end_time time,
  status text not null,
  absence_reason text,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.program_attendance_records
  drop constraint if exists program_attendance_records_status_check,
  add constraint program_attendance_records_status_check
  check (status in ('present', 'absent'));

create unique index if not exists program_attendance_records_session_student_unique
  on public.program_attendance_records(program_id, session_date, start_time, student_profile_id);

create index if not exists program_attendance_records_program_session_idx
  on public.program_attendance_records(program_id, session_date desc, start_time);

create index if not exists program_attendance_records_student_idx
  on public.program_attendance_records(student_profile_id, session_date desc);

alter table public.program_attendance_records enable row level security;

drop policy if exists "program managers view attendance records" on public.program_attendance_records;
create policy "program managers view attendance records"
on public.program_attendance_records for select
using (public.can_manage_program(program_id));

drop policy if exists "program managers manage attendance records" on public.program_attendance_records;
create policy "program managers manage attendance records"
on public.program_attendance_records for all
using (public.can_manage_program(program_id))
with check (public.can_manage_program(program_id));
