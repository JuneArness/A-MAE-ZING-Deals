// Shopping cart, saved in this browser so it survives a refresh.
// Totals here are for display only: the database recalculates prices and checks
// stock when the order is placed (see place_order in supabase/migrations).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "./store";
import type { CartLine, Product } from "./types";

const KEY = "amz-cart-v1";
export const MAX_QTY = 20; // matches the per-item limit in place_order

interface CartRow { product: Product; quantity: number; }
interface CartState {
  lines: CartLine[];
  rows: CartRow[];                 // lines matched to current products
  missing: number;                 // lines whose product is no longer available
  count: number;
  subtotalCents: number;
  add: (product: Product, qty?: number) => { added: number; capped: boolean };
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  maxFor: (product: Product) => number;
}

const Ctx = createContext<CartState | null>(null);

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((l) => typeof l?.product_id === "string" && Number.isInteger(l?.quantity) && l.quantity > 0).slice(0, 50)
      : [];
  } catch { return []; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products, loading } = useStore();
  const [lines, setLines] = useState<CartLine[]>(read);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode */ } }, [lines]);

  // Keep carts in sync across tabs
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setLines(read()); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const maxFor = useCallback((p: Product) => Math.max(0, Math.min(MAX_QTY, p.inventory_qty)), []);

  // Once the catalog loads, cap quantities to current stock (drop nothing silently: unavailable lines stay and are flagged)
  useEffect(() => {
    if (loading) return;
    setLines((cur) => {
      let changed = false;
      const next = cur.map((l) => {
        const p = byId.get(l.product_id);
        if (p && p.inventory_qty > 0 && l.quantity > maxFor(p)) { changed = true; return { ...l, quantity: maxFor(p) }; }
        return l;
      });
      return changed ? next : cur;
    });
  }, [loading, byId, maxFor]);

  const value = useMemo<CartState>(() => {
    const rows: CartRow[] = [];
    let missing = 0;
    for (const l of lines) {
      const p = byId.get(l.product_id);
      if (p) rows.push({ product: p, quantity: l.quantity }); else missing++;
    }
    return {
      lines, rows, missing,
      count: rows.reduce((a, r) => a + r.quantity, 0),
      subtotalCents: rows.reduce((a, r) => a + r.quantity * r.product.price_cents, 0),
      maxFor,
      add(product, qty = 1) {
        const max = maxFor(product);
        const current = lines.find((l) => l.product_id === product.id)?.quantity ?? 0;
        const target = Math.min(max, current + qty);
        const added = Math.max(0, target - current);
        if (added > 0) {
          setLines((cur) => cur.some((l) => l.product_id === product.id)
            ? cur.map((l) => (l.product_id === product.id ? { ...l, quantity: target } : l))
            : [...cur, { product_id: product.id, quantity: target }]);
        }
        return { added, capped: current + qty > max };
      },
      setQty(productId, qty) {
        const p = byId.get(productId);
        const max = p ? maxFor(p) : MAX_QTY;
        const q = Math.max(1, Math.min(max, Math.floor(qty) || 1));
        setLines((cur) => cur.map((l) => (l.product_id === productId ? { ...l, quantity: q } : l)));
      },
      remove(productId) { setLines((cur) => cur.filter((l) => l.product_id !== productId)); },
      clear() { setLines([]); },
    };
  }, [lines, byId, maxFor]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}
