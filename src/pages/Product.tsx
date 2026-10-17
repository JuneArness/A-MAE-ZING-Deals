import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AddToCartButton, DemoTag, Icon, Modal, Price, ProductGrid, ProductImage, QuantityStepper, Spinner, StockBadge } from "../components/ui";
import { useToast } from "../components/Toast";
import { useCart } from "../lib/cart";
import { canBuy, money } from "../lib/format";
import { absoluteUrl, useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import type { Product as P } from "../lib/types";
import NotFound from "./NotFound";

export default function Product() {
  const { slug = "" } = useParams();
  const { products, loading, api, categoryById, settings } = useStore();
  const cart = useCart();
  const toast = useToast();
  const [fetched, setFetched] = useState<P | null | undefined>(undefined);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [zoom, setZoom] = useState(false);

  const fromList = products.find((p) => p.slug === slug);
  // Not in the loaded catalog (e.g. a link to an unpublished item): ask the server once.
  useEffect(() => {
    setActive(0); setQty(1);
    if (loading || fromList || !api) return;
    let live = true;
    api.getProduct(slug).then((p) => { if (live) setFetched(p && p.is_published && !p.is_archived ? p : null); }).catch(() => live && setFetched(null));
    return () => { live = false; };
  }, [slug, loading, fromList, api]);

  const product = fromList ?? fetched ?? null;
  const cat = product ? categoryById(product.category_id) : undefined;
  const img = product?.images[active];
  const isRealListing = !!product && product.availability !== "demo";

  useSeo({
    title: product ? `${product.name} | ${money(product.price_cents)} | ${settings.store_name}` : `Product | ${settings.store_name}`,
    description: product ? (product.description || product.name).slice(0, 155) : undefined,
    path: `/product/${slug}`,
    image: product?.images[0]?.url,
    // Structured data only for real, published listings (never for sample/demo items). No ratings or reviews.
    jsonLd: product && isRealListing ? {
      "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description,
      sku: product.sku ?? undefined, image: product.images.map((i) => absoluteUrl(i.url)), category: cat?.name,
      offers: {
        "@type": "Offer", priceCurrency: "USD", price: (product.price_cents / 100).toFixed(2), url: absoluteUrl(`/product/${product.slug}`),
        availability: canBuy(product, settings.demo_orders_allowed) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: settings.legal_name },
      },
    } : null,
  });

  if (loading || (!fromList && fetched === undefined)) return <Spinner label="Loading product" />;
  if (!product) return <NotFound />;

  const max = cart.maxFor(product);
  const ok = canBuy(product, settings.demo_orders_allowed);
  const inCart = cart.lines.find((l) => l.product_id === product.id)?.quantity ?? 0;
  const related = products.filter((p) => p.id !== product.id && p.category_id === product.category_id).slice(0, 4);

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
        <Link to="/" className="hover:underline">Home</Link><span aria-hidden="true"> / </span>
        {cat && <><Link to={`/category/${cat.slug}`} className="hover:underline">{cat.name}</Link><span aria-hidden="true"> / </span></>}
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="card relative aspect-square overflow-hidden bg-cream">
            {img ? <img src={img.url} alt={img.alt || product.name} className="h-full w-full object-cover" width={1200} height={1200} /> : <ProductImage product={product} size="full" />}
            {img && (
              <button type="button" onClick={() => setZoom(true)} className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/90 px-4 text-sm font-semibold text-forest shadow hover:bg-white">
                <Icon name="zoom" className="h-4 w-4" />Zoom
              </button>
            )}
          </div>
          {product.images.length > 1 && (
            <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="More photos">
              {product.images.map((im, i) => (
                <li key={im.id}>
                  <button type="button" onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`} aria-pressed={i === active}
                    className={`h-20 w-20 overflow-hidden rounded-xl border-2 ${i === active ? "border-forest" : "border-transparent"}`}>
                    <img src={im.thumb_url || im.url} alt="" className="h-full w-full object-cover" loading="lazy" width={80} height={80} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {cat && <Link to={`/category/${cat.slug}`} className="text-sm font-bold uppercase tracking-wider text-coral-dark hover:underline">{cat.name}</Link>}
          <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-4"><Price product={product} large /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StockBadge product={product} />
            {product.is_new && <span className="chip bg-forest text-white">New</span>}
            {product.availability === "demo" && <DemoTag />}
          </div>
          {product.availability === "demo" && (
            <p className="mt-3 rounded-xl bg-[#fdf7e6] px-4 py-3 text-sm text-[#5c4a12]">This is a sample listing. The store will confirm availability before you pay.</p>
          )}

          {ok ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <QuantityStepper value={Math.min(qty, Math.max(1, max - inCart))} max={Math.max(1, max - inCart)} onChange={(n) => setQty(Math.max(1, Math.min(n || 1, Math.max(1, max - inCart))))} label={product.name} />
              <button type="button" className="btn-primary flex-1 sm:flex-none sm:px-10" disabled={inCart >= max}
                onClick={() => { const r = cart.add(product, qty); toast(r.added ? `Added ${r.added} × ${product.name} to your cart.` : "You already have all available stock in your cart."); setQty(1); }}>
                <Icon name="cart" className="h-4.5 w-4.5" />{inCart >= max ? "All available stock is in your cart" : "Add to cart"}
              </button>
            </div>
          ) : (
            <div className="mt-6"><AddToCartButton product={product} className="btn-primary w-full sm:w-auto sm:px-10" /></div>
          )}
          {inCart > 0 && <p className="mt-3 text-sm text-muted">{inCart} in your cart. <Link to="/cart" className="font-semibold text-forest underline">View cart</Link></p>}

          {product.description && (
            <div className="mt-8">
              <h2 className="text-lg font-extrabold">Details</h2>
              <div className="mt-2 space-y-3 whitespace-pre-line leading-relaxed text-[#3d3f3a]">{product.description}</div>
            </div>
          )}
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {product.sku && <><dt className="text-muted">SKU</dt><dd>{product.sku}</dd></>}
            <dt className="text-muted">Pickup</dt><dd>{settings.service_area}. Details confirmed after you order.</dd>
            <dt className="text-muted">Payment</dt><dd>Cash App, Venmo or cash</dd>
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="rel" className="mt-16">
          <h2 id="rel" className="section-title mb-5">More from {cat?.name ?? "this category"}</h2>
          <ProductGrid products={related} />
        </section>
      )}

      {img && (
        <Modal open={zoom} onClose={() => setZoom(false)} title={product.name} wide>
          <img src={img.url} alt={img.alt || product.name} className="mx-auto max-h-[75vh] w-auto rounded-xl" />
        </Modal>
      )}
    </div>
  );
}
