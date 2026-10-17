// Database tests: runs every migration + the demo seed in PGlite (real Postgres compiled
// to WebAssembly) with a small stand-in for Supabase's auth and storage schemas, then
// checks the security rules and the order function. Run: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../supabase/", import.meta.url);
const ADMIN = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
let db;

// Minimal Supabase environment: roles, auth.users, auth.uid(), storage tables, default grants.
const SUPABASE_SHIM = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
insert into auth.users values ('${ADMIN}', 'owner@example.com'), ('${STRANGER}', 'someone@example.com');
`;

async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}
const anon = (fn) => as("anon", null, fn);
const admin = (fn) => as("authenticated", ADMIN, fn);
const stranger = (fn) => as("authenticated", STRANGER, fn);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const errCode = async (promise) => {
  try { await promise; return "NO_ERROR"; } catch (e) { return String(e.message).split("|")[0]; }
};
const customer = (over = {}) => JSON.stringify({ name: "Test Shopper", phone: `616-555-${String(Math.floor(Math.random() * 9000) + 1000)}`, fulfillment_method: "pickup", payment_method: "cash", ...over });
const uuid = () => crypto.randomUUID();
const place = (items, cust = customer(), key = uuid()) =>
  rows("select public.place_order($1::jsonb, $2::jsonb, $3::uuid) as r", [JSON.stringify(items), cust, key]).then((r) => r[0].r);

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const f of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(readFileSync(new URL(`migrations/${f}`, root), "utf8"));
  }
  await db.exec(readFileSync(new URL("seed.sql", root), "utf8"));
  await db.exec(readFileSync(new URL("seed.sql", root), "utf8")); // idempotent
  await db.exec(`insert into public.admin_users (user_id, email) values ('${ADMIN}', 'owner@example.com');`);
  // Sample listings are NOT orderable by default; the tests switch it on to exercise ordering.
  const [d] = await rows("select demo_orders_allowed from public.store_settings");
  assert.equal(d.demo_orders_allowed, false);
  await db.exec("update public.store_settings set demo_orders_allowed = true");
});

test("seed: 8 categories and 65 demo products, all in the $1-$20 range", async () => {
  const [c] = await rows("select count(*)::int n from public.categories");
  const [p] = await rows("select count(*)::int n, min(price_cents) lo, max(price_cents) hi, bool_and(availability='demo') demo, bool_and(compare_at_cents is null) nocompare from public.products");
  assert.equal(c.n, 8);
  assert.equal(p.n, 65);
  assert.ok(p.lo >= 100 && p.hi <= 2000);
  assert.ok(p.demo && p.nocompare);
});

test("anon can read published products, not unpublished or archived ones", async () => {
  await db.exec("update public.products set is_published = false where slug = 'lint-brush'; update public.products set is_archived = true where slug = 'wide-tooth-comb';");
  const visible = await anon(() => rows("select slug from public.products"));
  const slugs = visible.map((r) => r.slug);
  assert.equal(slugs.length, 63);
  assert.ok(!slugs.includes("lint-brush") && !slugs.includes("wide-tooth-comb"));
  const adminSees = await admin(() => rows("select count(*)::int n from public.products"));
  assert.equal(adminSees[0].n, 65);
  await db.exec("update public.products set is_published = true where slug = 'lint-brush'; update public.products set is_archived = false where slug = 'wide-tooth-comb';");
});

test("anon cannot write products, settings or orders directly", async () => {
  assert.notEqual(await errCode(anon(() => db.query("update public.products set price_cents = 1"))), "NO_ERROR");
  assert.notEqual(await errCode(anon(() => db.query("insert into public.orders (order_number, idempotency_key, customer_name, customer_phone, fulfillment_method, payment_method, subtotal_cents, item_count) values ('X', gen_random_uuid(), 'a', '6165550101', 'pickup', 'cash', 1, 1)"))), "NO_ERROR");
  assert.notEqual(await errCode(anon(() => db.query("update public.store_settings set cashapp_tag = '$hacker'"))), "NO_ERROR");
  const [s] = await rows("select cashapp_tag from public.store_settings");
  assert.equal(s.cashapp_tag, "");
});

test("a signed-in user who is NOT an admin cannot change anything or read orders", async () => {
  const r = await stranger(() => db.query("update public.products set price_cents = 1 where slug = 'lint-brush'"));
  assert.equal(r.affectedRows ?? 0, 0);
  const [p] = await rows("select price_cents from public.products where slug = 'lint-brush'");
  assert.equal(p.price_cents, 200);
  await place([{ product_id: (await rows("select id from public.products where slug='lint-brush'"))[0].id, quantity: 1 }]);
  const seen = await stranger(() => rows("select * from public.orders"));
  assert.equal(seen.length, 0);
  assert.equal(await errCode(stranger(() => db.query("select public.admin_dashboard_stats()"))), "FORBIDDEN");
  assert.notEqual(await errCode(stranger(() => db.query("insert into public.admin_users values ($1, 'x')", [STRANGER]))), "NO_ERROR");
});

test("place_order uses database prices, reserves stock and logs inventory", async () => {
  const [p] = await rows("select id, price_cents, inventory_qty from public.products where slug = 'heavy-duty-scrub-brush'");
  // Browser tries to send its own price: it is ignored.
  const r = await anon(() => place([{ product_id: p.id, quantity: 2, price_cents: 1 }]));
  assert.equal(r.subtotal_cents, p.price_cents * 2);
  assert.equal(r.items[0].unit_price_cents, p.price_cents);
  assert.match(r.order_number, /^AMZ-\d{6}-\d+$/);
  const [after] = await rows("select inventory_qty from public.products where id = $1", [p.id]);
  assert.equal(after.inventory_qty, p.inventory_qty - 2);
  const tx = await rows("select change, reason from public.inventory_transactions where product_id = $1", [p.id]);
  assert.deepEqual(tx.map((t) => [t.change, t.reason]), [[-2, "order"]]);
});

test("duplicate submissions with the same key create one order", async () => {
  const [p] = await rows("select id, inventory_qty from public.products where slug = 'dish-drying-mat'");
  const key = uuid();
  const a = await anon(() => place([{ product_id: p.id, quantity: 1 }], customer(), key));
  const b = await anon(() => place([{ product_id: p.id, quantity: 1 }], customer(), key));
  assert.equal(a.order_number, b.order_number);
  assert.equal(b.duplicate, true);
  const [after] = await rows("select inventory_qty from public.products where id = $1", [p.id]);
  assert.equal(after.inventory_qty, p.inventory_qty - 1);
});

test("stock, quantity and option checks reject bad orders and change nothing", async () => {
  const [p] = await rows("select id, inventory_qty from public.products where slug = 'measuring-cups-4-piece-set'");
  const before = (await rows("select count(*)::int n from public.orders"))[0].n;
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: p.inventory_qty + 1 }]))), "OUT_OF_STOCK");
  // Two lines of the same product are merged before the stock check
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: p.inventory_qty }, { product_id: p.id, quantity: 1 }]))), "OUT_OF_STOCK");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 0 }]))), "INVALID_QUANTITY");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 21 }]))), "INVALID_QUANTITY");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 2.5 }]))), "BAD_REQUEST");
  assert.equal(await errCode(anon(() => place([{ product_id: "not-a-uuid", quantity: 1 }]))), "BAD_REQUEST");
  assert.equal(await errCode(anon(() => place([]))), "EMPTY_CART");
  assert.equal(await errCode(anon(() => place([{ product_id: uuid(), quantity: 1 }]))), "NOT_AVAILABLE");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ phone: "123" })))), "INVALID_PHONE");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ name: "" })))), "INVALID_NAME");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ email: "nope" })))), "INVALID_EMAIL");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ fulfillment_method: "local_delivery" })))), "FULFILLMENT_UNAVAILABLE");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ payment_method: "bitcoin" })))), "INVALID_OPTION");
  const after = (await rows("select count(*)::int n from public.orders"))[0].n;
  assert.equal(after, before);
  const [same] = await rows("select inventory_qty from public.products where id = $1", [p.id]);
  assert.equal(same.inventory_qty, p.inventory_qty);
});

test("unavailable, unpublished and (when switched off) demo products cannot be ordered", async () => {
  const [p] = await rows("select id from public.products where slug = 'pot-holders-2-pack'");
  await db.exec("update public.products set availability = 'unavailable' where slug = 'pot-holders-2-pack'");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }]))), "NOT_AVAILABLE");
  await db.exec("update public.products set availability = 'demo', is_published = false where slug = 'pot-holders-2-pack'");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }]))), "NOT_AVAILABLE");
  await db.exec("update public.products set is_published = true where slug = 'pot-holders-2-pack'; update public.store_settings set demo_orders_allowed = false;");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }]))), "NOT_AVAILABLE");
  await db.exec("update public.products set availability = 'available' where slug = 'pot-holders-2-pack'");
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }]))), "NO_ERROR");
  await db.exec("update public.store_settings set demo_orders_allowed = true;");
});

test("rate limit: 6th order from the same phone within 15 minutes is refused", async () => {
  const [p] = await rows("select id from public.products where slug = 'picture-frame-5-x-7'");
  const c = customer({ phone: "(269) 555-0199" });
  for (let i = 0; i < 5; i++) await anon(() => place([{ product_id: p.id, quantity: 1 }], c));
  assert.equal(await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }], customer({ phone: "269.555.0199" })))), "RATE_LIMITED");
});

test("customers can only look up an order with its private token", async () => {
  const [p] = await rows("select id from public.products where slug = 'zip-makeup-bag'");
  const r = await anon(() => place([{ product_id: p.id, quantity: 1 }]));
  const ok = await anon(() => rows("select public.get_order_public($1, $2::uuid) as o", [r.order_number, r.token]));
  assert.equal(ok[0].o.order_number, r.order_number);
  assert.equal(ok[0].o.internal_notes, undefined);
  const bad = await anon(() => rows("select public.get_order_public($1, $2::uuid) as o", [r.order_number, uuid()]));
  assert.equal(bad[0].o, null);
});

test("admin cancel restores stock exactly once and records history; canceled cannot reopen", async () => {
  const [p] = await rows("select id, inventory_qty from public.products where slug = 'soft-bath-mat'");
  const r = await anon(() => place([{ product_id: p.id, quantity: 3 }]));
  const [o] = await rows("select id from public.orders where order_number = $1", [r.order_number]);
  assert.equal((await rows("select inventory_qty from public.products where id=$1", [p.id]))[0].inventory_qty, p.inventory_qty - 3);
  await admin(() => db.query("select public.admin_update_order($1,'confirmed','paid','ready','paid in cash','Customer called')", [o.id]));
  assert.equal(await errCode(admin(() => db.query("select public.admin_update_order($1,'canceled','paid','ready','refund pending',null)", [o.id]))), "INVALID_STATUS");
  await admin(() => db.query("select public.admin_update_order($1,'canceled','refunded','ready','refunded',null)", [o.id]));
  assert.equal((await rows("select inventory_qty from public.products where id=$1", [p.id]))[0].inventory_qty, p.inventory_qty);
  assert.equal(await errCode(admin(() => db.query("select public.admin_update_order($1,'confirmed','refunded','ready',null,null)", [o.id]))), "INVALID_STATUS");
  const ev = await rows("select event from public.order_events where order_id=$1 order by id", [o.id]);
  assert.deepEqual(ev.map((e) => e.event), ["created", "status", "payment", "fulfillment", "note", "status", "payment"]);
  // A fulfilled order can't be canceled (its items are already with the customer)
  const [p2] = await rows("select id from public.products where slug = 'kitchen-towels-3-pack'");
  const r2 = await anon(() => place([{ product_id: p2.id, quantity: 1 }]));
  const [o2] = await rows("select id from public.orders where order_number = $1", [r2.order_number]);
  await admin(() => db.query("select public.admin_update_order($1,'fulfilled','paid','completed',null,null)", [o2.id]));
  assert.equal(await errCode(admin(() => db.query("select public.admin_update_order($1,'canceled','refunded','completed',null,null)", [o2.id]))), "INVALID_STATUS");
  const tx = await rows("select reason, change from public.inventory_transactions where order_id=$1 order by id", [o.id]);
  assert.deepEqual(tx.map((t) => [t.reason, t.change]), [["order", -3], ["cancel_restock", 3]]);
});

test("anon cannot call admin functions", async () => {
  assert.notEqual(await errCode(anon(() => db.query("select public.admin_dashboard_stats()"))), "NO_ERROR");
  const [o] = await rows("select id from public.orders limit 1");
  assert.notEqual(await errCode(anon(() => db.query("select public.admin_update_order($1,'canceled','unpaid','not_started',null,null)", [o.id]))), "NO_ERROR");
});

test("admin dashboard: revenue counts only paid, non-canceled orders", async () => {
  const [s] = await admin(() => rows("select public.admin_dashboard_stats() as s"));
  const [chk] = await rows("select coalesce(sum(subtotal_cents),0)::int v from public.orders where payment_status='paid' and status<>'canceled'");
  assert.equal(s.s.paid_revenue_cents, chk.v);
  assert.equal(s.s.products_total, 65);
  assert.ok(s.s.orders_pending > 0);
});

test("admin can edit products; inventory edits are logged as manual; categories with products cannot be deleted", async () => {
  await admin(() => db.query("update public.products set inventory_qty = 50, price_cents = 299 where slug = 'lint-brush'"));
  const [p] = await rows("select id, price_cents from public.products where slug='lint-brush'");
  assert.equal(p.price_cents, 299);
  const [t] = await rows("select reason, qty_after, actor from public.inventory_transactions where product_id=$1 order by id desc limit 1", [p.id]);
  assert.equal(t.reason, "manual"); assert.equal(t.qty_after, 50); assert.equal(t.actor, ADMIN);
  assert.notEqual(await errCode(admin(() => db.query("delete from public.categories where slug='laundry'"))), "NO_ERROR");
});

test("storage: only admins may upload product images", async () => {
  assert.notEqual(await errCode(anon(() => db.query("insert into storage.objects (bucket_id, name) values ('product-images', 'x.png')"))), "NO_ERROR");
  assert.notEqual(await errCode(stranger(() => db.query("insert into storage.objects (bucket_id, name) values ('product-images', 'x.png')"))), "NO_ERROR");
  assert.equal(await errCode(admin(() => db.query("insert into storage.objects (bucket_id, name) values ('product-images', 'ok.png')"))), "NO_ERROR");
  assert.notEqual(await errCode(admin(() => db.query("insert into storage.objects (bucket_id, name) values ('other-bucket', 'x.png')"))), "NO_ERROR");
  const [bk] = await rows("select public, file_size_limit, allowed_mime_types from storage.buckets where id='product-images'");
  assert.equal(bk.public, true); assert.equal(Number(bk.file_size_limit), 5242880);
});

test("admin can cancel stale unpaid orders, which restores their stock", async () => {
  const [p] = await rows("select id, inventory_qty from public.products where slug = 'reusable-shopping-bags-3-pack'");
  const r = await anon(() => place([{ product_id: p.id, quantity: 2 }]));
  await db.exec(`update public.orders set created_at = now() - interval '3 days' where order_number = '${r.order_number}'`);
  assert.notEqual(await errCode(anon(() => db.query("select public.admin_cancel_stale_orders(48)"))), "NO_ERROR");
  const [n] = await admin(() => rows("select public.admin_cancel_stale_orders(48) as n"));
  assert.ok(n.n >= 1);
  const [o] = await rows("select status from public.orders where order_number = $1", [r.order_number]);
  assert.equal(o.status, "canceled");
  assert.equal((await rows("select inventory_qty from public.products where id=$1", [p.id]))[0].inventory_qty, p.inventory_qty);
});

test("store-wide brake: too many pending orders in an hour are refused", async () => {
  const [p] = await rows("select id from public.products where slug = 'utility-hooks-4-pack'");
  await db.exec("update public.products set inventory_qty = 500 where slug = 'utility-hooks-4-pack'");
  let code = "NO_ERROR";
  for (let i = 0; i < 40 && code === "NO_ERROR"; i++) code = await errCode(anon(() => place([{ product_id: p.id, quantity: 1 }])));
  assert.equal(code, "RATE_LIMITED");
});
