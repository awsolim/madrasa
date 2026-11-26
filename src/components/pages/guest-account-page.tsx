import Link from "@/components/layout/workspace-link";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { guestLoginHref } from "@/lib/public-navigation";

const content = {
  schedule: { title: "Schedule", heading: "Your class schedule", text: "Log in to see upcoming sessions for you and your family.", path: "schedule" },
  inbox: { title: "Inbox", heading: "Updates from your classes", text: "Log in to read announcements, student notes and application updates.", path: "inbox" },
  account: { title: "Profile", heading: "Your account", text: "Log in to manage your profile, family and registrations.", path: "account" },
};

export function GuestAccountPage({ slug, tab }: { slug: string; tab: keyof typeof content }) {
  const item = content[tab];
  const returnTo = `/m/${slug}/${item.path}`;
  return <>
    <PageTitleBar title={item.title} />
    <main className="relative z-10 min-h-[calc(100svh-140px)] rounded-t-[34px] bg-[var(--workspace)] px-6 pb-36 pt-14" style={{ marginTop: "-172px" }}>
      <div className="mx-auto max-w-sm text-center">
        <svg className="mx-auto h-10 w-10 text-[#61766B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          {tab === "schedule" ? <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16M8 15h3m2 3h3" /></>
            : tab === "inbox" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>
              : <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}
        </svg>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[#263A31]">{item.heading}</h1>
        <p className="mt-3 text-sm leading-6 text-[#647268]">{item.text}</p>
        <Link href={guestLoginHref(slug, returnTo)} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#17624F] px-8 text-sm font-semibold !text-white">Log in</Link>
        <p className="mt-5 text-sm text-[#647268]">New here? <Link href={`/m/${slug}/signup?returnTo=${encodeURIComponent(returnTo)}`} className="text-link font-semibold">Create an account</Link></p>
      </div>
    </main>
  </>;
}
