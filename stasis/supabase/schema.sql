create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 48),
  avatar_url text,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  room_type text not null default 'direct' check (room_type in ('direct', 'group')),
  icon text not null default '♡' check (char_length(icon) between 1 and 8),
  accent text not null default 'rose' check (accent in ('rose','blush','lavender','sky','mint','gold','mono')),
  invite_code text not null unique check (char_length(invite_code) between 4 and 24),
  joining_enabled boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  card_order integer not null default 0,
  pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.stasis_cards (
  room_id uuid not null,
  user_id uuid not null,
  status text not null default 'available' check (char_length(status) between 1 and 40),
  custom_status text not null default '' check (char_length(custom_status) <= 60),
  mood text not null default 'okay' check (char_length(mood) between 1 and 40),
  custom_mood text not null default '' check (char_length(custom_mood) <= 60),
  availability text not null default 'messages_welcome' check (char_length(availability) between 1 and 40),
  note text not null default '' check (char_length(note) <= 280),
  until_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id) references public.room_members(room_id, user_id) on delete cascade
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  status_changes boolean not null default false,
  mood_changes boolean not null default false,
  availability_changes boolean not null default true,
  note_changes boolean not null default true,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_name text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete cascade,
  event_type text not null check (event_type in ('status','mood','availability','note')),
  title text not null,
  body text not null,
  url text not null default '#/dashboard',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists notification_outbox_pending_idx on public.notification_outbox(processed_at, created_at);
create index if not exists notification_outbox_recipient_idx on public.notification_outbox(recipient_id, created_at desc);

create index if not exists room_members_user_idx on public.room_members(user_id);
create index if not exists room_members_room_idx on public.room_members(room_id);
create index if not exists room_members_pinned_idx on public.room_members(user_id, pinned);
create index if not exists stasis_cards_room_idx on public.stasis_cards(room_id);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);
create index if not exists notification_preferences_room_idx on public.notification_preferences(room_id);

create or replace function public.set_stasis_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_stasis_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'someone'), 48)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.create_stasis_card_for_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.stasis_cards (room_id, user_id)
  values (new.room_id, new.user_id)
  on conflict (room_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists stasis_profiles_updated_at on public.profiles;
create trigger stasis_profiles_updated_at
before update on public.profiles
for each row execute function public.set_stasis_updated_at();

drop trigger if exists stasis_rooms_updated_at on public.rooms;
create trigger stasis_rooms_updated_at
before update on public.rooms
for each row execute function public.set_stasis_updated_at();

drop trigger if exists stasis_cards_updated_at on public.stasis_cards;
create trigger stasis_cards_updated_at
before update on public.stasis_cards
for each row execute function public.set_stasis_updated_at();

drop trigger if exists stasis_notification_preferences_updated_at on public.notification_preferences;
create trigger stasis_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_stasis_updated_at();

drop trigger if exists on_auth_user_created_stasis on auth.users;
create trigger on_auth_user_created_stasis
after insert on auth.users
for each row execute function public.handle_new_stasis_user();

drop trigger if exists on_stasis_member_created on public.room_members;
create trigger on_stasis_member_created
after insert on public.room_members
for each row execute function public.create_stasis_card_for_member();

-- Backfill profiles if the project already had Auth users before this SQL ran.
insert into public.profiles (id, display_name)
select
  u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(u.email, '@', 1), ''), 'someone'), 48)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Security helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_stasis_room_member(p_room uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room and rm.user_id = p_user
  );
$$;

create or replace function public.is_stasis_room_owner(p_room uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room and rm.user_id = p_user and rm.role = 'owner'
  );
$$;

create or replace function public.is_stasis_room_manager(p_room uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = p_room and rm.user_id = p_user and rm.role in ('owner','admin')
  );
$$;

create or replace function public.stasis_users_share_room(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_a = p_b or exists (
    select 1
    from public.room_members a
    join public.room_members b on b.room_id = a.room_id
    where a.user_id = p_a and b.user_id = p_b
  );
$$;

create or replace function public.stasis_users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.normalize_stasis_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_-]+', '', 'g'));
$$;

create or replace function public.generate_stasis_code(p_length integer default 8)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  p_length := greatest(4, least(coalesce(p_length, 8), 24));
  for i in 1..p_length loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.stasis_cards enable row level security;
alter table public.blocks enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

-- Profiles are visible only to the account itself or people who share a room.
-- Users may edit only themselves.
drop policy if exists "authenticated can read profiles" on public.profiles;
drop policy if exists "users read self or shared profiles" on public.profiles;
create policy "users read self or shared profiles"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.stasis_users_share_room(auth.uid(), id));

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

-- Rooms and membership are private to members.
drop policy if exists "members read rooms" on public.rooms;
create policy "members read rooms"
on public.rooms for select
to authenticated
using (public.is_stasis_room_member(id, auth.uid()));

drop policy if exists "members read room membership" on public.room_members;
create policy "members read room membership"
on public.room_members for select
to authenticated
using (public.is_stasis_room_member(room_id, auth.uid()));

-- Cards are visible only to room members. A block in either direction hides the
-- other person's card while preserving group membership.
drop policy if exists "members read allowed cards" on public.stasis_cards;
create policy "members read allowed cards"
on public.stasis_cards for select
to authenticated
using (
  public.is_stasis_room_member(room_id, auth.uid())
  and (user_id = auth.uid() or not public.stasis_users_blocked(auth.uid(), user_id))
);

drop policy if exists "users insert own card" on public.stasis_cards;
create policy "users insert own card"
on public.stasis_cards for insert
to authenticated
with check (user_id = auth.uid() and public.is_stasis_room_member(room_id, auth.uid()));

drop policy if exists "users update own card" on public.stasis_cards;
create policy "users update own card"
on public.stasis_cards for update
to authenticated
using (user_id = auth.uid() and public.is_stasis_room_member(room_id, auth.uid()))
with check (user_id = auth.uid() and public.is_stasis_room_member(room_id, auth.uid()));

-- Blocks are private to the blocker.
drop policy if exists "users read own blocks" on public.blocks;
create policy "users read own blocks"
on public.blocks for select
to authenticated
using (blocker_id = auth.uid());

drop policy if exists "users create own blocks" on public.blocks;
create policy "users create own blocks"
on public.blocks for insert
to authenticated
with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists "users delete own blocks" on public.blocks;
create policy "users delete own blocks"
on public.blocks for delete
to authenticated
using (blocker_id = auth.uid());

-- Notification data is private to each user.
drop policy if exists "users manage own notification prefs" on public.notification_preferences;
create policy "users manage own notification prefs"
on public.notification_preferences for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_stasis_room_member(room_id, auth.uid()));

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
on public.push_subscriptions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Room/account operations. These functions are security-definer so room codes
-- can be resolved without making private rooms publicly queryable.
-- ---------------------------------------------------------------------------

create or replace function public.stasis_code_available(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := public.normalize_stasis_code(p_code);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if char_length(v_code) < 4 or char_length(v_code) > 24 then
    return false;
  end if;
  return not exists (select 1 from public.rooms r where r.invite_code = v_code);
end;
$$;

create or replace function public.create_stasis_room(
  p_name text,
  p_room_type text default 'direct',
  p_custom_code text default null,
  p_icon text default '♡',
  p_accent text default 'rose'
)
returns public.rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_room public.rooms;
  attempts integer := 0;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 or char_length(trim(p_name)) > 80 then raise exception 'Room names must be 1–80 characters.'; end if;
  if p_room_type not in ('direct', 'group') then raise exception 'Invalid room type.'; end if;
  if char_length(trim(coalesce(p_icon, ''))) < 1 or char_length(trim(p_icon)) > 8 then raise exception 'Room icons must be 1–8 characters.'; end if;
  if p_accent not in ('rose','blush','lavender','sky','mint','gold','mono') then raise exception 'Invalid room accent.'; end if;

  if p_custom_code is not null and trim(p_custom_code) <> '' then
    v_code := public.normalize_stasis_code(p_custom_code);
    if char_length(v_code) < 4 or char_length(v_code) > 24 then raise exception 'Custom codes must be 4–24 letters, numbers, hyphens, or underscores.'; end if;
    if exists (select 1 from public.rooms where invite_code = v_code) then raise exception 'That room code is already taken.'; end if;
  else
    loop
      attempts := attempts + 1;
      v_code := public.generate_stasis_code(8);
      exit when not exists (select 1 from public.rooms where invite_code = v_code);
      if attempts > 30 then raise exception 'Could not generate a unique room code. Try again.'; end if;
    end loop;
  end if;

  begin
    insert into public.rooms (name, room_type, icon, accent, invite_code, created_by)
    values (trim(p_name), p_room_type, trim(p_icon), p_accent, v_code, v_uid)
    returning * into v_room;
  exception when unique_violation then
    raise exception 'That room code was just taken. Try another one.';
  end;

  insert into public.room_members (room_id, user_id, role, card_order)
  values (v_room.id, v_uid, 'owner', 0);

  return v_room;
end;
$$;

create or replace function public.join_stasis_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.normalize_stasis_code(p_code);
  v_room public.rooms;
  v_count integer;
  v_order integer;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;

  select * into v_room
  from public.rooms
  where invite_code = v_code
  for update;

  if v_room.id is null then raise exception 'No room exists with that code.'; end if;
  if public.is_stasis_room_member(v_room.id, v_uid) then return v_room; end if;
  if not v_room.joining_enabled then raise exception 'Joining is disabled for this room.'; end if;

  select count(*), coalesce(max(card_order), -1) + 1
  into v_count, v_order
  from public.room_members
  where room_id = v_room.id;

  if v_room.room_type = 'direct' then
    if v_count >= 2 then raise exception 'This two-person room is already full.'; end if;
    if exists (
      select 1 from public.room_members rm
      where rm.room_id = v_room.id and public.stasis_users_blocked(v_uid, rm.user_id)
    ) then
      raise exception 'You cannot join this direct room.';
    end if;
  end if;

  insert into public.room_members (room_id, user_id, role, card_order)
  values (v_room.id, v_uid, 'member', v_order);

  if v_room.room_type = 'direct' and v_count + 1 >= 2 then
    update public.rooms set joining_enabled = false where id = v_room.id;
    v_room.joining_enabled := false;
  end if;

  return v_room;
end;
$$;

create or replace function public.set_stasis_joining(p_room uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_count integer;
begin
  if auth.uid() is null or not public.is_stasis_room_manager(p_room, auth.uid()) then raise exception 'Only room managers can change joining.'; end if;
  select * into v_room from public.rooms where id = p_room for update;
  if p_enabled and v_room.room_type = 'direct' then
    select count(*) into v_count from public.room_members where room_id = p_room;
    if v_count >= 2 then raise exception 'A full two-person room cannot accept another member.'; end if;
  end if;
  update public.rooms set joining_enabled = p_enabled where id = p_room;
end;
$$;

create or replace function public.regenerate_stasis_code(p_room uuid, p_custom_code text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  attempts integer := 0;
begin
  if auth.uid() is null or not public.is_stasis_room_manager(p_room, auth.uid()) then raise exception 'Only room managers can change the code.'; end if;

  if p_custom_code is not null and trim(p_custom_code) <> '' then
    v_code := public.normalize_stasis_code(p_custom_code);
    if char_length(v_code) < 4 or char_length(v_code) > 24 then raise exception 'Custom codes must be 4–24 letters, numbers, hyphens, or underscores.'; end if;
    if exists (select 1 from public.rooms where invite_code = v_code and id <> p_room) then raise exception 'That room code is already taken.'; end if;
  else
    loop
      attempts := attempts + 1;
      v_code := public.generate_stasis_code(8);
      exit when not exists (select 1 from public.rooms where invite_code = v_code);
      if attempts > 30 then raise exception 'Could not generate a unique room code. Try again.'; end if;
    end loop;
  end if;

  update public.rooms set invite_code = v_code where id = p_room;
  return v_code;
end;
$$;

create or replace function public.leave_stasis_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_was_owner boolean;
  v_next uuid;
begin
  if v_uid is null or not public.is_stasis_room_member(p_room, v_uid) then raise exception 'You are not in this room.'; end if;
  select (role = 'owner') into v_was_owner from public.room_members where room_id = p_room and user_id = v_uid;
  delete from public.room_members where room_id = p_room and user_id = v_uid;

  if not exists (select 1 from public.room_members where room_id = p_room) then
    delete from public.rooms where id = p_room;
    return;
  end if;

  if v_was_owner then
    select user_id into v_next from public.room_members where room_id = p_room order by case when role='admin' then 0 else 1 end, joined_at, user_id limit 1;
    update public.room_members set role = 'owner' where room_id = p_room and user_id = v_next;
    update public.rooms set created_by = v_next where id = p_room;
  end if;
end;
$$;

create or replace function public.remove_stasis_member(p_room uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_stasis_room_manager(p_room, auth.uid()) then raise exception 'Only room managers can remove members.'; end if;
  if p_user = auth.uid() then raise exception 'Use Leave room to remove yourself.'; end if;
  if exists (select 1 from public.room_members where room_id=p_room and user_id=p_user and role='owner') then raise exception 'The owner cannot be removed. Transfer ownership first.'; end if;
  if not public.is_stasis_room_owner(p_room, auth.uid()) and exists (
    select 1 from public.room_members where room_id=p_room and user_id=p_user and role='admin'
  ) then raise exception 'Only the owner can remove an admin.'; end if;
  delete from public.room_members where room_id = p_room and user_id = p_user;
end;
$$;

create or replace function public.delete_stasis_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_stasis_room_owner(p_room, auth.uid()) then raise exception 'Only the owner can delete this room.'; end if;
  delete from public.rooms where id = p_room;
end;
$$;

create or replace function public.copy_my_stasis_card(
  p_source_room uuid,
  p_target_rooms uuid[],
  p_fields text[] default array['status','mood','availability','until_at']::text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.stasis_cards%rowtype;
  v_target uuid;
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if p_target_rooms is null or array_length(p_target_rooms, 1) is null then return 0; end if;
  if p_fields is null or array_length(p_fields, 1) is null then return 0; end if;
  if exists (select 1 from unnest(p_fields) as f(field_name) where field_name not in ('status','mood','availability','note','until_at')) then raise exception 'Invalid card field.'; end if;

  select * into v_source from public.stasis_cards where room_id = p_source_room and user_id = v_uid;
  if v_source.room_id is null then raise exception 'Your source card was not found.'; end if;

  for v_target in select distinct unnest(p_target_rooms) loop
    if v_target = p_source_room then continue; end if;
    if not public.is_stasis_room_member(v_target, v_uid) then continue; end if;

    update public.stasis_cards
    set
      status = case when 'status' = any(p_fields) then v_source.status else status end,
      custom_status = case when 'status' = any(p_fields) then v_source.custom_status else custom_status end,
      mood = case when 'mood' = any(p_fields) then v_source.mood else mood end,
      custom_mood = case when 'mood' = any(p_fields) then v_source.custom_mood else custom_mood end,
      availability = case when 'availability' = any(p_fields) then v_source.availability else availability end,
      note = case when 'note' = any(p_fields) then v_source.note else note end,
      until_at = case when 'until_at' = any(p_fields) then v_source.until_at else until_at end
    where room_id = v_target and user_id = v_uid;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.block_stasis_user(p_blocked uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if p_blocked = v_uid then raise exception 'You cannot block yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_blocked) then raise exception 'Account not found.'; end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, p_blocked)
  on conflict do nothing;

  -- Strong block: remove direct rooms shared by the pair. Group rooms remain,
  -- but card RLS hides blocked pairs from each other.
  delete from public.rooms r
  where r.room_type = 'direct'
    and exists (select 1 from public.room_members a where a.room_id = r.id and a.user_id = v_uid)
    and exists (select 1 from public.room_members b where b.room_id = r.id and b.user_id = p_blocked);
end;
$$;

create or replace function public.unblock_stasis_user(p_blocked uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_blocked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final release convenience/admin operations
-- ---------------------------------------------------------------------------

create or replace function public.update_stasis_room(
  p_room uuid,
  p_name text,
  p_icon text default '♡',
  p_accent text default 'rose'
)
returns public.rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_room public.rooms;
begin
  if auth.uid() is null or not public.is_stasis_room_manager(p_room, auth.uid()) then raise exception 'Only room managers can edit room settings.'; end if;
  if char_length(trim(coalesce(p_name,''))) < 1 or char_length(trim(p_name)) > 80 then raise exception 'Room names must be 1–80 characters.'; end if;
  if char_length(trim(coalesce(p_icon,''))) < 1 or char_length(trim(p_icon)) > 8 then raise exception 'Room icons must be 1–8 characters.'; end if;
  if p_accent not in ('rose','blush','lavender','sky','mint','gold','mono') then raise exception 'Invalid room accent.'; end if;
  update public.rooms set name=trim(p_name), icon=trim(p_icon), accent=p_accent where id=p_room returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.set_stasis_room_pinned(p_room uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_stasis_room_member(p_room, auth.uid()) then raise exception 'You are not in this room.'; end if;
  update public.room_members set pinned=coalesce(p_pinned,false) where room_id=p_room and user_id=auth.uid();
end;
$$;

create or replace function public.set_stasis_member_role(p_room uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_stasis_room_owner(p_room, auth.uid()) then raise exception 'Only the owner can change roles.'; end if;
  if p_user = auth.uid() then raise exception 'Use ownership transfer to change your own role.'; end if;
  if not exists (select 1 from public.rooms where id=p_room and room_type='group') then raise exception 'Roles are only used in group rooms.'; end if;
  if p_role not in ('admin','member') then raise exception 'Invalid role.'; end if;
  if not public.is_stasis_room_member(p_room,p_user) then raise exception 'That account is not in this room.'; end if;
  update public.room_members set role=p_role where room_id=p_room and user_id=p_user;
end;
$$;

create or replace function public.transfer_stasis_ownership(p_room uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_stasis_room_owner(p_room, auth.uid()) then raise exception 'Only the owner can transfer ownership.'; end if;
  if p_user = auth.uid() then return; end if;
  if not public.is_stasis_room_member(p_room,p_user) then raise exception 'That account is not in this room.'; end if;
  update public.room_members set role='member' where room_id=p_room and user_id=auth.uid();
  update public.room_members set role='owner' where room_id=p_room and user_id=p_user;
  update public.rooms set created_by=p_user where id=p_room;
end;
$$;

create or replace function public.set_my_stasis_everywhere(
  p_target_rooms uuid[],
  p_status text default null,
  p_custom_status text default null,
  p_mood text default null,
  p_custom_mood text default null,
  p_availability text default null,
  p_note text default null,
  p_until_at timestamptz default null,
  p_fields text[] default array['status','mood','availability','until_at']::text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_room uuid; v_count integer := 0;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if p_target_rooms is null or array_length(p_target_rooms,1) is null then return 0; end if;
  if exists (select 1 from unnest(p_fields) f where f not in ('status','mood','availability','note','until_at')) then raise exception 'Invalid card field.'; end if;
  if p_note is not null and char_length(p_note) > 280 then raise exception 'Notes are limited to 280 characters.'; end if;
  if p_custom_status is not null and char_length(p_custom_status) > 60 then raise exception 'Custom statuses are limited to 60 characters.'; end if;
  if p_custom_mood is not null and char_length(p_custom_mood) > 60 then raise exception 'Custom moods are limited to 60 characters.'; end if;
  for v_room in select distinct unnest(p_target_rooms) loop
    if not public.is_stasis_room_member(v_room,v_uid) then continue; end if;
    update public.stasis_cards set
      status = case when 'status'=any(p_fields) and p_status is not null then p_status else status end,
      custom_status = case when 'status'=any(p_fields) then coalesce(p_custom_status,'') else custom_status end,
      mood = case when 'mood'=any(p_fields) and p_mood is not null then p_mood else mood end,
      custom_mood = case when 'mood'=any(p_fields) then coalesce(p_custom_mood,'') else custom_mood end,
      availability = case when 'availability'=any(p_fields) and p_availability is not null then p_availability else availability end,
      note = case when 'note'=any(p_fields) then coalesce(p_note,'') else note end,
      until_at = case when 'until_at'=any(p_fields) then p_until_at else until_at end
    where room_id=v_room and user_id=v_uid;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.get_my_stasis_blocks()
returns table(blocked_id uuid, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b
  join public.profiles p on p.id=b.blocked_id
  where b.blocker_id=auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.delete_my_stasis_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_next uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;

  -- A profile that created rooms is referenced by rooms.created_by. Transfer
  -- ownership first (preferring admins), or delete rooms with no one left.
  for v_room in
    select rm.room_id from public.room_members rm
    where rm.user_id=v_uid and rm.role='owner'
  loop
    select rm.user_id into v_next
    from public.room_members rm
    where rm.room_id=v_room and rm.user_id<>v_uid
    order by case when rm.role='admin' then 0 else 1 end, rm.joined_at, rm.user_id
    limit 1;

    if v_next is null then
      delete from public.rooms where id=v_room;
    else
      update public.room_members set role='owner' where room_id=v_room and user_id=v_next;
      update public.rooms set created_by=v_next where id=v_room;
    end if;
  end loop;

  delete from auth.users where id=v_uid;
end;
$$;

-- Queue notifications when another room member's card changes. The optional
-- Edge Function consumes these rows with a service-role key and sends Web Push.
create or replace function public.queue_stasis_card_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
  actor_name text;
  room_name text;
  changed_type text;
  msg text;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  select display_name into actor_name from public.profiles where id=new.user_id;
  select name into room_name from public.rooms where id=new.room_id;

  for recipient in
    select rm.user_id, np.status_changes, np.mood_changes, np.availability_changes, np.note_changes
    from public.room_members rm
    left join public.notification_preferences np on np.room_id=rm.room_id and np.user_id=rm.user_id
    where rm.room_id=new.room_id and rm.user_id<>new.user_id
      and not public.stasis_users_blocked(rm.user_id,new.user_id)
      and exists (select 1 from public.push_subscriptions ps where ps.user_id=rm.user_id)
  loop
    changed_type := null; msg := null;
    if old.note is distinct from new.note and coalesce(recipient.note_changes,true) then changed_type:='note'; msg := case when trim(new.note)='' then actor_name || ' cleared their note.' else actor_name || ' left a new note ♡' end;
    elsif old.availability is distinct from new.availability and coalesce(recipient.availability_changes,true) then changed_type:='availability'; msg := actor_name || ' changed availability to ' || replace(new.availability,'_',' ') || '.';
    elsif (old.status is distinct from new.status or old.custom_status is distinct from new.custom_status) and coalesce(recipient.status_changes,false) then changed_type:='status'; msg := actor_name || ' changed status to ' || coalesce(nullif(new.custom_status,''),new.status) || '.';
    elsif (old.mood is distinct from new.mood or old.custom_mood is distinct from new.custom_mood) and coalesce(recipient.mood_changes,false) then changed_type:='mood'; msg := actor_name || ' is feeling ' || coalesce(nullif(new.custom_mood,''),new.mood) || '.';
    end if;
    if changed_type is not null then
      insert into public.notification_outbox(recipient_id,actor_id,room_id,event_type,title,body,url,payload)
      values(recipient.user_id,new.user_id,new.room_id,changed_type,coalesce(room_name,'Stasis'),msg,'#/room/'||new.room_id,jsonb_build_object('room_id',new.room_id,'actor_id',new.user_id,'event_type',changed_type));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_stasis_card_notify on public.stasis_cards;
create trigger on_stasis_card_notify
after update on public.stasis_cards
for each row execute function public.queue_stasis_card_notifications();

-- ---------------------------------------------------------------------------
-- API grants
-- ---------------------------------------------------------------------------

-- Security-definer functions are not public endpoints by default.
revoke all on function public.stasis_code_available(text) from public, anon;
revoke all on function public.create_stasis_room(text, text, text, text, text) from public, anon;
revoke all on function public.join_stasis_room(text) from public, anon;
revoke all on function public.set_stasis_joining(uuid, boolean) from public, anon;
revoke all on function public.regenerate_stasis_code(uuid, text) from public, anon;
revoke all on function public.leave_stasis_room(uuid) from public, anon;
revoke all on function public.remove_stasis_member(uuid, uuid) from public, anon;
revoke all on function public.delete_stasis_room(uuid) from public, anon;
revoke all on function public.copy_my_stasis_card(uuid, uuid[], text[]) from public, anon;
revoke all on function public.block_stasis_user(uuid) from public, anon;
revoke all on function public.unblock_stasis_user(uuid) from public, anon;
revoke all on function public.update_stasis_room(uuid,text,text,text) from public, anon;
revoke all on function public.set_stasis_room_pinned(uuid,boolean) from public, anon;
revoke all on function public.set_stasis_member_role(uuid,uuid,text) from public, anon;
revoke all on function public.transfer_stasis_ownership(uuid,uuid) from public, anon;
revoke all on function public.set_my_stasis_everywhere(uuid[],text,text,text,text,text,text,timestamptz,text[]) from public, anon;
revoke all on function public.get_my_stasis_blocks() from public, anon;
revoke all on function public.delete_my_stasis_account() from public, anon;
revoke all on function public.is_stasis_room_member(uuid, uuid) from public, anon;
revoke all on function public.is_stasis_room_owner(uuid, uuid) from public, anon;
revoke all on function public.is_stasis_room_manager(uuid, uuid) from public, anon;
revoke all on function public.stasis_users_share_room(uuid, uuid) from public, anon;
revoke all on function public.stasis_users_blocked(uuid, uuid) from public, anon;

revoke all on public.rooms from anon, authenticated;
revoke all on public.room_members from anon, authenticated;
revoke all on public.stasis_cards from anon, authenticated;
revoke all on public.blocks from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant select, insert, update on public.stasis_cards to authenticated;
grant select on public.blocks to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

grant execute on function public.stasis_code_available(text) to authenticated;
grant execute on function public.create_stasis_room(text, text, text, text, text) to authenticated;
grant execute on function public.join_stasis_room(text) to authenticated;
grant execute on function public.set_stasis_joining(uuid, boolean) to authenticated;
grant execute on function public.regenerate_stasis_code(uuid, text) to authenticated;
grant execute on function public.leave_stasis_room(uuid) to authenticated;
grant execute on function public.remove_stasis_member(uuid, uuid) to authenticated;
grant execute on function public.delete_stasis_room(uuid) to authenticated;
grant execute on function public.copy_my_stasis_card(uuid, uuid[], text[]) to authenticated;
grant execute on function public.block_stasis_user(uuid) to authenticated;
grant execute on function public.unblock_stasis_user(uuid) to authenticated;
grant execute on function public.update_stasis_room(uuid,text,text,text) to authenticated;
grant execute on function public.set_stasis_room_pinned(uuid,boolean) to authenticated;
grant execute on function public.set_stasis_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.transfer_stasis_ownership(uuid,uuid) to authenticated;
grant execute on function public.set_my_stasis_everywhere(uuid[],text,text,text,text,text,text,timestamptz,text[]) to authenticated;
grant execute on function public.get_my_stasis_blocks() to authenticated;
grant execute on function public.delete_my_stasis_account() to authenticated;

-- RLS policies invoke these helpers as the authenticated caller, so the role
-- needs EXECUTE permission. They return booleans only; writes remain in the
-- dedicated RPCs above.
grant execute on function public.is_stasis_room_member(uuid, uuid) to authenticated;
grant execute on function public.is_stasis_room_owner(uuid, uuid) to authenticated;
grant execute on function public.is_stasis_room_manager(uuid, uuid) to authenticated;
grant execute on function public.stasis_users_share_room(uuid, uuid) to authenticated;
grant execute on function public.stasis_users_blocked(uuid, uuid) to authenticated;

-- Internal helpers do not need to be callable from anonymous clients.
revoke execute on function public.is_stasis_room_member(uuid, uuid) from anon;
revoke execute on function public.is_stasis_room_owner(uuid, uuid) from anon;
revoke execute on function public.is_stasis_room_manager(uuid, uuid) from anon;
revoke execute on function public.stasis_users_share_room(uuid, uuid) from anon;
revoke execute on function public.stasis_users_blocked(uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.rooms replica identity full;
alter table public.room_members replica identity full;
alter table public.stasis_cards replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stasis_cards') then
    alter publication supabase_realtime add table public.stasis_cards;
  end if;
end $$;

-- Done. Create a test account in the app, then create/join a room from two
-- separate browsers to verify realtime + RLS behavior.
