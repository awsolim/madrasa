"use client";

export type LoadingLayout = "home" | "classes" | "inbox" | "account" | "detail" | "management" | "family" | "schedule";

function Block({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-[12px] bg-[#E7ECEF] ${className}`} aria-hidden />;
}

function Rows({ count = 4, trailing = true }: { count?: number; trailing?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] bg-white px-4 ring-1 ring-[#E1E8EC]">
      {Array.from({ length: count }, (_, item) => (
        <div key={item} className="flex items-center gap-3 border-b border-[#EEF2F4] py-4 last:border-b-0">
          <Block className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1"><Block className="h-4 w-2/5" /><Block className="mt-2 h-3 w-3/5" /></div>
          {trailing ? <Block className="h-9 w-9 shrink-0 rounded-full" /> : null}
        </div>
      ))}
    </div>
  );
}

function HomeSkeleton() {
  return <div className="space-y-5"><Block className="h-20 w-full rounded-[24px]" /><div className="grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <Block key={i} className="h-14 w-full rounded-[16px]" />)}</div><Block className="h-5 w-36" /><Rows count={3} /><Block className="h-5 w-28" /><div className="grid grid-cols-2 gap-3"><Block className="h-24 w-full rounded-[20px]" /><Block className="h-24 w-full rounded-[20px]" /></div></div>;
}

function ClassesSkeleton() {
  return <div className="space-y-4"><div className="flex gap-2"><Block className="h-11 flex-1 rounded-[14px]" /><Block className="h-10 w-10 rounded-full" /></div>{Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-[24px] bg-white p-4 ring-1 ring-[#E1E8EC]"><div className="flex gap-4"><Block className="h-24 w-24 shrink-0 rounded-[18px]" /><div className="flex-1"><Block className="h-5 w-3/5" /><Block className="mt-3 h-3 w-4/5" /><Block className="mt-2 h-3 w-1/2" /><Block className="mt-4 h-9 w-28" /></div></div></div>)}</div>;
}

function AccountSkeleton() {
  return <div className="space-y-6"><div className="flex flex-col items-center py-4"><Block className="h-28 w-28 rounded-full" /><Block className="mt-4 h-6 w-36" /><Block className="mt-2 h-3 w-48" /></div><Rows count={5} /></div>;
}

function FamilySkeleton() {
  return <div className="space-y-4"><div className="rounded-[24px] bg-white p-5 ring-1 ring-[#E1E8EC]"><Block className="h-5 w-28" /><Block className="mt-4 h-11 w-full" /><Block className="mt-3 h-11 w-full" /><Block className="mt-4 h-10 w-32" /></div><Rows count={3} /></div>;
}

function QuietSkeleton() {
  return <div className="space-y-3 py-2"><Block className="h-4 w-2/5" /><Block className="h-3 w-full" /><Block className="h-3 w-5/6" /></div>;
}

export function AppLoadingSkeleton({ layout, label = "Loading", compact = false }: { layout: LoadingLayout; label?: string; compact?: boolean }) {
  return (
    <section className={compact ? "bg-[var(--workspace)] py-2" : "min-h-[calc(100vh-150px)] bg-[var(--workspace)] px-4 pb-28 pt-4"} aria-label={label} aria-busy="true">
      <div className="mx-auto w-full max-w-6xl">
        {layout === "home" ? <HomeSkeleton /> : layout === "classes" ? <ClassesSkeleton /> : layout === "account" ? <AccountSkeleton /> : layout === "family" ? <FamilySkeleton /> : <QuietSkeleton />}
      </div>
    </section>
  );
}

export function GenericLoadingState({ label = "Loading", layout = "detail", compact = false }: { label?: string; layout?: LoadingLayout; compact?: boolean }) {
  return <AppLoadingSkeleton layout={layout} label={label} compact={compact} />;
}

export function DirectorySkeleton({ layout = "management" }: { layout?: LoadingLayout }) {
  return <AppLoadingSkeleton layout={layout} />;
}

export function QuietPageLoadingState({ layout = "classes" }: { layout?: LoadingLayout }) {
  return <AppLoadingSkeleton layout={layout} />;
}

// For the brief moment an auth flow (Google callback, password reset, profile completion)
// checks a session/token before showing its form -- a couple of pulsing bars in the shape of
// the form that's about to appear, not a spinner.
export function AuthFormSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3 p-6" : "space-y-4 p-5 md:p-6"} aria-label="Loading" aria-busy="true">
      <Block className="h-5 w-2/5" />
      <Block className="h-11 w-full" />
      <Block className="h-11 w-full" />
      <Block className="h-10 w-1/3 rounded-full" />
    </div>
  );
}
