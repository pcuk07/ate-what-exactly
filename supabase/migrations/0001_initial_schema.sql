-- Ate What, Exactly — initial schema.
-- Design doc §8 (data model) and §10 (security). Every table has RLS enabled.
-- User-owned tables are readable and writable only by their owner; the shared
-- food tables are world-readable and service-role-writable; the OAuth tables
-- have RLS on and no policies at all, so only the service role can touch them.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared reference data
-- ---------------------------------------------------------------------------

-- Packaged foods: Open Food Facts rows plus our own Irish corrections.
-- Both live here with the same shape; `source` decides which wins (overrides do).
create table public.foods (
  id           uuid primary key default gen_random_uuid(),
  barcode      text not null,
  name         text not null,
  brand        text,
  kcal_100g    numeric(7,2) not null check (kcal_100g >= 0),
  protein_100g numeric(6,2) not null default 0 check (protein_100g >= 0),
  carbs_100g   numeric(6,2) not null default 0 check (carbs_100g >= 0),
  fat_100g     numeric(6,2) not null default 0 check (fat_100g >= 0),
  fibre_100g   numeric(6,2) not null default 0 check (fibre_100g >= 0),
  serving_g    numeric(7,2) check (serving_g > 0),
  source       text not null check (source in ('openfoodfacts', 'override')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (barcode, source)
);
create index foods_barcode_idx on public.foods (barcode);

-- Chain restaurants that voluntarily publish nutrition (§12: there is no
-- Irish legal mandate, so this table is hand-seeded, source-by-source).
create table public.restaurant_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_name text not null,
  item_name       text not null,
  kcal            numeric(7,2) not null check (kcal >= 0),
  protein_g       numeric(6,2) not null default 0,
  carbs_g         numeric(6,2) not null default 0,
  fat_g           numeric(6,2) not null default 0,
  fibre_g         numeric(6,2) not null default 0,
  source_url      text,
  checked_at      date,
  created_at      timestamptz not null default now(),
  unique (restaurant_name, item_name)
);
create index restaurant_items_name_idx on public.restaurant_items (lower(restaurant_name));

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------

create table public.goals (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  kcal          integer not null default 2000 check (kcal between 800 and 8000),
  protein_g     integer not null default 120 check (protein_g >= 0),
  carbs_g       integer not null default 220 check (carbs_g >= 0),
  fat_g         integer not null default 65 check (fat_g >= 0),
  fibre_g       integer not null default 30 check (fibre_g >= 0),
  flexible_days boolean not null default true,
  updated_at    timestamptz not null default now()
);

create table public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  ingredients jsonb not null default '[]'::jsonb,
  portions    integer not null check (portions > 0),
  created_at  timestamptz not null default now()
);
create index recipes_user_idx on public.recipes (user_id);

-- Every logged entry, whichever flow produced it. `tier` records how the
-- numbers were arrived at and is never upgraded by a later correction.
create table public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  logged_at  timestamptz not null default now(),
  meal_type  text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  tier       text not null check (tier in ('A', 'B', 'C', 'D')),
  name       text not null,
  kcal       numeric(7,2) not null check (kcal >= 0),
  protein_g  numeric(6,2) not null default 0,
  carbs_g    numeric(6,2) not null default 0,
  fat_g      numeric(6,2) not null default 0,
  fibre_g    numeric(6,2) not null default 0,
  error_band numeric(4,3) not null default 0.3,
  items      jsonb not null default '[]'::jsonb,
  source     jsonb not null,
  photo_path text,
  created_at timestamptz not null default now()
);
create index meals_user_logged_idx on public.meals (user_id, logged_at desc);

-- Per-dish calibration (§5.4): the geometric mean of past corrections.
create table public.calibrations (
  user_id    uuid not null references auth.users (id) on delete cascade,
  dish_key   text not null,
  n          integer not null default 0 check (n >= 0),
  log_sum    double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, dish_key)
);

-- The audit trail behind those calibrations.
create table public.corrections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  meal_id      uuid references public.meals (id) on delete set null,
  dish_key     text not null,
  field        text not null,
  value_before numeric(9,2) not null,
  value_after  numeric(9,2) not null,
  created_at   timestamptz not null default now()
);
create index corrections_user_dish_idx on public.corrections (user_id, dish_key);

-- ---------------------------------------------------------------------------
-- OAuth (§4): lets a person connect this app to their own Claude.
-- ---------------------------------------------------------------------------

create table public.oauth_clients (
  client_id     text primary key,
  client_name   text not null,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

create table public.oauth_codes (
  code                  text primary key,
  client_id             text not null references public.oauth_clients (client_id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null check (code_challenge_method = 'S256'),
  scopes                text[] not null,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

-- Rotating refresh tokens. `family_id` groups a chain so that reuse of an
-- already-spent token can revoke every sibling (§10.5).
create table public.oauth_refresh_tokens (
  token      text primary key,
  family_id  text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  text not null references public.oauth_clients (client_id) on delete cascade,
  scopes     text[] not null,
  used_at    timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index oauth_refresh_family_idx on public.oauth_refresh_tokens (family_id);
create index oauth_refresh_user_idx on public.oauth_refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — on for every table, no exceptions.
-- ---------------------------------------------------------------------------

alter table public.foods                enable row level security;
alter table public.restaurant_items      enable row level security;
alter table public.goals                 enable row level security;
alter table public.recipes               enable row level security;
alter table public.meals                 enable row level security;
alter table public.calibrations          enable row level security;
alter table public.corrections           enable row level security;
alter table public.oauth_clients         enable row level security;
alter table public.oauth_codes           enable row level security;
alter table public.oauth_refresh_tokens  enable row level security;

-- Shared reference data: readable by any signed-in user, written only by the
-- service role (which bypasses RLS and so needs no policy).
create policy "foods are readable by signed-in users"
  on public.foods for select to authenticated using (true);

create policy "menu data is readable by signed-in users"
  on public.restaurant_items for select to authenticated using (true);

-- Per-user data: you can see and change your own rows, and nobody else's.
create policy "own goals" on public.goals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own recipes" on public.recipes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own meals" on public.meals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own calibrations" on public.calibrations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own corrections" on public.corrections
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- OAuth tables get RLS with zero policies: unreachable except by the service
-- role. A token table should never be queryable from a client.

-- ---------------------------------------------------------------------------
-- Meal photos: private bucket, one folder per user, signed URLs only (§10.1).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  5242880, -- 5 MB, matching the server-side check
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- The first path segment must be the user's own id, so one person's folder is
-- unreachable from another's session.
create policy "read own meal photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "upload own meal photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete own meal photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
