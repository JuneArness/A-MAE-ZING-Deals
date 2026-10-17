import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { POLICY_TITLES, type PolicyKey } from "../data/defaults";
import { useAdminSession } from "../lib/auth";
import { useCart } from "../lib/cart";
import { shortCategory, telHref } from "../lib/format";
import { useStore } from "../lib/store";
import { Logo } from "./Logo";
import { Icon } from "./ui";

function SearchForm({ id, onDone }: { id: string; onDone?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : "/shop");
    onDone?.();
  };
  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <label htmlFor={id} className="sr-only">Search products</label>
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sponges, hooks, baskets…"
        className="input rounded-full pl-4 pr-12" autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-forest text-white hover:bg-forest-dark" aria-label="Search">
        <Icon name="search" className="h-4.5 w-4.5" />
      </button>
    </form>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { categories, settings } = useStore();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="Menu"
      className="m-0 ml-auto h-full max-h-none w-[min(22rem,88vw)] max-w-none bg-ivory p-0 text-charcoal backdrop:bg-charcoal/50">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Logo size={36} />
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-sage-100" aria-label="Close menu"><Icon name="close" /></button>
      </div>
      <div className="p-4"><SearchForm id="m-search" onDone={onClose} /></div>
      <nav aria-label="Categories" className="px-2">
        <ul>
          <li><Link to="/shop" onClick={onClose} className="flex min-h-12 items-center rounded-xl px-3 font-bold hover:bg-sage-100">Shop all deals</Link></li>
          {categories.map((c) => (
            <li key={c.id}><Link to={`/category/${c.slug}`} onClick={onClose} className="flex min-h-12 items-center rounded-xl px-3 hover:bg-sage-100">{c.name}</Link></li>
          ))}
          <li><Link to="/shop?max=5" onClick={onClose} className="flex min-h-12 items-center rounded-xl px-3 font-semibold text-coral-dark hover:bg-sage-100">Deals under $5</Link></li>
          <li><Link to="/contact" onClick={onClose} className="flex min-h-12 items-center rounded-xl px-3 hover:bg-sage-100">Contact &amp; pickup</Link></li>
        </ul>
      </nav>
      <div className="mt-4 space-y-2 border-t border-line p-4 text-sm">
        {[settings.phone_primary, settings.phone_secondary].filter(Boolean).map((p) => (
          <a key={p} href={telHref(p)} className="flex min-h-11 items-center gap-2 font-semibold text-forest"><Icon name="phone" className="h-4 w-4" />{p}</a>
        ))}
      </div>
    </dialog>
  );
}

export function Layout() {
  const { settings, categories, api } = useStore();
  const { count } = useCart();
  const { isAdmin } = useAdminSession();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [loc.pathname]);
  const socials = [["Facebook", settings.facebook_url], ["Instagram", settings.instagram_url], ["TikTok", settings.tiktok_url]].filter(([, u]) => /^https:\/\//.test(u));

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
      {api?.mode === "demo" && (
        <div className="bg-[#fdf7e6] px-4 py-1.5 text-center text-xs font-semibold text-[#5c4a12]">
          Preview mode: sample data in this browser only. Orders placed here are not sent to the store.
        </div>
      )}
      {settings.announcement_enabled && settings.announcement && (
        <div className="bg-forest px-4 py-2 text-center text-sm font-semibold text-white">
          <span aria-hidden="true">✦ </span>{settings.announcement}
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
        <div className="container-page flex items-center gap-3 py-3 lg:gap-6">
          <button type="button" className="grid h-11 w-11 flex-none place-items-center rounded-full hover:bg-sage-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu" aria-haspopup="dialog">
            <Icon name="menu" />
          </button>
          <Link to="/" className="flex-none" aria-label={`${settings.store_name} home`}>
            {/^(https:|data:image\/)/.test(settings.logo_url) ? <img src={settings.logo_url} alt="" className="h-11 w-auto max-w-[11rem] object-contain" /> : <Logo size={42} />}
          </Link>
          <div className="hidden flex-1 md:block"><SearchForm id="h-search" /></div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href={telHref(settings.phone_primary)} className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-forest hover:bg-sage-100 xl:flex">
              <Icon name="phone" className="h-4 w-4" />{settings.phone_primary}
            </a>
            {isAdmin && <Link to="/admin" className="btn-ghost hidden px-3 sm:inline-flex"><Icon name="user" className="h-4.5 w-4.5" />Admin</Link>}
            <Link to="/cart" className="relative grid h-11 min-w-11 place-items-center rounded-full px-2 text-forest hover:bg-sage-100" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
              <Icon name="cart" className="h-6 w-6" />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral-dark px-1 text-[0.7rem] font-bold text-white" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
            </Link>
          </div>
        </div>
        <div className="container-page pb-3 md:hidden"><SearchForm id="s-search" /></div>
        <nav aria-label="Product categories" className="hidden border-t border-line lg:block">
          <ul className="container-page flex items-center gap-1 overflow-x-auto py-1.5 text-sm font-semibold">
            <li><NavLink to="/shop" end className={({ isActive }) => `block whitespace-nowrap rounded-full px-3 py-2 ${isActive ? "bg-sage-100 text-forest-dark" : "hover:bg-sage-50"}`}>All Deals</NavLink></li>
            {categories.map((c) => (
              <li key={c.id}><NavLink to={`/category/${c.slug}`} title={c.name} className={({ isActive }) => `block whitespace-nowrap rounded-full px-3 py-2 ${isActive ? "bg-sage-100 text-forest-dark" : "hover:bg-sage-50"}`}>{shortCategory(c.name)}</NavLink></li>
            ))}
            <li className="ml-auto"><Link to="/shop?max=5" className="block whitespace-nowrap rounded-full px-3 py-2 text-coral-dark hover:bg-coral-50">Under $5</Link></li>
          </ul>
        </nav>
      </header>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />

      <main id="main" className="flex-1" tabIndex={-1}><Outlet /></main>

      <footer className="mt-16 bg-forest-dark text-[#e6ece3]">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <span className="inline-flex rounded-2xl bg-ivory px-3 py-2"><Logo size={38} /></span>
            <p className="text-sm text-[#cfdccb]">{settings.slogan}</p>
            <p className="text-sm text-[#cfdccb]">Quality everyday essentials. Affordable prices. Local convenience.</p>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-white">Shop</h2>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:underline" to="/shop">All deals</Link></li>
              {categories.slice(0, 6).map((c) => <li key={c.id}><Link className="hover:underline" to={`/category/${c.slug}`}>{c.name}</Link></li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-white">Store policies</h2>
            <ul className="space-y-2 text-sm">
              {(Object.keys(POLICY_TITLES) as PolicyKey[]).map((k) => <li key={k}><Link className="hover:underline" to={`/policies/${k}`}>{POLICY_TITLES[k]}</Link></li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-white">Contact</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Icon name="pin" className="h-4 w-4" />{settings.service_area}</li>
              {[settings.phone_primary, settings.phone_secondary].filter(Boolean).map((p) => (
                <li key={p}><a className="flex min-h-9 items-center gap-2 font-semibold hover:underline" href={telHref(p)}><Icon name="phone" className="h-4 w-4" />{p}</a></li>
              ))}
              {settings.email && <li><a className="hover:underline" href={`mailto:${settings.email}`}>{settings.email}</a></li>}
              <li><Link className="hover:underline" to="/contact">Pickup &amp; contact details</Link></li>
            </ul>
            {socials.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2 text-sm">
                {socials.map(([n, u]) => <li key={n}><a className="rounded-full border border-white/25 px-3 py-1.5 hover:bg-white/10" href={u} target="_blank" rel="noopener noreferrer">{n}<span className="sr-only"> (opens in a new tab)</span></a></li>)}
              </ul>
            )}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-page flex flex-col gap-2 py-5 text-xs text-[#b9c8b5] sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} {settings.legal_name}. All rights reserved.</p>
            <p className="flex gap-4">
              <span>Website by SAP Development Solutions, LLC</span>
              <Link to="/admin" className="hover:underline">Owner login</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
