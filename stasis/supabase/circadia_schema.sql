-- CIRCADIA: Run in Supabase SQL editor. Auth users own all records.
create extension if not exists pgcrypto;
create table if not exists public.cycles(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,start_date date not null,end_date date,created_at timestamptz default now(),unique(user_id,start_date),check(end_date is null or end_date>=start_date));
create table if not exists public.daily_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date date not null,severity int not null default 0 check(severity between 0 and 10),symptoms text[] not null default '{}',bleeding text not null default 'none' check(bleeding in ('none','spotting','light','medium','heavy')),stress int check(stress between 0 and 10),sleep_hours numeric check(sleep_hours between 0 and 24),created_at timestamptz default now(),unique(user_id,date));
create table if not exists public.private_notes(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date date not null,body text not null check(char_length(body)<=3000),unique(user_id,date));
create table if not exists public.partner_grants(owner_id uuid not null references auth.users(id) on delete cascade,partner_id uuid not null references auth.users(id) on delete cascade,cycles boolean not null default false,symptoms boolean not null default false,notes boolean not null default false,created_at timestamptz default now(),primary key(owner_id,partner_id),check(owner_id<>partner_id));
create table if not exists public.invites(code uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,expires_at timestamptz not null default now()+interval '24 hours',redeemed_at timestamptz,redeemed_by uuid references auth.users(id));
create index if not exists idx_cycles_owner on public.cycles(user_id,start_date);
create index if not exists idx_logs_owner on public.daily_logs(user_id,date);
create index if not exists idx_notes_owner on public.private_notes(user_id,date);
create index if not exists idx_partner_grants_partner on public.partner_grants(partner_id);
alter table public.cycles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.private_notes enable row level security;
alter table public.partner_grants enable row level security;
alter table public.invites enable row level security;
revoke all on public.invites from anon,authenticated;
revoke all on public.cycles,public.daily_logs,public.private_notes,public.partner_grants from anon;
grant select,insert,update,delete on public.cycles,public.daily_logs,public.private_notes to authenticated;
grant select,update,delete on public.partner_grants to authenticated;
create policy cycles_read on public.cycles for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.partner_grants g where g.owner_id=user_id and g.partner_id=(select auth.uid()) and g.cycles));
create policy cycles_create on public.cycles for insert to authenticated with check(user_id=(select auth.uid()));
create policy cycles_modify on public.cycles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy cycles_delete on public.cycles for delete to authenticated using(user_id=(select auth.uid()));
create policy logs_read on public.daily_logs for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.partner_grants g where g.owner_id=user_id and g.partner_id=(select auth.uid()) and g.symptoms));
create policy logs_create on public.daily_logs for insert to authenticated with check(user_id=(select auth.uid()));
create policy logs_modify on public.daily_logs for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy logs_delete on public.daily_logs for delete to authenticated using(user_id=(select auth.uid()));
create policy notes_read on public.private_notes for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.partner_grants g where g.owner_id=user_id and g.partner_id=(select auth.uid()) and g.notes));
create policy notes_create on public.private_notes for insert to authenticated with check(user_id=(select auth.uid()));
create policy notes_modify on public.private_notes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy notes_delete on public.private_notes for delete to authenticated using(user_id=(select auth.uid()));
create policy grants_read on public.partner_grants for select to authenticated using(owner_id=(select auth.uid()) or partner_id=(select auth.uid()));
create policy grants_edit on public.partner_grants for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy grants_delete on public.partner_grants for delete to authenticated using(owner_id=(select auth.uid()) or partner_id=(select auth.uid()));
-- Invitation creation and redemption are server-side RPC only. Guests cannot enumerate codes or owners.
create or replace function public.create_partner_invite() returns uuid language plpgsql security definer set search_path='' as $$
declare v_code uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in';end if;
 if (select count(*) from public.invites where owner_id=auth.uid() and redeemed_at is null and expires_at>now()) >= 3 then raise exception 'Three pending invites maximum. Redeem or wait for expiry.'; end if;
 insert into public.invites(owner_id) values(auth.uid()) returning code into v_code;
 return v_code;
end;$$;
create or replace function public.redeem_partner_invite(p_code uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in';end if;
 select owner_id into v_owner from public.invites where code=p_code and redeemed_at is null and expires_at>now() for update;
 if v_owner is null or v_owner=auth.uid() then raise exception 'Invalid or expired invitation';end if;
 update public.invites set redeemed_at=now(),redeemed_by=auth.uid() where code=p_code;
 insert into public.partner_grants(owner_id,partner_id) values(v_owner,auth.uid()) on conflict(owner_id,partner_id) do nothing;
 return v_owner;
end;$$;
revoke execute on function public.create_partner_invite() from public,anon;
revoke execute on function public.redeem_partner_invite(uuid) from public,anon;
grant execute on function public.create_partner_invite() to authenticated;
grant execute on function public.redeem_partner_invite(uuid) to authenticated;
-- Prevent invitation reuse and ensure revocation requires a fresh code to reconnect.
