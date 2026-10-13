create table if not exists public.notification_delivery_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (profile_id, category),
  constraint notification_delivery_preferences_category_check check (
    category in ('applications', 'messages', 'class_updates', 'billing_alerts', 'payment_activity', 'withdrawals')
  ),
  constraint notification_delivery_preferences_required_channel_check check (
    category in ('messages', 'payment_activity') or push_enabled or email_enabled
  )
);

alter table public.notification_delivery_preferences enable row level security;

drop policy if exists "users manage their own notification preferences" on public.notification_delivery_preferences;
create policy "users manage their own notification preferences"
on public.notification_delivery_preferences
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

grant select, insert, update, delete on public.notification_delivery_preferences to authenticated;

