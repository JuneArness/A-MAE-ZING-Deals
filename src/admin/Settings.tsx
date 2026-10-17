import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import { Notice, Spinner } from "../components/ui";
import { DRAFT_POLICIES, POLICY_TITLES, type PolicyKey } from "../data/defaults";
import { friendlyError } from "../lib/format";
import { prepareLogo } from "../lib/image";
import { useStore } from "../lib/store";
import type { StoreSettings } from "../lib/types";
import { PageHeader } from "./AdminApp";

type Text = Exclude<{ [K in keyof StoreSettings]-?: StoreSettings[K] extends string ? K : never }[keyof StoreSettings], "updated_at" | undefined>;
type Bool = Exclude<{ [K in keyof StoreSettings]-?: StoreSettings[K] extends boolean ? K : never }[keyof StoreSettings], undefined>;

function Section({ id, title, children, intro }: { id: string; title: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-6 space-y-4 p-5">
      <div><h2 id={`${id}-t`} className="text-lg font-extrabold">{title}</h2>{intro && <div className="mt-1 text-sm text-muted">{intro}</div>}</div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { api, settings, reload } = useStore();
  const toast = useToast();
  const [s, setS] = useState<StoreSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  useEffect(() => { setS(settings); }, [settings]);
  useEffect(() => { if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }, []);

  const text = (k: Text, label: string, opts: { hint?: string; area?: boolean; placeholder?: string; type?: string; max?: number } = {}) => (
    <div>
      <label className="label" htmlFor={`st-${k}`}>{label}</label>
      {opts.area
        ? <textarea id={`st-${k}`} className="input min-h-24" maxLength={opts.max ?? 2000} placeholder={opts.placeholder} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
        : <input id={`st-${k}`} className="input" type={opts.type ?? "text"} maxLength={opts.max ?? 300} placeholder={opts.placeholder} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />}
      {opts.hint && <p className="mt-1 text-xs text-muted">{opts.hint}</p>}
    </div>
  );
  const check = (k: Bool, label: string, hint?: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#2f5d46]" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
      <span><b className="block">{label}</b>{hint && <span className="text-sm text-muted">{hint}</span>}</span>
    </label>
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!api) return;
    for (const k of ["cashapp_url", "venmo_url", "facebook_url", "instagram_url", "tiktok_url"] as const) {
      if (s[k] && !/^https:\/\/[^\s]+$/.test(s[k])) { setError(`The ${k.replace("_url", "").replace("cashapp", "Cash App")} link must start with https://`); document.getElementById(`st-${k}`)?.focus(); return; }
    }
    if (s.cashapp_tag && !/^\$[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(s.cashapp_tag)) { setError("Cash App tags start with $ followed by letters or numbers, like $YourStore."); document.getElementById("st-cashapp_tag")?.focus(); return; }
    if (!s.pickup_enabled && !s.delivery_enabled && !s.shipping_enabled && !window.confirm("No pickup, delivery or shipping option is turned on, so customers won't be able to check out. Save anyway?")) return;
    setBusy(true); setError("");
    const { updated_at: _u, ...patch } = s; void _u;
    try { await api.saveSettings(patch); await reload(); toast("Settings saved."); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  }

  async function uploadLogo(f?: File) {
    if (!f || !api) return;
    setLogoBusy(true); setError("");
    try { const url = await api.uploadLogo(await prepareLogo(f)); setS((v) => ({ ...v, logo_url: url })); toast("Logo uploaded. Click Save settings to use it."); }
    catch (e) { setError(friendlyError(e)); }
    finally { setLogoBusy(false); }
  }

  if (!api) return <Spinner />;
  return (
    <>
      <PageHeader title="Store settings" />
      <form onSubmit={save} className="max-w-3xl space-y-6" noValidate>
        {error && <Notice tone="error">{error}</Notice>}

        <Section id="store" title="Store details">
          <div className="grid gap-4 sm:grid-cols-2">
            {text("store_name", "Store name")}{text("legal_name", "Legal business name")}
            {text("slogan", "Slogan")}{text("tagline", "Supporting headline")}
            {text("phone_primary", "Primary phone", { type: "tel" })}{text("phone_secondary", "Secondary phone", { type: "tel", hint: "Leave blank to hide." })}
            {text("email", "Contact email (optional)", { type: "email" })}{text("service_area", "Service area shown on the site", { hint: "No street address is shown unless you type one here." })}
          </div>
          <div>
            <p className="label">Logo</p>
            <div className="flex flex-wrap items-center gap-3">
              {s.logo_url ? <img src={s.logo_url} alt="Current logo" className="h-14 w-auto rounded-lg border border-line bg-white p-1" /> : <span className="text-sm text-muted">Using the built-in A MAE Zing Deals logo.</span>}
              <label className="btn-secondary cursor-pointer">{logoBusy ? "Uploading…" : "Upload logo"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={logoBusy} onChange={(e) => uploadLogo(e.target.files?.[0])} /></label>
              {s.logo_url && <button type="button" className="btn-ghost" onClick={() => setS({ ...s, logo_url: "" })}>Use built-in logo</button>}
            </div>
          </div>
        </Section>

        <Section id="announcement" title="Announcement bar">
          {check("announcement_enabled", "Show the announcement bar")}
          {text("announcement", "Message", { max: 160 })}
        </Section>

        <Section id="payment" title="Payment details" intro={<>Enter only your <b>real, verified</b> accounts. Customers will send money here. Double-check spelling, then test by sending yourself $1. Leave blank until ready: checkout will tell customers you'll share details when you confirm.</>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("cashapp_tag", "Cash App $Cashtag", { placeholder: "$YourStore" })}
            {text("cashapp_url", "Cash App link (optional)", { placeholder: "https://cash.app/$YourStore", type: "url" })}
            {text("venmo_username", "Venmo username", { placeholder: "@Your-Store" })}
            {text("venmo_url", "Venmo link (optional)", { placeholder: "https://venmo.com/u/Your-Store", type: "url" })}
          </div>
          {text("payment_instructions", "Extra payment instructions (optional)", { area: true, placeholder: "e.g. Please put your order number in the payment note." })}
        </Section>

        <Section id="fulfillment" title="Pickup, delivery & shipping" intro="Customers can only choose options that are turned on. No fees are charged online.">
          {check("pickup_enabled", "Offer local pickup")}
          {text("pickup_instructions", "Pickup instructions", { area: true, placeholder: "Where and when customers pick up. Leave blank to say details are confirmed after ordering." })}
          {check("delivery_enabled", "Offer local delivery")}
          {s.delivery_enabled && <>{text("delivery_area", "Delivery area", { placeholder: "e.g. Within 5 miles of S.E. Grand Rapids" })}{text("delivery_instructions", "Delivery details (fees, days)", { area: true })}</>}
          {check("shipping_enabled", "Offer shipping", "Only turn on once you're ready to ship. Shipping costs are not calculated online.")}
          {s.shipping_enabled && text("shipping_instructions", "Shipping details", { area: true })}
        </Section>

        <Section id="samples" title="Sample listings">
          {check("demo_orders_allowed", "Allow orders for sample listings", "Sample listings came with the site as examples. Turn this off once your real products are entered, so customers can only order items you've confirmed.")}
        </Section>

        <Section id="social" title="Social links" intro="Shown in the footer only when filled in.">
          <div className="grid gap-4 sm:grid-cols-3">
            {text("facebook_url", "Facebook", { type: "url", placeholder: "https://…" })}{text("instagram_url", "Instagram", { type: "url", placeholder: "https://…" })}{text("tiktok_url", "TikTok", { type: "url", placeholder: "https://…" })}
          </div>
        </Section>

        <Section id="policies" title="Store policies" intro="Starting drafts are filled in below. Edit them to match how you run the store. They are not legal advice; consider having a professional review them.">
          {(Object.keys(POLICY_TITLES) as PolicyKey[]).map((k) => {
            const key = `policy_${k}` as Text;
            return (
              <div key={k}>
                <label className="label" htmlFor={`st-${key}`}>{POLICY_TITLES[k]}</label>
                <textarea id={`st-${key}`} className="input min-h-36" maxLength={6000} value={s[key] || DRAFT_POLICIES[k]} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
              </div>
            );
          })}
          {check("policies_reviewed", "I've reviewed these policies", "Removes the “draft policy” note shown to customers.")}
        </Section>

        <div className="sticky bottom-3 z-10 flex justify-end">
          <button className="btn-primary px-10 shadow-lg" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      </form>
    </>
  );
}
