// Loads store settings, categories and the published catalog once, and shares them.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS } from "../data/defaults";
import { getApi, type Api } from "./api";
import type { Category, Product, StoreSettings } from "./types";

interface StoreState {
  api: Api | null;
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  categoryById: (id: string | null) => Category | undefined;
}

const Ctx = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const a = await getApi();
      setApi(a);
      const [s, c, p] = await Promise.all([a.getSettings(), a.listCategories(), a.listProducts()]);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setCategories(c);
      setProducts(p);
      setError(null);
    } catch {
      setError("We couldn't load the store right now. Please refresh the page, or call us to order.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<StoreState>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return { api, settings, categories, products, loading, error, reload, categoryById: (id) => (id ? byId.get(id) : undefined) };
  }, [api, settings, categories, products, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
