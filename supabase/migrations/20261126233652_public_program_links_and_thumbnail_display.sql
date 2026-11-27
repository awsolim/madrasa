-- Public addresses are allocated once, independently of mutable class titles.
-- No enrollment, billing, or visibility rules are changed.
alter table public.programs add column if not exists public_slug text;
alter table public.programs add constraint programs_public_slug_format_check
  check (public_slug is null or (length(public_slug) <= 96 and public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
create unique index if not exists programs_mosque_public_slug_idx on public.programs(mosque_id, public_slug);

create or replace function public.assign_program_public_slug()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_base text; v_slug text; v_suffix integer := 1;
begin
  if tg_op = 'UPDATE' and old.public_slug is not null then
    if new.public_slug is distinct from old.public_slug or new.mosque_id is distinct from old.mosque_id then
      raise exception 'Published class links are permanent. Editing a title does not change its URL.' using errcode = '23514';
    end if;
    return new;
  end if;
  new.public_slug := null;
  if new.publication_status not in ('published', 'hidden') then return new; end if;
  -- The allocator must see all reserved names and serialize same-tenant publishes.
  perform pg_advisory_xact_lock(hashtextextended(new.mosque_id::text, 0));
  v_base := trim(both '-' from left(regexp_replace(lower(new.title), '[^a-z0-9]+', '-', 'g'), 80));
  if coalesce(v_base, '') = '' then v_base := 'class'; end if;
  if v_base = 'new' or v_base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_base := 'class-' || v_base;
  end if;
  v_slug := v_base;
  while exists(select 1 from public.programs p where p.mosque_id = new.mosque_id and p.public_slug = v_slug and p.id <> new.id) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  end loop;
  new.public_slug := v_slug;
  return new;
end;
$$;
revoke all on function public.assign_program_public_slug() from public, anon, authenticated;
drop trigger if exists assign_program_public_slug on public.programs;
create trigger assign_program_public_slug before insert or update of title, publication_status, public_slug, mosque_id
  on public.programs for each row execute function public.assign_program_public_slug();

do $$
declare v_id uuid;
begin
  -- Lifecycle guard exemption is scoped only to this metadata backfill.
  perform set_config('app.class_lifecycle', 'approved', true);
  for v_id in select id from public.programs where public_slug is null and publication_status in ('published', 'hidden') order by created_at, id loop
    update public.programs set public_slug = null where id = v_id;
  end loop;
end;
$$;

-- Invoker rights preserve the existing public visibility/RLS boundary.
create or replace function public.resolve_public_program_link(p_mosque_slug text, p_reference text)
returns table(program_id uuid, canonical_slug text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, p.public_slug from public.programs p join public.mosques m on m.id = p.mosque_id
  where m.slug = p_mosque_slug and p.public_slug = lower(p_reference)
    and p.is_active = true and p.publication_status in ('published', 'hidden')
  limit 1;
$$;
revoke all on function public.resolve_public_program_link(text, text) from public;
grant execute on function public.resolve_public_program_link(text, text) to anon, authenticated;
