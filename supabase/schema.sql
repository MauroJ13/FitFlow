-- FitFlow – complete Supabase schema (run once in the SQL editor, then run seed.sql).
-- Every user table shares the same sync columns, Row Level Security and the stale-write trigger.

create table if not exists public._ff_base (
  id text not null,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- set by the client; used for last-write-wins
  synced_at timestamptz not null default now(),   -- set by the server; used as pull cursor
  deleted boolean not null default false          -- tombstone so deletions reach every device
);
alter table public._ff_base enable row level security;

-- Reference table for equipment (global, read-only for users)
create table if not exists public.equipment (id text primary key, name jsonb not null);
alter table public.equipment enable row level security;
drop policy if exists equipment_read on public.equipment;
create policy equipment_read on public.equipment for select using (true);
insert into public.equipment (id, name) values
  ('barbell','{"en":"Barbell","de":"Langhantel","hr":"Šipka"}'), ('dumbbell','{"en":"Dumbbells","de":"Kurzhanteln","hr":"Bučice"}'),
  ('kettlebell','{"en":"Kettlebell","de":"Kettlebell","hr":"Girja"}'), ('machine','{"en":"Machine","de":"Maschine","hr":"Sprava"}'),
  ('cable','{"en":"Cable machine","de":"Kabelzug","hr":"Sajla"}'), ('cardio_machine','{"en":"Cardio machine","de":"Cardiogerät","hr":"Kardio sprava"}'),
  ('bench','{"en":"Bench","de":"Bank","hr":"Klupa"}'), ('pullup_bar','{"en":"Pull-up bar","de":"Klimmzugstange","hr":"Šipka za zgibove"}'),
  ('band','{"en":"Resistance band","de":"Widerstandsband","hr":"Elastična traka"}'), ('mat','{"en":"Mat","de":"Matte","hr":"Strunjača"}'),
  ('foam_roller','{"en":"Foam roller","de":"Faszienrolle","hr":"Pjenasti valjak"}'), ('bodyweight','{"en":"Bodyweight","de":"Körpergewicht","hr":"Vlastita težina"}'),
  ('other','{"en":"Other","de":"Sonstiges","hr":"Ostalo"}')
on conflict (id) do update set name = excluded.name;

create table if not exists public.profiles (like public._ff_base including defaults,
  display_name text not null default '', age int check (age is null or age between 13 and 120), gender text not null default '',
  experience text not null default 'beginner', goals jsonb not null default '[]', exercise_prefs text not null default '',
  equipment jsonb not null default '[]', dietary_prefs text not null default '', allergies text not null default '',
  sleep_bedtime text not null default '', sleep_waketime text not null default '', interests text not null default '',
  onboarded boolean not null default false, training_frequency int check (training_frequency is null or training_frequency between 0 and 7),
  activities jsonb not null default '[]', avatar text);

create table if not exists public.user_preferences (like public._ff_base including defaults,
  language text not null default 'en' check (language in ('en','de','hr')), theme text not null default 'dark' check (theme in ('dark','light')),
  water_quick jsonb not null default '[150,250,330,500]', water_pref_ml int, sleep_pref_h numeric,
  dashboard jsonb not null default '{}', notifications jsonb not null default '{}', timer jsonb not null default '{}', ai jsonb not null default '{}');

-- foods / exercises: rows with user_id = null are the built-in library (seed.sql), readable by everyone
create table if not exists public.foods (like public._ff_base including defaults,
  name text not null, names jsonb, brand text, state text not null default 'na' check (state in ('raw','cooked','na')),
  kcal numeric check (kcal >= 0), protein numeric check (protein >= 0), carbs numeric check (carbs >= 0), fat numeric check (fat >= 0), fiber numeric check (fiber >= 0),
  density numeric check (density > 0), piece_g numeric check (piece_g > 0),
  source text not null default 'custom' check (source in ('builtin','custom','off')), barcode text);

create table if not exists public.recipes (like public._ff_base including defaults,
  name text not null, portions numeric not null check (portions > 0), notes text not null default '');

create table if not exists public.recipe_ingredients (like public._ff_base including defaults,
  recipe_id text not null, food_id text not null, label text not null, amount numeric not null check (amount > 0),
  unit text not null check (unit in ('g','ml','tsp','tbsp','cup','piece')), grams numeric not null check (grams >= 0), position int not null default 0);

create table if not exists public.food_entries (like public._ff_base including defaults,
  date date not null, meal text not null check (meal in ('breakfast','lunch','dinner','snack')),
  food_id text, recipe_id text, label text not null, amount numeric not null check (amount > 0), unit text not null,
  grams numeric, estimated boolean not null default false, kcal numeric, protein numeric, carbs numeric, fat numeric, fiber numeric);

create table if not exists public.exercises (like public._ff_base including defaults,
  name text not null, names jsonb, category text not null, equipment_id text not null default 'other',
  muscles jsonb not null default '[]', secondary jsonb not null default '[]', difficulty int not null default 1 check (difficulty between 1 and 3),
  instructions text not null default '', instructions_i18n jsonb, tips jsonb not null default '[]', safety text not null default '',
  source text not null default 'custom' check (source in ('builtin','custom')));

create table if not exists public.workout_plans (like public._ff_base including defaults, name text not null default '', notes text not null default '');
create table if not exists public.workout_days (like public._ff_base including defaults,
  plan_id text not null, name text not null default '', position int not null default 0, weekdays jsonb not null default '[]');
create table if not exists public.workout_exercises (like public._ff_base including defaults,
  plan_id text not null, day_id text not null, exercise_id text not null, position int not null default 0,
  sets int not null check (sets between 1 and 20), reps text not null default '10', rest_seconds int not null default 90 check (rest_seconds between 0 and 900), notes text not null default '');
create table if not exists public.workout_sessions (like public._ff_base including defaults,
  date date not null, plan_id text, day_id text, name text not null default '', status text not null check (status in ('active','done')),
  started_at timestamptz not null, finished_at timestamptz, items jsonb not null default '[]', notes text not null default '');
create table if not exists public.completed_sets (like public._ff_base including defaults,
  session_id text not null, exercise_id text not null, exercise_name text not null default '', item_index int not null default 0,
  set_number int not null check (set_number > 0), reps int not null check (reps > 0), weight numeric check (weight is null or weight > 0), date date not null);

create table if not exists public.calendar_notes (like public._ff_base including defaults, date date not null, note text not null default '');
create table if not exists public.sleep_records (like public._ff_base including defaults,
  date date not null, bedtime text not null, wake_time text not null, duration_min int not null check (duration_min between 1 and 1080),
  energy int check (energy between 1 and 5), quality int check (quality between 1 and 5), notes text not null default '');
create table if not exists public.recovery_logs (like public._ff_base including defaults,
  date date not null, rest_day boolean not null default false, soreness int check (soreness between 1 and 5), stress int check (stress between 1 and 5), notes text not null default '');
create table if not exists public.hydration_records (like public._ff_base including defaults,
  date date not null, time text not null default '', amount_ml int not null check (amount_ml between 1 and 5000));
create table if not exists public.activity_records (like public._ff_base including defaults,
  date date not null, type text not null, duration_min int not null check (duration_min between 1 and 1440),
  distance_km numeric check (distance_km is null or distance_km > 0), steps int check (steps is null or steps > 0), notes text not null default '');
create table if not exists public.habits (like public._ff_base including defaults, name text not null, position int not null default 0, archived boolean not null default false);
create table if not exists public.habit_logs (like public._ff_base including defaults, habit_id text not null, date date not null);
create table if not exists public.goals (like public._ff_base including defaults,
  title text not null, category text not null default 'other', target numeric check (target is null or target > 0), unit text not null default '',
  current numeric not null default 0, due date, status text not null default 'active' check (status in ('active','done')), completed_at timestamptz, notes text not null default '');
create table if not exists public.goal_milestones (like public._ff_base including defaults, goal_id text not null, title text not null, done boolean not null default false, position int not null default 0);
create table if not exists public.achievements (like public._ff_base including defaults, key text not null, unlocked_at timestamptz not null);
create table if not exists public.ai_reports (like public._ff_base including defaults,
  kind text not null default 'weekly', period_start date not null, period_end date not null, stats jsonb not null default '{}',
  content text not null default '', source text not null check (source in ('ai','rules')), model text not null default '', lang text not null default 'en', seen boolean not null default false);
create table if not exists public.reflections (like public._ff_base including defaults, week_start date not null, text text not null default '');
create table if not exists public.favorites (like public._ff_base including defaults, kind text not null check (kind in ('food','exercise','recipe')), ref_id text not null);

-- Refuse stale overwrites (an old offline edit must not replace newer data) and stamp the server time.
create or replace function public.ff_touch() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then return null; end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- Primary keys, owner foreign key, indexes, RLS and policies for every synchronised table.
do $$
declare t text; shared boolean;
begin
  foreach t in array array['profiles','user_preferences','foods','recipes','recipe_ingredients','food_entries','exercises','workout_plans','workout_days',
    'workout_exercises','workout_sessions','completed_sets','calendar_notes','sleep_records','recovery_logs','hydration_records','activity_records',
    'habits','habit_logs','goals','goal_milestones','achievements','ai_reports','reflections','favorites'] loop
    shared := t in ('foods', 'exercises');
    if not exists (select 1 from pg_constraint where conname = t || '_pkey') then execute format('alter table public.%I add primary key (id)', t); end if;
    if not exists (select 1 from pg_constraint where conname = t || '_user_fk') then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade', t, t || '_user_fk');
    end if;
    if not shared then execute format('alter table public.%I alter column user_id set not null', t); end if;
    execute format('create index if not exists %I on public.%I (user_id, synced_at)', t || '_sync_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ff_select on public.%I', t);
    execute format('drop policy if exists ff_insert on public.%I', t);
    execute format('drop policy if exists ff_update on public.%I', t);
    execute format('drop policy if exists ff_delete on public.%I', t);
    execute format('create policy ff_select on public.%I for select using (user_id = auth.uid()%s)', t, case when shared then ' or user_id is null' else '' end);
    execute format('create policy ff_insert on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy ff_update on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy ff_delete on public.%I for delete using (user_id = auth.uid())', t);
    execute format('drop trigger if exists ff_touch on public.%I', t);
    execute format('create trigger ff_touch before insert or update on public.%I for each row execute function public.ff_touch()', t);
  end loop;
end $$;

-- Relationships (children are removed with their parent; optional references are set to null)
do $$
declare r record;
begin
  for r in select * from (values
    ('recipe_ingredients','recipe_id','recipes','cascade'), ('recipe_ingredients','food_id','foods','cascade'),
    ('food_entries','food_id','foods','set null'), ('food_entries','recipe_id','recipes','set null'),
    ('exercises','equipment_id','equipment','restrict'),
    ('workout_days','plan_id','workout_plans','cascade'), ('workout_exercises','plan_id','workout_plans','cascade'),
    ('workout_exercises','day_id','workout_days','cascade'), ('workout_exercises','exercise_id','exercises','cascade'),
    ('workout_sessions','plan_id','workout_plans','set null'), ('workout_sessions','day_id','workout_days','set null'),
    ('completed_sets','session_id','workout_sessions','cascade'), ('completed_sets','exercise_id','exercises','cascade'),
    ('habit_logs','habit_id','habits','cascade'), ('goal_milestones','goal_id','goals','cascade')
  ) as v(tbl, col, ref, action) loop
    if not exists (select 1 from pg_constraint where conname = r.tbl || '_' || r.col || '_fk') then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s', r.tbl, r.tbl || '_' || r.col || '_fk', r.col, r.ref, r.action);
      execute format('create index if not exists %I on public.%I (%I)', r.tbl || '_' || r.col || '_idx', r.tbl, r.col);
    end if;
  end loop;
end $$;

create index if not exists food_entries_date_idx on public.food_entries (user_id, date);
create index if not exists workout_sessions_date_idx on public.workout_sessions (user_id, date);
create index if not exists sleep_records_date_idx on public.sleep_records (user_id, date);
create index if not exists hydration_records_date_idx on public.hydration_records (user_id, date);

-- Calendar activities: one row per day and kind of recorded activity (derived, always consistent with the records)
create or replace view public.calendar_activities with (security_invoker = true) as
  select user_id, date, 'gym' as kind from public.workout_sessions where status = 'done' and not deleted
  union select user_id, date, 'nutrition' from public.food_entries where not deleted
  union select user_id, date, 'sleep' from public.sleep_records where not deleted
  union select user_id, date, 'habits' from public.habit_logs where not deleted
  union select user_id, date, 'water' from public.hydration_records where not deleted
  union select user_id, date, 'activity' from public.activity_records where not deleted;

-- Future subscriptions (not active). Written only by the service role (e.g. RevenueCat webhook function); users can read their own row.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','premium','ai_premium')),
  source text not null default '', expires_at timestamptz, updated_at timestamptz not null default now());
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select using (user_id = auth.uid());
