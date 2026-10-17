import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Icon, Modal, Notice, ProductImage, Spinner } from "../components/ui";
import { AVAILABILITY_LABEL, friendlyError, money } from "../lib/format";
import { useStore } from "../lib/store";
import type { Availability, Product, ProductInput } from "../lib/types";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";

const STATUS_FILTERS = [
  ["", "All (not archived)"], ["published", "Published"], ["unpublished", "Unpublished"], ["demo", "Sample listings"],
  ["low", "Low stock"], ["out", "Out of stock"], ["archived", "Archived"],
] as const;

export default function Products() {
  const { api, reload: reloadStore } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const products = useLoad(() => api!.listProducts({ admin: true }), [api]);
  const categories = useLoad(() => api!.listCategories({ includeInactive: true }), [api]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stockModal, setStockModal] = useState(false);
  const [stockValue, setStockValue] = useState("");

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const cat = params.get("cat") ?? "";
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

  const list = useMemo(() => (products.data ?? []).filter((p) => {
    if (status === "archived" ? !p.is_archived : p.is_archived) return false;
    if (status === "published" && !p.is_published) return false;
    if (status === "unpublished" && p.is_published) return false;
    if (status === "demo" && p.availability !== "demo") return false;
    if (status === "low" && !(p.inventory_qty > 0 && p.inventory_qty <= p.low_stock_threshold)) return false;
    if (status === "out" && p.inventory_qty !== 0) return false;
    if (cat && p.category_id !== cat) return false;
    if (q) { const t = q.toLowerCase(); if (![p.name, p.sku ?? "", p.slug].some((v) => v.toLowerCase().includes(t))) return false; }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name)), [products.data, status, cat, q]);

  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); setSelected(new Set()); };
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function bulk(patch: Partial<ProductInput>, label: string) {
    if (!selected.size || !api) return;
    setBusy(true); setError("");
    try {
      await api.bulkUpdateProducts([...selected], patch);
      toast(`${label}: ${selected.size} product${selected.size === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      await products.reload(); void reloadStore();
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  if (products.loading && !products.data) return <Spinner label="Loading products" />;

  return (
    <>
      <PageHeader title="Products">
        <Link to="/admin/import" className="btn-secondary"><Icon name="upload" className="h-4 w-4" />Import / Export</Link>
        <Link to="/admin/products/new" className="btn-primary"><Icon name="plus" className="h-4 w-4" />Add product</Link>
      </PageHeader>
      {(products.error || error) && <div className="mb-4"><Notice tone="error">{products.error || error}</Notice></div>}

      <div className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
        <div><label htmlFor="p-q" className="sr-only">Search products</label><input id="p-q" type="search" className="input" placeholder="Search by name or SKU" value={q} onChange={(e) => set("q", e.target.value)} /></div>
        <div><label htmlFor="p-status" className="sr-only">Status</label>
          <select id="p-status" className="input" value={status} onChange={(e) => set("status", e.target.value)}>{STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label htmlFor="p-cat" className="sr-only">Category</label>
          <select id="p-cat" className="input" value={cat} onChange={(e) => set("cat", e.target.value)}><option value="">All categories</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-forest-dark p-3 text-white shadow-lg" role="region" aria-label="Bulk actions">
          <span className="px-2 font-semibold">{selected.size} selected</span>
          <button className="btn bg-white text-forest" disabled={busy} onClick={() => bulk({ is_published: true }, "Published")}>Publish</button>
          <button className="btn bg-white text-forest" disabled={busy} onClick={() => bulk({ is_published: false }, "Unpublished")}>Unpublish</button>
          <label className="sr-only" htmlFor="bulk-avail">Set availability</label>
          <select id="bulk-avail" className="input w-auto text-charcoal" disabled={busy} value="" onChange={(e) => e.target.value && bulk({ availability: e.target.value as Availability }, `Marked ${AVAILABILITY_LABEL[e.target.value as Availability]}`)}>
            <option value="">Set availability…</option>
            {(["available", "unavailable", "demo"] as Availability[]).map((a) => <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>)}
          </select>
          <button className="btn bg-white text-forest" disabled={busy} onClick={() => { setStockValue(""); setStockModal(true); }}>Set stock…</button>
          {status === "archived"
            ? <button className="btn bg-white text-forest" disabled={busy} onClick={() => bulk({ is_archived: false }, "Restored")}>Restore</button>
            : <button className="btn bg-white text-red-700" disabled={busy} onClick={() => bulk({ is_archived: true, is_published: false }, "Archived")}>Archive</button>}
          <button className="btn text-white hover:bg-white/10" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">Products</caption>
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" className="h-5 w-5 accent-[#2f5d46]" aria-label="Select all shown products" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((p) => p.id)))} /></th>
              <th className="p-3 font-semibold">Product</th><th className="p-3 font-semibold">Price</th><th className="p-3 font-semibold">Stock</th><th className="p-3 font-semibold">Status</th><th className="p-3"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((p) => <Row key={p.id} p={p} cat={catName.get(p.category_id ?? "") ?? "No category"} checked={selected.has(p.id)} onToggle={() => toggle(p.id)} />)}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-muted">No products match. <Link to="/admin/products/new" className="font-semibold text-forest underline">Add a product</Link></p>}
      </div>
      <p className="mt-2 text-sm text-muted">{list.length} shown</p>

      <Modal open={stockModal} onClose={() => setStockModal(false)} title={`Set stock for ${selected.size} products`}>
        <form onSubmit={(e) => { e.preventDefault(); const n = Number(stockValue); if (Number.isInteger(n) && n >= 0 && n <= 100000) { setStockModal(false); void bulk({ inventory_qty: n }, `Stock set to ${n}`); } }}>
          <label className="label" htmlFor="bulk-stock">New quantity on hand</label>
          <input id="bulk-stock" className="input" type="number" min={0} max={100000} step={1} required value={stockValue} onChange={(e) => setStockValue(e.target.value)} />
          <p className="mt-2 text-sm text-muted">Every selected product will be set to this exact number. Each change is saved in the inventory history.</p>
          <button className="btn-primary mt-4 w-full" type="submit">Update stock</button>
        </form>
      </Modal>
    </>
  );
}

function Row({ p, cat, checked, onToggle }: { p: Product; cat: string; checked: boolean; onToggle: () => void }) {
  const stockCls = p.inventory_qty === 0 ? "text-red-700" : p.inventory_qty <= p.low_stock_threshold ? "text-coral-dark" : "";
  return (
    <tr className={checked ? "bg-sage-50" : "hover:bg-[#faf8f2]"}>
      <td className="p-3"><input type="checkbox" className="h-5 w-5 accent-[#2f5d46]" checked={checked} onChange={onToggle} aria-label={`Select ${p.name}`} /></td>
      <td className="p-3">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 flex-none overflow-hidden rounded-lg bg-cream"><ProductImage product={p} size="thumb" /></span>
          <span className="min-w-0"><Link to={`/admin/products/${p.id}`} className="font-semibold hover:text-forest hover:underline">{p.name}</Link><span className="block text-xs text-muted">{cat}{p.sku ? ` · ${p.sku}` : ""}</span></span>
        </div>
      </td>
      <td className="p-3 font-semibold">{money(p.price_cents)}</td>
      <td className={`p-3 font-bold ${stockCls}`}>{p.inventory_qty}</td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          {p.is_archived ? <span className="chip bg-[#efedea] text-muted">Archived</span> : p.is_published ? <span className="chip bg-sage-100 text-forest-dark">Published</span> : <span className="chip bg-[#efedea] text-muted">Hidden</span>}
          {p.availability !== "available" && <span className="chip border border-line bg-white text-muted">{AVAILABILITY_LABEL[p.availability]}</span>}
          {!p.images.length && <span className="chip border border-dashed border-line text-muted">No photo</span>}
        </div>
      </td>
      <td className="p-3 text-right"><Link to={`/admin/products/${p.id}`} className="btn-ghost px-3 py-1.5 text-sm">Edit</Link></td>
    </tr>
  );
}
