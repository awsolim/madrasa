import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Madrasa",
  description:
    "Madrasa gives masjids and Islamic schools a branded portal for programs, applications, payments, schedules, announcements, notes, and attendance.",
};

const painPoints = [
  "Applications scattered across forms, texts, and spreadsheets.",
  "Payment status, waivers, and custom pricing tracked by memory.",
  "Parents asking the same questions because there is no single portal.",
  "Teachers switching between rosters, schedules, notes, and announcements.",
  "A community program that feels generic instead of masjid-branded.",
];

const workflowSteps = [
  {
    title: "Build the program",
    body: "Directors create classes, tracks, schedules, pricing, registration rules, and public program pages in one structured builder.",
  },
  {
    title: "Parents apply",
    body: "Families browse the masjid portal, choose the right student and track, then submit an application with clear registration status.",
  },
  {
    title: "Staff review",
    body: "Directors approve, reject, waitlist, waive, customize payment terms, or invite families by code without losing the audit trail.",
  },
  {
    title: "Programs run",
    body: "Teachers manage rosters, attendance, notes, announcements, schedules, and student communication from the same branded app.",
  },
];

const featureGroups = [
  {
    title: "Enrollment Operations",
    items: ["Program pages", "Applications", "Approval workflow", "Waitlists", "Invite codes", "Track selection"],
  },
  {
    title: "Payments",
    items: ["Stripe checkout", "Monthly plans", "Annual options", "Waivers", "Custom pricing", "Finance audit trail"],
  },
  {
    title: "Class Management",
    items: ["Rosters", "Attendance", "Session views", "Student notes", "Announcements", "Export center"],
  },
  {
    title: "Tenant Branding",
    items: ["Subdomain portal", "Installable PWA", "Masjid logo", "Branded app name", "Director contact", "Powered by Madrasa"],
  },
];

const audiences = [
  {
    title: "For Directors",
    body: "A quieter control room for approvals, pricing decisions, rosters, finances, staff tools, and parent-facing program content.",
    points: ["See who needs action", "Review applications cleanly", "Track finances without side spreadsheets"],
  },
  {
    title: "For Teachers",
    body: "Daily tools for the actual classroom: upcoming sessions, student lists, attendance, notes, and announcements by track.",
    points: ["Mark attendance", "Send notes and updates", "Open the right students from each session"],
  },
  {
    title: "For Families",
    body: "A simple app-like portal where parents and students can apply, confirm registration, see schedules, and receive updates.",
    points: ["Know registration status", "View class schedules", "Keep child-specific notes organized"],
  },
];

function LogoMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#C9D8D3] bg-white text-[#2F6F5B] shadow-sm">
      <div className="grid h-6 w-6 grid-cols-2 gap-1">
        <span className="rounded-tl-full border border-current" />
        <span className="rounded-tr-full border border-current" />
        <span className="rounded-bl-full border border-current" />
        <span className="rounded-br-full bg-current" />
      </div>
    </div>
  );
}

function ParentPhone() {
  return (
    <div className="w-full rounded-[34px] border border-[#D5DED9] bg-[#111B18] p-2 shadow-[0_18px_50px_rgba(20,44,37,0.18)]">
      <div className="overflow-hidden rounded-[28px] bg-[#F8FBF9]">
        <div className="flex items-center justify-between border-b border-[#E3E9E6] bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <LogoMark />
            <div>
              <p className="text-sm font-bold text-[#26323A]">Assiddiq</p>
              <p className="text-[10px] font-semibold text-[#7B8780]">Powered by Madrasa</p>
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2F6F5B] text-xs font-bold text-white">P</div>
        </div>
        <div className="bg-[#A9D9CC] px-5 pb-8 pt-7 text-center">
          <h3 className="text-2xl font-black text-[#26323A]">Classes</h3>
        </div>
        <div className="-mt-4 rounded-t-[28px] bg-white px-5 pb-6 pt-5">
          <div className="mb-4 flex justify-center gap-8 border-b border-[#E3E9E6] pb-3 text-sm font-semibold text-[#6E7B75]">
            <span>My Classes</span>
            <span className="text-[#3E7D9F]">Browse</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#DDE6E2] bg-white">
            <div className="h-28 bg-[#D9E5E0] px-4 py-3">
              <div className="h-full rounded-md border border-[#C8D6D0] bg-[#F5F8F6] p-3">
                <div className="h-3 w-24 rounded-full bg-[#AEC8BD]" />
                <div className="mt-3 h-3 w-36 rounded-full bg-[#D5E2DC]" />
                <div className="mt-2 h-3 w-28 rounded-full bg-[#D5E2DC]" />
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <p className="text-lg font-black text-[#26323A]">Weekend School 2026/27</p>
                <p className="text-sm text-[#6B747B]">Quran, Arabic, and Islamic studies</p>
              </div>
              <div className="flex gap-2 text-xs font-bold text-[#2F6F5B]">
                <span className="rounded-full bg-[#EAF4EF] px-3 py-1">Registration open</span>
                <span className="rounded-full bg-[#EEF5F8] px-3 py-1 text-[#3E7D9F]">Ages 5-15</span>
              </div>
              <div className="rounded-lg bg-[#F5F8F6] px-3 py-2 text-sm text-[#435048]">
                Saturday, 12:00 PM-2:00 PM
              </div>
              <button className="w-full rounded-lg bg-[#2F6F5B] px-4 py-3 text-sm font-black text-white">Apply to register</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DirectorPhone() {
  return (
    <div className="w-full rounded-[34px] border border-[#D5DED9] bg-[#17231F] p-2 shadow-[0_18px_50px_rgba(20,44,37,0.16)]">
      <div className="overflow-hidden rounded-[28px] bg-white">
        <div className="bg-[#A9D9CC] px-5 pb-8 pt-7 text-center">
          <h3 className="text-2xl font-black text-[#26323A]">Director</h3>
        </div>
        <div className="-mt-4 rounded-t-[28px] bg-white px-5 pb-6 pt-5">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-[#F4F8F6] px-2 py-3">
              <p className="text-xl font-black text-[#2F6F5B]">24</p>
              <p className="text-[10px] font-bold uppercase text-[#7A8780]">Students</p>
            </div>
            <div className="rounded-lg bg-[#F4F8F6] px-2 py-3">
              <p className="text-xl font-black text-[#2F6F5B]">7</p>
              <p className="text-[10px] font-bold uppercase text-[#7A8780]">Pending</p>
            </div>
            <div className="rounded-lg bg-[#F4F8F6] px-2 py-3">
              <p className="text-xl font-black text-[#2F6F5B]">$1.8k</p>
              <p className="text-[10px] font-bold uppercase text-[#7A8780]">Monthly</p>
            </div>
          </div>
          <div className="space-y-3">
            {["Aisha Rahman", "Omar Salman", "Yusuf Khan"].map((name, index) => (
              <div key={name} className="rounded-lg border border-[#DDE6E2] bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#26323A]">{name}</p>
                    <p className="text-xs text-[#6B747B]">Application review</p>
                  </div>
                  <span className={index === 1 ? "rounded-full bg-[#FFF4D6] px-2 py-1 text-xs font-bold text-[#8A6A16]" : "rounded-full bg-[#EAF4EF] px-2 py-1 text-xs font-bold text-[#2F6F5B]"}>
                    {index === 1 ? "Custom" : "Ready"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-[#2F6F5B] px-4 py-3 text-center text-sm font-black text-white">Review applications</div>
        </div>
      </div>
    </div>
  );
}

function ProductShowcase() {
  return (
    <div className="relative mx-auto grid w-full max-w-[620px] grid-cols-1 gap-5 sm:grid-cols-[0.92fr_1fr] sm:items-end">
      <div className="sm:translate-y-8">
        <ParentPhone />
      </div>
      <div className="hidden sm:block">
        <DirectorPhone />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[#F7FBF8] text-[#26323A]">
      <header className="sticky top-0 z-30 border-b border-[#DDE6E2] bg-[#F7FBF8]/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <a href="#top" className="flex items-center gap-3" aria-label="Madrasa home">
            <LogoMark />
            <span className="text-xl font-black tracking-tight">Madrasa</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-bold text-[#5F6B73] md:flex">
            <a href="#workflow" className="hover:text-[#2F6F5B]">How it works</a>
            <a href="#features" className="hover:text-[#2F6F5B]">Features</a>
            <a href="#organizations" className="hover:text-[#2F6F5B]">For masjids</a>
            <a href="#pricing" className="hover:text-[#2F6F5B]">Pricing</a>
          </nav>
          <a href="#contact" className="rounded-lg bg-[#26323A] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#2F6F5B]">
            Request a demo
          </a>
        </div>
      </header>

      <section id="top" className="overflow-hidden border-b border-[#DDE6E2] bg-[#F7FBF8] px-5 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-black uppercase tracking-[0.24em] text-[#2F6F5B]">White-label program management for masjids</p>
            <h1 className="text-5xl font-black leading-[1.02] tracking-tight text-[#1F2A30] sm:text-6xl lg:text-7xl">
              Give every masjid program its own polished app.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#526059] sm:text-xl">
              Madrasa helps Islamic schools, weekend schools, Quran programs, and community classes manage applications, approvals, payments, schedules, announcements, notes, and attendance from one branded portal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#contact" className="rounded-lg bg-[#2F6F5B] px-6 py-4 text-center text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-[#285E4D]">
                Start a pilot
              </a>
              <a href="#workflow" className="rounded-lg border border-[#BFD0C8] bg-white px-6 py-4 text-center text-sm font-black uppercase tracking-[0.08em] text-[#2F6F5B] hover:border-[#2F6F5B]">
                See how it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold text-[#5F6B73]">
              <span className="rounded-full border border-[#D6E2DD] bg-white px-4 py-2">assiddiq.madrasa.ca</span>
              <span className="rounded-full border border-[#D6E2DD] bg-white px-4 py-2">Installable PWA</span>
              <span className="rounded-full border border-[#D6E2DD] bg-white px-4 py-2">Stripe-ready</span>
            </div>
          </div>
          <ProductShowcase />
        </div>
      </section>

      <section className="bg-white px-5 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#8A6A16]">Why teams switch</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Masjid programs deserve better than paper, group chats, and scattered spreadsheets.</h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-5">
            {painPoints.map((point) => (
              <div key={point} className="rounded-lg border border-[#E1E8E4] bg-[#F8FBF9] p-5">
                <div className="mb-4 h-1.5 w-10 rounded-full bg-[#B88746]" />
                <p className="text-sm font-bold leading-6 text-[#435048]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-[#DDE6E2] bg-[#F2F7F4] px-5 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#2F6F5B]">How it works</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">From public program page to running classroom.</h2>
            </div>
            <p className="max-w-md text-base leading-7 text-[#5F6B73]">
              Madrasa keeps the public-facing experience, staff workflow, and family portal connected so status does not get lost between tools.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="rounded-lg border border-[#D7E2DD] bg-white p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F6F5B] text-sm font-black text-white">{index + 1}</span>
                <h3 className="mt-5 text-xl font-black text-[#26323A]">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5F6B73]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.78fr_1.22fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#2F6F5B]">Feature set</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Operational tools for the full program lifecycle.</h2>
            <p className="mt-5 text-base leading-7 text-[#5F6B73]">
              Built around the actual jobs masjid directors, instructors, parents, and students repeat every week.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {featureGroups.map((group) => (
              <div key={group.title} className="rounded-lg border border-[#DDE6E2] bg-[#F8FBF9] p-6">
                <h3 className="text-lg font-black text-[#26323A]">{group.title}</h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span key={item} className="rounded-full border border-[#D3E0DA] bg-white px-3 py-1.5 text-xs font-bold text-[#526059]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="organizations" className="border-y border-[#DDE6E2] bg-[#26323A] px-5 py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#A9D9CC]">White-label for every masjid</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Each organization gets a branded Madrasa app.</h2>
            <p className="mt-5 text-base leading-7 text-[#D7E2DD]">
              A masjid can run on its own subdomain, show its own name and logo, and install as its own home-screen app while Madrasa stays quietly in the background.
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/8 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {["assiddiq", "alrashid", "yourmasjid"].map((slug) => (
                <div key={slug} className="rounded-lg bg-white p-4 text-[#26323A]">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#EAF4EF] font-black text-[#2F6F5B]">
                    {slug.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="font-black capitalize">{slug}</p>
                  <p className="mt-1 break-all text-sm text-[#5F6B73]">{slug}.madrasa.ca</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#F7FBF8] px-5 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#2F6F5B]">Daily experience</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Clear paths for everyone using the program.</h2>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {audiences.map((audience) => (
              <div key={audience.title} className="rounded-lg border border-[#DDE6E2] bg-white p-6">
                <h3 className="text-xl font-black text-[#26323A]">{audience.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5F6B73]">{audience.body}</p>
                <div className="mt-5 space-y-2">
                  {audience.points.map((point) => (
                    <div key={point} className="flex items-center gap-3 text-sm font-bold text-[#435048]">
                      <span className="h-2 w-2 rounded-full bg-[#2F6F5B]" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white px-5 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#8A6A16]">Pricing</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Pilot-friendly pricing while Madrasa is growing.</h2>
            <p className="mt-5 text-base leading-7 text-[#5F6B73]">
              Madrasa is early-stage and works best with partner organizations that want a close implementation process instead of a generic self-serve plan.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#DDE6E2] bg-[#F8FBF9] p-6">
              <h3 className="text-xl font-black">Pilot rollout</h3>
              <p className="mt-3 text-sm leading-6 text-[#5F6B73]">
                For a masjid launching Madrasa with a small number of programs and a hands-on setup period.
              </p>
              <div className="mt-5 rounded-lg bg-white px-4 py-3 text-sm font-bold text-[#2F6F5B]">Custom pilot pricing</div>
            </div>
            <div className="rounded-lg border border-[#DDE6E2] bg-[#F8FBF9] p-6">
              <h3 className="text-xl font-black">Partner organization</h3>
              <p className="mt-3 text-sm leading-6 text-[#5F6B73]">
                For schools and masjids that want multiple programs, staff roles, branded PWA setup, and payment operations.
              </p>
              <div className="mt-5 rounded-lg bg-white px-4 py-3 text-sm font-bold text-[#2F6F5B]">Quoted after discovery</div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-[#DDE6E2] bg-[#F2F7F4] px-5 py-16">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-lg border border-[#D7E2DD] bg-white p-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight">Bring Madrasa to your organization.</h2>
            <p className="mt-3 text-base leading-7 text-[#5F6B73]">
              Start with one program, one branded portal, and the workflows your team already needs: registration, approvals, payment terms, schedules, notes, announcements, and attendance.
            </p>
          </div>
          <a href="mailto:hello@madrasa.ca?subject=Madrasa demo request" className="rounded-lg bg-[#2F6F5B] px-6 py-4 text-center text-sm font-black uppercase tracking-[0.08em] text-white shadow-sm hover:bg-[#285E4D]">
            Request a demo
          </a>
        </div>
      </section>

      <footer className="border-t border-[#DDE6E2] bg-white px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#5F6B73] sm:flex-row">
          <p className="font-bold text-[#26323A]">Madrasa</p>
          <p>Program management for masjids, Islamic schools, and community education.</p>
        </div>
      </footer>
    </main>
  );
}
