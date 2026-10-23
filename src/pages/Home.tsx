import { Link } from "react-router-dom";
import { Icon, ProductGrid, Spinner } from "../components/ui";
import { canBuy, telHref } from "../lib/format";
import { categoryIcon } from "../lib/placeholder";
import { absoluteUrl, useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import type { Product } from "../lib/types";

function Section({ id, title, kicker, link, products }: { id: string; title: string; kicker?: string; link?: [string, string]; products: Product[] }) {
  if (!products.length) return null;
  return (
    <section aria-labelledby={id} className="container-page mt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <p className="mb-1 text-sm font-bold uppercase tracking-wider text-coral-dark">{kicker}</p>}
          <h2 id={id} className="section-title">{title}</h2>
        </div>
        {link && <Link to={link[0]} className="inline-flex items-center gap-1.5 font-semibold text-forest hover:underline">{link[1]}<Icon name="arrow" className="h-4 w-4" /></Link>}
      </div>
      <ProductGrid products={products} />
    </section>
  );
}

export default function Home() {
  const { settings, categories, products, loading } = useStore();
  useSeo({
    title: `${settings.store_name} | ${settings.slogan}`,
    description: `Affordable everyday home essentials in ${settings.service_area}: cleaning, laundry, kitchen, bathroom and organization basics, mostly $1 to $20. Pay with Cash App, Venmo or cash.`,
    path: "/",
    jsonLd: {
      "@context": "https://schema.org", "@type": "Store", name: settings.legal_name, slogan: settings.slogan, url: absoluteUrl("/"),
      telephone: [settings.phone_primary, settings.phone_secondary].filter(Boolean),
      areaServed: settings.service_area, paymentAccepted: "Cash App, Venmo, Cash", logo: absoluteUrl("/apple-touch-icon.png"),
      founder: settings.founders.split(/\s*(?:&|\band\b)\s*/).filter(Boolean).map((name) => ({ "@type": "Person", name })),
    },
  });

  const buyable = (p: Product) => canBuy(p, settings.demo_orders_allowed);
  const sortBuyableFirst = (list: Product[]) => [...list].sort((a, b) => Number(buyable(b)) - Number(buyable(a)));
  const bestsellers = sortBuyableFirst(products.filter((p) => p.is_bestseller)).slice(0, 8);
  const newArrivals = sortBuyableFirst(products.filter((p) => p.is_new)).slice(0, 8);
  const under5 = sortBuyableFirst(products.filter((p) => p.price_cents <= 500)).slice(0, 8);
  const essentials = sortBuyableFirst(products.filter((p) => p.is_featured)).slice(0, 8);
  const counts = new Map<string, number>();
  products.forEach((p) => p.category_id && counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1));
  const pay = [
    { name: "Cash App", detail: settings.cashapp_tag ? `Send to ${settings.cashapp_tag}` : "Our Cash App details are shared when we confirm your order." },
    { name: "Venmo", detail: settings.venmo_username ? `Send to ${settings.venmo_username}` : "Our Venmo details are shared when we confirm your order." },
    { name: "Cash", detail: "Pay in cash when you get your order." },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-sage-50 to-ivory">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sage-100/80" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-coral-50" aria-hidden="true" />
        <div className="container-page relative grid items-center gap-10 py-12 md:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white px-3.5 py-1.5 text-sm font-semibold text-forest">
              <Icon name="pin" className="h-4 w-4" />Local to {settings.service_area}
            </p>
            <h1 className="text-[2.4rem] font-black leading-[1.02] tracking-tight text-forest-dark sm:text-5xl lg:text-6xl">
              Everyday Home Essentials You <span className="relative whitespace-nowrap text-coral-dark">MAE<svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9C30 2 70 2 98 8" fill="none" stroke="#c8694a" strokeWidth="4" strokeLinecap="round" /></svg></span> Need!
            </h1>
            <p className="mt-5 text-xl font-bold text-charcoal sm:text-2xl" style={{ fontFamily: "var(--font-heading)" }}>{settings.tagline}</p>
            <p className="mt-3 max-w-xl text-lg text-muted">Cleaning, laundry, kitchen, bathroom and organizing basics, mostly priced from $1 to $20. Order online, then pay with Cash App, Venmo or cash.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/shop" className="btn-primary px-7 text-base">Shop All Deals<Icon name="arrow" className="h-4 w-4" /></Link>
              <a href="#categories" className="btn-secondary px-7 text-base">Browse Categories</a>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4" aria-hidden="true">
            {categories.slice(0, 6).map((c, i) => (
              <div key={c.id} className={`card flex aspect-square flex-col items-center justify-center gap-1 shadow-[0_18px_40px_-28px_rgba(47,93,70,.6)] ${i % 2 ? "translate-y-5" : ""}`}
                style={{ background: `linear-gradient(160deg, #fff, ${c.color}1c)` }}>
                <span className="text-4xl sm:text-5xl">{categoryIcon(c.slug)}</span>
                <span className="px-2 text-center text-[0.7rem] font-bold text-muted sm:text-xs">{c.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {loading && <Spinner label="Loading deals" />}

      {/* Categories */}
      <section id="categories" aria-labelledby="cat-title" className="container-page mt-14 scroll-mt-40">
        <h2 id="cat-title" className="section-title mb-5">Shop by category</h2>
        <ul className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))] sm:gap-4">
          {categories.map((c) => (
            <li key={c.id}>
              <Link to={`/category/${c.slug}`} className="card group flex h-full min-w-0 items-center gap-2.5 p-3 sm:gap-3 sm:p-4 transition-colors hover:border-forest/40 hover:bg-sage-50">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl text-2xl sm:h-14 sm:w-14 sm:text-3xl" style={{ background: `${c.color}22` }} aria-hidden="true">{categoryIcon(c.slug)}</span>
                <span className="min-w-0">
                  <span className="block hyphens-auto break-words font-bold leading-tight group-hover:text-forest" lang="en">{c.name}</span>
                  <span className="text-sm text-muted">{counts.get(c.id) ?? 0} items</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Section id="best" kicker="Customer favorites" title="Best Sellers" link={["/shop?sort=featured", "Shop all"]} products={bestsellers} />
      <Section id="new" kicker="Just added" title="New Arrivals" link={["/shop?sort=newest", "See what's new"]} products={newArrivals} />
      <Section id="under5" kicker="Little prices" title="Deals Under $5" link={["/shop?max=5", "Shop under $5"]} products={under5} />
      <Section id="essentials" kicker="Stock up" title="Everyday Household Essentials" link={["/shop", "Browse everything"]} products={essentials} />

      {/* How to pay */}
      <section aria-labelledby="pay-title" className="container-page mt-16">
        <div className="card overflow-hidden border-forest/15 bg-sage-50">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="mb-1 text-sm font-bold uppercase tracking-wider text-coral-dark">Simple and local</p>
              <h2 id="pay-title" className="section-title">How ordering and payment work</h2>
              <ol className="mt-5 space-y-4">
                {[["Place your order online", "Add items to your cart and check out. No card needed."], ["We confirm with you", "We'll call or text to confirm your items, total and pickup details."], ["Pay and pick up", "Pay with Cash App, Venmo or cash, then collect your order."]].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-forest font-bold text-white">{i + 1}</span>
                    <span><b className="block">{t}</b><span className="text-muted">{d}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {pay.map((p) => (
                <li key={p.name} className="card flex items-center gap-4 p-4">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-forest text-white"><Icon name="cash" /></span>
                  <span><b className="block text-lg" style={{ fontFamily: "var(--font-heading)" }}>{p.name}</b><span className="text-sm text-muted">{p.detail}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Local */}
      <section aria-labelledby="local-title" className="container-page mt-14">
        <div className="grid items-center gap-6 rounded-[var(--radius-card)] bg-forest px-6 py-10 text-white sm:px-10 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 id="local-title" className="text-2xl font-extrabold text-white sm:text-3xl">Your neighborhood essentials store</h2>
            <p className="mt-2 max-w-2xl text-[#d6e2d2]">Serving {settings.service_area}. Questions about an item or your order? Give us a call or send a text.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[settings.phone_primary, settings.phone_secondary].filter(Boolean).map((p) => (
              <a key={p} href={telHref(p)} className="btn bg-white text-forest hover:bg-sage-50"><Icon name="phone" className="h-4 w-4" />{p}</a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
