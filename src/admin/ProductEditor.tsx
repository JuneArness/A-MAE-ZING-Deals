import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Icon, Modal, Notice, ProductCard, Spinner } from "../components/ui";
import { friendlyError, slugify } from "../lib/format";
import { ACCEPTED, prepareImage } from "../lib/image";
import { useStore } from "../lib/store";
import type { Availability, Product, ProductImage, ProductInput } from "../lib/types";
import { fieldErrors, productFormSchema, toCents } from "../lib/validation";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";

interface FormState {
  name: string; slug: string; description: string; category_id: string; price: string; compare_at: string;
  compare_at_verified: boolean; compare_at_source: string; sku: string; inventory_qty: string; low_stock_threshold: string;
  availability: Availability; is_featured: boolean; is_bestseller: boolean; is_new: boolean; is_published: boolean;
}

const blank: FormState = {
  name: "", slug: "", description: "", category_id: "", price: "", compare_at: "", compare_at_verified: false, compare_at_source: "",
  sku: "", inventory_qty: "0", low_stock_threshold: "3", availability: "available", is_featured: false, is_bestseller: false, is_new: true, is_published: false,
};

const fromProduct = (p: Product): FormState => ({
  name: p.name, slug: p.slug, description: p.description, category_id: p.category_id ?? "", price: (p.price_cents / 100).toFixed(2),
  compare_at: p.compare_at_cents ? (p.compare_at_cents / 100).toFixed(2) : "", compare_at_verified: p.compare_at_verified,
  compare_at_source: p.compare_at_source ?? "", sku: p.sku ?? "", inventory_qty: String(p.inventory_qty),
  low_stock_threshold: String(p.low_stock_threshold), availability: p.availability, is_featured: p.is_featured,
  is_bestseller: p.is_bestseller, is_new: p.is_new, is_published: p.is_published,
});

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { api, reload: reloadStore } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useLoad(() => api!.listCategories({ includeInactive: true }), [api]);
  const existing = useLoad(() => (id ? api!.getProductById(id) : Promise.resolve(null)), [api, id]);
  const [form, setForm] = useState<FormState>(blank);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const product = existing.data ?? null;

  useEffect(() => {
    if (product) { setForm(fromProduct(product)); setSlugTouched(true); }
  }, [product]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "name" && !slugTouched) next.slug = slugify(String(v));
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const preview: Product = useMemo(() => ({
    id: product?.id ?? "preview", category_id: form.category_id || null, name: form.name || "Product name", slug: form.slug || "preview",
    description: form.description, price_cents: toCents(form.price || 0), compare_at_cents: form.compare_at ? toCents(form.compare_at) : null,
    compare_at_verified: form.compare_at_verified, compare_at_source: form.compare_at_source || null, sku: form.sku || null,
    inventory_qty: Number(form.inventory_qty) || 0, low_stock_threshold: Number(form.low_stock_threshold) || 0, availability: form.availability,
    is_featured: form.is_featured, is_bestseller: form.is_bestseller, is_new: form.is_new, is_published: true, is_archived: false,
    created_at: "", updated_at: "", images: product?.images ?? [],
  }), [form, product]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!api || saving) return;
    setServerError("");
    const parsed = productFormSchema.safeParse(form);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error); setErrors(fe);
      document.getElementById(`pe-${Object.keys(fe)[0]}`)?.focus();
      return;
    }
    const v = parsed.data;
    const input: ProductInput = {
      name: v.name, slug: v.slug, description: v.description, category_id: v.category_id, price_cents: toCents(v.price),
      compare_at_cents: v.compare_at === "" ? null : toCents(v.compare_at), compare_at_verified: v.compare_at === "" ? false : v.compare_at_verified,
      compare_at_source: v.compare_at_source || null, sku: v.sku || null, inventory_qty: v.inventory_qty, low_stock_threshold: v.low_stock_threshold,
      availability: v.availability, is_featured: v.is_featured, is_bestseller: v.is_bestseller, is_new: v.is_new, is_published: v.is_published,
      is_archived: product?.is_archived ?? false,
    };
    setSaving(true);
    try {
      const saved = await api.saveProduct(id ?? null, input);
      void reloadStore();
      toast(isNew ? "Product created. Now add photos." : "Product saved.");
      if (isNew) navigate(`/admin/products/${saved.id}`, { replace: true });
      else await existing.reload();
    } catch (err) { setServerError(friendlyError(err)); }
    finally { setSaving(false); }
  }

  async function archive(flag: boolean) {
    if (!api || !product) return;
    try {
      await api.saveProduct(product.id, { ...fromInput(product), is_archived: flag, is_published: flag ? false : product.is_published });
      toast(flag ? "Product archived. It's hidden from the store." : "Product restored.");
      void reloadStore(); await existing.reload();
    } catch (err) { setServerError(friendlyError(err)); }
  }
  async function remove() {
    if (!api || !product) return;
    try { await api.deleteProduct(product.id); toast("Product deleted."); void reloadStore(); navigate("/admin/products", { replace: true }); }
    catch (err) { setConfirmDelete(false); setServerError(friendlyError(err)); }
  }

  if ((existing.loading && existing.data === undefined) || (categories.loading && !categories.data)) return <Spinner label="Loading product" />;
  if (id && !product) return <Notice tone="error">That product wasn't found. <Link to="/admin/products" className="underline">Back to products</Link></Notice>;

  const err = (k: string) => (errors[k] ? <p className="field-error" id={`pe-${k}-err`}>{errors[k]}</p> : null);
  const a = (k: string) => ({ id: `pe-${k}`, "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `pe-${k}-err` : undefined });
  const price = Number(form.price);
  const toggle = (k: "is_published" | "is_featured" | "is_bestseller" | "is_new" | "compare_at_verified", label: string, hint?: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#2f5d46]" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><b className="block">{label}</b>{hint && <span className="text-sm text-muted">{hint}</span>}</span>
    </label>
  );

  return (
    <>
      <PageHeader title={isNew ? "Add product" : form.name || "Edit product"} back={["/admin/products", "All products"]}>
        {product && <Link to={`/product/${product.slug}`} target="_blank" className="btn-secondary">View in store<span className="sr-only"> (opens in a new tab)</span></Link>}
      </PageHeader>
      {product?.is_archived && <div className="mb-4"><Notice tone="warn">This product is archived and hidden from the store. <button className="font-semibold underline" onClick={() => archive(false)}>Restore it</button></Notice></div>}
      {serverError && <div className="mb-4"><Notice tone="error">{serverError}</Notice></div>}

      <form onSubmit={save} noValidate className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="card space-y-4 p-5" aria-labelledby="pe-basic">
            <h2 id="pe-basic" className="text-lg font-extrabold">Basics</h2>
            <div><label className="label" htmlFor="pe-name">Product name</label><input className="input" {...a("name")} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />{err("name")}</div>
            <div>
              <label className="label" htmlFor="pe-slug">Web address</label>
              <div className="flex items-center gap-1 text-sm text-muted"><span className="hidden sm:inline">/product/</span>
                <input className="input" {...a("slug")} value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} maxLength={80} /></div>
              {err("slug")}
              {!isNew && <p className="mt-1 text-xs text-muted">Changing this breaks old links to the product.</p>}
            </div>
            <div><label className="label" htmlFor="pe-description">Description</label><textarea className="input min-h-32" {...a("description")} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />{err("description")}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="pe-category_id">Category</label>
                <select className="input" {...a("category_id")} value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">Choose a category…</option>
                  {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (inactive)"}</option>)}
                </select>{err("category_id")}</div>
              <div><label className="label" htmlFor="pe-sku">SKU <span className="font-normal text-muted">(optional)</span></label><input className="input" {...a("sku")} value={form.sku} onChange={(e) => set("sku", e.target.value)} maxLength={64} />{err("sku")}</div>
            </div>
          </section>

          <section className="card space-y-4 p-5" aria-labelledby="pe-h-price">
            <h2 id="pe-h-price" className="text-lg font-extrabold">Price</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="pe-price">Selling price ($)</label><input className="input" {...a("price")} inputMode="decimal" type="number" step="0.01" min="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />{err("price")}
                {price > 20 && !errors.price && <p className="mt-1 text-sm text-coral-dark">Heads up: this is above the store's usual $1–$20 range.</p>}</div>
              <div><label className="label" htmlFor="pe-compare_at">Compare-at retail price ($) <span className="font-normal text-muted">(optional)</span></label><input className="input" {...a("compare_at")} inputMode="decimal" type="number" step="0.01" min="0" value={form.compare_at} onChange={(e) => set("compare_at", e.target.value)} />{err("compare_at")}</div>
            </div>
            {form.compare_at && (
              <div className="rounded-xl bg-cream p-4">
                {toggle("compare_at_verified", "I checked this comparison price", "Shows a crossed-out price on the store. Only tick this if you saw the same item at this price at another retailer.")}
                <label className="label mt-3" htmlFor="pe-compare_at_source">Where and when you checked it</label>
                <input className="input" {...a("compare_at_source")} placeholder="e.g. Same item at a major retailer, 10/15/2026" value={form.compare_at_source} onChange={(e) => set("compare_at_source", e.target.value)} maxLength={300} />{err("compare_at_source")}
                <p className="mt-1 text-xs text-muted">Kept for your records only. Not shown to customers.</p>
              </div>
            )}
          </section>

          <section className="card space-y-4 p-5" aria-labelledby="pe-stock">
            <h2 id="pe-stock" className="text-lg font-extrabold">Stock &amp; availability</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="pe-inventory_qty">Quantity on hand</label><input className="input" {...a("inventory_qty")} type="number" min={0} step={1} value={form.inventory_qty} onChange={(e) => set("inventory_qty", e.target.value)} />{err("inventory_qty")}</div>
              <div><label className="label" htmlFor="pe-low_stock_threshold">Low-stock alert at</label><input className="input" {...a("low_stock_threshold")} type="number" min={0} step={1} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} />{err("low_stock_threshold")}</div>
              <div><label className="label" htmlFor="pe-availability">Availability</label>
                <select className="input" {...a("availability")} value={form.availability} onChange={(e) => set("availability", e.target.value as Availability)}>
                  <option value="available">Available (real stock)</option><option value="unavailable">Unavailable</option><option value="demo">Sample listing</option>
                </select></div>
            </div>
            <p className="text-sm text-muted">Stock goes down automatically when customers order and comes back if you cancel an order.</p>
          </section>

          <section className="card space-y-1 p-5" aria-labelledby="pe-vis">
            <h2 id="pe-vis" className="mb-2 text-lg font-extrabold">Visibility &amp; placement</h2>
            {toggle("is_published", "Published", "Show this product on the store.")}
            {toggle("is_new", "New arrival", "Appears in New Arrivals.")}
            {toggle("is_featured", "Everyday essential (featured)", "Appears on the home page and first in “Featured” sorting.")}
            {toggle("is_bestseller", "Best seller", "Only tick for items that really sell well. Appears in Best Sellers.")}
          </section>

          {product ? <ImageManager product={product} onChange={() => { void existing.reload(); void reloadStore(); }} />
            : <Notice tone="info">Save the product first, then you can add photos.</Notice>}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary px-8" disabled={saving}>{saving ? "Saving…" : isNew ? "Create product" : "Save changes"}</button>
            <Link to="/admin/products" className="btn-secondary">Cancel</Link>
            {product && !product.is_archived && <button type="button" className="btn-secondary ml-auto" onClick={() => archive(true)}>Archive</button>}
            {product && <button type="button" className={`btn-danger ${product.is_archived ? "ml-auto" : ""}`} onClick={() => setConfirmDelete(true)}>Delete…</button>}
          </div>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start" aria-labelledby="pe-preview">
          <h2 id="pe-preview" className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Store preview</h2>
          <div inert className="pointer-events-none max-w-xs select-none"><ProductCard product={preview} /></div>
          {!form.is_published && <p className="mt-2 text-sm text-muted">Not published: customers can't see this yet.</p>}
        </aside>
      </form>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this product?">
        <p>This permanently removes <b>{product?.name}</b> and its photos. Past orders keep the product name and price.</p>
        <p className="mt-2 text-muted">To just hide it, use <b>Archive</b> instead. You can restore archived products any time.</p>
        <div className="mt-5 flex gap-2"><button className="btn-danger" onClick={remove}>Delete permanently</button><button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Keep it</button></div>
      </Modal>
    </>
  );
}

const fromInput = (p: Product): ProductInput => {
  const { id: _i, created_at: _c, updated_at: _u, images: _im, ...rest } = p;
  void _i; void _c; void _u; void _im;
  return rest;
};

function ImageManager({ product, onChange }: { product: Product; onChange: () => void }) {
  const { api } = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [alts, setAlts] = useState<Record<string, string>>({});
  const images = product.images;

  async function upload(files: FileList | null) {
    if (!files?.length || !api) return;
    setError("");
    let order = images.length ? Math.max(...images.map((i) => i.sort_order)) + 1 : 0;
    let uploaded = 0;
    for (const f of Array.from(files).slice(0, 8)) {
      setBusy(`Uploading ${f.name}…`);
      try {
        const { full, thumb } = await prepareImage(f);
        await api.uploadProductImage(product.id, full, thumb, product.name, order++);
        uploaded++;
      } catch (e) { setError(friendlyError(e, `"${f.name}" couldn't be uploaded. Please try again.`)); break; }
    }
    setBusy(""); if (input.current) input.current.value = "";
    if (uploaded) { toast(`${uploaded} photo${uploaded > 1 ? "s" : ""} added.`); onChange(); }
  }
  async function move(img: ProductImage, dir: -1 | 1) {
    const i = images.findIndex((x) => x.id === img.id), j = i + dir;
    if (!api || j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy("Reordering…");
    try {
      // Save a clean 0..n order so positions stay unique
      for (const [k, x] of next.entries()) if (x.sort_order !== k) await api.updateProductImage(x.id, { sort_order: k });
    } catch (e) { setError(friendlyError(e)); }
    setBusy(""); onChange();
  }
  async function replace(img: ProductImage, files: FileList | null) {
    const f = files?.[0];
    if (!f || !api) return;
    setError(""); setBusy(`Replacing with ${f.name}…`);
    try {
      const { full, thumb } = await prepareImage(f);
      await api.uploadProductImage(product.id, full, thumb, img.alt || product.name, img.sort_order);
      await api.deleteProductImage(img);
      toast("Photo replaced.");
    } catch (e) { setError(friendlyError(e, `"${f.name}" couldn't be uploaded. Please try again.`)); }
    setBusy(""); onChange();
  }
  async function del(img: ProductImage) {
    if (!api || !window.confirm("Remove this photo?")) return;
    setBusy("Removing…");
    try { await api.deleteProductImage(img); toast("Photo removed."); } catch (e) { setError(friendlyError(e)); }
    setBusy(""); onChange();
  }
  async function saveAlt(img: ProductImage) {
    const v = (alts[img.id] ?? img.alt).trim().slice(0, 300);
    if (!api || v === img.alt) return;
    try { await api.updateProductImage(img.id, { alt: v }); toast("Description saved."); onChange(); } catch (e) { setError(friendlyError(e)); }
  }

  return (
    <section className="card p-5" aria-labelledby="pe-photos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pe-photos" className="text-lg font-extrabold">Photos</h2>
        <label className="btn-primary cursor-pointer">
          <Icon name="upload" className="h-4 w-4" />Add photos
          <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={!!busy} />
        </label>
      </div>
      <p className="mt-1 text-sm text-muted">JPG, PNG or WebP from your phone or computer. Photos are resized automatically. The first photo is the main one.</p>
      {busy && <p className="mt-3 font-semibold text-forest" role="status">{busy}</p>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {!images.length ? <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-muted">No photos yet. The store shows a placeholder until you add one.</p> : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="rounded-xl border border-line p-3">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-cream">
                <img src={img.thumb_url || img.url} alt={img.alt} className="h-full w-full object-cover" />
                {i === 0 && <span className="chip absolute left-2 top-2 bg-forest text-white">Main photo</span>}
              </div>
              <label className="label mt-2 text-xs" htmlFor={`alt-${img.id}`}>Photo description (for screen readers)</label>
              <input id={`alt-${img.id}`} className="input text-sm" value={alts[img.id] ?? img.alt} onChange={(e) => setAlts((a) => ({ ...a, [img.id]: e.target.value }))} onBlur={() => saveAlt(img)} maxLength={300} />
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className="btn-ghost px-3 text-sm" disabled={i === 0 || !!busy} onClick={() => move(img, -1)} aria-label="Move photo earlier">← Earlier</button>
                <button type="button" className="btn-ghost px-3 text-sm" disabled={i === images.length - 1 || !!busy} onClick={() => move(img, 1)} aria-label="Move photo later">Later →</button>
                <label className="btn-ghost cursor-pointer px-3 text-sm">Replace<input type="file" accept={ACCEPTED.join(",")} className="sr-only" disabled={!!busy} onChange={(e) => replace(img, e.target.files)} /><span className="sr-only"> photo {i + 1}</span></label>
                <button type="button" className="ml-auto grid h-11 w-11 place-items-center rounded-full text-red-700 hover:bg-red-50" disabled={!!busy} onClick={() => del(img)} aria-label="Remove photo"><Icon name="trash" className="h-4.5 w-4.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
