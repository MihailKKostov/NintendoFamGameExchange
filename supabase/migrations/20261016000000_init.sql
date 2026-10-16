-- ============================================================================
--  Family Game Exchange — database schema
--
--  Access model
--  ------------
--  * Only emails listed in public.invites can create an account (enforced by a
--    trigger on auth.users) and only current invitees can read or write data
--    (enforced by row-level security through public.is_member()).
--  * Everything that changes the state of a loan goes through SECURITY DEFINER
--    functions (RPCs) below, so the rules for who may do what live in one place.
--  * Every loan event creates a row in public.notifications. The
--    send-notifications Edge Function turns those rows into emails.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Invites (the allow-list)
-- ---------------------------------------------------------------------------
create table public.invites (
  email       text primary key
              check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_admin    boolean not null default false,
  note        text check (char_length(note) <= 120),
  invited_by  uuid references auth.users (id) on delete set null,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.invites is
  'Allow-list of emails that may sign in. Add your own email with is_admin = true to bootstrap.';

create or replace function public.current_email()
returns text
language sql stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.invites i where i.email = public.current_email());
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invites i where i.email = public.current_email() and i.is_admin
  );
$$;

-- Block sign-ups from emails that are not on the invite list.
create or replace function public.enforce_invite_only()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from public.invites i where i.email = lower(new.email)) then
    raise exception 'not_invited: % is not on the invite list', coalesce(new.email, '(no email)')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_invite_only
  before insert on auth.users
  for each row execute function public.enforce_invite_only();

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  display_name        text not null check (char_length(btrim(display_name)) between 1 and 40),
  nickname            text check (char_length(nickname) <= 30),
  avatar_url          text check (char_length(avatar_url) <= 1000),
  avatar_icon         text check (char_length(avatar_icon) <= 16),
  accent_color        text not null default '#e60012' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  bio                 text check (char_length(bio) <= 280),
  friend_code         text check (friend_code ~ '^SW-[0-9]{4}-[0-9]{4}-[0-9]{4}$'),
  email_notifications boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  local_part text := split_part(lower(new.email), '@', 1);
  palette text[] := array['#e60012', '#0ab9e6', '#ff3c28', '#1edc00', '#ffdc00', '#b400e6', '#ff8c00', '#00b894'];
begin
  insert into public.profiles (id, email, display_name, nickname, avatar_icon, accent_color)
  values (
    new.id,
    lower(new.email),
    left(initcap(regexp_replace(local_part, '[._+-]+', ' ', 'g')), 40),
    left(initcap(split_part(regexp_replace(local_part, '[._+-]+', ' ', 'g'), ' ', 1)), 30),
    (array['🍄', '⭐', '🐢', '👾', '🎮', '🌸', '🦊', '🐙'])[1 + ((hashtext(new.email)::bigint % 8 + 8) % 8)::int],
    palette[1 + ((hashtext(new.email || 'c')::bigint % 8 + 8) % 8)::int]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Games (a shared catalog cache, mostly copied from the Nintendo eShop)
-- ---------------------------------------------------------------------------
create table public.games (
  id                  uuid primary key default gen_random_uuid(),
  nsuid               text unique,
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  icon_url            text,
  hero_url            text,
  platform            text,
  publisher           text,
  developer           text,
  release_date        date,
  genres              text[] not null default '{}',
  player_count        text,
  max_players         integer check (max_players between 1 and 100),
  multiplayer         boolean,
  local_multiplayer   boolean,
  online_multiplayer  boolean,
  coop                boolean,
  play_modes          text[] not null default '{}',
  features            text[] not null default '{}',
  ways_to_play        text[] not null default '{}',
  esrb_rating         text,
  description         text,
  store_url           text,
  source              text not null default 'nintendo' check (source in ('nintendo', 'manual')),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Library items (a copy of a game that a member owns)
-- ---------------------------------------------------------------------------
create table public.library_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete restrict,
  format      text not null default 'physical' check (format in ('physical', 'digital')),
  condition   text check (condition in ('mint', 'good', 'fair', 'worn')),
  notes       text check (char_length(notes) <= 500),
  lendable    boolean not null default true,
  created_at  timestamptz not null default now()
);

create index library_items_owner_idx on public.library_items (owner_id);
create index library_items_game_idx on public.library_items (game_id);

-- ---------------------------------------------------------------------------
-- Loans
--   pending  -> active (accepted) -> returned
--   pending  -> declined | cancelled
--   (owner can also lend directly, which creates an active loan)
-- ---------------------------------------------------------------------------
create table public.loans (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid references public.library_items (id) on delete set null,
  game_id          uuid not null references public.games (id) on delete restrict,
  lender_id        uuid not null references public.profiles (id) on delete cascade,
  borrower_id      uuid not null references public.profiles (id) on delete cascade,
  status           text not null check (status in ('pending', 'declined', 'cancelled', 'active', 'returned')),
  request_message  text check (char_length(request_message) <= 1000),
  due_at           date,
  requested_at     timestamptz,
  responded_at     timestamptz,
  lent_at          timestamptz,
  returned_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (lender_id <> borrower_id)
);

create unique index loans_one_active_per_item on public.loans (item_id) where status = 'active';
create unique index loans_one_pending_per_borrower on public.loans (item_id, borrower_id) where status = 'pending';
create index loans_lender_idx on public.loans (lender_id);
create index loans_borrower_idx on public.loans (borrower_id);

create table public.loan_events (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references public.loans (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('requested', 'accepted', 'declined', 'cancelled', 'lent', 'returned', 'comment', 'due_changed')),
  body        text check (char_length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index loan_events_loan_idx on public.loan_events (loan_id, created_at);

-- ---------------------------------------------------------------------------
-- Notifications (in-app + email outbox)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  loan_id      uuid references public.loans (id) on delete cascade,
  kind         text not null,
  body         text,
  read_at      timestamptz,
  emailed_at   timestamptz,
  email_error  text,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_outbox_idx on public.notifications (created_at) where emailed_at is null;

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger loans_touch before update on public.loans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.invites        enable row level security;
alter table public.profiles       enable row level security;
alter table public.games          enable row level security;
alter table public.library_items  enable row level security;
alter table public.loans          enable row level security;
alter table public.loan_events    enable row level security;
alter table public.notifications  enable row level security;

-- invites: members can see who is invited (so the app can show "invited, not
-- joined yet"); only admins can change the list, and nobody can remove themselves.
create policy "members read invites" on public.invites
  for select to authenticated using (public.is_member());
create policy "admins add invites" on public.invites
  for insert to authenticated with check (public.is_admin());
create policy "admins update invites" on public.invites
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins remove invites" on public.invites
  for delete to authenticated using (public.is_admin() and email <> public.current_email());

-- profiles
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
create policy "members edit own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_member())
  with check (id = auth.uid());

-- games: readable by members; created through add_to_library(); the creator
-- of a manually entered game may fix its details.
create policy "members read games" on public.games
  for select to authenticated using (public.is_member());
create policy "creator edits manual games" on public.games
  for update to authenticated
  using (created_by = auth.uid() and source = 'manual' and public.is_member())
  with check (created_by = auth.uid() and source = 'manual');

-- library items: readable by members; owners edit/delete their own copies.
create policy "members read library" on public.library_items
  for select to authenticated using (public.is_member());
create policy "owners edit own items" on public.library_items
  for update to authenticated
  using (owner_id = auth.uid() and public.is_member())
  with check (owner_id = auth.uid());
create policy "owners delete own items" on public.library_items
  for delete to authenticated using (owner_id = auth.uid() and public.is_member());

-- loans & events: the family can see who has what (that's the point!);
-- all writes go through the RPCs below.
create policy "members read loans" on public.loans
  for select to authenticated using (public.is_member());
create policy "members read loan events" on public.loan_events
  for select to authenticated using (public.is_member());

-- notifications: private to the recipient.
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Column-level privileges: keep immutable / server-managed columns out of reach.
revoke all on public.invites, public.profiles, public.games, public.library_items,
              public.loans, public.loan_events, public.notifications from anon;
revoke insert, update, delete on public.invites, public.profiles, public.games, public.library_items,
              public.loans, public.loan_events, public.notifications from authenticated;

grant select on public.invites, public.profiles, public.games, public.library_items,
                public.loans, public.loan_events, public.notifications to authenticated;
grant insert (email, is_admin, note) on public.invites to authenticated;
grant update (is_admin, note) on public.invites to authenticated;
grant delete on public.invites to authenticated;
grant update (display_name, nickname, avatar_url, avatar_icon, accent_color, bio, friend_code,
              email_notifications) on public.profiles to authenticated;
grant update (title, icon_url, platform, publisher, developer, release_date, genres, player_count,
              max_players, multiplayer, local_multiplayer, online_multiplayer, coop, description)
  on public.games to authenticated;
grant update (format, condition, notes, lendable) on public.library_items to authenticated;
grant delete on public.library_items to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Stamp who invited whom.
create or replace function public.stamp_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.invited_by := auth.uid();
  new.emailed_at := null;
  return new;
end;
$$;

create trigger invites_stamp before insert on public.invites
  for each row execute function public.stamp_invite();

-- ---------------------------------------------------------------------------
-- Helpers used by the RPCs
-- ---------------------------------------------------------------------------
create or replace function public.require_member()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not_member: you are not a member of this group' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.log_loan_event(
  p_loan uuid, p_actor uuid, p_kind text, p_body text, p_notify uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.loan_events (loan_id, actor_id, kind, body)
  values (p_loan, p_actor, p_kind, nullif(btrim(p_body), ''));

  if p_notify is not null and p_notify <> p_actor then
    insert into public.notifications (user_id, actor_id, loan_id, kind, body)
    values (p_notify, p_actor, p_loan, 'loan_' || p_kind, nullif(btrim(p_body), ''));
  end if;
end;
$$;

-- Library item removal: refuse while it is lent out, cancel open requests.
create or replace function public.before_library_item_delete()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  if exists (select 1 from public.loans l where l.item_id = old.id and l.status = 'active') then
    raise exception 'item_on_loan: this game is currently lent out — mark it returned first'
      using errcode = 'P0001';
  end if;

  for r in select * from public.loans l where l.item_id = old.id and l.status = 'pending' loop
    update public.loans set status = 'cancelled', responded_at = now() where id = r.id;
    perform public.log_loan_event(r.id, old.owner_id, 'cancelled',
      'The owner removed this game from their library.', r.borrower_id);
  end loop;
  return old;
end;
$$;

create trigger library_items_before_delete before delete on public.library_items
  for each row execute function public.before_library_item_delete();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Add a game to my library. p_game is either {"id": "<existing games.id>"} or
-- a full game record (from the eShop catalog, keyed by nsuid, or manual).
create or replace function public.add_to_library(
  p_game jsonb,
  p_format text default 'physical',
  p_condition text default null,
  p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_game uuid;
  v_item uuid;
  v_nsuid text := nullif(btrim(p_game ->> 'nsuid'), '');
begin
  if p_game ? 'id' and (p_game ->> 'id') is not null then
    select g.id into v_game from public.games g where g.id = (p_game ->> 'id')::uuid;
    if v_game is null then
      raise exception 'unknown_game' using errcode = 'P0002';
    end if;
  else
    if v_nsuid is not null then
      select g.id into v_game from public.games g where g.nsuid = v_nsuid;
    end if;

    if v_game is null then
      insert into public.games (
        nsuid, title, icon_url, hero_url, platform, publisher, developer, release_date, genres,
        player_count, max_players, multiplayer, local_multiplayer, online_multiplayer, coop,
        play_modes, features, ways_to_play, esrb_rating, description, store_url, source, created_by
      )
      values (
        v_nsuid,
        btrim(p_game ->> 'title'),
        p_game ->> 'icon_url',
        p_game ->> 'hero_url',
        p_game ->> 'platform',
        p_game ->> 'publisher',
        p_game ->> 'developer',
        nullif(p_game ->> 'release_date', '')::date,
        coalesce(array(select jsonb_array_elements_text(p_game -> 'genres')), '{}'),
        p_game ->> 'player_count',
        nullif(p_game ->> 'max_players', '')::integer,
        (p_game ->> 'multiplayer')::boolean,
        (p_game ->> 'local_multiplayer')::boolean,
        (p_game ->> 'online_multiplayer')::boolean,
        (p_game ->> 'coop')::boolean,
        coalesce(array(select jsonb_array_elements_text(p_game -> 'play_modes')), '{}'),
        coalesce(array(select jsonb_array_elements_text(p_game -> 'features')), '{}'),
        coalesce(array(select jsonb_array_elements_text(p_game -> 'ways_to_play')), '{}'),
        p_game ->> 'esrb_rating',
        left(p_game ->> 'description', 4000),
        p_game ->> 'store_url',
        case when v_nsuid is null then 'manual' else 'nintendo' end,
        me
      )
      on conflict (nsuid) do update set title = excluded.title
      returning id into v_game;
    end if;
  end if;

  insert into public.library_items (owner_id, game_id, format, condition, notes)
  values (me, v_game, coalesce(p_format, 'physical'), p_condition, nullif(btrim(p_notes), ''))
  returning id into v_item;

  return v_item;
end;
$$;

create or replace function public.request_loan(p_item_id uuid, p_message text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_item public.library_items;
  v_loan uuid;
begin
  select * into v_item from public.library_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'unknown_item: that game is no longer in the library' using errcode = 'P0002';
  end if;
  if v_item.owner_id = me then
    raise exception 'own_item: you already own this copy' using errcode = 'P0001';
  end if;
  if not v_item.lendable then
    raise exception 'not_lendable: the owner is not lending this game right now' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.loans where item_id = p_item_id and borrower_id = me and status in ('pending', 'active')) then
    raise exception 'already_requested: you already have an open request for this game' using errcode = 'P0001';
  end if;

  insert into public.loans (item_id, game_id, lender_id, borrower_id, status, request_message, requested_at)
  values (v_item.id, v_item.game_id, v_item.owner_id, me, 'pending', nullif(btrim(p_message), ''), now())
  returning id into v_loan;

  perform public.log_loan_event(v_loan, me, 'requested', p_message, v_item.owner_id);
  return v_loan;
end;
$$;

-- Internal: turn a loan active, auto-declining every other open request for the item.
create or replace function public.activate_loan(p_loan uuid, p_actor uuid, p_due date)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_loan public.loans;
  r record;
begin
  select * into v_loan from public.loans where id = p_loan for update;

  if exists (select 1 from public.loans where item_id = v_loan.item_id and status = 'active' and id <> p_loan) then
    raise exception 'on_loan: this copy is already lent out — mark it returned first' using errcode = 'P0001';
  end if;

  update public.loans
     set status = 'active',
         responded_at = coalesce(responded_at, now()),
         lent_at = now(),
         due_at = p_due
   where id = p_loan;

  for r in
    select * from public.loans
     where item_id = v_loan.item_id and status = 'pending' and id <> p_loan
  loop
    update public.loans set status = 'declined', responded_at = now() where id = r.id;
    perform public.log_loan_event(r.id, p_actor, 'declined',
      'This copy was lent to someone else. Try again once it is returned!', r.borrower_id);
  end loop;
end;
$$;

create or replace function public.respond_to_loan(
  p_loan_id uuid, p_accept boolean, p_message text default null, p_due date default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_loan public.loans;
begin
  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'unknown_loan' using errcode = 'P0002';
  end if;
  if v_loan.lender_id <> me then
    raise exception 'not_lender: only the owner can answer this request' using errcode = '42501';
  end if;
  if v_loan.status <> 'pending' then
    raise exception 'not_pending: this request was already answered' using errcode = 'P0001';
  end if;
  if v_loan.item_id is null then
    raise exception 'unknown_item: that copy is no longer in your library' using errcode = 'P0002';
  end if;

  if p_accept then
    perform public.activate_loan(p_loan_id, me, p_due);
    perform public.log_loan_event(p_loan_id, me, 'accepted', p_message, v_loan.borrower_id);
  else
    update public.loans set status = 'declined', responded_at = now() where id = p_loan_id;
    perform public.log_loan_event(p_loan_id, me, 'declined', p_message, v_loan.borrower_id);
  end if;
end;
$$;

create or replace function public.cancel_loan_request(p_loan_id uuid, p_message text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_loan public.loans;
begin
  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'unknown_loan' using errcode = 'P0002';
  end if;
  if v_loan.borrower_id <> me then
    raise exception 'not_borrower: only the person who asked can cancel' using errcode = '42501';
  end if;
  if v_loan.status <> 'pending' then
    raise exception 'not_pending: this request was already answered' using errcode = 'P0001';
  end if;

  update public.loans set status = 'cancelled', responded_at = now() where id = p_loan_id;
  perform public.log_loan_event(p_loan_id, me, 'cancelled', p_message, v_loan.lender_id);
end;
$$;

-- Owner hands a game to someone directly (no request needed).
create or replace function public.lend_game(
  p_item_id uuid, p_borrower_id uuid, p_due date default null, p_message text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_item public.library_items;
  v_loan uuid;
begin
  select * into v_item from public.library_items where id = p_item_id for update;
  if v_item.id is null then
    raise exception 'unknown_item' using errcode = 'P0002';
  end if;
  if v_item.owner_id <> me then
    raise exception 'not_owner: you can only lend your own games' using errcode = '42501';
  end if;
  if p_borrower_id = me then
    raise exception 'self_loan: pick someone else' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles p join public.invites i on i.email = p.email where p.id = p_borrower_id
  ) then
    raise exception 'unknown_member: that person is not in the group' using errcode = 'P0002';
  end if;

  -- If they already asked for it, treat this as accepting their request.
  select id into v_loan from public.loans
   where item_id = p_item_id and borrower_id = p_borrower_id and status = 'pending';

  if v_loan is not null then
    perform public.activate_loan(v_loan, me, p_due);
    perform public.log_loan_event(v_loan, me, 'accepted', p_message, p_borrower_id);
    return v_loan;
  end if;

  if exists (select 1 from public.loans where item_id = p_item_id and status = 'active') then
    raise exception 'on_loan: this copy is already lent out — mark it returned first' using errcode = 'P0001';
  end if;

  insert into public.loans (item_id, game_id, lender_id, borrower_id, status, due_at, responded_at, lent_at)
  values (v_item.id, v_item.game_id, me, p_borrower_id, 'pending', p_due, now(), now())
  returning id into v_loan;

  perform public.activate_loan(v_loan, me, p_due);
  perform public.log_loan_event(v_loan, me, 'lent', p_message, p_borrower_id);
  return v_loan;
end;
$$;

create or replace function public.mark_loan_returned(p_loan_id uuid, p_message text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_loan public.loans;
begin
  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'unknown_loan' using errcode = 'P0002';
  end if;
  if me not in (v_loan.lender_id, v_loan.borrower_id) then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  if v_loan.status <> 'active' then
    raise exception 'not_active: this game is not currently lent out' using errcode = 'P0001';
  end if;

  update public.loans set status = 'returned', returned_at = now() where id = p_loan_id;
  perform public.log_loan_event(
    p_loan_id, me, 'returned', p_message,
    case when me = v_loan.lender_id then v_loan.borrower_id else v_loan.lender_id end
  );
end;
$$;

create or replace function public.set_loan_due(p_loan_id uuid, p_due date)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_loan public.loans;
begin
  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'unknown_loan' using errcode = 'P0002';
  end if;
  if v_loan.lender_id <> me then
    raise exception 'not_lender: only the owner can change the due date' using errcode = '42501';
  end if;
  if v_loan.status not in ('pending', 'active') then
    raise exception 'closed: this loan is closed' using errcode = 'P0001';
  end if;

  update public.loans set due_at = p_due where id = p_loan_id;
  perform public.log_loan_event(
    p_loan_id, me, 'due_changed',
    case when p_due is null then 'No due date' else 'Due ' || to_char(p_due, 'FMMonth FMDD, YYYY') end,
    v_loan.borrower_id
  );
end;
$$;

create or replace function public.comment_on_loan(p_loan_id uuid, p_body text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := public.require_member();
  v_loan public.loans;
begin
  if nullif(btrim(p_body), '') is null then
    raise exception 'empty_comment' using errcode = 'P0001';
  end if;
  select * into v_loan from public.loans where id = p_loan_id;
  if v_loan.id is null then
    raise exception 'unknown_loan' using errcode = 'P0002';
  end if;
  if me not in (v_loan.lender_id, v_loan.borrower_id) then
    raise exception 'not_participant: only the two people involved can comment' using errcode = '42501';
  end if;

  perform public.log_loan_event(
    p_loan_id, me, 'comment', p_body,
    case when me = v_loan.lender_id then v_loan.borrower_id else v_loan.lender_id end
  );
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any (p_ids));
$$;

-- Used by the send-notifications Edge Function (service role only): atomically
-- claim unsent notifications/invites so concurrent calls never double-send.
create or replace function public.claim_email_outbox(p_limit integer default 25)
returns table (
  kind text, notification_id uuid, recipient_email text, recipient_name text,
  wants_email boolean, actor_name text, loan_id uuid, game_title text, game_icon text,
  body text, invited_by_name text
)
language plpgsql security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    update public.notifications n
       set emailed_at = now()
     where n.id in (
       select n2.id from public.notifications n2
        where n2.emailed_at is null and n2.created_at > now() - interval '2 days'
        order by n2.created_at
        limit p_limit
        for update skip locked
     )
    returning n.*
  )
  select c.kind, c.id, p.email, coalesce(p.nickname, p.display_name), p.email_notifications,
         coalesce(a.nickname, a.display_name), c.loan_id, g.title, g.icon_url, c.body, null::text
    from claimed c
    join public.profiles p on p.id = c.user_id
    left join public.profiles a on a.id = c.actor_id
    left join public.loans l on l.id = c.loan_id
    left join public.games g on g.id = l.game_id;

  return query
  with claimed as (
    update public.invites i
       set emailed_at = now()
     where i.email in (
       select i2.email from public.invites i2
        where i2.emailed_at is null and i2.created_at > now() - interval '2 days'
          and i2.invited_by is not null
        limit p_limit
        for update skip locked
     )
    returning i.*
  )
  select 'invite'::text, null::uuid, c.email, null::text, true, null::text, null::uuid,
         null::text, null::text, c.note, coalesce(p.nickname, p.display_name)
    from claimed c
    left join public.profiles p on p.id = c.invited_by;
end;
$$;

create or replace function public.record_email_error(p_notification uuid, p_error text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.notifications set email_error = left(p_error, 500) where id = p_notification;
$$;

-- Lock down function execution: helpers are internal, RPCs are for members.
-- (Supabase grants EXECUTE on new functions to anon/authenticated by default.)
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.current_email(), public.is_member(), public.is_admin(),
  public.add_to_library(jsonb, text, text, text),
  public.request_loan(uuid, text),
  public.respond_to_loan(uuid, boolean, text, date),
  public.cancel_loan_request(uuid, text),
  public.lend_game(uuid, uuid, date, text),
  public.mark_loan_returned(uuid, text),
  public.set_loan_due(uuid, date),
  public.comment_on_loan(uuid, text),
  public.mark_notifications_read(uuid[])
to authenticated;
grant execute on function public.claim_email_outbox(integer), public.record_email_error(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: push changes to open browsers
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.library_items, public.loans, public.loan_events, public.notifications, public.profiles;

-- ---------------------------------------------------------------------------
-- Storage: profile pictures (public URLs, members upload into their own folder)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "members upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
create policy "members update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
