"use client";

export function GenericLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center bg-[var(--workspace)] px-6 py-10" aria-label={label}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="h-11 w-11 animate-spin rounded-full border-4 border-[#DDEFF4] border-t-[#2F8FB3]" aria-hidden />
        <span className="text-sm font-semibold text-[#52616A]">Loading</span>
      </div>
    </div>
  );
}

export function DirectorySkeleton() {
  return <GenericLoadingState label="Loading" />;
}
