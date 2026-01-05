-- PRINZIFIT / NUTRIFAI - SCHEMA + RLS (Admin + Coach + Client)
-- ✅ Admin vede tutto
-- ✅ Coach vede/gestisce SOLO i suoi clienti
-- ✅ Client vede SOLO i propri dati/assegnazioni
-- ✅ Pagamenti esterni: admin/coach gestisce active_until + blocco + note

-- Nota: questo file è idempotente (puoi rilanciarlo).

-- 0) Extensions
create extension if not exists "uuid-ossp";

-- 1) ENUM ruoli
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin','coach','client');
  end if;
end $$;

-- 2) Profili utente
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  -- legacy (mantenuto per compatibilità)
  is_admin boolean not null default false,

  role public.user_role not null default 'client',
  is_blocked boolean not null default false,
  active_until date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role public.user_role not null default 'client';
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists active_until date;
alter table public.profiles add column if not exists notes text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- 3) Tabella admin (legacy, ma utile)
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 4) Coach -> Client (1 coach per client)
create table if not exists public.coach_clients (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);

create unique index if not exists coach_clients_one_coach_per_client
  on public.coach_clients (client_id);

-- 5) Piani allenamento
create table if not exists public.workout_plans (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.workout_plans add column if not exists created_by uuid references public.profiles(id);

create table if not exists public.workout_plan_items (
  id uuid primary key default uuid_generate_v4(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  order_index integer not null default 1,
  exercise text not null,
  sets integer,
  reps text,
  rest_seconds integer,
  notes text
);

-- 6) Piani alimentazione
create table if not exists public.nutrition_plans (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.nutrition_plans add column if not exists created_by uuid references public.profiles(id);

create table if not exists public.nutrition_plan_items (
  id uuid primary key default uuid_generate_v4(),
  nutrition_plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  meal_label text,
  item text not null,
  qty text,
  notes text
);

-- 7) Assegnazioni
create table if not exists public.user_workout_plans (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (user_id, workout_plan_id)
);

create table if not exists public.user_nutrition_plans (
  user_id uuid not null references public.profiles(id) on delete cascade,
  nutrition_plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (user_id, nutrition_plan_id)
);

alter table public.user_workout_plans add column if not exists assigned_by uuid references public.profiles(id);
alter table public.user_nutrition_plans add column if not exists assigned_by uuid references public.profiles(id);

-- 8) Helpers: ruolo corrente (bypass RLS)
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'client'::public.user_role);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin'::public.user_role
     or exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'coach'::public.user_role;
$$;

create or replace function public.is_my_client(u uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.coach_clients c
    where c.coach_id = auth.uid() and c.client_id = u
  );
$$;

-- 9) Trigger: crea profilo in automatico quando si registra un user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'client')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
  end if;
end $$;

-- 10) Backfill: allinea role da legacy
update public.profiles set role = 'admin' where is_admin = true;
update public.profiles set role = 'admin' where id in (select user_id from public.admin_users);

-- 11) RLS ON
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.coach_clients enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_plan_items enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plan_items enable row level security;
alter table public.user_workout_plans enable row level security;
alter table public.user_nutrition_plans enable row level security;

-- 12) POLICIES

-- PROFILES
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select
using (
  id = auth.uid()
  or public.is_admin()
  or (public.is_coach() and public.is_my_client(id))
);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
for insert
with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
for update
using (
  id = auth.uid() or public.is_admin() or (public.is_coach() and public.is_my_client(id))
)
with check (
  id = auth.uid()
  or public.is_admin()
  or (public.is_coach() and public.is_my_client(id) and role = 'client'::public.user_role)
);

-- ADMIN_USERS (solo admin)
drop policy if exists "admin_users_select" on public.admin_users;
create policy "admin_users_select" on public.admin_users
for select using (public.is_admin());

drop policy if exists "admin_users_write" on public.admin_users;
create policy "admin_users_write" on public.admin_users
for all using (public.is_admin()) with check (public.is_admin());

-- COACH_CLIENTS
drop policy if exists "coach_clients_select" on public.coach_clients;
create policy "coach_clients_select" on public.coach_clients
for select using (
  public.is_admin() or coach_id = auth.uid() or client_id = auth.uid()
);

drop policy if exists "coach_clients_insert" on public.coach_clients;
create policy "coach_clients_insert" on public.coach_clients
for insert with check (
  public.is_admin() or coach_id = auth.uid()
);

drop policy if exists "coach_clients_delete" on public.coach_clients;
create policy "coach_clients_delete" on public.coach_clients
for delete using (
  public.is_admin() or coach_id = auth.uid()
);

-- WORKOUT PLANS
drop policy if exists "workout_plans_select" on public.workout_plans;
create policy "workout_plans_select" on public.workout_plans
for select
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (select 1 from public.user_workout_plans uw where uw.workout_plan_id = id and uw.user_id = auth.uid())
  or (public.is_coach() and exists (
      select 1
      from public.user_workout_plans uw
      join public.coach_clients cc on cc.client_id = uw.user_id
      where cc.coach_id = auth.uid() and uw.workout_plan_id = id
  ))
);

drop policy if exists "workout_plans_write" on public.workout_plans;
create policy "workout_plans_write" on public.workout_plans
for all
using (
  public.is_admin() or created_by = auth.uid()
)
with check (
  public.is_admin() or created_by = auth.uid()
);

-- WORKOUT ITEMS
drop policy if exists "workout_items_select" on public.workout_plan_items;
create policy "workout_items_select" on public.workout_plan_items
for select using (
  exists (select 1 from public.workout_plans wp where wp.id = workout_plan_id)
);

drop policy if exists "workout_items_write" on public.workout_plan_items;
create policy "workout_items_write" on public.workout_plan_items
for all
using (
  exists (select 1 from public.workout_plans wp where wp.id = workout_plan_id and (public.is_admin() or wp.created_by = auth.uid()))
)
with check (
  exists (select 1 from public.workout_plans wp where wp.id = workout_plan_id and (public.is_admin() or wp.created_by = auth.uid()))
);

-- NUTRITION PLANS
drop policy if exists "nutrition_plans_select" on public.nutrition_plans;
create policy "nutrition_plans_select" on public.nutrition_plans
for select
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (select 1 from public.user_nutrition_plans un where un.nutrition_plan_id = id and un.user_id = auth.uid())
  or (public.is_coach() and exists (
      select 1
      from public.user_nutrition_plans un
      join public.coach_clients cc on cc.client_id = un.user_id
      where cc.coach_id = auth.uid() and un.nutrition_plan_id = id
  ))
);

drop policy if exists "nutrition_plans_write" on public.nutrition_plans;
create policy "nutrition_plans_write" on public.nutrition_plans
for all
using (
  public.is_admin() or created_by = auth.uid()
)
with check (
  public.is_admin() or created_by = auth.uid()
);

-- NUTRITION ITEMS
drop policy if exists "nutrition_items_select" on public.nutrition_plan_items;
create policy "nutrition_items_select" on public.nutrition_plan_items
for select using (
  exists (select 1 from public.nutrition_plans np where np.id = nutrition_plan_id)
);

drop policy if exists "nutrition_items_write" on public.nutrition_plan_items;
create policy "nutrition_items_write" on public.nutrition_plan_items
for all
using (
  exists (select 1 from public.nutrition_plans np where np.id = nutrition_plan_id and (public.is_admin() or np.created_by = auth.uid()))
)
with check (
  exists (select 1 from public.nutrition_plans np where np.id = nutrition_plan_id and (public.is_admin() or np.created_by = auth.uid()))
);

-- USER_WORKOUT_PLANS
drop policy if exists "user_workout_select" on public.user_workout_plans;
create policy "user_workout_select" on public.user_workout_plans
for select using (
  user_id = auth.uid() or public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
);

drop policy if exists "user_workout_write" on public.user_workout_plans;
create policy "user_workout_write" on public.user_workout_plans
for all
using (
  public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
)
with check (
  public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
);

-- USER_NUTRITION_PLANS
drop policy if exists "user_nutrition_select" on public.user_nutrition_plans;
create policy "user_nutrition_select" on public.user_nutrition_plans
for select using (
  user_id = auth.uid() or public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
);

drop policy if exists "user_nutrition_write" on public.user_nutrition_plans;
create policy "user_nutrition_write" on public.user_nutrition_plans
for all
using (
  public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
)
with check (
  public.is_admin() or (public.is_coach() and public.is_my_client(user_id))
);

-- 13) (Opzionale) Imposta un admin a mano:
-- insert into public.admin_users(user_id) values ('<UUID_ADMIN>') on conflict do nothing;
-- update public.profiles set role='admin' where id='<UUID_ADMIN>';
