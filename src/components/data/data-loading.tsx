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

function InboxSkeleton() {
  return <div className="space-y-4"><div className="grid grid-cols-2 border-b border-[#D6DCE0]"><Block className="mx-auto h-6 w-24" /><Block className="mx-auto h-6 w-20" /></div><div className="flex items-center justify-between"><Block className="h-5 w-28" /><Block className="h-9 w-24 rounded-full" /></div><Rows count={5} /></div>;
}

function AccountSkeleton() {
  return <div className="space-y-6"><div className="flex flex-col items-center py-4"><Block className="h-28 w-28 rounded-full" /><Block className="mt-4 h-6 w-36" /><Block className="mt-2 h-3 w-48" /></div><Rows count={5} /></div>;
}

function DetailSkeleton() {
  return <div className="space-y-4"><Block className="aspect-[16/8] w-full rounded-[26px]" /><div className="rounded-[24px] bg-white p-5 ring-1 ring-[#E1E8EC]"><Block className="h-7 w-3/5" /><Block className="mt-3 h-4 w-2/5" /><Block className="mt-5 h-3 w-full" /><Block className="mt-2 h-3 w-5/6" /><div className="mt-5 grid grid-cols-2 gap-3"><Block className="h-12 w-full" /><Block className="h-12 w-full" /></div></div><Rows count={3} trailing={false} /></div>;
}

function ManagementSkeleton() {
  return <div className="space-y-4"><Block className="h-28 w-full rounded-[26px]" /><div className="flex gap-2"><Block className="h-11 flex-1 rounded-[14px]" /><Block className="h-10 w-10 rounded-full" /></div><div className="overflow-hidden rounded-[22px] bg-white ring-1 ring-[#E1E8EC]">{Array.from({ length: 5 }, (_, i) => <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-4 border-b border-[#EEF2F4] px-4 py-5 last:border-b-0"><Block className="h-4 w-full" /><Block className="h-4 w-full" /><Block className="h-4 w-full" /><Block className="h-8 w-8 rounded-full" /></div>)}</div></div>;
}

function FamilySkeleton() {
  return <div className="space-y-4"><div className="rounded-[24px] bg-white p-5 ring-1 ring-[#E1E8EC]"><Block className="h-5 w-28" /><Block className="mt-4 h-11 w-full" /><Block className="mt-3 h-11 w-full" /><Block className="mt-4 h-10 w-32" /></div><Rows count={3} /></div>;
}

function ScheduleSkeleton() {
  return <div className="space-y-4"><div className="grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <Block key={i} className="h-16 w-full rounded-[16px]" />)}</div>{Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-4 rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8EC]"><Block className="h-12 w-16 shrink-0" /><div className="flex-1"><Block className="h-4 w-2/5" /><Block className="mt-2 h-3 w-3/5" /></div></div>)}</div>;
}

export function AppLoadingSkeleton({ layout, label = "Loading", compact = false }: { layout: LoadingLayout; label?: string; compact?: boolean }) {
  return (
    <section className={compact ? "bg-[var(--workspace)] py-2" : "min-h-[calc(100vh-150px)] bg-[var(--workspace)] px-4 pb-28 pt-4"} aria-label={label} aria-busy="true">
      <div className="mx-auto w-full max-w-6xl">
        {layout === "home" ? <HomeSkeleton /> : layout === "classes" ? <ClassesSkeleton /> : layout === "inbox" ? <InboxSkeleton /> : layout === "account" ? <AccountSkeleton /> : layout === "detail" ? <DetailSkeleton /> : layout === "family" ? <FamilySkeleton /> : layout === "schedule" ? <ScheduleSkeleton /> : <ManagementSkeleton />}
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
