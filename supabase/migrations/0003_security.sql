-- =============================================================================
-- A MAE Zing Deals | 0003 Row Level Security
-- The public (anon) key can only READ published catalog data and store settings.
-- Orders can only be created through place_order(). Everything else needs an admin.
-- =============================================================================

alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.product_images         enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.order_events           enable row level security;
alter table public.admin_users            enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.store_settings         enable row level security;

-- Belt and braces: shoppers never get direct write access to any table.
revoke insert, update, delete on all tables in schema public from anon;
revoke all on public.orders, public.order_items, public.order_events,
              public.admin_users, public.inventory_transactions from anon;
revoke usage, select on sequence public.order_number_seq from anon, authenticated;

-- ---------------------------------------------------------------- categories
create policy "Public can read active categories" on public.categories
  for select using (is_active or public.is_admin());
create policy "Admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- products
create policy "Public can read published products" on public.products
  for select using ((is_published and not is_archived) or public.is_admin());
create policy "Admins manage products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- product images
create policy "Public can read images of published products" on public.product_images
  for select using (
    public.is_admin() or exists (
      select 1 from public.products p
       where p.id = product_images.product_id and p.is_published and not p.is_archived)
  );
create policy "Admins manage product images" on public.product_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- orders (admins only; shoppers use place_order / get_order_public)
create policy "Admins read orders" on public.orders
  for select to authenticated using (public.is_admin());
-- No direct UPDATE policy: admins change orders through admin_update_order(), which
-- restores stock on cancel and records history.

create policy "Admins read order items" on public.order_items
  for select to authenticated using (public.is_admin());

create policy "Admins read order events" on public.order_events
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- admin users (read-only from the app)
-- New admins are added in the Supabase SQL editor; see README "Create the first administrator".
create policy "Admins read admin list" on public.admin_users
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- inventory history
create policy "Admins read inventory history" on public.inventory_transactions
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- store settings
-- All settings are public display information (phone, payment handles, policies).
-- Never store secrets in this table.
create policy "Public can read store settings" on public.store_settings
  for select using (true);
create policy "Admins update store settings" on public.store_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
