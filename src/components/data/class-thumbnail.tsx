import Image from "next/image";

export function ClassThumbnail({ src, sizes = "164px", className = "relative aspect-square" }: {
  src: string | null; sizes?: string; className?: string;
}) {
  return <div className={`w-full overflow-hidden bg-[#EAE3D4] ${className}`}>
    {src ? <Image src={src} alt="" fill sizes={sizes} className="object-cover object-center" /> : (
      <div className="absolute inset-0 flex items-center justify-center text-[#71857C]" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 17 5-5 4 4 4-6 5 7" /><circle cx="8" cy="8" r="1" /></svg>
      </div>
    )}
  </div>;
}

export function ThumbnailDisplayField({ onChoose, src }: {
  onChoose: () => void; src: string | null;
}) {
  return <div className="flex items-center gap-4">
    <div className="w-24 shrink-0 overflow-hidden rounded-lg"><ClassThumbnail src={src} sizes="96px" /></div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-[#26323A]">Browse thumbnail</p>
      <p className="mt-1 text-xs leading-5 text-[#52616A]">Choose an image to crop and position it.</p>
      <button type="button" onClick={onChoose} className="mt-2 min-h-10 rounded-lg border border-[#B9C3C8] bg-white px-4 text-sm font-medium text-[#26323A] hover:bg-[#F2F5F3] active:bg-[#DCE7E0] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17624F]">Change</button>
    </div>
  </div>;
}
