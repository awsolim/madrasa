alter table public.mosques
  add column if not exists pwa_name text,
  add column if not exists pwa_short_name text,
  add column if not exists app_icon_url text;
