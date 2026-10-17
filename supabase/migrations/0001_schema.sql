-- =============================================================================
-- A MAE Zing Deals | 0001 Schema
-- Tables, types, indexes and timestamp triggers.
-- Run in order: 0001 -> 0002 -> 0003 -> 0004, then seed.sql (optional demo data).
-- =============================================================================

create type public.product_availability as enum ('available', 'unavailable', 'demo');
create type public.order_status as enum ('pending_confirmation', 'awaiting_payment', 'confirmed', 'fulfilled', 'canceled');
create type public.payment_method as enum ('cash_app', 'venmo', 'cash');
create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
create type public.fulfillment_method as enum ('pickup', 'local_delivery', 'shipping');
create type public.fulfillment_status as enum ('not_started', 'ready', 'completed');

-- ---------------------------------------------------------------- categories
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 500),
  color       text not null default '#3f7a5a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  image_url   text check (image_url is null or char_length(image_url) <= 1000),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_sort_idx on public.categories (sort_order, name);

-- ---------------------------------------------------------------- products
-- Prices are stored in cents (integers) to avoid rounding errors.
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid references public.categories (id) on delete restrict,
  name                text not null check (char_length(name) between 1 and 120),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description         text not null default '' check (char_length(description) <= 4000),
  price_cents         integer not null check (price_cents between 1 and 100000),
  -- "Compare at" price is only shown on the store when compare_at_verified is true.
  compare_at_cents    integer check (compare_at_cents is null or compare_at_cents > price_cents),
  compare_at_verified boolean not null default false,
  compare_at_source   text check (compare_at_source is null or char_length(compare_at_source) <= 300),
  sku                 text unique check (sku is null or char_length(sku) between 1 and 64),
  inventory_qty       integer not null default 0 check (inventory_qty between 0 and 100000),
  low_stock_threshold integer not null default 3 check (low_stock_threshold between 0 and 1000),
  availability        public.product_availability not null default 'available',
  is_featured         boolean not null default false,
  is_bestseller       boolean not null default false,
  is_new              boolean not null default false,
  is_published        boolean not null default false,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_public_idx on public.products (is_published, is_archived);
create index products_created_idx on public.products (created_at desc);

-- ---------------------------------------------------------------- product images
-- url / thumb_url are public URLs. storage_path is set for uploaded files (Supabase Storage)
-- and null for bundled demo images.
create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  url          text not null check (char_length(url) <= 1000),
  thumb_url    text check (thumb_url is null or char_length(thumb_url) <= 1000),
  storage_path text check (storage_path is null or char_length(storage_path) <= 500),
  thumb_path   text check (thumb_path is null or char_length(thumb_path) <= 500),
  alt          text not null default '' check (char_length(alt) <= 300),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

-- ---------------------------------------------------------------- orders
create sequence public.order_number_seq start 1001;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique,
  public_token       uuid not null default gen_random_uuid(),  -- lets the customer view their own confirmation
  idempotency_key    uuid not null unique,                     -- blocks duplicate submissions
  customer_name      text not null check (char_length(customer_name) between 1 and 100),
  customer_phone     text not null check (char_length(customer_phone) between 7 and 30),
  customer_email     text check (customer_email is null or char_length(customer_email) <= 200),
  fulfillment_method public.fulfillment_method not null,
  payment_method     public.payment_method not null,
  notes              text check (notes is null or char_length(notes) <= 1000),
  status             public.order_status not null default 'pending_confirmation',
  payment_status     public.payment_status not null default 'unpaid',
  fulfillment_status public.fulfillment_status not null default 'not_started',
  subtotal_cents     integer not null check (subtotal_cents >= 0),
  item_count         integer not null check (item_count > 0),
  internal_notes     text check (internal_notes is null or char_length(internal_notes) <= 4000),
  canceled_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_phone_idx on public.orders (customer_phone, created_at desc);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  product_name     text not null,
  sku              text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity between 1 and 99),
  line_total_cents integer not null check (line_total_cents >= 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- Order history (status changes, notes)
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  event       text not null,
  detail      text,
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------- admins
-- A row here makes a signed-in Supabase user a store administrator.
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- inventory history
create table public.inventory_transactions (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references public.products (id) on delete cascade,
  change      integer not null,
  qty_after   integer not null,
  reason      text not null default 'manual' check (reason in ('order', 'cancel_restock', 'manual', 'import')),
  order_id    uuid references public.orders (id) on delete set null,
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index inventory_tx_product_idx on public.inventory_transactions (product_id, created_at desc);

-- ---------------------------------------------------------------- store settings (single row)
create table public.store_settings (
  id                     integer primary key default 1 check (id = 1),
  store_name             text not null default 'A MAE Zing Deals',
  legal_name             text not null default 'A MAE Zing Deals LLC',
  slogan                 text not null default 'Everyday Home Essentials You MAE Need!',
  tagline                text not null default 'Big Everyday Savings. Little Everyday Prices.',
  phone_primary          text not null default '(616) 719-7033',
  phone_secondary        text not null default '(269) 838-0075',
  email                  text not null default '',
  service_area           text not null default 'S.E. Grand Rapids, Michigan',
  logo_url               text not null default '',
  announcement_enabled   boolean not null default true,
  announcement           text not null default 'Everyday home essentials from $1 to $20. Local to S.E. Grand Rapids.',
  -- Payment details stay empty until the owner enters their real, verified accounts.
  cashapp_tag            text not null default '',
  cashapp_url            text not null default '',
  venmo_username         text not null default '',
  venmo_url              text not null default '',
  payment_instructions   text not null default '',
  pickup_enabled         boolean not null default true,
  pickup_instructions    text not null default '',
  delivery_enabled       boolean not null default false,
  delivery_area          text not null default '',
  delivery_instructions  text not null default '',
  shipping_enabled       boolean not null default false,
  shipping_instructions  text not null default '',
  demo_orders_allowed    boolean not null default false, -- sample listings can't be ordered unless the owner turns this on
  facebook_url           text not null default '',
  instagram_url          text not null default '',
  tiktok_url             text not null default '',
  policy_privacy         text not null default '',
  policy_returns         text not null default '',
  policy_cancellation    text not null default '',
  policy_fulfillment     text not null default '',
  policy_payment         text not null default '',
  policies_reviewed      boolean not null default false,
  updated_at             timestamptz not null default now()
);
insert into public.store_settings (id) values (1);

-- ---------------------------------------------------------------- updated_at triggers
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger products_touch   before update on public.products   for each row execute function public.touch_updated_at();
create trigger orders_touch     before update on public.orders     for each row execute function public.touch_updated_at();
create trigger settings_touch   before update on public.store_settings for each row execute function public.touch_updated_at();
