-- =============================================================================
-- A MAE Zing Deals | 0002 Functions
-- is_admin(), inventory logging, place_order() (the ONLY way to create an order),
-- order lookup for customers, and admin helpers.
-- =============================================================================

-- ---------------------------------------------------------------- is_admin
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- inventory log
-- Every change to products.inventory_qty is recorded. place_order / admin_update_order
-- set app.inv_reason and app.inv_order so the log knows why the stock moved.
create or replace function public.log_inventory_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := coalesce(nullif(current_setting('app.inv_reason', true), ''), 'manual');
  v_order  uuid := nullif(current_setting('app.inv_order', true), '')::uuid;
begin
  if new.inventory_qty is distinct from old.inventory_qty then
    insert into public.inventory_transactions (product_id, change, qty_after, reason, order_id, actor)
    values (new.id, new.inventory_qty - old.inventory_qty, new.inventory_qty, v_reason, v_order, auth.uid());
  end if;
  return new;
end $$;

create trigger products_inventory_log after update of inventory_qty on public.products
for each row execute function public.log_inventory_change();

-- ---------------------------------------------------------------- order summary (internal)
create or replace function public.order_summary(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'token', o.public_token,
    'created_at', o.created_at,
    'status', o.status,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'payment_method', o.payment_method,
    'fulfillment_method', o.fulfillment_method,
    'customer_name', o.customer_name,
    'subtotal_cents', o.subtotal_cents,
    'item_count', o.item_count,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_name', i.product_name, 'sku', i.sku, 'quantity', i.quantity,
               'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents)
             order by i.product_name)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o where o.id = p_order_id;
$$;
revoke all on function public.order_summary(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- place_order
-- Called by the storefront checkout. Prices and stock come from the database, never
-- from the browser. Runs in one transaction: rows are locked, stock is checked and
-- reserved, and the order is written, or nothing happens at all.
--
-- p_items:    [{"product_id": "...", "quantity": 2}, ...]
-- p_customer: {"name","phone","email","fulfillment_method","payment_method","notes"}
-- p_key:      a random UUID generated once per checkout attempt (duplicate protection)
--
-- Errors are raised as 'CODE|human message' so the storefront can show a friendly message.
create or replace function public.place_order(p_items jsonb, p_customer jsonb, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s            public.store_settings;
  v_existing   uuid;
  v_order_id   uuid;
  v_name       text := btrim(coalesce(p_customer->>'name', ''));
  v_phone      text := btrim(coalesce(p_customer->>'phone', ''));
  v_digits     text;
  v_email      text := nullif(lower(btrim(coalesce(p_customer->>'email', ''))), '');
  v_notes      text := nullif(btrim(coalesce(p_customer->>'notes', '')), '');
  v_fulfil     public.fulfillment_method;
  v_pay        public.payment_method;
  v_subtotal   integer := 0;
  v_count      integer := 0;
  v_recent     integer;
  r            record;
  p            public.products;
begin
  if p_key is null then
    raise exception 'BAD_REQUEST|Missing checkout key. Please refresh and try again.';
  end if;

  -- Same checkout submitted twice: return the order that already exists.
  select id into v_existing from public.orders where idempotency_key = p_key;
  if found then
    return public.order_summary(v_existing) || jsonb_build_object('duplicate', true);
  end if;

  select * into s from public.store_settings where id = 1;

  -- ---- customer details
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'INVALID_NAME|Please enter your name.';
  end if;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if char_length(v_digits) < 10 or char_length(v_digits) > 15 or char_length(v_phone) > 30 then
    raise exception 'INVALID_PHONE|Please enter a valid phone number with area code.';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$') then
    raise exception 'INVALID_EMAIL|Please enter a valid email address, or leave it blank.';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'INVALID_NOTES|Order notes must be 1,000 characters or fewer.';
  end if;

  begin
    v_fulfil := (p_customer->>'fulfillment_method')::public.fulfillment_method;
    v_pay    := (p_customer->>'payment_method')::public.payment_method;
  exception when others then
    raise exception 'INVALID_OPTION|Please choose a pickup or delivery option and a payment method.';
  end;
  if v_fulfil is null or v_pay is null then
    raise exception 'INVALID_OPTION|Please choose a pickup or delivery option and a payment method.';
  end if;
  if (v_fulfil = 'pickup' and not s.pickup_enabled)
     or (v_fulfil = 'local_delivery' and not s.delivery_enabled)
     or (v_fulfil = 'shipping' and not s.shipping_enabled) then
    raise exception 'FULFILLMENT_UNAVAILABLE|That pickup or delivery option is not available right now.';
  end if;

  -- ---- simple abuse protection: limit orders per phone number
  select count(*) into v_recent from public.orders
   where regexp_replace(customer_phone, '\D', '', 'g') = v_digits
     and created_at > now() - interval '15 minutes';
  if v_recent >= 5 then
    raise exception 'RATE_LIMITED|Too many orders were placed with this phone number. Please call the store.';
  end if;

  -- ---- items
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART|Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_ITEMS|Please keep orders to 50 different products or fewer.';
  end if;

  -- Store-wide brake: stops a script from reserving the whole catalog with fake orders.
  select count(*) into v_recent from public.orders
   where status in ('pending_confirmation', 'awaiting_payment') and created_at > now() - interval '60 minutes';
  if v_recent >= 25 then
    raise exception 'RATE_LIMITED|We are receiving a lot of orders right now. Please try again shortly or call the store.';
  end if;

  -- Validate shape (ids must be UUIDs, quantities whole numbers).
  begin
    perform (e->>'product_id')::uuid, (e->>'quantity')::integer from jsonb_array_elements(p_items) e;
  exception when others then
    raise exception 'BAD_REQUEST|Your cart contains an invalid item. Please refresh and try again.';
  end;
  -- Duplicate lines for the same product are merged before checking.
  if exists (
    select 1 from (
      select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::integer) as q
        from jsonb_array_elements(p_items) e group by 1
    ) x where x.pid is null or x.q is null or x.q < 1 or x.q > 20
  ) then
    raise exception 'INVALID_QUANTITY|You can order up to 20 of each item online. For larger amounts, please call the store.';
  end if;

  v_order_id := gen_random_uuid();
  perform set_config('app.inv_reason', 'order', true);
  perform set_config('app.inv_order', v_order_id::text, true);

  begin
    insert into public.orders (id, order_number, idempotency_key, customer_name, customer_phone, customer_email,
                               fulfillment_method, payment_method, notes, subtotal_cents, item_count)
    values (v_order_id,
            'AMZ-' || to_char(now() at time zone 'America/Detroit', 'YYMMDD') || '-' || nextval('public.order_number_seq'),
            p_key, v_name, v_phone, v_email, v_fulfil, v_pay, v_notes, 0, 1);
  exception when unique_violation then
    -- Another request with the same key won the race.
    select id into v_existing from public.orders where idempotency_key = p_key;
    return public.order_summary(v_existing) || jsonb_build_object('duplicate', true);
  end;

  -- Lock product rows in a fixed order (prevents deadlocks between simultaneous orders).
  for r in
    select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    select * into p from public.products where id = r.product_id for update;
    if not found or not p.is_published or p.is_archived then
      raise exception 'NOT_AVAILABLE|An item in your cart is no longer available. Please review your cart.';
    end if;
    if p.availability = 'unavailable' then
      raise exception 'NOT_AVAILABLE|"%" is currently unavailable. Please remove it from your cart.', p.name;
    end if;
    if p.availability = 'demo' and not s.demo_orders_allowed then
      raise exception 'NOT_AVAILABLE|"%" is a sample listing and cannot be ordered yet.', p.name;
    end if;
    if r.quantity > p.inventory_qty then
      raise exception 'OUT_OF_STOCK|Only % of "%" left. Please lower the quantity.', p.inventory_qty, p.name;
    end if;

    insert into public.order_items (order_id, product_id, product_name, sku, unit_price_cents, quantity, line_total_cents)
    values (v_order_id, p.id, p.name, p.sku, p.price_cents, r.quantity, p.price_cents * r.quantity);

    update public.products set inventory_qty = inventory_qty - r.quantity where id = p.id;

    v_subtotal := v_subtotal + p.price_cents * r.quantity;
    v_count := v_count + r.quantity;
  end loop;

  if v_count > 100 then
    raise exception 'TOO_MANY_ITEMS|Online orders are limited to 100 items. For larger orders, please call the store.';
  end if;

  update public.orders set subtotal_cents = v_subtotal, item_count = v_count where id = v_order_id;
  insert into public.order_events (order_id, event, detail) values (v_order_id, 'created', 'Order placed online');

  perform set_config('app.inv_reason', '', true);
  perform set_config('app.inv_order', '', true);

  return public.order_summary(v_order_id) || jsonb_build_object('duplicate', false);
end $$;

revoke all on function public.place_order(jsonb, jsonb, uuid) from public;
grant execute on function public.place_order(jsonb, jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- customer order lookup
-- Needs BOTH the order number and the private token from the confirmation link.
create or replace function public.get_order_public(p_order_number text, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.orders where order_number = p_order_number and public_token = p_token;
  if not found then return null; end if;
  return public.order_summary(v_id);
end $$;
revoke all on function public.get_order_public(text, uuid) from public;
grant execute on function public.get_order_public(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- admin: update an order
-- Canceling restores the reserved stock. A canceled order cannot be reopened.
create or replace function public.admin_update_order(
  p_order_id uuid,
  p_status public.order_status,
  p_payment_status public.payment_status,
  p_fulfillment_status public.fulfillment_status,
  p_internal_notes text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  i record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN|Administrator access required.';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND|Order not found.'; end if;

  if o.status = 'canceled' and p_status <> 'canceled' then
    raise exception 'INVALID_STATUS|A canceled order cannot be reopened. Ask the customer to place a new order.';
  end if;
  if p_status = 'canceled' and o.status <> 'canceled' and o.status = 'fulfilled' then
    raise exception 'INVALID_STATUS|This order was already fulfilled, so it can''t be canceled (its items are with the customer). Handle returns by adjusting stock on the product.';
  end if;
  if p_status = 'canceled' and p_payment_status = 'paid' then
    raise exception 'INVALID_STATUS|Set Payment to Refunded (or Unpaid) before canceling a paid order.';
  end if;

  if p_status = 'canceled' and o.status <> 'canceled' then
    perform set_config('app.inv_reason', 'cancel_restock', true);
    perform set_config('app.inv_order', o.id::text, true);
    for i in select product_id, quantity from public.order_items where order_id = o.id and product_id is not null order by product_id loop
      update public.products set inventory_qty = inventory_qty + i.quantity where id = i.product_id;
    end loop;
    perform set_config('app.inv_reason', '', true);
    perform set_config('app.inv_order', '', true);
  end if;

  update public.orders set
    status = p_status,
    payment_status = p_payment_status,
    fulfillment_status = p_fulfillment_status,
    internal_notes = nullif(btrim(coalesce(p_internal_notes, '')), ''),
    canceled_at = case when p_status = 'canceled' and o.status <> 'canceled' then now() else canceled_at end
  where id = o.id;

  if o.status is distinct from p_status then
    insert into public.order_events (order_id, event, detail, actor)
    values (o.id, 'status', replace(o.status::text, '_', ' ') || ' -> ' || replace(p_status::text, '_', ' '), auth.uid());
  end if;
  if o.payment_status is distinct from p_payment_status then
    insert into public.order_events (order_id, event, detail, actor)
    values (o.id, 'payment', o.payment_status::text || ' -> ' || p_payment_status::text, auth.uid());
  end if;
  if o.fulfillment_status is distinct from p_fulfillment_status then
    insert into public.order_events (order_id, event, detail, actor)
    values (o.id, 'fulfillment', replace(o.fulfillment_status::text, '_', ' ') || ' -> ' || replace(p_fulfillment_status::text, '_', ' '), auth.uid());
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.order_events (order_id, event, detail, actor) values (o.id, 'note', left(btrim(p_note), 1000), auth.uid());
  end if;
end $$;
revoke all on function public.admin_update_order(uuid, public.order_status, public.payment_status, public.fulfillment_status, text, text) from public, anon;
grant execute on function public.admin_update_order(uuid, public.order_status, public.payment_status, public.fulfillment_status, text, text) to authenticated;

-- ---------------------------------------------------------------- admin: dashboard numbers
-- Revenue counts only orders marked PAID and not canceled. Pending orders are reported separately.
create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN|Administrator access required.';
  end if;
  return jsonb_build_object(
    'products_total',     (select count(*) from public.products where not is_archived),
    'products_published', (select count(*) from public.products where is_published and not is_archived),
    'products_low',       (select count(*) from public.products where not is_archived and inventory_qty > 0 and inventory_qty <= low_stock_threshold),
    'products_out',       (select count(*) from public.products where not is_archived and inventory_qty = 0),
    'products_demo',      (select count(*) from public.products where not is_archived and availability = 'demo'),
    'orders_pending',     (select count(*) from public.orders where status in ('pending_confirmation', 'awaiting_payment')),
    'orders_confirmed',   (select count(*) from public.orders where status = 'confirmed'),
    'orders_fulfilled',   (select count(*) from public.orders where status = 'fulfilled'),
    'paid_revenue_cents', (select coalesce(sum(subtotal_cents), 0) from public.orders where payment_status = 'paid' and status <> 'canceled'),
    'paid_orders',        (select count(*) from public.orders where payment_status = 'paid' and status <> 'canceled')
  );
end $$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------- admin: cancel stale orders
-- Cancels UNPAID orders still waiting for confirmation or payment after p_hours, restoring stock.
create or replace function public.admin_cancel_stale_orders(p_hours integer default 48) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN|Administrator access required.';
  end if;
  for r in select id, payment_status, fulfillment_status, internal_notes from public.orders
            where status in ('pending_confirmation', 'awaiting_payment') and payment_status = 'unpaid'
              and created_at < now() - make_interval(hours => greatest(p_hours, 1))
  loop
    perform public.admin_update_order(r.id, 'canceled', 'unpaid', r.fulfillment_status, r.internal_notes, 'Canceled automatically: not confirmed within ' || p_hours || ' hours');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.admin_cancel_stale_orders(integer) from public, anon;
grant execute on function public.admin_cancel_stale_orders(integer) to authenticated;
