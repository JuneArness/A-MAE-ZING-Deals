// Preview-mode sign-in (VITE_DEMO_MODE=true only). In the real store these are empty
// strings and sign-in is handled by Supabase Auth.
const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
export const DEMO_ADMIN_EMAIL = DEMO ? "demo@amaezing.local" : "";
export const DEMO_ADMIN_PASSWORD = DEMO ? "preview-only" : "";
