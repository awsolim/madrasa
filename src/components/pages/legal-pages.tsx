import { PageTitleBar } from "@/components/layout/page-title-bar";

function LegalWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 min-h-[calc(100vh-260px)]" style={{ marginTop: "-172px" }}>
      <div className="min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px] bg-white">{children}</div>
    </div>
  );
}

function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--workspace)]">
      <PageTitleBar title={title} backHref="/" backLabel="Home" tone="teal" />
      <LegalWorkspace>
        <section className="bg-white px-5 py-8">
          <div className="mx-auto max-w-2xl space-y-6 text-sm leading-6 text-[#52616A]">{children}</div>
        </section>
      </LegalWorkspace>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-[#26323A]">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A9399]">Last updated: July 2026</p>
      <p>
        Tareeqah is a class registration and management platform used by masjids (Islamic community centers) to run their educational programs. This
        policy explains what information is collected through a Tareeqah-powered portal, how it is used, and how it is protected - for every family,
        student, and teacher using the platform.
      </p>

      <LegalSection title="Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account information:</strong> name, email address, phone number, date of birth, gender, and profile photo.</li>
          <li><strong>Family information:</strong> for parent/guardian accounts, the names, ages, and class-related details of enrolled children.</li>
          <li><strong>Class activity:</strong> applications, enrollments, attendance, withdrawal requests, teacher notes and feedback, class announcements, and attachments added to those messages.</li>
          <li><strong>Payment information:</strong> for paid programs, payments are processed directly by Stripe. Tareeqah never stores card numbers or full payment details - only payment status and amount are kept for record-keeping.</li>
          <li><strong>Device information:</strong> if you enable push notifications, a device-specific subscription token is stored so notifications can be delivered to that device; general browser/device information may also be used for security and troubleshooting.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How this information is used">
        <p>
          To operate class registration and enrollment, to communicate updates (in-app, by email, and by push notification where enabled), to process
          payments for paid programs, and to allow masjid staff to manage the programs they run.
        </p>
      </LegalSection>

      <LegalSection title="Who can see it">
        <p>
          Masjid staff (teachers, program directors, and administrators) can see information relevant to the programs they manage. Tareeqah does not
          sell or share personal information with advertisers or unrelated third parties.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>
          Tareeqah uses trusted service providers to operate the platform: Supabase (secure database hosting and authentication), Stripe (payment
          processing), Resend (transactional email delivery), and browser push notification services (operated by Google, Mozilla, Apple, and other
          browser vendors, depending on your device). These providers process data solely on Tareeqah&apos;s behalf to deliver the service.
        </p>
      </LegalSection>

      <LegalSection title="Children's information">
        <p>
          Child profiles are created and managed by a parent or guardian account. Tareeqah does not knowingly collect information directly from
          children without a parent or guardian creating and managing the account on their behalf. Notes, announcements, attendance records, and
          related attachments may include information about a child&apos;s participation in a class.
        </p>
      </LegalSection>

      <LegalSection title="Data retention and deletion">
        <p>
          Information is retained for as long as needed to operate the program, maintain class records, support payment or receipt records, and
          meet the masjid&apos;s administrative needs. To request deletion of your account or a child&apos;s profile, contact your masjid&apos;s administrator
          directly.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Access to data is restricted using row-level access controls so that only authorized staff and the account holder can view relevant
          records, and all traffic to and from the platform is encrypted (HTTPS).
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          Tareeqah uses browser local storage for session authentication, remembering dismissed notifications, and device push-notification
          subscriptions - not for advertising or tracking across other websites.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>This policy may be updated from time to time; the date at the top will reflect the most recent revision.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Since each masjid manages its own community&apos;s data on Tareeqah, questions about your specific information should be directed to your
          masjid&apos;s administrator.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A9399]">Last updated: July 2026</p>
      <p>
        These terms govern your use of Tareeqah, a software platform that masjids use to manage class registration, communication, and, for paid
        programs, tuition collection. By creating an account, you agree to these terms.
      </p>

      <LegalSection title="Description of service">
        <p>
          Tareeqah provides the technology platform a masjid uses to run its educational programs - application review, enrollment, scheduling,
          announcements, teacher-family messaging, and payment processing where applicable.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You must provide accurate information when creating an account and are responsible for safeguarding your login credentials. Parent and
          guardian accounts are responsible for the accuracy of their children&apos;s profile information and for any activity under linked child
          profiles.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          You agree not to misuse the platform, attempt to access accounts or data that are not yours, or use messaging features to harass another
          user.
        </p>
      </LegalSection>

      <LegalSection title="Payments">
        <p>
          Paid classes are billed through Stripe when online payment is enabled. Pricing, refund, withdrawal, cancellation, and receipt policies are
          set by the individual masjid running the program, not by Tareeqah - Tareeqah is not responsible for a masjid&apos;s specific tuition, refund,
          or receipt policy.
        </p>
      </LegalSection>

      <LegalSection title="Class registration decisions">
        <p>Acceptance, waitlisting, or rejection of any application is at the sole discretion of the masjid&apos;s staff.</p>
      </LegalSection>

      <LegalSection title="Communications">
        <p>
          By creating an account you consent to receive service-related communications, including in-app messages, teacher notes, announcements,
          attachments, email, and - if you choose to enable them - push notifications.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          Masjid administrators may suspend or remove accounts that violate these terms or the masjid&apos;s own policies. You may request closure of
          your account at any time by contacting your masjid&apos;s administrator.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimer and limitation of liability">
        <p>
          The service is provided &quot;as is&quot; without warranties of any kind. To the fullest extent permitted by law, Tareeqah is not liable
          for indirect, incidental, or consequential damages arising from use of the platform.
        </p>
      </LegalSection>

      <LegalSection title="The masjid's role">
        <p>
          Each masjid using Tareeqah is responsible for its own program content, policies, staff conduct, and communications with its community.
          Tareeqah provides the underlying technology platform.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>These terms may be updated from time to time; the date at the top will reflect the most recent revision.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about these terms should be directed to your masjid&apos;s administrator.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
