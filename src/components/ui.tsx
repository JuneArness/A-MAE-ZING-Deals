// Small shared building blocks.
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../lib/cart";
import { canBuy, money, showCompare, stockState, stockText } from "../lib/format";
import { placeholderIcon } from "../lib/placeholder";
import { useStore } from "../lib/store";
import type { Product } from "../lib/types";
import { useToast } from "./Toast";

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cart: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20.5" r="1" /><circle cx="17" cy="20.5" r="1" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  phone: <path d="M5 3h3.6l1.9 4.8-2.4 1.5a11.3 11.3 0 0 0 6.6 6.6l1.5-2.4L21 15.4V19a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 3 5.2 2 2 0 0 1 5 3z" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  bag: <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></>,
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  box: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
  sparkle: <path d="M12 3c1 4 3 6 7 7-4 1-6 3-7 7-1-4-3-6-7-7 4-1 6-3 7-7z" />,
} as const;

export function ProductImage({ product, size = "card", className = "" }: { product: Product; size?: "card" | "full" | "thumb"; className?: string }) {
  const { categoryById } = useStore();
  const img = product.images[0];
  const cat = categoryById(product.category_id);
  if (img) {
    const src = size === "full" ? img.url : img.thumb_url || img.url;
    return (
      <img src={src} alt={img.alt || product.name} loading={size === "full" ? "eager" : "lazy"} decoding="async"
        className={`h-full w-full object-cover ${className}`} width={size === "full" ? 1200 : 480} height={size === "full" ? 1200 : 480} />
    );
  }
  const color = cat?.color ?? "#3f7a5a";
  return (
    <div role="img" aria-label={`${product.name} (photo coming soon)`}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(circle at 30% 25%, ${color}26, transparent 60%), linear-gradient(160deg, ${color}1f, ${color}38)` }}>
      <span className={size === "thumb" ? "text-2xl" : size === "full" ? "text-[7rem]" : "text-6xl"} style={{ filter: "saturate(0.9)" }} aria-hidden="true">
        {placeholderIcon(product.name, cat?.slug)}
      </span>
      {size !== "thumb" && (
        <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[0.68rem] font-semibold text-muted">Photo coming soon</span>
      )}
    </div>
  );
}

export function Price({ product, large = false }: { product: Product; large?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={`font-black text-forest ${large ? "text-4xl" : "text-2xl"}`} style={{ fontFamily: "var(--font-heading)" }}>
        {money(product.price_cents)}
      </span>
      {showCompare(product) && (
        <span className="text-sm text-muted">
          <span className="sr-only">Compare at </span>
          <s>{money(product.compare_at_cents!)}</s>
          <span className="ml-1.5 font-semibold text-coral-dark">Save {money(product.compare_at_cents! - product.price_cents)}</span>
        </span>
      )}
    </div>
  );
}

export function StockBadge({ product }: { product: Product }) {
  const st = stockState(product);
  const cls = st === "in" ? "bg-sage-100 text-forest-dark" : st === "low" ? "bg-coral-50 text-coral-dark" : "bg-[#efedea] text-muted";
  return <span className={`chip ${cls}`}>{stockText(product)}</span>;
}

export function DemoTag() {
  return <span className="chip border border-dashed border-[#c9b98e] bg-[#fdf7e6] text-[#6d5a1f]" title="Sample listing: availability is confirmed by the store">Sample listing</span>;
}

export function AddToCartButton({ product, onAdded, className = "btn-primary w-full" }: { product: Product; onAdded?: (msg: string) => void; className?: string }) {
  const { settings } = useStore();
  const cart = useCart();
  const toast = useToast();
  const ok = canBuy(product, settings.demo_orders_allowed);
  const label = !ok ? (product.availability === "unavailable" ? "Unavailable" : product.inventory_qty <= 0 ? "Out of stock" : "Not available to order") : "Add to cart";
  return (
    <button type="button" className={className} disabled={!ok}
      onClick={() => {
        const r = cart.add(product, 1);
        const msg = r.added > 0 ? `Added ${product.name} to your cart.` : `You already have the most we can sell of ${product.name}.`;
        toast(msg);
        onAdded?.(msg);
      }}>
      {ok && <Icon name="cart" className="h-4.5 w-4.5" />}{label}
      <span className="sr-only">: {product.name}</span>
    </button>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="group card flex h-full flex-col overflow-hidden transition-shadow hover:shadow-[0_14px_30px_-20px_rgba(43,43,43,.45)]">
      <Link to={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden bg-cream" tabIndex={-1} aria-hidden="true">
        <ProductImage product={product} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {product.is_new && <span className="chip bg-forest text-white">New</span>}
          {product.price_cents <= 500 && <span className="chip bg-coral-dark text-white">Under $5</span>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <Price product={product} />
        <h3 className="text-[0.98rem] font-bold leading-snug">
          <Link to={`/product/${product.slug}`} className="hover:text-forest hover:underline">{product.name}</Link>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <StockBadge product={product} />
          {product.availability === "demo" && <DemoTag />}
        </div>
        <div className="mt-auto pt-1.5"><AddToCartButton product={product} /></div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, className = "" }: { products: Product[]; className?: string }) {
  return (
    <ul className={`grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 ${className}`}>
      {products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
    </ul>
  );
}

export function QuantityStepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[#cfc9bb] bg-white" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-forest disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Decrease quantity"><Icon name="minus" className="h-4 w-4" /></button>
      <input type="number" inputMode="numeric" min={1} max={max} value={value} aria-label="Quantity"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-12 bg-transparent text-center font-semibold [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-forest disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity"><Icon name="plus" className="h-4 w-4" /></button>
    </div>
  );
}

export function EmptyState({ icon = "bag", title, children }: { icon?: keyof typeof PATHS; title: string; children?: ReactNode }) {
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-sage-100 text-forest"><Icon name={icon} className="h-7 w-7" /></span>
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children && <div className="text-muted">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-sage-300 border-t-forest" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls = { info: "border-sage-300 bg-sage-50 text-forest-dark", warn: "border-[#e5d29a] bg-[#fdf7e6] text-[#5c4a12]", error: "border-red-200 bg-red-50 text-red-800", ok: "border-sage-300 bg-sage-100 text-forest-dark" }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`} role={tone === "error" ? "alert" : undefined}>
      <Icon name={tone === "ok" ? "check" : "info"} className="mt-0.5 h-5 w-5 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Native <dialog> wrapper: focus is trapped and Escape closes it. */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-4xl" : "max-w-lg"} rounded-2xl bg-white p-0 text-charcoal shadow-2xl backdrop:bg-charcoal/50`}
      aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-sage-50" aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
