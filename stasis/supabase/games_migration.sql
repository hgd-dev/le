-- STASIS COMPLETE UPGRADE v1.2 migration
-- Run this ONCE in Supabase -> SQL Editor on an existing Stasis v1.0 database.
-- It is safe to keep in a public repository; there are no secrets here.

-- Keep the expanded note limit from the post-v1.0 Stasis update.
alter table public.stasis_cards drop constraint if exists stasis_cards_note_check;
alter table public.stasis_cards add constraint stasis_cards_note_check check (char_length(note) <= 1500);

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
  if p_note is not null and char_length(p_note) > 1500 then raise exception 'Notes are limited to 1500 characters.'; end if;
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

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_type text not null check (game_type in ('tictactoe','connect4','gomoku','reversi','mancala','chess','checkers','pool8','pool9','cuppong','dots','filler','anagrams','wordchain','darts','archery','basketball','minigolf','shuffleboard')),
  host_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','active','finished','cancelled')),
  player_ids uuid[] not null default '{}'::uuid[],
  max_players integer not null check (max_players between 2 and 8),
  state jsonb not null default '{}'::jsonb,
  turn_user_id uuid references public.profiles(id) on delete set null,
  winner_user_ids uuid[] not null default '{}'::uuid[],
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.game_sessions drop constraint if exists game_sessions_game_type_check;
alter table public.game_sessions add constraint game_sessions_game_type_check
  check (game_type in ('tictactoe','connect4','gomoku','reversi','mancala','chess','checkers','pool8','pool9','cuppong','dots','filler','anagrams','wordchain','darts','archery','basketball','minigolf','shuffleboard'));

create index if not exists game_sessions_room_idx on public.game_sessions(room_id, updated_at desc);
create index if not exists game_sessions_host_idx on public.game_sessions(host_user_id, updated_at desc);

alter table public.game_sessions enable row level security;

drop policy if exists "room members read games" on public.game_sessions;
create policy "room members read games"
on public.game_sessions for select
to authenticated
using (public.is_stasis_room_member(room_id, auth.uid()));

drop trigger if exists set_game_sessions_updated_at on public.game_sessions;
create trigger set_game_sessions_updated_at
before update on public.game_sessions
for each row execute function public.set_stasis_updated_at();

create or replace function public.create_stasis_game(p_room uuid, p_game_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_max integer;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if not public.is_stasis_room_member(p_room, v_uid) then raise exception 'You are not a member of this room.'; end if;
  if (select count(*) from public.game_sessions where room_id=p_room and host_user_id=v_uid and status in ('waiting','active')) >= 6 then
    raise exception 'Finish or cancel one of your open games first.';
  end if;

  v_max := case p_game_type
    when 'tictactoe' then 2
    when 'connect4' then 2
    when 'gomoku' then 2
    when 'reversi' then 2
    when 'mancala' then 2
    when 'chess' then 2
    when 'checkers' then 2
    when 'pool8' then 2
    when 'pool9' then 2
    when 'cuppong' then 2
    when 'dots' then 4
    when 'filler' then 4
    when 'anagrams' then 8
    when 'wordchain' then 8
    when 'darts' then 4
    when 'archery' then 4
    when 'basketball' then 4
    when 'minigolf' then 4
    when 'shuffleboard' then 4
    else null
  end;
  if v_max is null then raise exception 'Unsupported game.'; end if;

  insert into public.game_sessions(room_id, game_type, host_user_id, player_ids, max_players)
  values(p_room, p_game_type, v_uid, array[v_uid]::uuid[], v_max)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.join_stasis_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  other_id uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if not public.is_stasis_room_member(g.room_id, v_uid) then raise exception 'You are not a member of this room.'; end if;
  if g.status <> 'waiting' then raise exception 'This game has already started.'; end if;
  if v_uid = any(g.player_ids) then return; end if;
  if coalesce(array_length(g.player_ids,1),0) >= g.max_players then raise exception 'This game is full.'; end if;

  foreach other_id in array g.player_ids loop
    if public.stasis_users_blocked(v_uid, other_id) then raise exception 'A block prevents these accounts from playing together.'; end if;
  end loop;

  update public.game_sessions set player_ids=array_append(player_ids,v_uid) where id=p_game;
end;
$$;

create or replace function public.leave_stasis_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  remaining uuid[];
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if g.status <> 'waiting' then raise exception 'You can only leave a waiting lobby. Resign after a game starts.'; end if;
  if not (v_uid = any(g.player_ids)) then return; end if;

  select coalesce(array_agg(x), '{}'::uuid[]) into remaining from unnest(g.player_ids) x where x<>v_uid;
  if coalesce(array_length(remaining,1),0)=0 then
    delete from public.game_sessions where id=p_game;
  else
    update public.game_sessions set player_ids=remaining, host_user_id=case when host_user_id=v_uid then remaining[1] else host_user_id end where id=p_game;
  end if;
end;
$$;

create or replace function public.start_stasis_game(p_game uuid, p_state jsonb, p_first_turn uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_min integer;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if g.host_user_id<>v_uid then raise exception 'Only the game host can start it.'; end if;
  if g.status<>'waiting' then raise exception 'This game is not waiting.'; end if;
  v_min := case when g.game_type in ('tictactoe','connect4','gomoku','reversi','mancala','chess','checkers','pool8','pool9','cuppong','dots','filler','anagrams','wordchain','darts','archery','basketball','minigolf','shuffleboard') then 2 else 2 end;
  if coalesce(array_length(g.player_ids,1),0)<v_min then raise exception 'Not enough players yet.'; end if;
  if not (p_first_turn = any(g.player_ids)) then raise exception 'Invalid first player.'; end if;
  if jsonb_typeof(p_state)<>'object' or pg_column_size(p_state)>150000 then raise exception 'Invalid game state.'; end if;

  update public.game_sessions set status='active', state=p_state, turn_user_id=p_first_turn, winner_user_ids='{}'::uuid[], version=1, finished_at=null where id=p_game;
end;
$$;

create or replace function public.submit_stasis_game_state(
  p_game uuid,
  p_expected_version integer,
  p_state jsonb,
  p_next_turn uuid,
  p_status text default 'active',
  p_winners uuid[] default '{}'::uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_new_version integer;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if g.status<>'active' then raise exception 'This game is not active.'; end if;
  if g.turn_user_id<>v_uid then raise exception 'It is not your turn.'; end if;
  if not (v_uid = any(g.player_ids)) then raise exception 'You are not a player in this game.'; end if;
  if g.version<>p_expected_version then raise exception 'The game changed before that move saved. Reload and try again.'; end if;
  if p_status not in ('active','finished') then raise exception 'Invalid game status.'; end if;
  if jsonb_typeof(p_state)<>'object' or pg_column_size(p_state)>150000 then raise exception 'Invalid game state.'; end if;
  if p_next_turn is not null and not (p_next_turn = any(g.player_ids)) then raise exception 'Invalid next player.'; end if;
  if not coalesce(p_winners,'{}'::uuid[]) <@ g.player_ids then raise exception 'Invalid winner list.'; end if;
  if p_status='finished' and p_next_turn is not null then raise exception 'Finished games cannot have a next turn.'; end if;

  v_new_version := g.version + 1;
  update public.game_sessions set
    state=p_state,
    turn_user_id=case when p_status='finished' then null else p_next_turn end,
    winner_user_ids=coalesce(p_winners,'{}'::uuid[]),
    status=p_status,
    version=v_new_version,
    finished_at=case when p_status='finished' then now() else null end
  where id=p_game;
  return v_new_version;
end;
$$;

create or replace function public.cancel_stasis_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if g.host_user_id<>v_uid and not public.is_stasis_room_manager(g.room_id,v_uid) then raise exception 'Only the host or a room manager can cancel this game.'; end if;
  if g.status<>'waiting' then raise exception 'Only waiting games can be cancelled.'; end if;
  update public.game_sessions set status='cancelled', turn_user_id=null where id=p_game;
end;
$$;

create or replace function public.resign_stasis_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  winners uuid[];
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game for update;
  if not found then raise exception 'Game not found.'; end if;
  if g.status<>'active' then raise exception 'This game is not active.'; end if;
  if not (v_uid=any(g.player_ids)) then raise exception 'You are not a player in this game.'; end if;
  select coalesce(array_agg(x), '{}'::uuid[]) into winners from unnest(g.player_ids) x where x<>v_uid;
  update public.game_sessions set status='finished', turn_user_id=null, winner_user_ids=winners, version=version+1, finished_at=now() where id=p_game;
end;
$$;

create or replace function public.rematch_stasis_game(p_game uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into g from public.game_sessions where id=p_game;
  if not found then raise exception 'Game not found.'; end if;
  if g.status<>'finished' then raise exception 'Finish the current game first.'; end if;
  if not (v_uid=any(g.player_ids)) then raise exception 'Only players can request a rematch.'; end if;
  insert into public.game_sessions(room_id,game_type,host_user_id,status,player_ids,max_players)
  values(g.room_id,g.game_type,v_uid,'waiting',g.player_ids,g.max_players)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.handle_stasis_game_member_departure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g record;
  remaining uuid[];
begin
  for g in
    select * from public.game_sessions
    where room_id=old.room_id and old.user_id=any(player_ids) and status in ('waiting','active')
    for update
  loop
    select coalesce(array_agg(x), '{}'::uuid[]) into remaining from unnest(g.player_ids) x where x<>old.user_id;
    if g.status='waiting' then
      if coalesce(array_length(remaining,1),0)=0 then
        delete from public.game_sessions where id=g.id;
      else
        update public.game_sessions set
          player_ids=remaining,
          host_user_id=case when g.host_user_id=old.user_id then remaining[1] else g.host_user_id end
        where id=g.id;
      end if;
    else
      update public.game_sessions set
        status='finished', turn_user_id=null, winner_user_ids=remaining, version=version+1, finished_at=now()
      where id=g.id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists on_stasis_member_game_departure on public.room_members;
create trigger on_stasis_member_game_departure
after delete on public.room_members
for each row execute function public.handle_stasis_game_member_departure();

revoke all on public.game_sessions from anon, authenticated;
grant select on public.game_sessions to authenticated;

revoke all on function public.create_stasis_game(uuid,text) from public, anon;
revoke all on function public.join_stasis_game(uuid) from public, anon;
revoke all on function public.leave_stasis_game(uuid) from public, anon;
revoke all on function public.start_stasis_game(uuid,jsonb,uuid) from public, anon;
revoke all on function public.submit_stasis_game_state(uuid,integer,jsonb,uuid,text,uuid[]) from public, anon;
revoke all on function public.cancel_stasis_game(uuid) from public, anon;
revoke all on function public.resign_stasis_game(uuid) from public, anon;
revoke all on function public.rematch_stasis_game(uuid) from public, anon;

grant execute on function public.create_stasis_game(uuid,text) to authenticated;
grant execute on function public.join_stasis_game(uuid) to authenticated;
grant execute on function public.leave_stasis_game(uuid) to authenticated;
grant execute on function public.start_stasis_game(uuid,jsonb,uuid) to authenticated;
grant execute on function public.submit_stasis_game_state(uuid,integer,jsonb,uuid,text,uuid[]) to authenticated;
grant execute on function public.cancel_stasis_game(uuid) to authenticated;
grant execute on function public.resign_stasis_game(uuid) to authenticated;
grant execute on function public.rematch_stasis_game(uuid) to authenticated;

alter table public.game_sessions replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='game_sessions'
  ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
end $$;

-- Done. Reload the Stasis page after deploying games.js/games.css/app.js.
