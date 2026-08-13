alter table public.program_announcements
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.program_announcements
  drop constraint if exists program_announcements_attachments_array_check,
  add constraint program_announcements_attachments_array_check
  check (jsonb_typeof(attachments) = 'array');

alter table public.program_student_notes
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.program_student_notes
  drop constraint if exists program_student_notes_attachments_array_check,
  add constraint program_student_notes_attachments_array_check
  check (jsonb_typeof(attachments) = 'array');

alter table public.program_student_notes
  drop constraint if exists program_student_notes_message_check,
  add constraint program_student_notes_message_check
  check (length(trim(message)) > 0 or jsonb_array_length(attachments) > 0);
