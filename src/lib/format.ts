import type { Availability, FulfillmentMethod, FulfillmentStatus, OrderStatus, PaymentMethod, PaymentStatus, Product } from "./types";

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const telHref = (phone: string) => "tel:+1" + phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash_app: "Cash App", venmo: "Venmo", cash: "Cash" };
export const FULFILLMENT_LABEL: Record<FulfillmentMethod, string> = { pickup: "Local pickup", local_delivery: "Local delivery", shipping: "Shipping" };
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_confirmation: "Pending confirmation",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
  canceled: "Canceled",
};
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", paid: "Paid", refunded: "Refunded" };
export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = { not_started: "Not started", ready: "Ready", completed: "Completed" };
export const AVAILABILITY_LABEL: Record<Availability, string> = { available: "Available", unavailable: "Unavailable", demo: "Sample listing" };

export type StockState = "in" | "low" | "out" | "unavailable";

export function stockState(p: Pick<Product, "availability" | "inventory_qty" | "low_stock_threshold">): StockState {
  if (p.availability === "unavailable") return "unavailable";
  if (p.inventory_qty <= 0) return "out";
  if (p.inventory_qty <= p.low_stock_threshold) return "low";
  return "in";
}

export function stockText(p: Pick<Product, "availability" | "inventory_qty" | "low_stock_threshold">): string {
  switch (stockState(p)) {
    case "unavailable": return "Currently unavailable";
    case "out": return "Out of stock";
    case "low": return `Only ${p.inventory_qty} left`;
    default: return "In stock";
  }
}

/** Show a crossed-out "compare at" price only when the owner marked it verified. */
export const showCompare = (p: Pick<Product, "compare_at_cents" | "compare_at_verified" | "price_cents">) =>
  !!p.compare_at_cents && p.compare_at_verified && p.compare_at_cents > p.price_cents;

export const canBuy = (p: Product, demoOrdersAllowed: boolean) =>
  p.is_published && !p.is_archived && p.availability !== "unavailable" && p.inventory_qty > 0 &&
  (p.availability !== "demo" || demoOrdersAllowed);

/** Friendly message from a database error formatted as "CODE|message". */
export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again or call the store."): string {
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  const i = raw.indexOf("|");
  if (i > 0 && /^[A-Z_]+$/.test(raw.slice(0, i))) return raw.slice(i + 1);
  return fallback;
}

/** Short category label for tight menus: "Cleaning Supplies" -> "Cleaning". */
export const shortCategory = (name: string) =>
  name.replace(/\s*&\s*(Living|Household|Essentials)$/i, "").replace(/\s+(Supplies|Essentials|Accessories)$/i, "").trim() || name;
