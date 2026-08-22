create extension if not exists "pgcrypto";

create type public.inventory_movement_type as enum ('receipt', 'consumption', 'waste', 'adjustment');
create type public.recommendation_type as enum ('stock', 'expiry', 'sales', 'promotion');
create type public.recommendation_severity as enum ('info', 'warning', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, version)
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  unit text not null,
  reorder_point numeric(14,3) not null default 0 check (reorder_point >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  quantity numeric(14,4) not null check (quantity > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id)
);

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  lot_code text,
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  quantity_remaining numeric(14,3) not null check (quantity_remaining >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  expires_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  lot_id uuid references public.inventory_lots(id),
  type public.inventory_movement_type not null,
  quantity numeric(14,3) not null check (quantity > 0),
  occurred_at timestamptz not null,
  source text not null default 'manual',
  note text,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create table public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  occurred_at timestamptz not null,
  order_count integer check (order_count >= 0),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create table public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sales_transaction_id uuid not null references public.sales_transactions(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  quantity integer not null check (quantity > 0),
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  cogs_snapshot numeric(12,4) not null default 0 check (cogs_snapshot >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_closes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'reversed')),
  note text,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, business_date, idempotency_key)
);

create table public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  method text not null default 'baseline',
  data_days integer not null default 0,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  generated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.forecast_points (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  forecast_run_id uuid not null references public.forecast_runs(id) on delete cascade,
  forecast_date date not null,
  actual_units integer,
  predicted_units integer not null check (predicted_units >= 0),
  low_units integer check (low_units >= 0),
  high_units integer check (high_units >= 0),
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  type public.recommendation_type not null,
  severity public.recommendation_severity not null,
  title text not null,
  body text not null,
  action text not null,
  source_timestamp timestamptz not null default now(),
  dismissed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_movements_shop_ingredient_idx on public.inventory_movements(shop_id, ingredient_id, occurred_at desc);
create index sales_transactions_shop_date_idx on public.sales_transactions(shop_id, business_date desc);
create index forecast_points_shop_date_idx on public.forecast_points(shop_id, forecast_date);

create or replace function public.is_shop_member(target_shop_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members where shop_id = target_shop_id and user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.ingredients enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.sales_lines enable row level security;
alter table public.daily_closes enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.forecast_points enable row level security;
alter table public.recommendations enable row level security;

create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy shops_member on public.shops for all using (public.is_shop_member(id) or created_by = auth.uid()) with check (created_by = auth.uid());
create policy shop_members_self_or_member on public.shop_members for all using (user_id = auth.uid() or public.is_shop_member(shop_id)) with check (user_id = auth.uid() or public.is_shop_member(shop_id));

do $$
declare table_name text;
begin
  foreach table_name in array array['menu_categories','menu_items','recipes','recipe_lines','ingredients','inventory_lots','inventory_movements','sales_transactions','sales_lines','daily_closes','forecast_runs','forecast_points','recommendations'] loop
    execute format('create policy %I_member on public.%I for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id) and created_by = auth.uid())', table_name, table_name);
  end loop;
end $$;
