// Owner dashboard. Screens are shown only to signed-in administrators, and every
// action is checked again by the database (see supabase/migrations/0003_security.sql).
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Logo } from "../components/Logo";
import { Icon, Notice, Spinner } from "../components/ui";
import { useAdminSession } from "../lib/auth";
import { friendlyError } from "../lib/format";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "../lib/demoCreds";
import Categories from "./Categories";
import Dashboard from "./Dashboard";
import ImportExport from "./ImportExport";
import { OrderDetail, Orders } from "./Orders";
import ProductEditor from "./ProductEditor";
import Products from "./Products";
import Settings from "./Settings";

function Login() {
  const { api } = useStore();
  const { refresh } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!api || busy) return;
    setBusy(true); setError("");
    try { await api.signIn(email.trim(), password); await refresh(); }
    catch (err) { setError(friendlyError(err, "Sign-in failed. Please try again.")); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-sage-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7" aria-labelledby="login-title">
        <Link to="/" aria-label="Back to the store"><Logo size={40} /></Link>
        <h1 id="login-title" className="mt-6 text-2xl font-black">Owner sign in</h1>
        <p className="mt-1 text-sm text-muted">For store administrators only.</p>
        {api?.mode === "demo" && <div className="mt-4"><Notice tone="warn">Preview mode. Sign in with <b>{DEMO_ADMIN_EMAIL}</b> / <b>{DEMO_ADMIN_PASSWORD}</b>. Changes stay in this browser.</Notice></div>}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <label className="label mt-5" htmlFor="l-email">Email</label>
        <input id="l-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label mt-4" htmlFor="l-pass">Password</label>
        <input id="l-pass" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <Link to="/" className="btn-ghost mt-2 w-full">Back to the store</Link>
      </form>
    </div>
  );
}

const NAV = [
  ["/admin", "Overview", "grid"], ["/admin/orders", "Orders", "receipt"], ["/admin/products", "Products", "box"],
  ["/admin/categories", "Categories", "folder"], ["/admin/import", "Import / Export", "upload"], ["/admin/settings", "Settings", "gear"],
] as const;

export default function AdminApp() {
  const { session, isAdmin, checking } = useAdminSession();
  const { api } = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useSeo({ title: "Admin | A MAE Zing Deals", noindex: true });

  if (!api || checking) return <Spinner label="Checking your sign-in" />;
  if (!session) return <Login />;
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-md p-7">
          <h1 className="text-2xl font-black">No admin access</h1>
          <p className="mt-2 text-muted">You're signed in as {session.email}, but this account isn't a store administrator.</p>
          <div className="mt-5 flex gap-2"><button className="btn-primary" onClick={() => api.signOut()}>Sign out</button><Link to="/" className="btn-secondary">Back to the store</Link></div>
        </div>
      </div>
    );
  }

  const nav = (
    <ul className="space-y-1">
      {NAV.map(([to, label, icon]) => (
        <li key={to}>
          <NavLink to={to} end={to === "/admin"} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold ${isActive ? "bg-white text-forest shadow-sm" : "text-[#dfe8db] hover:bg-white/10"}`}>
            <Icon name={icon} className="h-5 w-5" />{label}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-screen bg-[#f5f3ec] lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <aside className="bg-forest-dark text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center justify-between p-4">
          <Link to="/admin" className="rounded-xl bg-ivory px-2 py-1.5"><Logo size={32} /></Link>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10 lg:hidden" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen((v) => !v)} aria-label="Admin menu"><Icon name={open ? "close" : "menu"} /></button>
        </div>
        <nav id="admin-nav" aria-label="Admin" className={`${open ? "block" : "hidden"} px-3 pb-4 lg:block`}>
          {nav}
          <div className="mt-6 border-t border-white/15 pt-4 text-sm">
            <p className="truncate px-3 text-[#b9c8b5]">{session.email}</p>
            <Link to="/" className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 hover:bg-white/10"><Icon name="bag" className="h-5 w-5" />View store</Link>
            <button type="button" onClick={() => api.signOut()} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 hover:bg-white/10"><Icon name="logout" className="h-5 w-5" />Sign out</button>
          </div>
        </nav>
      </aside>
      <main id="admin-main" className="min-w-0 p-4 sm:p-6 lg:p-8" key={loc.pathname}>
        {api.mode === "demo" && <div className="mb-4"><Notice tone="warn">Preview mode: changes are saved only in this browser and no real orders are received.</Notice></div>}
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEditor />} />
          <Route path="products/:id" element={<ProductEditor />} />
          <Route path="categories" element={<Categories />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="import" element={<ImportExport />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function PageHeader({ title, children, back }: { title: string; children?: ReactNode; back?: [string, string] }) {
  return (
    <div className="mb-6">
      {back && <Link to={back[0]} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:underline"><Icon name="back" className="h-4 w-4" />{back[1]}</Link>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}
