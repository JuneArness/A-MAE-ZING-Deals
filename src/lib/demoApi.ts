// PREVIEW MODE ONLY (VITE_DEMO_MODE=true).
// A browser-only copy of the store for previews and automated tests. Data lives in this
// browser's localStorage, orders never reach the owner, and the admin password is public.
// It follows the same rules as the database (server prices, stock checks, duplicate keys,
// restock on cancel) so the storefront and admin can be exercised end to end.
import catalog from "../../supabase/seed-data/catalog.json";
import { DEFAULT_SETTINGS } from "../data/defaults";
import { sortImages, type Api, type Session } from "./api";
import type { Category, Order, OrderEvent, OrderItem, OrderSummary, Product, ProductImage, StoreSettings } from "./types";

import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "./demoCreds";

interface DemoDb {
  v: number;
  settings: StoreSettings;
  categories: Category[];
  products: Omit<Product, "images">[];
  images: ProductImage[];
  orders: (Order & { token: string; key: string })[];
  items: (OrderItem & { order_id: string })[];
  events: (OrderEvent & { order_id: string })[];
  seq: number;
  session: Session | null;
}

const KEY = "amz-demo-db-v1";
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const err = (code: string, msg: string) => new Error(`${code}|${msg}`);
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

function fresh(): DemoDb {
  const categories: Category[] = catalog.categories.map((c) => ({
    id: uid(), name: c.name, slug: c.slug, description: c.description, color: c.color, image_url: null, sort_order: c.sort_order, is_active: true,
  }));
  const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const t0 = Date.now();
  const products = catalog.products.map((p, i) => ({
    id: uid(), category_id: bySlug.get(p.category) ?? null, name: p.name, slug: p.slug, description: p.description,
    price_cents: p.price_cents, compare_at_cents: null, compare_at_verified: false, compare_at_source: null, sku: p.sku,
    inventory_qty: p.inventory_qty, low_stock_threshold: 3, availability: "demo" as const, is_featured: p.is_featured,
    is_bestseller: p.is_bestseller, is_new: p.is_new, is_published: true, is_archived: false,
    created_at: new Date(t0 - i * 3600_000).toISOString(), updated_at: now(),
  }));
  // Preview mode lets you order the sample items so checkout can be tried end to end.
  return { v: 1, settings: { ...DEFAULT_SETTINGS, demo_orders_allowed: true }, categories, products, images: [], orders: [], items: [], events: [], seq: 1000, session: null };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw) as DemoDb; if (d.v === 1) return d; }
  } catch { /* storage unavailable: start fresh */ }
  return fresh();
}

export function createDemoApi(): Api {
  const db = load();
  const listeners = new Set<(s: Session | null) => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore quota/private mode */ } };
  save(); // keep product ids stable across page loads (carts store product ids)
  const withImages = (p: Omit<Product, "images">): Product => sortImages({ ...p, images: db.images.filter((i) => i.product_id === p.id) });
  const requireAdmin = () => { if (!db.session) throw err("FORBIDDEN", "Administrator access required."); };
  const summary = (o: DemoDb["orders"][number]): OrderSummary => ({
    order_number: o.order_number, token: o.token, created_at: o.created_at, status: o.status, payment_status: o.payment_status,
    fulfillment_status: o.fulfillment_status, payment_method: o.payment_method, fulfillment_method: o.fulfillment_method,
    customer_name: o.customer_name, subtotal_cents: o.subtotal_cents, item_count: o.item_count,
    items: db.items.filter((i) => i.order_id === o.id).map(({ product_name, sku, quantity, unit_price_cents, line_total_cents }) => ({ product_name, sku, quantity, unit_price_cents, line_total_cents })),
  });
  const event = (order_id: string, ev: string, detail: string) => {
    db.events.push({ id: db.events.length + 1, order_id, event: ev, detail, created_at: now() });
  };
  const fileUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

  const api: Api = {
    mode: "demo",
    getSettings: () => delay({ ...db.settings }),
    listCategories: (o) => delay(db.categories.filter((c) => o?.includeInactive || c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))),
    listProducts: (o) => delay(db.products.filter((p) => o?.admin ? !!db.session : p.is_published && !p.is_archived).map(withImages)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))),
    getProduct: (slug) => {
      const p = db.products.find((x) => x.slug === slug && (x.is_published && !x.is_archived || !!db.session));
      return delay(p ? withImages(p) : null);
    },
    getProductById: (id) => { const p = db.products.find((x) => x.id === id); return delay(p ? withImages(p) : null); },

    async placeOrder(lines, c, key) {
      await delay(null);
      const dup = db.orders.find((o) => o.key === key);
      if (dup) return { ...summary(dup), duplicate: true };
      const s = db.settings;
      const digits = c.phone.replace(/\D/g, "");
      if (c.name.trim().length < 2) throw err("INVALID_NAME", "Please enter your name.");
      if (digits.length < 10 || digits.length > 15) throw err("INVALID_PHONE", "Please enter a valid phone number with area code.");
      if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(c.email.trim())) throw err("INVALID_EMAIL", "Please enter a valid email address, or leave it blank.");
      const okFulfil = { pickup: s.pickup_enabled, local_delivery: s.delivery_enabled, shipping: s.shipping_enabled }[c.fulfillment_method];
      if (!okFulfil) throw err("FULFILLMENT_UNAVAILABLE", "That pickup or delivery option is not available right now.");
      if (!["cash_app", "venmo", "cash"].includes(c.payment_method)) throw err("INVALID_OPTION", "Please choose a payment method.");
      if (!lines.length) throw err("EMPTY_CART", "Your cart is empty.");
      const merged = new Map<string, number>();
      for (const l of lines) merged.set(l.product_id, (merged.get(l.product_id) ?? 0) + l.quantity);
      const picked: { p: DemoDb["products"][number]; q: number }[] = [];
      for (const [id, q] of merged) {
        if (!Number.isInteger(q) || q < 1 || q > 20) throw err("INVALID_QUANTITY", "You can order up to 20 of each item online. For larger amounts, please call the store.");
        const p = db.products.find((x) => x.id === id);
        if (!p || !p.is_published || p.is_archived) throw err("NOT_AVAILABLE", "An item in your cart is no longer available. Please review your cart.");
        if (p.availability === "unavailable") throw err("NOT_AVAILABLE", `"${p.name}" is currently unavailable. Please remove it from your cart.`);
        if (p.availability === "demo" && !s.demo_orders_allowed) throw err("NOT_AVAILABLE", `"${p.name}" is a sample listing and cannot be ordered yet.`);
        if (q > p.inventory_qty) throw err("OUT_OF_STOCK", `Only ${p.inventory_qty} of "${p.name}" left. Please lower the quantity.`);
        picked.push({ p, q });
      }
      const id = uid();
      const d = new Date();
      const order: DemoDb["orders"][number] = {
        id, key, token: uid(),
        order_number: `AMZ-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${++db.seq}`,
        customer_name: c.name.trim(), customer_phone: c.phone.trim(), customer_email: c.email.trim() || null,
        fulfillment_method: c.fulfillment_method, payment_method: c.payment_method, notes: c.notes.trim() || null,
        status: "pending_confirmation", payment_status: "unpaid", fulfillment_status: "not_started",
        subtotal_cents: 0, item_count: 0, internal_notes: null, canceled_at: null, created_at: now(), updated_at: now(),
      };
      for (const { p, q } of picked) {
        p.inventory_qty -= q;
        db.items.push({ id: uid(), order_id: id, product_id: p.id, product_name: p.name, sku: p.sku, quantity: q, unit_price_cents: p.price_cents, line_total_cents: p.price_cents * q });
        order.subtotal_cents += p.price_cents * q;
        order.item_count += q;
      }
      db.orders.push(order);
      event(id, "created", "Order placed online");
      save();
      return { ...summary(order), duplicate: false };
    },

    async getOrderPublic(n, t) {
      const o = db.orders.find((x) => x.order_number === n && x.token === t);
      return delay(o ? summary(o) : null);
    },

    getSession: () => delay(db.session),
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn(email, password) {
      await delay(null);
      if (email.trim().toLowerCase() !== DEMO_ADMIN_EMAIL || password !== DEMO_ADMIN_PASSWORD) throw err("LOGIN", "That email and password didn't work. Please try again.");
      db.session = { email: DEMO_ADMIN_EMAIL }; save(); listeners.forEach((l) => l(db.session));
    },
    async signOut() { db.session = null; save(); listeners.forEach((l) => l(null)); },
    isAdmin: () => delay(!!db.session),

    async dashboardStats() {
      requireAdmin();
      const live = db.products.filter((p) => !p.is_archived);
      const paid = db.orders.filter((o) => o.payment_status === "paid" && o.status !== "canceled");
      return delay({
        products_total: live.length,
        products_published: live.filter((p) => p.is_published).length,
        products_low: live.filter((p) => p.inventory_qty > 0 && p.inventory_qty <= p.low_stock_threshold).length,
        products_out: live.filter((p) => p.inventory_qty === 0).length,
        products_demo: live.filter((p) => p.availability === "demo").length,
        orders_pending: db.orders.filter((o) => o.status === "pending_confirmation" || o.status === "awaiting_payment").length,
        orders_confirmed: db.orders.filter((o) => o.status === "confirmed").length,
        orders_fulfilled: db.orders.filter((o) => o.status === "fulfilled").length,
        paid_revenue_cents: paid.reduce((a, o) => a + o.subtotal_cents, 0),
        paid_orders: paid.length,
      });
    },

    async saveProduct(id, input) {
      requireAdmin();
      if (db.products.some((p) => p.id !== id && (p.slug === input.slug || (input.sku && p.sku === input.sku))))
        throw err("DUPLICATE", "That name, URL slug or SKU is already used by another item.");
      let p = id ? db.products.find((x) => x.id === id) : undefined;
      if (id && !p) throw err("NOT_FOUND", "Product not found.");
      if (p) Object.assign(p, input, { updated_at: now() });
      else { p = { ...input, id: uid(), created_at: now(), updated_at: now() }; db.products.push(p); }
      save();
      return withImages(p);
    },
    async deleteProduct(id) {
      requireAdmin();
      db.products = db.products.filter((p) => p.id !== id);
      db.images = db.images.filter((i) => i.product_id !== id);
      db.items.forEach((i) => { if (i.product_id === id) i.product_id = null; });
      save();
    },
    async bulkUpdateProducts(ids, patch) {
      requireAdmin();
      db.products.forEach((p) => { if (ids.includes(p.id)) Object.assign(p, patch, { updated_at: now() }); });
      save();
    },
    async importProducts(newRows, updates) {
      requireAdmin();
      for (const r of updates) { const p = db.products.find((x) => x.slug === r.slug); if (p) Object.assign(p, r, { updated_at: now() }); }
      for (const r of newRows) db.products.push({ ...r, id: uid(), created_at: now(), updated_at: now() });
      save();
      return { created: newRows.length, updated: updates.length };
    },
    async uploadProductImage(productId, full, thumb, alt, sort_order) {
      requireAdmin();
      const img: ProductImage = { id: uid(), product_id: productId, url: await fileUrl(full), thumb_url: await fileUrl(thumb), storage_path: null, thumb_path: null, alt, sort_order };
      db.images.push(img); save();
      return img;
    },
    async updateProductImage(id, patch) { requireAdmin(); const i = db.images.find((x) => x.id === id); if (i) Object.assign(i, patch); save(); },
    async deleteProductImage(img) { requireAdmin(); db.images = db.images.filter((i) => i.id !== img.id); save(); },

    async saveCategory(id, input) {
      requireAdmin();
      if (db.categories.some((c) => c.id !== id && c.slug === input.slug)) throw err("DUPLICATE", "That name, URL slug or SKU is already used by another item.");
      let c = id ? db.categories.find((x) => x.id === id) : undefined;
      if (c) Object.assign(c, input); else { c = { ...input, id: uid() }; db.categories.push(c); }
      save();
      return { ...c };
    },
    async deleteCategory(id) {
      requireAdmin();
      const n = db.products.filter((p) => p.category_id === id).length;
      if (n) throw err("IN_USE", `This category still has ${n} product${n === 1 ? "" : "s"}. Move them to another category (or deactivate the category) first.`);
      db.categories = db.categories.filter((c) => c.id !== id); save();
    },

    async listOrders(f) {
      requireAdmin();
      const q = f?.q?.trim().toLowerCase() ?? "";
      return delay(db.orders
        .filter((o) => !f?.status || (f.status === "open" ? ["pending_confirmation", "awaiting_payment", "confirmed"].includes(o.status) : o.status === f.status))
        .filter((o) => !q || [o.order_number, o.customer_name, o.customer_phone].some((v) => v.toLowerCase().includes(q)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async getOrder(id) {
      requireAdmin();
      const o = db.orders.find((x) => x.id === id);
      return delay(o ? { ...o, items: db.items.filter((i) => i.order_id === id), events: db.events.filter((e) => e.order_id === id) } : null);
    },
    async updateOrder(id, u) {
      requireAdmin();
      const o = db.orders.find((x) => x.id === id);
      if (!o) throw err("NOT_FOUND", "Order not found.");
      if (o.status === "canceled" && u.status !== "canceled") throw err("INVALID_STATUS", "A canceled order cannot be reopened. Ask the customer to place a new order.");
      if (u.status === "canceled" && o.status === "fulfilled") throw err("INVALID_STATUS", "This order was already fulfilled, so it can't be canceled (its items are with the customer). Handle returns by adjusting stock on the product.");
      if (u.status === "canceled" && u.payment_status === "paid") throw err("INVALID_STATUS", "Set Payment to Refunded (or Unpaid) before canceling a paid order.");
      if (u.status === "canceled" && o.status !== "canceled") {
        db.items.filter((i) => i.order_id === id && i.product_id).forEach((i) => {
          const p = db.products.find((x) => x.id === i.product_id); if (p) p.inventory_qty += i.quantity;
        });
        o.canceled_at = now();
      }
      if (o.status !== u.status) event(id, "status", `${o.status.replace(/_/g, " ")} -> ${u.status.replace(/_/g, " ")}`);
      if (o.payment_status !== u.payment_status) event(id, "payment", `${o.payment_status} -> ${u.payment_status}`);
      if (o.fulfillment_status !== u.fulfillment_status) event(id, "fulfillment", `${o.fulfillment_status.replace(/_/g, " ")} -> ${u.fulfillment_status.replace(/_/g, " ")}`);
      if (u.note.trim()) event(id, "note", u.note.trim().slice(0, 1000));
      Object.assign(o, { status: u.status, payment_status: u.payment_status, fulfillment_status: u.fulfillment_status, internal_notes: u.internal_notes.trim() || null, updated_at: now() });
      save();
    },
    async cancelStaleOrders(hours) {
      requireAdmin();
      const cutoff = Date.now() - hours * 3600_000;
      const stale = db.orders.filter((o) => ["pending_confirmation", "awaiting_payment"].includes(o.status) && o.payment_status === "unpaid" && Date.parse(o.created_at) < cutoff);
      for (const o of stale) await api.updateOrder(o.id, { status: "canceled", payment_status: "unpaid", fulfillment_status: o.fulfillment_status, internal_notes: o.internal_notes ?? "", note: `Canceled automatically: not confirmed within ${hours} hours` });
      return stale.length;
    },
    async saveSettings(patch) { requireAdmin(); Object.assign(db.settings, patch); save(); return { ...db.settings }; },
    async uploadLogo(file) { requireAdmin(); return fileUrl(file); },
  };
  return api;
}
