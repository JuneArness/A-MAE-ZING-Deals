// One interface, two implementations:
//  - supabaseApi: the real store (database, logins, image storage).
//  - demoApi: browser-only preview used by `npm run dev:demo` and automated tests.
// The rest of the app only talks to `api`, so both behave the same way.
import type {
  CartLine, Category, CategoryInput, CheckoutCustomer, DashboardStats, Order, OrderSummary,
  OrderUpdate, OrderStatus, Product, ProductImage, ProductInput, StoreSettings,
} from "./types";

export interface Session { email: string; }
export type ProductUpdate = Partial<ProductInput> & { slug: string };

export interface OrderFilter { status?: OrderStatus | "open" | ""; q?: string; }

export interface Api {
  mode: "supabase" | "demo";
  // storefront
  getSettings(): Promise<StoreSettings>;
  listCategories(opts?: { includeInactive?: boolean }): Promise<Category[]>;
  listProducts(opts?: { admin?: boolean }): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  placeOrder(items: CartLine[], customer: CheckoutCustomer, key: string): Promise<OrderSummary>;
  getOrderPublic(orderNumber: string, token: string): Promise<OrderSummary | null>;
  // auth
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  isAdmin(): Promise<boolean>;
  // admin
  dashboardStats(): Promise<DashboardStats>;
  getProductById(id: string): Promise<Product | null>;
  saveProduct(id: string | null, input: ProductInput): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  bulkUpdateProducts(ids: string[], patch: Partial<ProductInput>): Promise<void>;
  /** New products get every field; updates only change the columns that were in the file. */
  importProducts(newRows: ProductInput[], updates: ProductUpdate[]): Promise<{ created: number; updated: number }>;
  uploadProductImage(productId: string, full: Blob, thumb: Blob, alt: string, sortOrder: number): Promise<ProductImage>;
  updateProductImage(id: string, patch: { alt?: string; sort_order?: number }): Promise<void>;
  deleteProductImage(img: ProductImage): Promise<void>;
  saveCategory(id: string | null, input: CategoryInput): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  listOrders(filter?: OrderFilter): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  updateOrder(id: string, update: OrderUpdate): Promise<void>;
  cancelStaleOrders(hours: number): Promise<number>;
  saveSettings(patch: Partial<StoreSettings>): Promise<StoreSettings>;
  uploadLogo(file: Blob): Promise<string>;
}

/** Site folder on the host ("/" or "/A-MAE-ZING-Deals/"). */
export const BASE: string = import.meta.env.BASE_URL;
/** Turns "/brand/x.webp" into a path that works under BASE. */
export const asset = (p: string) => BASE.replace(/\/$/, "") + p;

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "").replace(/\/+$/, "");
export const CONFIGURED = DEMO_MODE || (/^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20);

let instance: Promise<Api> | null = null;

/** Lazily loads the right implementation (keeps the demo code out of the real store's bundle). */
export function getApi(): Promise<Api> {
  if (!instance) {
    instance = DEMO_MODE
      ? import("./demoApi").then((m) => m.createDemoApi())
      : import("./supabaseApi").then((m) => m.createSupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return instance;
}

export function sortImages(p: Product): Product {
  return { ...p, images: [...(p.images ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}
