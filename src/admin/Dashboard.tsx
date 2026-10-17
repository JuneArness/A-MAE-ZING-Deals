import { Link } from "react-router-dom";
import { Icon, Notice, Spinner } from "../components/ui";
import { dateTime, money } from "../lib/format";
import { useStore } from "../lib/store";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";
import { StatusPill } from "./Orders";

export default function Dashboard() {
  const { api, settings } = useStore();
  const stats = useLoad(() => api!.dashboardStats(), [api]);
  const recent = useLoad(() => api!.listOrders(), [api]);
  const products = useLoad(() => api!.listProducts({ admin: true }), [api]);

  if (stats.loading && !stats.data) return <Spinner label="Loading overview" />;
  if (stats.error) return <Notice tone="error">{stats.error}</Notice>;
  const s = stats.data!;
  const low = (products.data ?? []).filter((p) => !p.is_archived && p.inventory_qty <= p.low_stock_threshold).sort((a, b) => a.inventory_qty - b.inventory_qty).slice(0, 8);

  const card = (label: string, value: string | number, to: string, tone = "") => (
    <Link to={to} className={`card block p-4 transition-colors hover:border-forest/40 ${tone}`}>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-black" style={{ fontFamily: "var(--font-heading)" }}>{value}</p>
    </Link>
  );

  const setupTasks = [
    [!settings.cashapp_tag && !settings.venmo_username, "Add your verified Cash App and/or Venmo details", "/admin/settings"],
    [!settings.policies_reviewed, "Review and approve the draft store policies", "/admin/settings#policies"],
    [s.products_demo > 0, `${s.products_demo} products are still sample listings: confirm stock, add photos, then mark them Available`, "/admin/products?status=demo"],
    [!settings.pickup_instructions, "Add pickup instructions (where and when customers collect orders)", "/admin/settings#fulfillment"],
  ].filter(([show]) => show) as [boolean, string, string][];

  return (
    <>
      <PageHeader title="Overview"><Link to="/admin/products/new" className="btn-primary"><Icon name="plus" className="h-4 w-4" />Add product</Link></PageHeader>

      {setupTasks.length > 0 && (
        <section aria-labelledby="setup" className="card mb-6 border-[#e5d29a] bg-[#fffbef] p-5">
          <h2 id="setup" className="text-lg font-extrabold">Before you launch</h2>
          <ul className="mt-2 space-y-1.5">
            {setupTasks.map(([, t, to]) => <li key={t}><Link to={to} className="inline-flex items-start gap-2 text-[#5c4a12] hover:underline"><span aria-hidden="true">○</span>{t}</Link></li>)}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">Orders</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card("Pending orders", s.orders_pending, "/admin/orders?status=open", s.orders_pending ? "border-coral/50 bg-coral-50" : "")}
        {card("Confirmed", s.orders_confirmed, "/admin/orders?status=confirmed")}
        {card("Fulfilled", s.orders_fulfilled, "/admin/orders?status=fulfilled")}
        {card("Paid sales (recorded)", money(s.paid_revenue_cents), "/admin/orders")}
      </div>
      <p className="mt-2 text-xs text-muted">Paid sales count only orders you marked <b>Paid</b> that aren't canceled ({s.paid_orders} order{s.paid_orders === 1 ? "" : "s"}). Pending orders are not sales yet.</p>

      <h2 className="mb-3 mt-8 text-sm font-extrabold uppercase tracking-wider text-muted">Products</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card("Total products", s.products_total, "/admin/products")}
        {card("Published", s.products_published, "/admin/products?status=published")}
        {card("Low stock", s.products_low, "/admin/products?status=low", s.products_low ? "border-[#e5d29a] bg-[#fffbef]" : "")}
        {card("Out of stock", s.products_out, "/admin/products?status=out", s.products_out ? "border-red-200 bg-red-50" : "")}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="recent" className="card p-5">
          <div className="flex items-center justify-between"><h2 id="recent" className="text-lg font-extrabold">Recent orders</h2><Link to="/admin/orders" className="text-sm font-semibold text-forest hover:underline">All orders</Link></div>
          {recent.loading ? <Spinner /> : !(recent.data ?? []).length ? <p className="mt-3 text-muted">No orders yet.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {recent.data!.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-sage-50">
                    <span><b>{o.order_number}</b> · {o.customer_name}<span className="block text-xs text-muted">{dateTime(o.created_at)}</span></span>
                    <span className="flex items-center gap-3"><StatusPill status={o.status} /><b>{money(o.subtotal_cents)}</b></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="lowstock" className="card p-5">
          <h2 id="lowstock" className="text-lg font-extrabold">Low or out of stock</h2>
          {!low.length ? <p className="mt-3 text-muted">Everything is above its low-stock level.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {low.map((p) => (
                <li key={p.id}><Link to={`/admin/products/${p.id}`} className="flex justify-between gap-3 py-2.5 hover:bg-sage-50"><span>{p.name}</span><b className={p.inventory_qty === 0 ? "text-red-700" : "text-coral-dark"}>{p.inventory_qty}</b></Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
