export function ScheduleIcon({ className = "h-6 w-6", active = false }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="16" height="16" rx="2.5" fill={active ? "currentColor" : "none"} />
      <path d="M8 3v4M16 3v4" />
      <path d="M4 10h16M8 14h2M14 14h2M8 17h2" stroke={active ? "var(--workspace)" : "currentColor"} />
    </svg>
  );
}
