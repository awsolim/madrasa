"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { masjidHomepage, type PublicMasjid } from "@/lib/masjid-directory";
import { supportedProfileImage } from "@/lib/profile-images";

export function DirectoryUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="border-y border-[#DCE4E1] py-7 text-sm leading-6 text-[#52616A]">
    <p>The masjid directory is temporarily unavailable.</p>
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="mt-2 font-semibold text-[#17624F] underline underline-offset-4 disabled:opacity-60">{pending ? "Retrying…" : "Try again"}</button>
  </div>;
}

export function MasjidDirectory({ masjids, hostname, rootDomain }: { masjids: PublicMasjid[]; hostname: string; rootDomain: string }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = masjids.filter((masjid) => `${masjid.name} ${masjid.address ?? ""} ${masjid.slug}`.toLocaleLowerCase().includes(query));

  return (
    <div>
      {masjids.length > 5 ? <label className="mb-5 block">
        <span className="sr-only">Search masjids by name or location</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or location" className="h-12 w-full rounded-xl border border-[#DCE4E1] bg-white px-4 text-sm text-[#26323A] outline-none placeholder:text-[#7B858C] focus:border-[#17624F] focus:ring-2 focus:ring-[#17624F]/15" />
      </label> : null}
      {matches.length ? <ul className="divide-y divide-[#DCE4E1] border-y border-[#DCE4E1]">
        {matches.map((masjid) => <li key={masjid.slug}>
          <a href={masjidHomepage(masjid.slug, hostname, rootDomain)} className="group flex items-center gap-4 rounded-lg py-5 pr-2 text-[#26323A] transition-colors hover:bg-[#F5FAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17624F] sm:gap-5 sm:py-6">
            <MasjidLogo masjid={masjid} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-snug sm:text-lg">{masjid.name}</span>
              {masjid.address ? <span className="mt-1 block text-[13px] leading-relaxed text-[#52616A]">{masjid.address}</span> : null}
              <span className="mt-2 block break-all text-xs text-[#17624F]">{masjid.slug}.{rootDomain}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#17624F]">
              <span className="hidden lg:inline">Open portal</span>
              <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </a>
        </li>)}
      </ul> : <p role="status" className="border-y border-[#DCE4E1] py-7 text-sm text-[#52616A]">{masjids.length ? "No masjids match your search." : "No masjids are listed yet."}</p>}
    </div>
  );
}

function MasjidLogo({ masjid }: { masjid: PublicMasjid }) {
  const [failed, setFailed] = useState(false);
  const src = supportedProfileImage(masjid.logo_url);
  return <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E6ECE9] bg-white sm:h-16 sm:w-16">
    {src && !failed ? <Image src={src} alt="" width={64} height={64} sizes="64px" className="h-full w-full object-contain p-1.5" onError={() => setFailed(true)} /> : <span className="text-lg font-semibold text-[#17624F]">{masjid.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>}
  </span>;
}
