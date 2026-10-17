import { useCallback, useEffect, useState } from "react";
import { friendlyError } from "../lib/format";

/** Loads data once (and on demand) with loading and error states. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await load()); setError(""); }
    catch (e) { setError(friendlyError(e, "Couldn't load this data. Check your connection and try again.")); }
    finally { setLoading(false); }
  }, [load]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
