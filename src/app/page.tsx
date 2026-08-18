import type { Metadata } from "next";
import Image from "next/image";
import { Fraunces, Manrope } from "next/font/google";

export const metadata: Metadata = {
  title: "Madrasa",
  description:
    "Madrasa gives masjids and Islamic schools a branded portal for programs, applications, payments, schedules, announcements, notes, and attendance.",
};

const display = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], display: "swap" });
const body = Manrope({ subsets: ["latin"], display: "swap" });

/* Palette pulled straight from the app's own tokens (globals.css) so the marketing
   site reads as the same product, not an invented brand. */
const white = "#FFFFFF";
const mint = "#F5FAF8";
const ink = "#26323A";
const inkSoft = "#52616A";
const line = "#DCE4E1";
const green = "#17624F";
const aqua = "#2F8FB3";
const aquaSoft = "#6FB7B2";
const dark = "#122420";
const contactHref = "mailto:awsolim@gmail.com?subject=Madrasa";

const grainStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")",
  backgroundRepeat: "repeat",
};

const painPoints = [
  "Applications scattered across paper forms, texts, and spreadsheets.",
  "Payment status, waivers, and custom pricing tracked by memory.",
  "Parents asking the same question because there is no single portal.",
  "Teachers switching between rosters, schedules, notes, and group chats.",
  "A community program that looks generic instead of masjid-branded.",
];

const workflowSteps = [
  { title: "Build the program", body: "Directors set up classes, tracks, schedules, and pricing in one structured builder — no spreadsheet required." },
  { title: "Parents apply", body: "Families browse the masjid's own portal, pick a student and track, and submit an application with a clear status." },
  { title: "Staff review", body: "Teachers and directors approve, waitlist, waive, adjust pricing, or invite by code — every decision keeps its own audit trail." },
  { title: "Programs run", body: "Teachers manage rosters, attendance, notes, and announcements from the same branded app all season." },
];

const featureGroups = [
  { title: "Enrollment", items: ["Public program pages", "Applications", "Approval workflow", "Waitlists", "Invite codes", "Track selection"] },
  { title: "Payments", items: ["Stripe checkout", "Monthly & annual plans", "Waivers", "Custom pricing", "Finance audit trail"] },
  { title: "Classroom", items: ["Rosters", "Attendance", "Session views", "Student notes", "Announcements", "Exports"] },
  { title: "Branding", items: ["Subdomain portal", "Installable PWA", "Masjid logo & name", "Teacher contact", "Powered by Madrasa"] },
];

export default function Page() {
  return (
    <main className={`${body.className} relative min-h-screen overflow-x-clip`} style={{ backgroundColor: mint, color: ink }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={grainStyle} aria-hidden />
      <div className="relative z-[1]">
        <SiteHeader />
        <Hero />
        <ProblemSection />
        <WorkflowSection />
        <ProductTour />
        <FeaturesSection />
        <WhiteLabelSection />
        <PricingSection />
        <ClosingSection />
        <SiteFooter />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

function SiteHeader() {
  return (
    <header className="border-b" style={{ borderColor: line, backgroundColor: `${white}CC` }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Madrasa home">
          <Image src="/icon-512x512.png" alt="" width={28} height={28} className="rounded-[7px]" />
          <span className={`${display.className} text-[22px] italic`} style={{ color: ink }}>
            Madrasa
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-[13px] font-semibold uppercase tracking-[0.08em] md:flex">
          {[
            ["How it works", "#workflow"],
            ["Features", "#features"],
            ["For organizations", "#organizations"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="transition-opacity hover:opacity-70" style={{ color: inkSoft }}>
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a href={contactHref} className="hidden rounded-full border px-5 py-2 text-[13px] font-semibold sm:inline-block" style={{ borderColor: green, color: green }}>
            Contact
          </a>
          <details className="relative md:hidden">
            <summary className="flex h-9 w-9 list-none items-center justify-center rounded-full border" style={{ borderColor: line }} aria-label="Menu">
              <MenuGlyph />
            </summary>
            <div className="absolute right-0 top-11 z-40 w-52 rounded-2xl border p-2 text-sm font-semibold shadow-[0_18px_40px_rgba(18,36,32,0.16)]" style={{ borderColor: line, backgroundColor: white }}>
              {[
                ["How it works", "#workflow"],
                ["Features", "#features"],
                ["For organizations", "#organizations"],
                ["Pricing", "#pricing"],
                ["Contact", contactHref],
              ].map(([label, href]) => (
                <a key={href} href={href} className="block rounded-xl px-3 py-2.5" style={{ color: ink }}>
                  {label}
                </a>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:pb-28 lg:pt-24">
      <GeometricMark size={480} className="pointer-events-none absolute -right-44 -top-36 opacity-[0.06]" style={{ color: green }} rotate={8} />

      <div className="relative mx-auto grid max-w-6xl gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <h1 className={`${display.className} text-[42px] leading-[1.08] tracking-tight sm:text-[56px] lg:text-[64px]`}>
            Give every masjid its <em style={{ color: green }}>own</em> app.
          </h1>

          <p className="mt-6 max-w-lg text-[17px] leading-[1.7]" style={{ color: inkSoft }}>
            Parents apply online. Teachers and directors approve students, adjust pricing, and track payments. Every family knows exactly what happens next — on a portal that carries your masjid&rsquo;s own name.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <a href={contactHref} className="rounded-full px-7 py-3.5 text-[14px] font-bold shadow-[0_16px_32px_rgba(15,69,55,0.28)] transition-transform hover:-translate-y-0.5" style={{ backgroundColor: green, color: white }}>
              Contact
            </a>
            <a href="#workflow" className="group inline-flex items-center gap-2 text-[14px] font-bold" style={{ color: ink }}>
              See how it works
              <span className="transition-transform group-hover:translate-y-0.5">↓</span>
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {["assiddiq.madrasa.ca", "Installable PWA", "Stripe-ready"].map((tag) => (
              <span key={tag} className="rounded-full border px-4 py-1.5 text-[12px] font-semibold" style={{ borderColor: line, color: inkSoft, backgroundColor: white }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto flex justify-center">
          <PhoneFrame tapeColor={aquaSoft}>
            <Image src="/marketing/final-parent-browse.png" alt="Browsing classes as a parent on the Assiddiq masjid app" width={390} height={760} className="w-full" />
          </PhoneFrame>
          <div className="absolute -bottom-8 -left-10 hidden w-[120px] -rotate-6 overflow-hidden rounded-xl border shadow-[0_20px_44px_rgba(18,36,32,0.2)] sm:block" style={{ borderColor: line }}>
            <Image src="/marketing/final-program-card.png" alt="A masjid program page, branded with the organization's own logo" width={390} height={760} className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="border-t px-5 py-20 sm:px-8" style={{ borderColor: line, backgroundColor: white }}>
      <div className="mx-auto max-w-6xl">
        <h2 className={`${display.className} max-w-xl text-[28px] leading-[1.2] sm:text-[34px]`}>
          Registration shouldn&rsquo;t live across paper forms, group chats, and memory.
        </h2>

        <div className="mt-10 grid gap-x-10 md:grid-cols-2">
          {painPoints.map((point, index) => (
            <div key={point} className="flex items-baseline gap-5 border-t py-5 first:border-t-0 md:[&:nth-child(2)]:border-t-0" style={{ borderColor: line }}>
              <span className={`${display.className} w-8 shrink-0 text-[15px]`} style={{ color: aqua }}>
                0{index + 1}
              </span>
              <p className="text-[15px] leading-[1.6]" style={{ color: inkSoft }}>
                {point}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="relative overflow-hidden px-5 py-20 sm:px-8" style={{ backgroundColor: dark }}>
      <GeometricMark size={320} className="pointer-events-none absolute -bottom-24 -left-24 opacity-[0.05]" style={{ color: aquaSoft }} rotate={-6} />
      <div className="relative mx-auto max-w-6xl">
        <h2 className={`${display.className} max-w-2xl text-[30px] leading-[1.2] sm:text-[38px]`} style={{ color: white }}>
          From public program page to running classroom.
        </h2>

        <div className="relative mt-16 grid gap-x-6 gap-y-14 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-[26px] hidden h-px lg:block" style={{ backgroundColor: "rgba(255,255,255,0.16)" }} />
          {workflowSteps.map((step, index) => (
            <div key={step.title} className="relative">
              <span className={`${display.className} block text-[52px] leading-none`} style={{ color: "rgba(255,255,255,0.22)" }}>
                {index + 1}
              </span>
              <span className="absolute left-0 top-3 hidden h-2.5 w-2.5 -translate-x-1/2 rounded-full lg:block" style={{ backgroundColor: aquaSoft }} />
              <h3 className="mt-4 text-[17px] font-bold" style={{ color: white }}>
                {step.title}
              </h3>
              <p className="mt-2.5 text-[14px] leading-[1.65]" style={{ color: "rgba(255,255,255,0.65)" }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductTour() {
  return (
    <section className="px-5 py-20 sm:px-8" style={{ backgroundColor: mint }}>
      <div className="mx-auto max-w-6xl">
        <h2 className={`${display.className} max-w-xl text-[30px] leading-[1.2] sm:text-[36px]`}>The actual screens, not a pitch deck.</h2>
        <p className="mt-4 max-w-lg text-[15px] leading-[1.7]" style={{ color: inkSoft }}>
          These are real Madrasa screens from a live masjid, not mockups.
        </p>

        <TourRow
          title="Everyone starts at Home"
          body="Teachers and directors see today's and this week's sessions the moment they open the app — with the class thumbnail, time, and track, not a spreadsheet tab."
          reverse={false}
        >
          <PhoneFrame tapeColor={green} size="md">
            <Image src="/marketing/final-admin-home.png" alt="The Madrasa home screen showing upcoming classes for a masjid" width={390} height={780} className="w-full" />
          </PhoneFrame>
        </TourRow>

        <TourRow
          title="Applications, not group chats"
          body="Every application lands in one dashboard — pending review, waiting on confirmation, waiting on payment — so nothing gets tracked by memory."
          reverse
        >
          <div className="w-full max-w-[280px] overflow-hidden rounded-2xl border shadow-[0_24px_54px_rgba(18,36,32,0.16)]" style={{ borderColor: line }}>
            <Image src="/marketing/final-applications.png" alt="An applications review dashboard showing pending, waitlisted, and completed counts" width={390} height={340} className="w-full" />
          </div>
        </TourRow>

        <TourRow
          title="Build the program, not just the paperwork"
          body="Photos, schedule, tracks, and pricing all live in one guided builder — the same one used to set up this masjid's actual weekend school."
          reverse={false}
        >
          <PhoneFrame tapeColor={aquaSoft} size="md">
            <Image src="/marketing/final-program-builder.png" alt="The program builder showing a class photo and basic details" width={390} height={780} className="w-full" />
          </PhoneFrame>
        </TourRow>

        <div className="mt-20">
          <h3 className={`${display.className} text-[22px]`}>Every finance detail, on any screen.</h3>
          <p className="mt-3 max-w-lg text-[14px] leading-[1.7]" style={{ color: inkSoft }}>
            The same finance table a director sees on a laptop — payment type, status, current period, next billing date — no side spreadsheet required.
          </p>
          <BrowserFrame className="mt-8">
            <Image src="/marketing/final-finances-desktop.png" alt="A desktop view of the finances table for a masjid program" width={1440} height={560} className="w-full" />
          </BrowserFrame>
        </div>
      </div>
    </section>
  );
}

function TourRow({ title, body, children, reverse }: { title: string; body: string; children: React.ReactNode; reverse: boolean }) {
  return (
    <div className={`grid items-center gap-10 border-t py-14 first:border-t-0 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`} style={{ borderColor: line }}>
      <div>
        <h3 className={`${display.className} text-[24px] leading-[1.25] sm:text-[28px]`}>{title}</h3>
        <p className="mt-4 max-w-md text-[15px] leading-[1.7]" style={{ color: inkSoft }}>
          {body}
        </p>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  );
}

function FeaturesSection() {
  const accents = [green, aqua, green, aqua];
  return (
    <section id="features" className="border-t px-5 py-20 sm:px-8" style={{ borderColor: line, backgroundColor: white }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <h2 className={`${display.className} text-[30px] leading-[1.2] sm:text-[36px]`}>Built for the full program lifecycle.</h2>
            <p className="mt-5 text-[15px] leading-[1.7]" style={{ color: inkSoft }}>
              Not a generic toolkit — the actual jobs masjid directors, teachers, parents, and students repeat every week.
            </p>
          </div>

          <div>
            {featureGroups.map((group, index) => (
              <div key={group.title} className="border-t py-7 first:border-t-0" style={{ borderColor: line }}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <h3 className="w-40 shrink-0 text-[15px] font-bold uppercase tracking-[0.06em]" style={{ color: accents[index % accents.length] }}>
                    {group.title}
                  </h3>
                  <p className="flex-1 text-[15px] leading-[1.9]" style={{ color: inkSoft }}>
                    {group.items.join("  ·  ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhiteLabelSection() {
  return (
    <section id="organizations" className="relative overflow-hidden border-y px-5 py-20 sm:px-8" style={{ borderColor: line, backgroundColor: dark }}>
      <GeometricMark size={280} className="pointer-events-none absolute -right-20 -top-20 opacity-[0.06]" style={{ color: aquaSoft }} rotate={12} />
      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <h2 className={`${display.className} text-[30px] leading-[1.2] sm:text-[36px]`} style={{ color: white }}>
              Every organization gets a branded Madrasa app.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.7]" style={{ color: "rgba(255,255,255,0.68)" }}>
              A masjid runs on its own subdomain, shows its own name and logo, and installs as its own home-screen app —
              while Madrasa stays quietly in the background as the engine underneath. This is a real program page from a real masjid running on Madrasa today.
            </p>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-[280px] -rotate-2 overflow-hidden rounded-2xl border shadow-[0_28px_60px_rgba(0,0,0,0.35)]" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
              <Image src="/marketing/final-program-card.png" alt="A real masjid program page with its own logo and branding" width={390} height={760} className="w-full" />
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {[
            { slug: "assiddiq", note: "Live today" },
            { slug: "alrashid", note: "Coming soon" },
            { slug: "yourmasjid", note: "Your subdomain" },
          ].map((tenant, index) => (
            <LedgerCard key={tenant.slug} rotate={index % 2 === 0 ? -2 : 2} className="flex h-[120px] flex-col justify-between">
              <span className={`${display.className} text-lg`}>{tenant.slug.slice(0, 1).toUpperCase()}</span>
              <div>
                <p className="font-bold capitalize">{tenant.slug}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: inkSoft }}>
                  {tenant.slug}.madrasa.ca &middot; {tenant.note}
                </p>
              </div>
            </LedgerCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="border-t px-5 py-20 sm:px-8" style={{ borderColor: line, backgroundColor: mint }}>
      <div className="mx-auto max-w-6xl">
        <h2 className={`${display.className} max-w-2xl text-[30px] leading-[1.2] sm:text-[36px]`}>Pilot-friendly pricing while Madrasa is growing.</h2>
        <p className="mt-5 max-w-xl text-[15px] leading-[1.7]" style={{ color: inkSoft }}>
          Madrasa is early-stage and works best with partner organizations that want a close setup process, not a generic self-serve plan.
        </p>

        <div className="mt-14 grid gap-10 border-t pt-10 sm:grid-cols-2" style={{ borderColor: line }}>
          <div className="sm:border-r sm:pr-10" style={{ borderColor: line }}>
            <h3 className={`${display.className} text-[22px]`}>Pilot rollout</h3>
            <p className="mt-3 text-[14px] leading-[1.7]" style={{ color: inkSoft }}>
              For a masjid launching Madrasa with a small number of programs and a hands-on setup period.
            </p>
            <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: green }}>
              Custom pilot pricing
            </p>
          </div>
          <div>
            <h3 className={`${display.className} text-[22px]`}>Partner organization</h3>
            <p className="mt-3 text-[14px] leading-[1.7]" style={{ color: inkSoft }}>
              For schools and masjids running multiple programs, staff roles, branded PWA setup, and payment operations.
            </p>
            <p className="mt-6 text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: green }}>
              Quoted after discovery
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section id="contact" className="relative overflow-hidden border-t px-5 py-24 text-center sm:px-8" style={{ borderColor: line, backgroundColor: white }}>
      <GeometricMark size={64} className="mx-auto mb-8 opacity-70" style={{ color: aqua }} />
      <h2 className={`${display.className} mx-auto max-w-2xl text-[30px] italic leading-[1.3] sm:text-[38px]`}>
        Bring your registration, payments, and class communication into one branded portal.
      </h2>
      <div className="mt-9">
        <a
          href={contactHref}
          className="inline-flex rounded-full px-8 py-4 text-[14px] font-bold shadow-[0_16px_32px_rgba(15,69,55,0.28)] transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: green, color: white }}
        >
          Contact
        </a>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t px-5 py-8 sm:px-8" style={{ borderColor: line, backgroundColor: mint }}>
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 text-[13px] sm:flex-row sm:items-center" style={{ color: inkSoft }}>
        <div className="flex items-center gap-2">
          <Image src="/icon-512x512.png" alt="" width={18} height={18} className="rounded-[5px]" />
          <span className="font-bold" style={{ color: ink }}>
            Madrasa
          </span>
        </div>
        <p>Program management for masjids, Islamic schools, and community education.</p>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Frames for real screenshots                                                */
/* -------------------------------------------------------------------------- */

function PhoneFrame({ children, tapeColor = aquaSoft, size = "lg" }: { children: React.ReactNode; tapeColor?: string; size?: "lg" | "md" }) {
  const width = size === "lg" ? 240 : 208;
  return (
    <div className="relative" style={{ width }}>
      <span className="absolute left-1/2 top-0 h-6 w-16 -translate-x-1/2 -rotate-3 opacity-70" style={{ backgroundColor: tapeColor }} aria-hidden />
      <div className="relative overflow-hidden rounded-[30px] p-[7px] shadow-[0_26px_60px_rgba(18,36,32,0.28)]" style={{ backgroundColor: dark, marginTop: 10 }}>
        <div className="pointer-events-none absolute left-1/2 top-[7px] z-10 h-[16px] w-[70px] -translate-x-1/2 rounded-full" style={{ backgroundColor: dark }} />
        <div className="relative overflow-hidden rounded-[24px] bg-white">{children}</div>
      </div>
    </div>
  );
}

function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border shadow-[0_28px_60px_rgba(18,36,32,0.18)] ${className}`} style={{ borderColor: line }}>
      <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ backgroundColor: mint }}>
        {[aqua, green, aquaSoft].map((c, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
        ))}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared marks                                                         */
/* -------------------------------------------------------------------------- */

function GeometricMark({ size = 40, className = "", style, rotate = 0 }: { size?: number; className?: string; style?: React.CSSProperties; rotate?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}
      fill="none"
      aria-hidden
    >
      <rect x="18" y="18" width="64" height="64" stroke="currentColor" strokeWidth="1.4" />
      <rect x="18" y="18" width="64" height="64" stroke="currentColor" strokeWidth="1.4" transform="rotate(45 50 50)" />
    </svg>
  );
}

function LedgerCard({ rotate = 0, className = "", children }: { rotate?: number; className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`rounded-[8px] border p-6 shadow-[0_20px_44px_rgba(18,36,32,0.16)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, borderColor: line, backgroundColor: white, color: ink }}
    >
      {children}
    </div>
  );
}

function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}
