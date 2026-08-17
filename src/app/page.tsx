import { MosqueDirectoryRows } from "@/components/data/supabase-public-sections";

export default function Page() {
  return (
    <main className="min-h-screen bg-[var(--workspace)] px-4 py-8 text-[#26323A]">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#6B747B]">Madrasa</p>
          <h1 className="text-3xl font-black tracking-tight text-[#26323A]">Masjid portals</h1>
          <p className="max-w-xl text-base leading-7 text-[#5F6B73]">
            Choose a masjid portal, or open your masjid&apos;s dedicated Madrasa subdomain directly.
          </p>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-[#D6DCE0] bg-white shadow-sm">
          <MosqueDirectoryRows />
        </div>
      </section>
    </main>
  );
}