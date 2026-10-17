// Tracks whether the current visitor is a signed-in administrator.
// This only decides what to SHOW. Real protection is in the database rules:
// a non-admin who forces their way into an admin screen gets no data and can't save.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "./api";
import { useStore } from "./store";

interface AuthState { session: Session | null; isAdmin: boolean; checking: boolean; refresh: () => Promise<void>; }
const Ctx = createContext<AuthState>({ session: null, isAdmin: false, checking: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { api } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useMemo(() => async () => {
    if (!api) return;
    setChecking(true);
    const s = await api.getSession().catch(() => null);
    setSession(s);
    setIsAdmin(s ? await api.isAdmin().catch(() => false) : false);
    setChecking(false);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void refresh();
    return api.onAuthChange(() => { void refresh(); });
  }, [api, refresh]);

  return <Ctx.Provider value={{ session, isAdmin, checking, refresh }}>{children}</Ctx.Provider>;
}

export const useAdminSession = () => useContext(Ctx);
