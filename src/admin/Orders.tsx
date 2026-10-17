import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Notice, Spinner } from "../components/ui";
import {
  dateTime, FULFILLMENT_LABEL, FULFILLMENT_STATUS_LABEL, friendlyError, money, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, telHref,
} from "../lib/format";
import { useStore } from "../lib/store";
import type { FulfillmentStatus, OrderStatus, OrderUpdate, PaymentStatus } from "../lib/types";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";

const STATUS_CLS: Record<OrderStatus, string> = {
  pending_confirmation: "bg-coral-50 text-coral-dark", awaiting_payment: "bg-[#fdf7e6] text-[#6d5a1f]",
  confirmed: "bg-sage-100 text-forest-dark", fulfilled: "bg-forest text-white", canceled: "bg-[#efedea] text-muted",
};
export const StatusPill = ({ status }: { status: OrderStatus }) => <span className={`chip ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>;

export function Orders() {
  const { api } = useStore();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "") as OrderStatus | "open" | "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const orders = useLoad(() => api!.listOrders({ status, q: params.get("q") ?? "" }), [api, status, params.get("q")]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };
  const toast = useToast();
  const [cleanup, setCleanup] = useState("");
  async function cancelStale() {
    if (!api || !window.confirm("Cancel every UNPAID order that has waited more than 48 hours for confirmation or payment? Their items go back into stock.")) return;
    try { const n = await api.cancelStaleOrders(48); toast(n ? `${n} stale order${n === 1 ? "" : "s"} canceled.` : "No stale orders to cancel."); setCleanup(""); await orders.reload(); }
    catch (e) { setCleanup(friendlyError(e)); }
  }

  return (
    <>
      <PageHeader title="Orders"><button type="button" className="btn-secondary" onClick={cancelStale}>Cancel stale unpaid orders</button></PageHeader>
      {cleanup && <div className="mb-4"><Notice tone="error">{cleanup}</Notice></div>}
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]" onSubmit={(e) => { e.preventDefault(); set("q", q.trim()); }}>
        <div><label htmlFor="o-q" className="sr-only">Search orders</label><input id="o-q" type="search" className="input" placeholder="Order number, name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label htmlFor="o-status" className="sr-only">Status</label>
          <select id="o-status" className="input" value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All orders</option><option value="open">Open (not fulfilled or canceled)</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></div>
        <button className="btn-primary">Search</button>
      </form>
      {orders.error && <Notice tone="error">{orders.error}</Notice>}
      {orders.loading && !orders.data ? <Spinner label="Loading orders" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Orders</caption>
            <thead className="border-b border-line text-left text-muted"><tr><th className="p-3 font-semibold">Order</th><th className="p-3 font-semibold">Customer</th><th className="p-3 font-semibold">Total</th><th className="p-3 font-semibold">Payment</th><th className="p-3 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(orders.data ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-[#faf8f2]">
                  <td className="p-3"><Link to={`/admin/orders/${o.id}`} className="font-bold text-forest hover:underline">{o.order_number}</Link><span className="block text-xs text-muted">{dateTime(o.created_at)}</span></td>
                  <td className="p-3">{o.customer_name}<span className="block text-xs text-muted">{o.customer_phone}</span></td>
                  <td className="p-3 font-semibold">{money(o.subtotal_cents)}<span className="block text-xs font-normal text-muted">{o.item_count} item{o.item_count === 1 ? "" : "s"}</span></td>
                  <td className="p-3">{PAYMENT_LABEL[o.payment_method]}<span className="block text-xs text-muted">{PAYMENT_STATUS_LABEL[o.payment_status]}</span></td>
                  <td className="p-3"><StatusPill status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(orders.data ?? []).length && <p className="p-6 text-center text-muted">No orders found.</p>}
        </div>
      )}
    </>
  );
}

export function OrderDetail() {
  const { id = "" } = useParams();
  const { api, reload: reloadStore } = useStore();
  const toast = useToast();
  const order = useLoad(() => api!.getOrder(id), [api, id]);
  const [form, setForm] = useState<OrderUpdate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const o = order.data;

  useEffect(() => {
    if (o) setForm({ status: o.status, payment_status: o.payment_status, fulfillment_status: o.fulfillment_status, internal_notes: o.internal_notes ?? "", note: "" });
  }, [o]);

  async function save(e: FormEvent, override?: Partial<OrderUpdate>) {
    e.preventDefault();
    if (!api || !form || !o || busy) return;
    const next = { ...form, ...override };
    if (next.status === "canceled" && o.status !== "canceled" && !window.confirm("Cancel this order? Its items will be added back to stock. A canceled order can't be reopened.")) return;
    setBusy(true); setError("");
    try { await api.updateOrder(o.id, next); toast("Order updated."); await order.reload(); void reloadStore(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }

  if (order.loading && !o) return <Spinner label="Loading order" />;
  if (!o || !form) return <Notice tone="error">{order.error || "Order not found."} <Link className="underline" to="/admin/orders">Back to orders</Link></Notice>;
  const canceled = o.status === "canceled";

  return (
    <>
      <PageHeader title={`Order ${o.order_number}`} back={["/admin/orders", "All orders"]}><StatusPill status={o.status} /></PageHeader>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="od-cust">
            <h2 id="od-cust" className="text-lg font-extrabold">Customer</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Name</dt><dd className="font-semibold">{o.customer_name}</dd>
              <dt className="text-muted">Phone</dt><dd><a href={telHref(o.customer_phone)} className="font-semibold text-forest underline">{o.customer_phone}</a></dd>
              {o.customer_email && <><dt className="text-muted">Email</dt><dd><a href={`mailto:${o.customer_email}`} className="text-forest underline">{o.customer_email}</a></dd></>}
              <dt className="text-muted">Fulfillment</dt><dd>{FULFILLMENT_LABEL[o.fulfillment_method]}</dd>
              <dt className="text-muted">Pays with</dt><dd>{PAYMENT_LABEL[o.payment_method]}</dd>
              <dt className="text-muted">Placed</dt><dd>{dateTime(o.created_at)}</dd>
            </dl>
            {o.notes && <div className="mt-4 rounded-xl bg-cream p-3 text-sm"><b>Customer note:</b> <span className="whitespace-pre-line">{o.notes}</span></div>}
          </section>

          <section className="card p-5" aria-labelledby="od-items">
            <h2 id="od-items" className="text-lg font-extrabold">Items</h2>
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Items</caption>
              <thead className="border-b border-line text-left text-muted"><tr><th className="py-2 font-semibold">Item</th><th className="py-2 text-center font-semibold">Qty</th><th className="py-2 text-right font-semibold">Each</th><th className="py-2 text-right font-semibold">Total</th></tr></thead>
              <tbody className="divide-y divide-line">
                {(o.items ?? []).map((i) => (
                  <tr key={i.id}><td className="py-2">{i.product_id ? <Link to={`/admin/products/${i.product_id}`} className="hover:underline">{i.product_name}</Link> : i.product_name}{i.sku && <span className="block text-xs text-muted">{i.sku}</span>}</td>
                    <td className="py-2 text-center">{i.quantity}</td><td className="py-2 text-right">{money(i.unit_price_cents)}</td><td className="py-2 text-right font-semibold">{money(i.line_total_cents)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={3} scope="row" className="pt-3 text-left">Product subtotal</th><td className="pt-3 text-right text-base font-extrabold">{money(o.subtotal_cents)}</td></tr></tfoot>
            </table>
          </section>

          <section className="card p-5" aria-labelledby="od-hist">
            <h2 id="od-hist" className="text-lg font-extrabold">History</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {(o.events ?? []).map((ev) => (
                <li key={ev.id} className="flex gap-3"><span className="w-36 flex-none text-muted">{dateTime(ev.created_at)}</span>
                  <span><b className="capitalize">{ev.event}</b>{ev.detail ? `: ${ev.detail}` : ""}</span></li>
              ))}
            </ol>
          </section>
        </div>

        <form onSubmit={save} className="card h-fit space-y-4 p-5 xl:sticky xl:top-6" aria-labelledby="od-manage">
          <h2 id="od-manage" className="text-lg font-extrabold">Manage order</h2>
          {canceled && <Notice tone="warn">This order is canceled. Its items were returned to stock.</Notice>}
          <div><label className="label" htmlFor="od-status">Order status</label>
            <select id="od-status" className="input" value={form.status} disabled={canceled} onChange={(e) => setForm({ ...form, status: e.target.value as OrderStatus })}>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="od-pay">Payment</label>
            <select id="od-pay" className="input" value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value as PaymentStatus })}>
              {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">Mark Paid only after you've seen the money arrive.</p></div>
          <div><label className="label" htmlFor="od-ful">Fulfillment</label>
            <select id="od-ful" className="input" value={form.fulfillment_status} onChange={(e) => setForm({ ...form, fulfillment_status: e.target.value as FulfillmentStatus })}>
              {(Object.keys(FULFILLMENT_STATUS_LABEL) as FulfillmentStatus[]).map((s) => <option key={s} value={s}>{FULFILLMENT_STATUS_LABEL[s]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="od-int">Internal notes <span className="font-normal text-muted">(only you see these)</span></label>
            <textarea id="od-int" className="input min-h-24" maxLength={4000} value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} /></div>
          <div><label className="label" htmlFor="od-note">Add to history <span className="font-normal text-muted">(optional)</span></label>
            <input id="od-note" className="input" maxLength={1000} placeholder="e.g. Called customer, pickup Saturday" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          {!canceled && o.status !== "fulfilled" && <button type="button" className="btn-danger w-full" disabled={busy} onClick={(e) => save(e as unknown as FormEvent, { status: "canceled" })}>Cancel order…</button>}
        </form>
      </div>
    </>
  );
}
