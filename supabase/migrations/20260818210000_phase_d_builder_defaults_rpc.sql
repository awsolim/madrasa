-- Phase D (builder part, handled conservatively given this project's own instructions flag
-- the program builder as active WIP): collapses ONLY the one-time default-seeding fetch in
-- TeacherProgramCreateData (profile -> mosque -> [if admin] memberships -> teachers, four
-- sequential stages) into one call. Nothing about the builder's form state, validation, or
-- submission logic is touched -- this replaces exactly one fetch, the same low-risk pattern
-- used everywhere else in this series.
create or replace function public.get_program_create_defaults_snapshot(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_account_type text;
  v_mosque jsonb;
  v_mosque_id uuid;
  v_teacher_ids uuid[];
  v_teachers jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('profile', null, 'mosque', null, 'teachers', '[]'::jsonb);
  end if;

  select to_jsonb(p) into v_profile
    from (select full_name, phone_number, teacher_whatsapp_number, account_type from public.profiles where id = v_user_id) p;
  select account_type into v_account_type from public.profiles where id = v_user_id;

  select id, to_jsonb(m) into v_mosque_id, v_mosque from public.mosques m where m.slug = p_slug limit 1;

  if lower(coalesce(v_account_type, '')) = 'admin' and v_mosque_id is not null then
    select array_agg(profile_id) into v_teacher_ids
      from public.mosque_memberships where mosque_id = v_mosque_id and role = 'teacher' and status = 'active';
    if v_teacher_ids is not null then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.full_name), '[]'::jsonb) into v_teachers
        from (
          select id, full_name, email, phone_number, teacher_credentials, teacher_whatsapp_number
          from public.profiles where account_type = 'teacher' and id = any(v_teacher_ids)
        ) t;
    end if;
  end if;

  return jsonb_build_object('profile', v_profile, 'mosque', v_mosque, 'teachers', v_teachers);
end;
$$;

grant execute on function public.get_program_create_defaults_snapshot(text) to authenticated;
