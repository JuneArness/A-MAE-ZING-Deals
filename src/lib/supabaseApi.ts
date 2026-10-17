// The real backend: Supabase (Postgres + Auth + Storage).
// Every write below is also enforced by the database security rules in supabase/migrations,
// so this file can never grant more access than the database allows.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sortImages, type Api, type Session } from "./api";
import type { Category, Order, OrderSummary, Product, ProductImage, StoreSettings } from "./types";

const BUCKET = "product-images";
const PRODUCT_SELECT = "*, images:product_images(*)";

function fail(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "Request failed";
  if (error?.code === "23503") throw new Error("IN_USE|This item is still in use. Reassign or archive what depends on it first.");
  if (error?.code === "23505") throw new Error("DUPLICATE|That name, URL slug or SKU is already used by another item.");
  if (error?.code === "42501" || /row-level security/i.test(msg)) throw new Error("FORBIDDEN|You don't have permission to do that. Please sign in as an administrator.");
  throw new Error(msg);
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "amz-admin-auth" },
  });

  const toSession = (email?: string | null): Session | null => (email ? { email } : null);

  const api: Api = {
    mode: "supabase",

    async getSettings() {
      const { data, error } = await sb.from("store_settings").select("*").eq("id", 1).single();
      if (error) fail(error);
      return data as StoreSettings;
    },

    async listCategories(opts) {
      let q = sb.from("categories").select("*").order("sort_order").order("name");
      if (!opts?.includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as Category[];
    },

    async listProducts(opts) {
      let q = sb.from("products").select(PRODUCT_SELECT).order("created_at", { ascending: false }).limit(2000);
      if (!opts?.admin) q = q.eq("is_published", true).eq("is_archived", false);
      const { data, error } = await q;
      if (error) fail(error);
      return ((data ?? []) as Product[]).map(sortImages);
    },

    async getProduct(slug) {
      const { data, error } = await sb.from("products").select(PRODUCT_SELECT).eq("slug", slug).maybeSingle();
      if (error) fail(error);
      return data ? sortImages(data as Product) : null;
    },

    async getProductById(id) {
      const { data, error } = await sb.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle();
      if (error) fail(error);
      return data ? sortImages(data as Product) : null;
    },

    async placeOrder(items, customer, key) {
      const { data, error } = await sb.rpc("place_order", { p_items: items, p_customer: customer, p_key: key });
      if (error) fail(error);
      return data as OrderSummary;
    },

    async getOrderPublic(orderNumber, token) {
      const { data, error } = await sb.rpc("get_order_public", { p_order_number: orderNumber, p_token: token });
      if (error) return null;
      return (data as OrderSummary | null) ?? null;
    },

    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session?.user.email);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s?.user.email)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("LOGIN|That email and password didn't work. Please try again.");
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async isAdmin() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return false;
      // RLS only returns rows from admin_users to admins, so a non-admin sees nothing.
      const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", u.user.id).maybeSingle();
      return !error && !!data;
    },

    async dashboardStats() {
      const { data, error } = await sb.rpc("admin_dashboard_stats");
      if (error) fail(error);
      return data;
    },

    async saveProduct(id, input) {
      const q = id ? sb.from("products").update(input).eq("id", id) : sb.from("products").insert(input);
      const { data, error } = await q.select(PRODUCT_SELECT).single();
      if (error) fail(error);
      return sortImages(data as Product);
    },

    async deleteProduct(id) {
      const { data: imgs } = await sb.from("product_images").select("storage_path, thumb_path").eq("product_id", id);
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) fail(error);
      const paths = (imgs ?? []).flatMap((i) => [i.storage_path, i.thumb_path]).filter(Boolean) as string[];
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    },

    async bulkUpdateProducts(ids, patch) {
      if (!ids.length) return;
      const { error } = await sb.from("products").update(patch).in("id", ids);
      if (error) fail(error);
    },

    async importProducts(newRows, updates) {
      // Every row in one file has the same columns, so one upsert per group only sets those columns
      // (ON CONFLICT ... DO UPDATE touches only the columns sent; everything else is left as is).
      if (updates.length) {
        const { error } = await sb.from("products").upsert(updates, { onConflict: "slug" });
        if (error) fail(error);
      }
      if (newRows.length) {
        const { error } = await sb.from("products").insert(newRows);
        if (error) fail(error);
      }
      return { created: newRows.length, updated: updates.length };
    },

    async uploadProductImage(productId, full, thumb, alt, sortOrder) {
      const id = crypto.randomUUID();
      const path = `products/${productId}/${id}.webp`;
      const thumbPath = `products/${productId}/${id}-sm.webp`;
      const opts = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
      const up1 = await sb.storage.from(BUCKET).upload(path, full, opts);
      if (up1.error) throw new Error("UPLOAD|The image could not be uploaded. Check that it is a JPG, PNG or WebP under 5 MB.");
      const up2 = await sb.storage.from(BUCKET).upload(thumbPath, thumb, opts);
      if (up2.error) {
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error("UPLOAD|The image could not be uploaded. Please try again.");
      }
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const thumbUrl = sb.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;
      const { data, error } = await sb.from("product_images")
        .insert({ product_id: productId, url, thumb_url: thumbUrl, storage_path: path, thumb_path: thumbPath, alt, sort_order: sortOrder })
        .select("*").single();
      if (error) {
        await sb.storage.from(BUCKET).remove([path, thumbPath]);
        fail(error);
      }
      return data as ProductImage;
    },

    async updateProductImage(id, patch) {
      const { error } = await sb.from("product_images").update(patch).eq("id", id);
      if (error) fail(error);
    },

    async deleteProductImage(img) {
      const { error } = await sb.from("product_images").delete().eq("id", img.id);
      if (error) fail(error);
      const paths = [img.storage_path, img.thumb_path].filter(Boolean) as string[];
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    },

    async saveCategory(id, input) {
      const q = id ? sb.from("categories").update(input).eq("id", id) : sb.from("categories").insert(input);
      const { data, error } = await q.select("*").single();
      if (error) fail(error);
      return data as Category;
    },

    async deleteCategory(id) {
      const { count } = await sb.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
      if (count) throw new Error(`IN_USE|This category still has ${count} product${count === 1 ? "" : "s"}. Move them to another category (or deactivate the category) first.`);
      const { error } = await sb.from("categories").delete().eq("id", id);
      if (error) fail(error);
    },

    async listOrders(filter) {
      let q = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
      if (filter?.status === "open") q = q.in("status", ["pending_confirmation", "awaiting_payment", "confirmed"]);
      else if (filter?.status) q = q.eq("status", filter.status);
      const term = filter?.q?.trim().replace(/[%,()*]/g, "");
      if (term) q = q.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as Order[];
    },

    async getOrder(id) {
      const { data, error } = await sb.from("orders")
        .select("*, items:order_items(*), events:order_events(*)").eq("id", id).maybeSingle();
      if (error) fail(error);
      if (!data) return null;
      const o = data as Order;
      o.events?.sort((a, b) => a.id - b.id);
      return o;
    },

    async updateOrder(id, u) {
      const { error } = await sb.rpc("admin_update_order", {
        p_order_id: id, p_status: u.status, p_payment_status: u.payment_status,
        p_fulfillment_status: u.fulfillment_status, p_internal_notes: u.internal_notes, p_note: u.note,
      });
      if (error) fail(error);
    },

    async cancelStaleOrders(hours) {
      const { data, error } = await sb.rpc("admin_cancel_stale_orders", { p_hours: hours });
      if (error) fail(error);
      return Number(data) || 0;
    },

    async saveSettings(patch) {
      const { data, error } = await sb.from("store_settings").update(patch).eq("id", 1).select("*").single();
      if (error) fail(error);
      return data as StoreSettings;
    },

    async uploadLogo(file) {
      const path = `site/logo-${crypto.randomUUID()}.webp`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw new Error("UPLOAD|The logo could not be uploaded. Please try again.");
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
  };
  return api;
}
