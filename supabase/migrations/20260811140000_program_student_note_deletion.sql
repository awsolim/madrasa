drop policy if exists "program teachers delete student notes" on public.program_student_notes;
create policy "program teachers delete student notes"
on public.program_student_notes for delete
using (public.is_program_teacher(program_id));
