// Default store settings and DRAFT policy text.
// Policies are shown with a "draft" note until the owner reviews them and ticks
// "Policies reviewed" in Admin → Settings. They are plain-language drafts, not legal advice.
import type { StoreSettings } from "../lib/types";

export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: "A MAE Zing Deals",
  legal_name: "A MAE Zing Deals LLC",
  slogan: "Everyday Home Essentials You MAE Need!",
  tagline: "Big Everyday Savings. Little Everyday Prices.",
  phone_primary: "(616) 719-7033",
  phone_secondary: "(269) 838-0075",
  email: "",
  service_area: "S.E. Grand Rapids, Michigan",
  logo_url: "",
  announcement_enabled: true,
  announcement: "Everyday home essentials from $1 to $20. Local to S.E. Grand Rapids.",
  cashapp_tag: "",
  cashapp_url: "",
  venmo_username: "",
  venmo_url: "",
  payment_instructions: "",
  pickup_enabled: true,
  pickup_instructions: "",
  delivery_enabled: false,
  delivery_area: "",
  delivery_instructions: "",
  shipping_enabled: false,
  shipping_instructions: "",
  demo_orders_allowed: false,
  facebook_url: "",
  instagram_url: "",
  tiktok_url: "",
  policy_privacy: "",
  policy_returns: "",
  policy_cancellation: "",
  policy_fulfillment: "",
  policy_payment: "",
  policies_reviewed: false,
  founders: "Stephen A. Parks Jr. & Gina P. McCoy",
  about_text: "A MAE Zing Deals is owned and run by Stephen A. Parks Jr. and Gina P. McCoy, an engaged couple building a friendly neighborhood store for S.E. Grand Rapids. We started it to make everyday home essentials easy to find and easy on the budget.",
};

export type PolicyKey = "privacy" | "returns" | "cancellation" | "fulfillment" | "payment";

export const POLICY_TITLES: Record<PolicyKey, string> = {
  privacy: "Privacy Policy",
  returns: "Returns & Exchanges",
  cancellation: "Order Cancellation",
  fulfillment: "Pickup & Fulfillment",
  payment: "Payment Instructions",
};

export const DRAFT_POLICIES: Record<PolicyKey, string> = {
  privacy: `We collect only the information needed to fill your order: your name, phone number, and (if you choose to share it) your email address, along with the items you order and your notes.

We use this information to confirm your order, arrange pickup or delivery, and contact you about your order. We do not sell your information.

We do not collect or store card numbers or bank details on this website. Payments are made through Cash App, Venmo, or in cash, and those services have their own privacy policies.

To ask about or remove your information, call or text us using the numbers on this site.`,
  returns: `Unused items in their original condition may be returned or exchanged within 7 days with your order number.

Items that have been used, damaged after purchase, or are personal-care items that have been opened may not be eligible for return for hygiene reasons.

To start a return or exchange, contact us by phone. Refunds are made using the original payment method when possible.`,
  cancellation: `You may cancel an order any time before it is picked up or delivered by calling or texting us with your order number.

If you already paid, we will refund you using the original payment method. We may cancel an order if an item is no longer available; if that happens, we will contact you and refund any payment.`,
  fulfillment: `Orders are currently available for local pickup in S.E. Grand Rapids, Michigan. After you place an order, we will contact you to confirm your items and share the pickup details and time.

Please do not come to pick up an order until we have confirmed it with you.`,
  payment: `We accept Cash App, Venmo, and cash. After you place an order, we will confirm your items and total, then share how to pay.

Please send payment only after we confirm your order. Include your order number in the payment note. We will never ask for your card number, bank login, or password.`,
};

export function policyText(s: StoreSettings, key: PolicyKey): string {
  const map: Record<PolicyKey, string> = {
    privacy: s.policy_privacy, returns: s.policy_returns, cancellation: s.policy_cancellation,
    fulfillment: s.policy_fulfillment, payment: s.policy_payment,
  };
  return map[key]?.trim() || DRAFT_POLICIES[key];
}
