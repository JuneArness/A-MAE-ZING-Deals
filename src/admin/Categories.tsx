import { useState, type FormEvent } from "react";
import { useToast } from "../components/Toast";
import { Icon, Modal, Notice, Spinner } from "../components/ui";
import { friendlyError, slugify } from "../lib/format";
import { categoryIcon } from "../lib/placeholder";
import { useStore } from "../lib/store";
import type { Category } from "../lib/types";
import { categoryFormSchema, fieldErrors } from "../lib/validation";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";

const COLORS = ["#3f7a5a", "#4f7f8f", "#b5674d", "#5d7fa3", "#7a6a9a", "#a3606f", "#8a7a3f", "#5f6b73"];

export default function Categories() {
  const { api, reload: reloadStore } = useStore();
  const toast = useToast();
  const cats = useLoad(() => api!.listCategories({ includeInactive: true }), [api]);
  const prods = useLoad(() => api!.listProducts({ admin: true }), [api]);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [error, setError] = useState("");

  const counts = new Map<string, number>();
  (prods.data ?? []).forEach((p) => p.category_id && counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1));
  const list = cats.data ?? [];

  async function refresh() { await cats.reload(); void reloadStore(); }

  async function move(c: Category, dir: -1 | 1) {
    const i = list.findIndex((x) => x.id === c.id), j = i + dir;
    if (!api || j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    try {
      for (const [k, x] of next.entries()) {
        const order = (k + 1) * 10;
        if (x.sort_order !== order) { const { id, product_count: _pc, ...rest } = x; void _pc; await api.saveCategory(id, { ...rest, sort_order: order }); }
      }
      await refresh();
    } catch (e) { setError(friendlyError(e)); }
  }
  async function toggleActive(c: Category) {
    if (!api) return;
    try { const { id, product_count: _pc, ...rest } = c; void _pc; await api.saveCategory(id, { ...rest, is_active: !c.is_active }); toast(c.is_active ? "Category hidden from the store." : "Category is visible again."); await refresh(); }
    catch (e) { setError(friendlyError(e)); }
  }
  async function remove(c: Category) {
    if (!api || !window.confirm(`Delete the category "${c.name}"?`)) return;
    try { await api.deleteCategory(c.id); toast("Category deleted."); await refresh(); }
    catch (e) { setError(friendlyError(e)); }
  }

  if (cats.loading && !cats.data) return <Spinner label="Loading categories" />;
  return (
    <>
      <PageHeader title="Categories"><button className="btn-primary" onClick={() => setEditing("new")}><Icon name="plus" className="h-4 w-4" />Add category</button></PageHeader>
      {(error || cats.error) && <div className="mb-4"><Notice tone="error">{error || cats.error}</Notice></div>}
      <p className="mb-4 text-sm text-muted">The order here is the order shoppers see in the menu. A category with products can't be deleted: move its products first, or hide the category instead.</p>
      <ul className="card divide-y divide-line">
        {list.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-xl text-2xl" style={{ background: `${c.color}22` }} aria-hidden="true">{categoryIcon(c.slug)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{c.name} {!c.is_active && <span className="chip ml-1 bg-[#efedea] text-muted">Hidden</span>}</p>
              <p className="text-sm text-muted">/{c.slug} · {counts.get(c.id) ?? 0} products</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button className="btn-ghost px-3 text-sm" disabled={i === 0} onClick={() => move(c, -1)} aria-label={`Move ${c.name} up`}>↑</button>
              <button className="btn-ghost px-3 text-sm" disabled={i === list.length - 1} onClick={() => move(c, 1)} aria-label={`Move ${c.name} down`}>↓</button>
              <button className="btn-secondary px-4 text-sm" onClick={() => setEditing(c)}>Edit</button>
              <button className="btn-secondary px-4 text-sm" onClick={() => toggleActive(c)}>{c.is_active ? "Hide" : "Show"}</button>
              <button className="btn-danger px-4 text-sm" onClick={() => remove(c)} disabled={(counts.get(c.id) ?? 0) > 0} title={(counts.get(c.id) ?? 0) > 0 ? "Move this category's products first" : undefined}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add category" : "Edit category"}>
        {editing !== null && <CategoryForm key={editing === "new" ? "new" : editing.id} category={editing === "new" ? null : editing} nextOrder={(list.length + 1) * 10}
          onSaved={async () => { setEditing(null); toast("Category saved."); await refresh(); }} />}
      </Modal>
    </>
  );
}

function CategoryForm({ category, nextOrder, onSaved }: { category: Category | null; nextOrder: number; onSaved: () => void }) {
  const { api } = useStore();
  const [f, setF] = useState({ name: category?.name ?? "", slug: category?.slug ?? "", description: category?.description ?? "", color: category?.color ?? COLORS[0], sort_order: String(category?.sort_order ?? nextOrder), is_active: category?.is_active ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = categoryFormSchema.safeParse(f);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setBusy(true); setError("");
    try { await api!.saveCategory(category?.id ?? null, { ...parsed.data, image_url: category?.image_url ?? null }); onSaved(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <div><label className="label" htmlFor="cf-name">Name</label><input id="cf-name" className="input" value={f.name} maxLength={80} onChange={(e) => setF((v) => ({ ...v, name: e.target.value, slug: category ? v.slug : slugify(e.target.value) }))} />{errors.name && <p className="field-error">{errors.name}</p>}</div>
      <div><label className="label" htmlFor="cf-slug">Web address</label><input id="cf-slug" className="input" value={f.slug} maxLength={80} onChange={(e) => setF((v) => ({ ...v, slug: e.target.value.toLowerCase() }))} />{errors.slug && <p className="field-error">{errors.slug}</p>}<p className="mt-1 text-xs text-muted">Shown as /category/{f.slug || "…"}</p></div>
      <div><label className="label" htmlFor="cf-desc">Short description</label><textarea id="cf-desc" className="input min-h-20" maxLength={500} value={f.description} onChange={(e) => setF((v) => ({ ...v, description: e.target.value }))} /></div>
      <fieldset><legend className="label">Color</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <label key={c} className="cursor-pointer"><input type="radio" name="cf-color" className="peer sr-only" checked={f.color === c} onChange={() => setF((v) => ({ ...v, color: c }))} />
              <span className="block h-10 w-10 rounded-full border-4 border-white ring-2 ring-transparent peer-checked:ring-forest peer-focus-visible:ring-coral" style={{ background: c }}><span className="sr-only">{c}</span></span></label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5 accent-[#2f5d46]" checked={f.is_active} onChange={(e) => setF((v) => ({ ...v, is_active: e.target.checked }))} />Visible on the store</label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save category"}</button>
    </form>
  );
}
