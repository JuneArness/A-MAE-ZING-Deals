// CSV export and import. Import checks every row first and refuses to apply
// anything until all errors are fixed.
import { useState } from "react";
import { useToast } from "../components/Toast";
import { Icon, Notice, Spinner } from "../components/ui";
import { download, parseCsv, toCsv } from "../lib/csv";
import { friendlyError, money } from "../lib/format";
import { useStore } from "../lib/store";
import type { ProductUpdate } from "../lib/api";
import type { Availability, Category, ProductInput } from "../lib/types";
import { PageHeader } from "./AdminApp";
import { useLoad } from "./hooks";

const COLUMNS = ["slug", "name", "category", "price", "compare_at", "compare_at_verified", "compare_at_source", "sku", "inventory_qty",
  "low_stock_threshold", "availability", "is_published", "is_featured", "is_bestseller", "is_new", "description"] as const;
const REQUIRED = ["slug", "name", "category", "price"] as const;

const yes = (v: string) => /^(true|yes|y|1|x)$/i.test(v.trim());
const boolOk = (v: string) => v.trim() === "" || /^(true|false|yes|no|y|n|1|0|x)$/i.test(v.trim());

interface Checked { line: number; input?: ProductInput; update?: ProductUpdate; errors: string[]; isUpdate: boolean; }

// CSV column -> product field it controls (updates only change columns present in the file)
const FIELD: Record<(typeof COLUMNS)[number], (keyof ProductInput)[]> = {
  slug: ["slug"], name: ["name"], category: ["category_id"], price: ["price_cents"], compare_at: ["compare_at_cents"],
  compare_at_verified: ["compare_at_verified"], compare_at_source: ["compare_at_source"], sku: ["sku"], inventory_qty: ["inventory_qty"],
  low_stock_threshold: ["low_stock_threshold"], availability: ["availability"], is_published: ["is_published"], is_featured: ["is_featured"],
  is_bestseller: ["is_bestseller"], is_new: ["is_new"], description: ["description"],
};

export function validateRows(rows: string[][], categories: Category[], existingSlugs: Set<string>, existingSkus: Map<string, string>): Checked[] | string {
  if (rows.length < 2) return "The file has no product rows.";
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected columns.`;
  const idx = (c: string) => header.indexOf(c);
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const seenSlugs = new Set<string>(), seenSkus = new Set<string>();
  if (rows.length > 1001) return "Please import 1,000 products or fewer at a time.";

  return rows.slice(1).map((r, i) => {
    const get = (c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
    const errors: string[] = [];
    const slug = get("slug").toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) errors.push("slug must be lowercase letters, numbers and dashes");
    if (seenSlugs.has(slug)) errors.push("slug appears twice in this file");
    seenSlugs.add(slug);
    const name = get("name");
    if (!name || name.length > 120) errors.push("name is required (120 characters max)");
    const catKey = get("category").toLowerCase();
    const cat = catBySlug.get(catKey) ?? catByName.get(catKey);
    if (!cat) errors.push(`category "${get("category")}" doesn't exist`);
    const price = Number(get("price").replace(/^\$/, ""));
    if (!Number.isFinite(price) || price <= 0 || price > 1000) errors.push("price must be a number like 4.99");
    const compareRaw = get("compare_at").replace(/^\$/, "");
    const compare = compareRaw === "" ? null : Number(compareRaw);
    if (compare !== null && (!Number.isFinite(compare) || compare <= price)) errors.push("compare_at must be blank or higher than price");
    const verified = yes(get("compare_at_verified"));
    if (verified && compare === null) errors.push("compare_at_verified needs a compare_at price");
    if (verified && !get("compare_at_source")) errors.push("compare_at_source is required when compare_at_verified is true");
    const sku = get("sku");
    if (sku.length > 64) errors.push("sku is too long");
    if (sku && seenSkus.has(sku)) errors.push("sku appears twice in this file");
    if (sku && existingSkus.has(sku) && existingSkus.get(sku) !== slug) errors.push(`sku is already used by "${existingSkus.get(sku)}"`);
    if (sku) seenSkus.add(sku);
    const qtyRaw = get("inventory_qty"), lowRaw = get("low_stock_threshold");
    const qty = qtyRaw === "" ? 0 : Number(qtyRaw), low = lowRaw === "" ? 3 : Number(lowRaw);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100000) errors.push("inventory_qty must be a whole number 0 or more");
    if (!Number.isInteger(low) || low < 0 || low > 1000) errors.push("low_stock_threshold must be a whole number");
    const avail = (get("availability") || "available").toLowerCase();
    if (!["available", "unavailable", "demo"].includes(avail)) errors.push("availability must be available, unavailable or demo");
    for (const b of ["compare_at_verified", "is_published", "is_featured", "is_bestseller", "is_new"]) if (!boolOk(get(b))) errors.push(`${b} must be true or false`);
    const description = get("description");
    if (description.length > 4000) errors.push("description is too long (4,000 max)");

    const input: ProductInput | undefined = errors.length ? undefined : {
      slug, name, category_id: cat!.id, description, price_cents: Math.round(price * 100),
      compare_at_cents: compare === null ? null : Math.round(compare * 100), compare_at_verified: compare === null ? false : verified,
      compare_at_source: get("compare_at_source") || null, sku: sku || null, inventory_qty: qty, low_stock_threshold: low,
      availability: avail as Availability, is_published: get("is_published") === "" ? true : yes(get("is_published")),
      is_featured: yes(get("is_featured")), is_bestseller: yes(get("is_bestseller")), is_new: yes(get("is_new")), is_archived: false,
    };
    const isUpdate = existingSlugs.has(slug);
    let update: ProductUpdate | undefined;
    if (input && isUpdate) {
      update = { slug };
      for (const col of COLUMNS) if (header.includes(col)) for (const f of FIELD[col]) (update as Record<string, unknown>)[f] = input[f];
    }
    return { line: i + 2, input, update, errors, isUpdate };
  });
}

export default function ImportExport() {
  const { api, reload: reloadStore } = useStore();
  const toast = useToast();
  const products = useLoad(() => api!.listProducts({ admin: true }), [api]);
  const categories = useLoad(() => api!.listCategories({ includeInactive: true }), [api]);
  const [checked, setChecked] = useState<Checked[] | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  if (products.loading || categories.loading) return <Spinner />;
  const cats = categories.data ?? [];
  const catSlug = new Map(cats.map((c) => [c.id, c.slug]));

  function exportCsv() {
    const rows = (products.data ?? []).filter((p) => !p.is_archived).map((p) => [
      p.slug, p.name, catSlug.get(p.category_id ?? "") ?? "", (p.price_cents / 100).toFixed(2), p.compare_at_cents ? (p.compare_at_cents / 100).toFixed(2) : "",
      p.compare_at_verified, p.compare_at_source ?? "", p.sku ?? "", p.inventory_qty, p.low_stock_threshold, p.availability,
      p.is_published, p.is_featured, p.is_bestseller, p.is_new, p.description,
    ]);
    download(`amaezing-products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([[...COLUMNS], ...rows]));
  }
  function template() {
    download("amaezing-products-template.csv", toCsv([[...COLUMNS], ["sample-dish-brush", "Sample Dish Brush", cats[0]?.slug ?? "cleaning", "2.99", "", "false", "", "AMZ-NEW-001", "12", "3", "available", "true", "false", "false", "true", "Describe the item here."]]));
  }
  async function readFile(f?: File) {
    setChecked(null); setFileError("");
    if (!f) return;
    setFileName(f.name);
    if (f.size > 5 * 1024 * 1024) { setFileError("That file is larger than 5 MB."); return; }
    const text = await f.text();
    const existing = products.data ?? [];
    const res = validateRows(parseCsv(text), cats, new Set(existing.map((p) => p.slug)), new Map(existing.filter((p) => p.sku).map((p) => [p.sku!, p.slug])));
    if (typeof res === "string") setFileError(res); else setChecked(res);
  }
  async function apply() {
    if (!api || !checked || checked.some((c) => c.errors.length)) return;
    setBusy(true);
    try {
      const r = await api.importProducts(checked.filter((c) => !c.isUpdate).map((c) => c.input!), checked.filter((c) => c.isUpdate).map((c) => c.update!));
      toast(`Import complete: ${r.created} added, ${r.updated} updated.`);
      setChecked(null); setFileName("");
      await products.reload(); void reloadStore();
    } catch (e) { setFileError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  const bad = checked?.filter((c) => c.errors.length) ?? [];
  return (
    <>
      <PageHeader title="Import / Export products" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="ex">
          <h2 id="ex" className="text-lg font-extrabold">Export</h2>
          <p className="mt-1 text-sm text-muted">Download all products (except archived) as a spreadsheet you can open in Excel or Google Sheets.</p>
          <button className="btn-primary mt-4" onClick={exportCsv}><Icon name="upload" className="h-4 w-4 rotate-180" />Download products CSV</button>
        </section>
        <section className="card p-5" aria-labelledby="im">
          <h2 id="im" className="text-lg font-extrabold">Import</h2>
          <p className="mt-1 text-sm text-muted">Add new products or update existing ones (matched by <b>slug</b>). Updates only change the columns included in your file. Every row is checked first; nothing changes until the whole file is error-free. Photos are added separately on each product.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="btn-primary cursor-pointer">Choose CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} /></label>
            <button className="btn-secondary" onClick={template}>Download template</button>
          </div>
          <p className="mt-3 text-xs text-muted">Category column: use the category's web address (e.g. <code>cleaning</code>) or its exact name. True/false columns accept true, false, yes or no.</p>
        </section>
      </div>

      {fileError && <div className="mt-6"><Notice tone="error">{fileError}</Notice></div>}
      {checked && (
        <section className="card mt-6 p-5" aria-labelledby="pv">
          <h2 id="pv" className="text-lg font-extrabold">Check: {fileName}</h2>
          {bad.length ? (
            <Notice tone="error"><b>{bad.length} row{bad.length > 1 ? "s have" : " has"} problems.</b> Fix them in your spreadsheet and choose the file again. Nothing has been changed.</Notice>
          ) : (
            <Notice tone="ok">All {checked.length} rows look good: {checked.filter((c) => !c.isUpdate).length} new, {checked.filter((c) => c.isUpdate).length} updates.</Notice>
          )}
          <div className="mt-4 max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Rows in the file</caption>
              <thead className="sticky top-0 bg-white text-left text-muted"><tr><th className="p-2">Row</th><th className="p-2">Product</th><th className="p-2">Price</th><th className="p-2">Result</th></tr></thead>
              <tbody className="divide-y divide-line">
                {checked.map((c) => (
                  <tr key={c.line} className={c.errors.length ? "bg-red-50" : ""}>
                    <td className="p-2">{c.line}</td><td className="p-2">{c.input?.name ?? "—"}</td><td className="p-2">{c.input ? money(c.input.price_cents) : "—"}</td>
                    <td className="p-2">{c.errors.length ? <span className="text-red-800">{c.errors.join("; ")}</span> : c.isUpdate ? "Update" : "New"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary mt-4" disabled={busy || bad.length > 0} onClick={apply}>{busy ? "Importing…" : `Apply ${checked.length} row${checked.length === 1 ? "" : "s"}`}</button>
        </section>
      )}
    </>
  );
}
