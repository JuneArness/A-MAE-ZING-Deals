// Shared data shapes. These mirror the database tables in supabase/migrations.

export type Availability = "available" | "unavailable" | "demo";
export type OrderStatus = "pending_confirmation" | "awaiting_payment" | "confirmed" | "fulfilled" | "canceled";
export type PaymentMethod = "cash_app" | "venmo" | "cash";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type FulfillmentMethod = "pickup" | "local_delivery" | "shipping";
export type FulfillmentStatus = "not_started" | "ready" | "completed";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  product_count?: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  thumb_url: string | null;
  storage_path: string | null;
  thumb_path: string | null;
  alt: string;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  compare_at_verified: boolean;
  compare_at_source: string | null;
  sku: string | null;
  inventory_qty: number;
  low_stock_threshold: number;
  availability: Availability;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new: boolean;
  is_published: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  images: ProductImage[];
}

export interface StoreSettings {
  store_name: string;
  legal_name: string;
  slogan: string;
  tagline: string;
  phone_primary: string;
  phone_secondary: string;
  email: string;
  service_area: string;
  logo_url: string;
  announcement_enabled: boolean;
  announcement: string;
  cashapp_tag: string;
  cashapp_url: string;
  venmo_username: string;
  venmo_url: string;
  payment_instructions: string;
  pickup_enabled: boolean;
  pickup_instructions: string;
  delivery_enabled: boolean;
  delivery_area: string;
  delivery_instructions: string;
  shipping_enabled: boolean;
  shipping_instructions: string;
  demo_orders_allowed: boolean;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  policy_privacy: string;
  policy_returns: string;
  policy_cancellation: string;
  policy_fulfillment: string;
  policy_payment: string;
  policies_reviewed: boolean;
  updated_at?: string;
}

export interface CartLine {
  product_id: string;
  quantity: number;
}

export interface CheckoutCustomer {
  name: string;
  phone: string;
  email: string;
  fulfillment_method: FulfillmentMethod;
  payment_method: PaymentMethod;
  notes: string;
}

export interface OrderSummaryItem {
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface OrderSummary {
  order_number: string;
  token: string;
  created_at: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_method: PaymentMethod;
  fulfillment_method: FulfillmentMethod;
  customer_name: string;
  subtotal_cents: number;
  item_count: number;
  items: OrderSummaryItem[];
  duplicate?: boolean;
}

export interface OrderItem extends OrderSummaryItem {
  id: string;
  product_id: string | null;
}

export interface OrderEvent {
  id: number;
  event: string;
  detail: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment_method: FulfillmentMethod;
  payment_method: PaymentMethod;
  notes: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  subtotal_cents: number;
  item_count: number;
  internal_notes: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  events?: OrderEvent[];
}

export interface DashboardStats {
  products_total: number;
  products_published: number;
  products_low: number;
  products_out: number;
  products_demo: number;
  orders_pending: number;
  orders_confirmed: number;
  orders_fulfilled: number;
  paid_revenue_cents: number;
  paid_orders: number;
}

/** Editable product fields (admin form / CSV import). */
export type ProductInput = Omit<Product, "id" | "created_at" | "updated_at" | "images">;
export type CategoryInput = Omit<Category, "id" | "product_count">;

export interface OrderUpdate {
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  internal_notes: string;
  note: string;
}
