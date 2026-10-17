import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, Icon, ProductGrid, Spinner } from "../components/ui";
import { canBuy } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import type { Product } from "../lib/types";
import NotFound from "./NotFound";

const SORTS = [
  ["featured", "Featured"], ["newest", "Newest"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["name", "Name: A to Z"],
] as const;
type Sort = (typeof SORTS)[number][0];

export default function Shop() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { products, categories, settings, loading } = useStore();
  const [showFilters, setShowFilters] = useState(false);

  const category = slug ? categories.find((c) => c.slug === slug) : undefined;
  const q = params.get("q")?.trim() ?? "";
  const min = Number(params.get("min") ?? "") || 0;
  const max = Number(params.get("max") ?? "") || 0;
  const sort = (SORTS.some(([k]) => k === params.get("sort")) ? params.get("sort") : "featured") as Sort;
  const inStock = params.get("stock") === "1";
  const catFilter = slug ? category?.id : categories.find((c) => c.slug === params.get("cat"))?.id;

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = products.filter((p) => {
      if (catFilter && p.category_id !== catFilter) return false;
      if (min && p.price_cents < min * 100) return false;
      if (max && p.price_cents > max * 100) return false;
      if (inStock && !canBuy(p, settings.demo_orders_allowed)) return false;
      if (terms.length) {
        const hay = `${p.name} ${p.description} ${p.sku ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      featured: (a, b) => Number(b.is_featured) - Number(a.is_featured) || Number(b.is_bestseller) - Number(a.is_bestseller) || a.name.localeCompare(b.name),
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      "price-asc": (a, b) => a.price_cents - b.price_cents || a.name.localeCompare(b.name),
      "price-desc": (a, b) => b.price_cents - a.price_cents || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    list = [...list].sort(by[sort]);
    return list;
  }, [products, catFilter, min, max, inStock, q, sort, settings.demo_orders_allowed]);

  const title = category ? category.name : q ? `Search: “${q}”` : max === 5 && !min ? "Deals Under $5" : "All Deals";
  useSeo({
    title: `${title} | ${settings.store_name}`,
    description: category?.description || `Shop affordable everyday home essentials from ${settings.store_name} in ${settings.service_area}.`,
    path: category ? `/category/${category.slug}` : "/shop",
    noindex: !!q,
  });

  if (slug && !loading && !category) return <NotFound />;

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const active = !!(q || min || max || inStock || (!slug && catFilter));

  const filters = (
    <div className="space-y-6">
      {!slug && (
        <fieldset>
          <legend className="label">Category</legend>
          <select className="input" value={params.get("cat") ?? ""} onChange={(e) => set("cat", e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </fieldset>
      )}
      <fieldset>
        <legend className="label">Price</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="f-min">Minimum price</label>
          <input id="f-min" className="input" type="number" inputMode="decimal" min={0} placeholder="Min $" value={params.get("min") ?? ""} onChange={(e) => set("min", e.target.value)} />
          <span className="text-muted" aria-hidden="true">to</span>
          <label className="sr-only" htmlFor="f-max">Maximum price</label>
          <input id="f-max" className="input" type="number" inputMode="decimal" min={0} placeholder="Max $" value={params.get("max") ?? ""} onChange={(e) => set("max", e.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[["Under $2", "", "2"], ["Under $5", "", "5"], ["$5 – $10", "5", "10"], ["$10 – $20", "10", "20"]].map(([l, a, b]) => (
            <button key={l} type="button" className="chip border border-line bg-white px-3 py-1.5 text-sm hover:border-forest"
              onClick={() => { const n = new URLSearchParams(params); a ? n.set("min", a) : n.delete("min"); n.set("max", b); setParams(n, { replace: true }); }}>{l}</button>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-[#2f5d46]" checked={inStock} onChange={(e) => set("stock", e.target.checked ? "1" : "")} />
        In stock and ready to order
      </label>
      {active && <button type="button" className="btn-secondary w-full" onClick={clearAll}>Clear filters</button>}
    </div>
  );

  return (
    <div className="container-page py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link to="/" className="hover:underline">Home</Link><span aria-hidden="true"> / </span>
        {slug ? <><Link to="/shop" className="hover:underline">Shop</Link><span aria-hidden="true"> / </span><span aria-current="page">{category?.name}</span></> : <span aria-current="page">Shop</span>}
      </nav>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          {category?.description && <p className="mt-1 text-muted">{category.description}</p>}
          <p className="mt-1 text-sm text-muted" aria-live="polite">{loading ? "Loading…" : `${results.length} item${results.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary lg:hidden" aria-expanded={showFilters} aria-controls="filters" onClick={() => setShowFilters((v) => !v)}>
            <Icon name="grid" className="h-4 w-4" />Filters{active ? " (on)" : ""}
          </button>
          <label htmlFor="sort" className="sr-only">Sort by</label>
          <select id="sort" className="input w-auto" value={sort} onChange={(e) => set("sort", e.target.value === "featured" ? "" : e.target.value)}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside id="filters" aria-label="Filters" className={`${showFilters ? "block" : "hidden"} card p-5 lg:sticky lg:top-40 lg:block lg:self-start`}>{filters}</aside>
        <div>
          {loading ? <Spinner label="Loading products" /> : results.length ? <ProductGrid products={results} className="md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4" /> : (
            <EmptyState icon="search" title="No matching products">
              <p>{q ? <>We couldn't find anything for “{q}”.</> : "Nothing matches these filters right now."} Try a different word or clear the filters.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {active && <button type="button" className="btn-secondary" onClick={clearAll}>Clear filters</button>}
                <Link to="/shop" className="btn-primary">Shop all deals</Link>
              </div>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
