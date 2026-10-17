// Policies, contact page, 404 page and "store not connected" page.
import { Link, useParams } from "react-router-dom";
import { Icon, Notice } from "../components/ui";
import { POLICY_TITLES, policyText, type PolicyKey } from "../data/defaults";
import { telHref } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

export function Policy() {
  const { key = "" } = useParams();
  const { settings } = useStore();
  const valid = key in POLICY_TITLES;
  const k = key as PolicyKey;
  useSeo({ title: `${valid ? POLICY_TITLES[k] : "Policy"} | ${settings.store_name}`, path: `/policies/${key}`, noindex: !valid });
  if (!valid) return <NotFoundPage />;
  return (
    <div className="container-page max-w-3xl py-10">
      <nav aria-label="Store policies" className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(POLICY_TITLES) as PolicyKey[]).map((p) => (
          <Link key={p} to={`/policies/${p}`} aria-current={p === k ? "page" : undefined}
            className={`chip px-3 py-2 text-sm ${p === k ? "bg-forest text-white" : "border border-line bg-white hover:border-forest"}`}>{POLICY_TITLES[p]}</Link>
        ))}
      </nav>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{POLICY_TITLES[k]}</h1>
      {!settings.policies_reviewed && <div className="mt-4"><Notice tone="warn">Draft policy, pending review by {settings.legal_name}. Questions? Call {settings.phone_primary}.</Notice></div>}
      <div className="mt-6 space-y-4 whitespace-pre-line text-lg leading-relaxed">{policyText(settings, k)}</div>
      {k === "payment" && (settings.cashapp_tag || settings.venmo_username) && (
        <ul className="card mt-6 space-y-1 p-5">
          {settings.cashapp_tag && <li><b>Cash App:</b> {settings.cashapp_tag}</li>}
          {settings.venmo_username && <li><b>Venmo:</b> {settings.venmo_username}</li>}
        </ul>
      )}
    </div>
  );
}

export function Contact() {
  const { settings } = useStore();
  useSeo({ title: `Contact & Pickup | ${settings.store_name}`, description: `Contact ${settings.legal_name} in ${settings.service_area}. Call ${settings.phone_primary}.`, path: "/contact" });
  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Contact &amp; pickup</h1>
      <p className="mt-2 text-lg text-muted">We're a local store serving {settings.service_area}. Call or text us any time about products or your order.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="card p-6" aria-labelledby="c-phone">
          <h2 id="c-phone" className="text-xl font-extrabold">Call or text</h2>
          <ul className="mt-3 space-y-2">
            {[settings.phone_primary, settings.phone_secondary].filter(Boolean).map((p) => (
              <li key={p}><a href={telHref(p)} className="inline-flex min-h-11 items-center gap-2 text-lg font-bold text-forest hover:underline"><Icon name="phone" className="h-5 w-5" />{p}</a></li>
            ))}
            {settings.email && <li><a href={`mailto:${settings.email}`} className="font-semibold text-forest underline">{settings.email}</a></li>}
          </ul>
        </section>
        <section className="card p-6" aria-labelledby="c-loc">
          <h2 id="c-loc" className="text-xl font-extrabold">Location &amp; pickup</h2>
          <p className="mt-3 flex items-center gap-2 font-semibold"><Icon name="pin" className="h-5 w-5 text-forest" />{settings.service_area}</p>
          <p className="mt-2 whitespace-pre-line text-muted">{settings.pickup_instructions || "Pickup details are shared when we confirm your order. Please don't stop by until we've confirmed it with you."}</p>
          {settings.delivery_enabled && <p className="mt-2 text-muted"><b>Local delivery:</b> {settings.delivery_area || "Ask us about delivery to your area."}</p>}
        </section>
      </div>
      <section className="card mt-4 p-6" aria-labelledby="c-pay">
        <h2 id="c-pay" className="text-xl font-extrabold">Payment</h2>
        <p className="mt-2 text-muted">We accept Cash App, Venmo and cash. We'll confirm your order before you pay. <Link to="/policies/payment" className="font-semibold text-forest underline">Payment instructions</Link></p>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  const { settings } = useStore();
  useSeo({ title: `Page not found | ${settings.store_name}`, noindex: true });
  return (
    <div className="container-page py-16 text-center">
      <p className="text-6xl" aria-hidden="true">🧺</p>
      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">We couldn't find that page</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">The item may have sold out or moved. Try searching, or browse all of today's deals.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/shop" className="btn-primary">Shop all deals</Link>
        <Link to="/" className="btn-secondary">Go to the home page</Link>
      </div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="card max-w-lg p-8">
        <h1 className="text-2xl font-black">This store isn't connected yet</h1>
        <p className="mt-3 text-muted">The website is installed, but its database connection hasn't been set up.</p>
        <p className="mt-3 text-sm text-muted"><b>Store owner:</b> add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your hosting settings, then redeploy. The README has step-by-step instructions.</p>
        <p className="mt-4 font-semibold">To order now, call (616) 719-7033 or (269) 838-0075.</p>
      </div>
    </div>
  );
}
