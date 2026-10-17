// Form rules shared by checkout, the admin product form and CSV import.
// The database applies the same limits again, so these are for friendly messages.
import { z } from "zod";

export const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100, "Please use 100 characters or fewer."),
  phone: z.string().trim().max(30, "Please enter a valid phone number.")
    .refine((v) => { const d = v.replace(/\D/g, ""); return d.length >= 10 && d.length <= 15; }, "Please enter a valid phone number with area code."),
  email: z.string().trim().max(200).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v), "Please enter a valid email address, or leave it blank."),
  fulfillment_method: z.enum(["pickup", "local_delivery", "shipping"], { message: "Please choose pickup or delivery." }),
  payment_method: z.enum(["cash_app", "venmo", "cash"], { message: "Please choose how you'll pay." }),
  notes: z.string().trim().max(1000, "Notes must be 1,000 characters or fewer."),
});

const slugRule = z.string().trim().min(1, "Required").max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes only.");
const dollars = (msg: string) => z.coerce.number({ message: msg }).finite(msg);

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(120, "Keep the name under 120 characters."),
  slug: slugRule,
  description: z.string().trim().max(4000, "Description is too long (4,000 characters max)."),
  category_id: z.string().uuid("Choose a category."),
  price: dollars("Enter a price like 4.99.").min(0.01, "Price must be at least $0.01.").max(1000, "Price looks too high."),
  compare_at: z.union([z.literal(""), dollars("Enter a price like 9.99.").min(0.01)]),
  compare_at_verified: z.boolean(),
  compare_at_source: z.string().trim().max(300),
  sku: z.string().trim().max(64, "SKU must be 64 characters or fewer."),
  inventory_qty: z.coerce.number().int("Whole numbers only.").min(0, "Can't be negative.").max(100000),
  low_stock_threshold: z.coerce.number().int("Whole numbers only.").min(0).max(1000),
  availability: z.enum(["available", "unavailable", "demo"]),
  is_featured: z.boolean(), is_bestseller: z.boolean(), is_new: z.boolean(), is_published: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.compare_at !== "" && Number(v.compare_at) <= v.price) ctx.addIssue({ code: "custom", path: ["compare_at"], message: "Compare-at price must be higher than the selling price." });
  if (v.compare_at_verified && v.compare_at === "") ctx.addIssue({ code: "custom", path: ["compare_at"], message: "Enter the compare-at price you verified." });
  if (v.compare_at_verified && !v.compare_at_source) ctx.addIssue({ code: "custom", path: ["compare_at_source"], message: "Note where the comparison price came from (store and date)." });
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  slug: slugRule,
  description: z.string().trim().max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color."),
  sort_order: z.coerce.number().int().min(0).max(10000),
  is_active: z.boolean(),
});

/** Collects zod issues into { field: message }. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) { const k = String(i.path[0] ?? "_"); if (!out[k]) out[k] = i.message; }
  return out;
}

export const toCents = (dollarsValue: number | string) => Math.round(Number(dollarsValue) * 100);
