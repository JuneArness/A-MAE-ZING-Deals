import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, Icon, Notice, Spinner } from "../components/ui";
import { dateTime, FULFILLMENT_LABEL, money, PAYMENT_LABEL, STATUS_LABEL, telHref } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import type { OrderSummary } from "../lib/types";

export default function OrderConfirmation() {
  const { number = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const loc = useLocation();
  const { api, settings } = useStore();
  const initial = (loc.state as { summary?: OrderSummary } | null)?.summary;
  const [order, setOrder] = useState<OrderSummary | null | undefined>(initial?.order_number === number ? initial : undefined);
  useSeo({ title: `Order ${number} | ${settings.store_name}`, noindex: true });

  useEffect(() => {
    if (!api || !token) { if (!token) setOrder(null); return; }
    let live = true;
    api.getOrderPublic(number, token).then((o) => { if (live) setOrder(o); }).catch(() => live && setOrder((cur) => cur ?? null));
    return () => { live = false; };
  }, [api, number, token]);

  if (order === undefined) return <Spinner label="Loading your order" />;
  if (!order) {
    return (
      <div className="container-page py-12">
        <EmptyState icon="receipt" title="We couldn't find that order">
          <p>Please use the link from your confirmation page, or call us with your order number.</p>
          <p className="mt-3 font-semibold">{[settings.phone_primary, settings.phone_secondary].filter(Boolean).join(" · ")}</p>
        </EmptyState>
      </div>
    );
  }

  const handoff = order.fulfillment_method === "pickup" ? "when you pick up your order" : "when you receive your order";
  const payNext = order.payment_method === "cash"
    ? `Pay in cash ${handoff}.`
    : order.payment_method === "cash_app"
      ? settings.cashapp_tag ? `After we confirm your order, send payment on Cash App to ${settings.cashapp_tag} and include your order number in the note.` : "After we confirm your order, we'll send our Cash App details. Please don't send payment before then."
      : settings.venmo_username ? `After we confirm your order, send payment on Venmo to ${settings.venmo_username} and include your order number in the note.` : "After we confirm your order, we'll send our Venmo details. Please don't send payment before then.";
  const payLink = order.payment_method === "cash_app" ? settings.cashapp_url : order.payment_method === "venmo" ? settings.venmo_url : "";

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sage-100 text-forest"><Icon name="check" className="h-8 w-8" /></span>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{order.status === "canceled" ? `Order ${order.order_number} was canceled` : `Thanks, ${order.customer_name.split(" ")[0]}! Your order request is in.`}</h1>
        <p className="mt-2 text-muted">Order number</p>
        <p className="text-2xl font-black tracking-wide text-forest" style={{ fontFamily: "var(--font-heading)" }}>{order.order_number}</p>
        <p className="mt-1 text-sm text-muted">Placed {dateTime(order.created_at)} · Status: <b>{STATUS_LABEL[order.status]}</b></p>
      </div>

      <div className="mt-6">
        {order.status === "canceled" ? <Notice tone="warn">This order was canceled. Questions? Call us at {settings.phone_primary}.</Notice>
          : order.payment_status === "paid" ? <Notice tone="ok"><b>Payment received.</b> Thank you! Save this page or write down your order number.</Notice>
          : order.payment_status === "refunded" ? <Notice tone="info">This order's payment was refunded.</Notice>
          : <Notice tone="info"><b>Nothing has been charged.</b> Your order is not paid yet. Save this page or write down your order number.</Notice>}
      </div>

      <section aria-labelledby="next" className="card mt-6 p-5 sm:p-6">
        <h2 id="next" className="text-xl font-extrabold">What happens next</h2>
        <ol className="mt-4 space-y-4">
          <li className="flex gap-3"><span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-forest text-sm font-bold text-white">1</span><span><b>We confirm your order.</b> We'll call or text you to confirm your items, total and {FULFILLMENT_LABEL[order.fulfillment_method].toLowerCase()} details.</span></li>
          <li className="flex gap-3"><span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-forest text-sm font-bold text-white">2</span><span><b>Pay with {PAYMENT_LABEL[order.payment_method]}.</b> {payNext} {payLink && /^https:\/\//.test(payLink) && <a href={payLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest underline">Open {PAYMENT_LABEL[order.payment_method]}<span className="sr-only"> (opens in a new tab)</span></a>}</span></li>
          <li className="flex gap-3"><span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-forest text-sm font-bold text-white">3</span><span><b>{order.fulfillment_method === "pickup" ? "Pick up your order" : "Receive your order"}.</b> Please wait for our confirmation before coming by.</span></li>
        </ol>
      </section>

      <section aria-labelledby="items" className="card mt-6 p-5 sm:p-6">
        <h2 id="items" className="text-xl font-extrabold">Items</h2>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Items in order {order.order_number}</caption>
          <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 font-semibold">Item</th><th className="py-2 text-center font-semibold">Qty</th><th className="py-2 text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.product_name + i.sku} className="border-b border-line/70">
                <td className="py-2.5">{i.product_name}<span className="block text-xs text-muted">{money(i.unit_price_cents)} each</span></td>
                <td className="py-2.5 text-center">{i.quantity}</td>
                <td className="py-2.5 text-right font-semibold">{money(i.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row" colSpan={2} className="pt-3 text-left text-base">Product subtotal</th><td className="pt-3 text-right text-base font-extrabold">{money(order.subtotal_cents)}</td></tr></tfoot>
        </table>
        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">Payment method: </dt><dd className="inline font-semibold">{PAYMENT_LABEL[order.payment_method]}</dd></div>
          <div><dt className="inline text-muted">Fulfillment: </dt><dd className="inline font-semibold">{FULFILLMENT_LABEL[order.fulfillment_method]}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">The store will confirm any sales tax or delivery charge before you pay.</p>
      </section>

      <section aria-labelledby="help" className="mt-6 text-center">
        <h2 id="help" className="text-lg font-extrabold">Questions about your order?</h2>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {[settings.phone_primary, settings.phone_secondary].filter(Boolean).map((p) => <a key={p} href={telHref(p)} className="btn-secondary"><Icon name="phone" className="h-4 w-4" />{p}</a>)}
        </div>
        <Link to="/shop" className="btn-ghost mt-4">Continue shopping</Link>
      </section>
    </div>
  );
}
