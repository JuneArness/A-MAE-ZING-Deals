import { Link, useNavigate } from "react-router-dom";
import { EmptyState, Icon, Notice, ProductImage, QuantityStepper, Spinner } from "../components/ui";
import { useCart } from "../lib/cart";
import { canBuy, money, stockText } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

export default function Cart() {
  const { settings, loading } = useStore();
  const cart = useCart();
  const navigate = useNavigate();
  useSeo({ title: `Your cart | ${settings.store_name}`, path: "/cart", noindex: true });

  if (loading) return <Spinner label="Loading your cart" />;

  const problems = cart.rows.filter((r) => !canBuy(r.product, settings.demo_orders_allowed) || r.quantity > r.product.inventory_qty);
  const hasDemo = cart.rows.some((r) => r.product.availability === "demo");

  if (!cart.rows.length) {
    return (
      <div className="container-page py-12">
        <h1 className="sr-only">Your cart</h1>
        <EmptyState icon="cart" title="Your cart is empty">
          <p>Find something you MAE need!</p>
          <Link to="/shop" className="btn-primary mt-4">Shop all deals</Link>
          {cart.missing > 0 && <p className="mt-4 text-sm">{cart.missing} item{cart.missing > 1 ? "s" : ""} from an earlier visit {cart.missing > 1 ? "are" : "is"} no longer available.</p>}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Your cart</h1>
      <p className="mt-1 text-muted">{cart.count} item{cart.count === 1 ? "" : "s"}</p>
      {cart.missing > 0 && <div className="mt-4"><Notice tone="warn">{cart.missing} item{cart.missing > 1 ? "s" : ""} in your cart {cart.missing > 1 ? "are" : "is"} no longer available and won't be ordered. <button type="button" className="font-semibold underline" onClick={() => cart.lines.forEach((l) => !cart.rows.some((r) => r.product.id === l.product_id) && cart.remove(l.product_id))}>Remove</button></Notice></div>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="card min-w-0 divide-y divide-line">
          {cart.rows.map(({ product: p, quantity }) => {
            const buyable = canBuy(p, settings.demo_orders_allowed);
            const max = cart.maxFor(p);
            return (
              <li key={p.id} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                <Link to={`/product/${p.slug}`} className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-cream sm:h-28 sm:w-28" tabIndex={-1} aria-hidden="true"><ProductImage product={p} size="thumb" /></Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link to={`/product/${p.slug}`} className="font-bold hover:text-forest hover:underline">{p.name}</Link>
                    <p className="text-sm text-muted">{money(p.price_cents)} each</p>
                    {!buyable && <p className="mt-1 text-sm font-semibold text-red-700">{stockText(p) === "In stock" ? "Not available to order" : stockText(p)}. Please remove it.</p>}
                    {buyable && quantity > p.inventory_qty && <p className="mt-1 text-sm font-semibold text-red-700">Only {p.inventory_qty} left. Please lower the quantity.</p>}
                    {p.availability === "demo" && <p className="mt-1 text-xs text-[#6d5a1f]">Sample listing: availability confirmed by the store.</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
                    <p className="text-lg font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>{money(p.price_cents * quantity)}</p>
                    <div className="flex items-center gap-2">
                      {buyable && <QuantityStepper value={quantity} max={max} onChange={(n) => cart.setQty(p.id, n)} label={p.name} />}
                      <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-700" onClick={() => cart.remove(p.id)} aria-label={`Remove ${p.name}`}><Icon name="trash" /></button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside aria-labelledby="sum" className="card h-fit p-5 lg:sticky lg:top-40">
          <h2 id="sum" className="text-xl font-extrabold">Order summary</h2>
          <dl className="mt-4 space-y-2">
            <div className="flex justify-between"><dt>Items ({cart.count})</dt><dd className="font-semibold">{money(cart.subtotalCents)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-extrabold"><dt>Product subtotal</dt><dd>{money(cart.subtotalCents)}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-muted">No fees are added online. If any sales tax or delivery charge applies, the store will confirm it with you before you pay.</p>
          {hasDemo && <p className="mt-3 text-sm text-[#6d5a1f]">Your cart includes sample listings. The store will confirm availability.</p>}
          <button type="button" className="btn-primary mt-5 w-full text-base" disabled={problems.length > 0} onClick={() => navigate("/checkout")}>
            Continue to checkout<Icon name="arrow" className="h-4 w-4" />
          </button>
          {problems.length > 0 && <p className="mt-2 text-sm font-semibold text-red-700">Please fix the highlighted items first.</p>}
          <Link to="/shop" className="btn-ghost mt-2 w-full">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
