// Polite status messages (e.g. "Added to cart") announced to screen readers.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((m: string) => {
    window.clearTimeout(timer.current);
    setMsg(m); setShow(true);
    timer.current = window.setTimeout(() => setShow(false), 3200);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className={`max-w-md rounded-full bg-charcoal px-5 py-3 text-sm font-semibold text-white shadow-xl transition-all duration-300 ${show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
          {msg}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
