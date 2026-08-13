-- Security/abuse-prevention fix: program_announcements.message and
-- program_student_notes.message are plain `text` columns with only a
-- non-empty check — nothing bounds the upper size, and both are written to
-- directly from the browser client (anon/user key), not through an API route
-- that could clip the length server-side. A malicious or buggy client could
-- insert an arbitrarily large message. 20,000 characters is far beyond any
-- legitimate announcement/note (comfortably multiple pages of text) while
-- still bounding storage/rendering cost per row. Non-destructive: widens
-- nothing, only adds a new CHECK constraint; existing rows are all well under
-- this limit already (messages are short chat-style text in practice).

alter table public.program_announcements
  drop constraint if exists program_announcements_message_length_check,
  add constraint program_announcements_message_length_check
  check (length(message) <= 20000);

alter table public.program_student_notes
  drop constraint if exists program_student_notes_message_length_check,
  add constraint program_student_notes_message_length_check
  check (length(message) <= 20000);
