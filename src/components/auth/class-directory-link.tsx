import { classDirectoryHref } from "@/lib/continuity";

export function ClassDirectoryLink({ slug }: { slug: string }) {
  const href = classDirectoryHref(slug);
  if (!href) return null;
  return (
    <div className="mt-6 border-t border-[#DCE4DE] pt-5 text-center">
      <p className="mb-3 text-sm leading-6 text-[#52616A]">For class information or registration inquiries, you can still email or call a teacher.</p>
      {/* Full document navigation deliberately bypasses account guards, router
          caches and all server-rendered layouts that depend on Supabase. */}
      <a href={href} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#AEC2B7] bg-white px-5 text-sm font-semibold !text-[#17624F]">Classes &amp; contacts</a>
    </div>
  );
}
