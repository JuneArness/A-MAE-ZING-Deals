import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Icon, Notice, Spinner } from "../components/ui";
import { useCart } from "../lib/cart";
import { canBuy, FULFILLMENT_LABEL, friendlyError, money, PAYMENT_LABEL } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import type { CheckoutCustomer, FulfillmentMethod, PaymentMethod } from "../lib/types";
import { checkoutSchema, fieldErrors } from "../lib/validation";

export default function Checkout() {
  const { settings, api, loading, reload } = useStore();
  const cart = useCart();
  const navigate = useNavigate();
  useSeo({ title: `Checkout | ${settings.store_name}`, path: "/checkout", noindex: true });

  const fulfillOptions = useMemo(() => ([
    ["pickup", settings.pickup_enabled, settings.pickup_instructions || `Pick up in ${settings.service_area}. We'll confirm the exact place and time with you.`],
    ["local_delivery", settings.delivery_enabled, [settings.delivery_area && `Delivery area: ${settings.delivery_area}.`, settings.delivery_instructions].filter(Boolean).join(" ") || "We'll confirm delivery details with you."],
    ["shipping", settings.shipping_enabled, settings.shipping_instructions || "We'll confirm shipping details with you."],
  ] as [FulfillmentMethod, boolean, string][]).filter(([, on]) => on), [settings]);

  const [form, setForm] = useState<CheckoutCustomer>({ name: "", phone: "", email: "", fulfillment_method: "pickup", payment_method: "cash", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: a double-click or a retry after a network blip can't create two orders.
  const keyRef = useRef<string>(crypto.randomUUID());
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fulfillOptions.length && !fulfillOptions.some(([k]) => k === form.fulfillment_method)) setForm((f) => ({ ...f, fulfillment_method: fulfillOptions[0][0] }));
  }, [fulfillOptions, form.fulfillment_method]);

  if (loading) return <Spinner label="Loading checkout" />;
  if (!cart.rows.length && !submitting) return <Navigate to="/cart" replace />;

  const blocked = cart.rows.some((r) => !canBuy(r.product, settings.demo_orders_allowed) || r.quantity > r.product.inventory_qty);
  const set = <K extends keyof CheckoutCustomer>(k: K, v: CheckoutCustomer[K]) => { setForm((f) => ({ ...f, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: "" })); };

  const payInfo: Record<PaymentMethod, string> = {
    cash_app: settings.cashapp_tag ? `Cash App: ${settings.cashapp_tag}. Send payment only after we confirm your order.` : "We'll send our Cash App details when we confirm your order.",
    venmo: settings.venmo_username ? `Venmo: ${settings.venmo_username}. Send payment only after we confirm your order.` : "We'll send our Venmo details when we confirm your order.",
    cash: form.fulfillment_method === "pickup" ? "Pay in cash when you pick up your order." : "Pay in cash when you receive your order.",
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !api) return;
    setServerError("");
    const parsed = checkoutSchema.safeParse(form);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      const first = Object.keys(fe)[0];
      document.getElementById(`co-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const summary = await api.placeOrder(cart.rows.map((r) => ({ product_id: r.product.id, quantity: r.quantity })), { ...parsed.data, notes: parsed.data.notes }, keyRef.current);
      cart.clear();
      void reload(); // refresh stock numbers
      navigate(`/order/${encodeURIComponent(summary.order_number)}?t=${encodeURIComponent(summary.token)}`, { replace: true, state: { summary } });
    } catch (err) {
      setServerError(friendlyError(err, "We couldn't place your order. Please check your connection and try again, or call the store."));
      setSubmitting(false);
      void reload();
      setTimeout(() => errorRef.current?.focus(), 30);
    }
  }

  const err = (k: string) => errors[k] ? <p id={`co-${k}-err`} className="field-error">{errors[k]}</p> : null;
  const aria = (k: string) => ({ "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `co-${k}-err` : undefined });

  return (
    <div className="container-page py-8">
      <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:underline"><Icon name="back" className="h-4 w-4" />Back to cart</Link>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Checkout</h1>
      <p className="mt-1 text-muted">No card needed. Place your order, and we'll contact you to confirm it before you pay.</p>

      <form onSubmit={submit} noValidate className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {serverError && <div ref={errorRef} tabIndex={-1}><Notice tone="error">{serverError}{/stock|available|cart/i.test(serverError) && <> <Link className="font-semibold underline" to="/cart">Review your cart</Link></>}</Notice></div>}

          <fieldset className="card p-5 sm:p-6">
            <legend className="px-1 text-lg font-extrabold">Your details</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="co-name">Full name</label>
                <input id="co-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} required {...aria("name")} />{err("name")}
              </div>
              <div>
                <label className="label" htmlFor="co-phone">Phone number</label>
                <input id="co-phone" className="input" type="tel" autoComplete="tel" inputMode="tel" placeholder="(616) 555-0123" value={form.phone} onChange={(e) => set("phone", e.target.value)} required {...aria("phone")} />{err("phone")}
                <p className="mt-1 text-xs text-muted">We'll call or text this number to confirm your order.</p>
              </div>
              <div>
                <label className="label" htmlFor="co-email">Email <span className="font-normal text-muted">(optional)</span></label>
                <input id="co-email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} {...aria("email")} />{err("email")}
              </div>
            </div>
          </fieldset>

          <fieldset className="card p-5 sm:p-6">
            <legend className="px-1 text-lg font-extrabold">Pickup or delivery</legend>
            {fulfillOptions.length === 0 ? <Notice tone="warn">Online ordering is paused right now. Please call the store.</Notice> : (
              <div className="mt-2 space-y-3" role="radiogroup" aria-describedby={errors.fulfillment_method ? "co-fulfillment_method-err" : undefined}>
                {fulfillOptions.map(([k, , info], i) => (
                  <label key={k} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${form.fulfillment_method === k ? "border-forest bg-sage-50" : "border-line"}`}>
                    <input id={i === 0 ? "co-fulfillment_method" : undefined} type="radio" name="fulfillment" value={k} checked={form.fulfillment_method === k} onChange={() => set("fulfillment_method", k)} className="mt-1 h-5 w-5 accent-[#2f5d46]" />
                    <span><b className="block">{FULFILLMENT_LABEL[k]}</b><span className="text-sm text-muted">{info}</span></span>
                  </label>
                ))}
                {err("fulfillment_method")}
              </div>
            )}
          </fieldset>

          <fieldset className="card p-5 sm:p-6">
            <legend className="px-1 text-lg font-extrabold">How you'll pay</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3" role="radiogroup">
              {(["cash_app", "venmo", "cash"] as PaymentMethod[]).map((k, i) => (
                <label key={k} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 font-bold ${form.payment_method === k ? "border-forest bg-sage-50" : "border-line"}`}>
                  <input id={i === 0 ? "co-payment_method" : undefined} type="radio" name="payment" value={k} checked={form.payment_method === k} onChange={() => set("payment_method", k)} className="h-5 w-5 accent-[#2f5d46]" />
                  {PAYMENT_LABEL[k]}
                </label>
              ))}
            </div>
            {err("payment_method")}
            <p className="mt-3 rounded-xl bg-cream px-4 py-3 text-sm">{payInfo[form.payment_method]}</p>
            {settings.payment_instructions && <p className="mt-2 whitespace-pre-line text-sm text-muted">{settings.payment_instructions}</p>}
          </fieldset>

          <div className="card p-5 sm:p-6">
            <label className="label text-lg font-extrabold" htmlFor="co-notes">Order notes <span className="text-sm font-normal text-muted">(optional)</span></label>
            <textarea id="co-notes" className="input min-h-28" maxLength={1000} placeholder="Best time to reach you, pickup preferences, questions…" value={form.notes} onChange={(e) => set("notes", e.target.value)} {...aria("notes")} />{err("notes")}
          </div>
        </div>

        <aside aria-labelledby="rev" className="card h-fit p-5 lg:sticky lg:top-40">
          <h2 id="rev" className="text-xl font-extrabold">Your order</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {cart.rows.map((r) => (
              <li key={r.product.id} className="flex justify-between gap-3">
                <span><span className="font-semibold">{r.quantity} ×</span> {r.product.name}</span>
                <span className="font-semibold">{money(r.product.price_cents * r.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-line pt-3 text-lg font-extrabold"><span>Product subtotal</span><span>{money(cart.subtotalCents)}</span></div>
          <p className="mt-2 text-xs text-muted">Prices and stock are confirmed by our system when you place the order. No fees are added online; the store will confirm any sales tax or delivery charge before you pay.</p>
          <button type="submit" className="btn-primary mt-5 w-full text-base" disabled={submitting || blocked || fulfillOptions.length === 0}>
            {submitting ? "Placing order…" : "Place order request"}
          </button>
          {blocked && <p className="mt-2 text-sm font-semibold text-red-700">Some items need attention. <Link to="/cart" className="underline">Review your cart</Link></p>}
          <p className="mt-3 text-xs text-muted">By placing an order you agree to our <Link className="underline" to="/policies/cancellation">cancellation</Link> and <Link className="underline" to="/policies/returns">returns</Link> policies. Nothing is charged online.</p>
        </aside>
      </form>
    </div>
  );
}
