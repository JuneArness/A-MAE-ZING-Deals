// Runs after `vite build`: writes dist/sitemap.xml (published, non-sample products and
// active categories, read with the PUBLIC key) and fills the Sitemap line in robots.txt.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const env = { ...process.env };
for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const site = (env.VITE_SITE_URL || "").replace(/\/+$/, "");
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
if (!existsSync("dist")) { console.error("sitemap: run vite build first"); process.exit(1); }
if (!/^https?:\/\//.test(site)) { console.warn("sitemap: VITE_SITE_URL not set; skipping sitemap (set it in your hosting settings)."); process.exit(0); }

const paths = ["/", "/shop", "/contact", "/policies/privacy", "/policies/returns", "/policies/cancellation", "/policies/fulfillment", "/policies/payment"];
if (url && key && env.VITE_DEMO_MODE !== "true") {
  try {
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    const [cats, prods] = await Promise.all([
      fetch(`${url}/rest/v1/categories?select=slug&is_active=eq.true`, { headers: h }).then((r) => r.json()),
      fetch(`${url}/rest/v1/products?select=slug&is_published=eq.true&is_archived=eq.false&availability=neq.demo`, { headers: h }).then((r) => r.json()),
    ]);
    if (Array.isArray(cats)) cats.forEach((c) => paths.push(`/category/${c.slug}`));
    if (Array.isArray(prods)) prods.forEach((p) => paths.push(`/product/${p.slug}`));
  } catch (e) { console.warn("sitemap: couldn't reach Supabase, writing basic sitemap only.", e.message); }
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join("\n")}\n</urlset>\n`;
writeFileSync("dist/sitemap.xml", xml);
if (existsSync("dist/robots.txt")) {
  writeFileSync("dist/robots.txt", readFileSync("dist/robots.txt", "utf8").replace(/^Sitemap:.*$/m, `Sitemap: ${site}/sitemap.xml`).replace(/^# Replace.*\n/m, ""));
}
console.log(`sitemap: ${paths.length} pages for ${site}`);
