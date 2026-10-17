// A MAE Zing Deals logo: a house that doubles as a shopping bag, with a deal "sparkle",
// plus the wordmark with MAE emphasized. Use mono for one-color printing.
interface Props { mono?: boolean; className?: string; showWordmark?: boolean; size?: number; }

export function LogoMark({ mono = false, size = 44, className = "" }: { mono?: boolean; size?: number; className?: string }) {
  const bg = mono ? "currentColor" : "#2f5d46";
  const fg = mono ? "var(--logo-knockout, #fff)" : "#fbf8f1";
  const spark = mono ? "currentColor" : "#c8694a";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d="M10 30 32 12l22 18" fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="28" width="32" height="25" rx="5" fill={fg} />
      <path d="M26 33v-3a6 6 0 0 1 12 0v3" fill="none" stroke={bg} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M50 4c.9 3.4 2.6 5.1 6 6-3.4.9-5.1 2.6-6 6-.9-3.4-2.6-5.1-6-6 3.4-.9 5.1-2.6 6-6z" fill={spark} stroke={mono ? "none" : "#fbf8f1"} strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ mono = false, className = "", showWordmark = true, size = 44 }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark mono={mono} size={size} />
      {showWordmark && (
        <span className="flex flex-col leading-none" style={{ fontFamily: "var(--font-heading)" }}>
          <span className={`text-[1.3rem] font-black tracking-tight ${mono ? "" : "text-forest"}`}>
            A <span className={mono ? "underline decoration-2 underline-offset-2" : "text-coral-dark"}>MAE</span> Zing
          </span>
          <span className={`mt-0.5 text-[0.7rem] font-extrabold uppercase tracking-[0.32em] ${mono ? "" : "text-charcoal/80"}`}>Deals</span>
        </span>
      )}
    </span>
  );
}
