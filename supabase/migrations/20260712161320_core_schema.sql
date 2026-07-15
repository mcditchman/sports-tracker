-- Sport-agnostic core schema (PRD §8.1)

create table sports (
  id text primary key,          -- 'soccer', later 'basketball', ...
  name text not null
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  sport_id text not null references sports (id),
  name text not null,
  provider text not null,               -- 'api-football'
  provider_league_id text not null,     -- '39' = Premier League
  unique (provider, provider_league_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id),
  name text not null,
  provider text not null,
  provider_team_id text not null,
  unique (provider, provider_team_id)
);

-- Modeled now for the player-props fast-follow; unused by MVP UI (PRD §6).
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams (id),
  name text not null,
  provider text not null,
  provider_player_id text not null,
  unique (provider, provider_player_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id),
  season text not null,                 -- '2025' = 2025-26; multi-season is data, not schema
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  kickoff_at timestamptz not null,
  status text not null,                 -- 'finished' | 'scheduled' | 'other'
  provider text not null,
  provider_match_id text not null,
  unique (provider, provider_match_id)
);

create index matches_home_team_idx on matches (home_team_id, kickoff_at desc);
create index matches_away_team_idx on matches (away_team_id, kickoff_at desc);

create table stat_types (
  id text primary key,                  -- 'corners', 'shots', ...
  sport_id text not null references sports (id),
  name text not null,
  unit text not null default 'count'
);

create table stat_values (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid references teams (id),
  player_id uuid references players (id),
  stat_type_id text not null references stat_types (id),
  value numeric not null,
  check (team_id is not null or player_id is not null)
);

create unique index stat_values_team_unique
  on stat_values (match_id, stat_type_id, team_id) where player_id is null;
create unique index stat_values_player_unique
  on stat_values (match_id, stat_type_id, player_id) where player_id is not null;

-- RLS: public read, no anon writes (service role bypasses RLS for ingestion).
alter table sports enable row level security;
alter table leagues enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table stat_types enable row level security;
alter table stat_values enable row level security;

create policy "public read" on sports for select using (true);
create policy "public read" on leagues for select using (true);
create policy "public read" on teams for select using (true);
create policy "public read" on players for select using (true);
create policy "public read" on matches for select using (true);
create policy "public read" on stat_types for select using (true);
create policy "public read" on stat_values for select using (true);

-- Seeds
insert into sports (id, name) values ('soccer', 'Soccer');

insert into leagues (sport_id, name, provider, provider_league_id)
values ('soccer', 'Premier League', 'api-football', '39');

insert into stat_types (id, sport_id, name, unit) values
  ('corners', 'soccer', 'Corners', 'count'),
  ('shots', 'soccer', 'Shots', 'count'),
  ('shots_on_target', 'soccer', 'Shots on Target', 'count'),
  ('fouls', 'soccer', 'Fouls', 'count'),
  ('yellow_cards', 'soccer', 'Yellow Cards', 'count'),
  ('red_cards', 'soccer', 'Red Cards', 'count'),
  ('possession', 'soccer', 'Possession', 'percent');
