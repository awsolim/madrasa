"use client";

import Image from "next/image";
import { ClassDirectoryLink } from "@/components/auth/class-directory-link";

export function TenantBootState({ mosqueName, mosqueLogoUrl, message = "Opening your account", onRetry, slug }: { mosqueName: string; mosqueLogoUrl: string; message?: string; onRetry?: () => void; slug?: string }) {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#F1F5F3] px-6 text-[#20352F]" aria-label="Opening your account" aria-busy={!onRetry}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Image src={mosqueLogoUrl} alt="" width={80} height={80} className="h-20 w-20 rounded-2xl object-contain" priority />
        <p className="mt-5 text-lg font-semibold tracking-[-0.01em]">{mosqueName}</p>
        <p className="mt-1 text-sm text-[#6D7B75]">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-6 min-h-11 rounded-full bg-[#17624F] px-6 text-sm font-semibold text-white">Try again</button>
        ) : (
          <div className="mt-7 h-1 w-32 overflow-hidden rounded-full bg-[#DCE6E2]" aria-hidden>
            <span className="tenant-boot-progress block h-full rounded-full bg-[#17624F]" />
          </div>
        )}
        {onRetry && slug ? <ClassDirectoryLink slug={slug} /> : null}
      </div>
    </main>
  );
}
