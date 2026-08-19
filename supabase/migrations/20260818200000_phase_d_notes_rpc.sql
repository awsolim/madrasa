-- Phase D (non-builder part): student notes drill-down. Same pattern as every prior snapshot
-- RPC in this series -- collapses a real component-level waterfall (TeacherStudentNotesData
-- fetches mosque/program/target across ~6 sequential stages, then its child
-- TeacherStudentNotesPage fetches notes+authors on its own, gated behind the parent
-- finishing) into one call. The child's own loadNotes() stays in place for refresh-after-
-- send/delete -- that's a one-off user action, not a page-load cost, so it's left untouched.
create or replace function public.get_teacher_student_notes_snapshot(p_slug text, p_program_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mosque public.mosques;
  v_program public.programs;
  v_enrollment public.enrollments;
  v_profile jsonb;
  v_parent_profile_id uuid;
  v_parent jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_author_ids uuid[];
  v_authors jsonb := '[]'::jsonb;
begin
  select * into v_mosque from public.mosques where slug = p_slug limit 1;
  if v_mosque.id is null then
    return jsonb_build_object('error', 'Masjid not found.', 'mosque', null, 'program', null);
  end if;

  select * into v_program from public.programs where id = p_program_id and mosque_id = v_mosque.id limit 1;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'mosque', to_jsonb(v_mosque), 'program', null);
  end if;

  select * into v_enrollment from public.enrollments where program_id = v_program.id and student_profile_id = p_student_id limit 1;
  if v_enrollment.id is null then
    return jsonb_build_object('error', 'Student enrollment not found.', 'mosque', to_jsonb(v_mosque), 'program', to_jsonb(v_program));
  end if;

  select to_jsonb(p) into v_profile
    from (select id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type from public.profiles where id = p_student_id) p;

  select parent_profile_id into v_parent_profile_id from public.parent_child_links where mosque_id = v_mosque.id and child_profile_id = p_student_id limit 1;
  if v_parent_profile_id is not null then
    select to_jsonb(p) into v_parent from (select id, full_name, email, phone_number, avatar_url from public.profiles where id = v_parent_profile_id) p;
  end if;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at asc), '[]'::jsonb) into v_notes
    from public.program_student_notes n where n.program_id = v_program.id and n.student_profile_id = p_student_id;

  select array_agg(distinct author_profile_id) into v_author_ids
    from public.program_student_notes where program_id = v_program.id and student_profile_id = p_student_id and author_profile_id is not null;
  if v_author_ids is not null then
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_authors from public.profiles p where p.id = any(v_author_ids);
  end if;

  return jsonb_build_object(
    'error', null,
    'mosque', to_jsonb(v_mosque),
    'program', to_jsonb(v_program),
    'enrollment', to_jsonb(v_enrollment),
    'profile', v_profile,
    'parent', v_parent,
    'notes', v_notes,
    'authors', v_authors
  );
end;
$$;

grant execute on function public.get_teacher_student_notes_snapshot(text, uuid, uuid) to authenticated;
