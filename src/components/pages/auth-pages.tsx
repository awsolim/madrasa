import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { GoogleAuthCallback } from "@/components/auth/google-auth-callback";
import { OAuthProfileCompletion } from "@/components/auth/oauth-profile-completion";
import { ForgotPasswordPanel, ResetPasswordPanel } from "@/components/auth/password-reset";
import { PageShell } from "@/components/layout/page-shell";
import { PageTitleBar } from "@/components/layout/page-title-bar";

const defaultMasjidName = "Assiddiq";

function AuthWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 min-h-[calc(100vh-260px)]" style={{ marginTop: "-172px" }}>
      <div className="min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px] bg-[var(--workspace)]">
        <section className="bg-white">{children}</section>
      </div>
    </div>
  );
}

function AuthForm({ mode, slug, returnTo }: { mode: "login" | "signup"; slug: string; returnTo?: string }) {
  return (
    <main className="min-h-screen bg-white">
      <PageTitleBar title={mode === "login" ? "Log In" : "Create Account"} subtitle={defaultMasjidName} tone="teal" />
      <AuthWorkspace>
        <AuthPanel mode={mode} slug={slug} returnTo={returnTo} />
        {mode === "signup" ? (
          <p className="px-5 pb-6 text-center text-xs leading-5 text-[#8A9399]">
            By creating an account, you agree to our{" "}
            <Link href="/legal/terms" className="font-semibold text-[#2F8FB3] hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="font-semibold text-[#2F8FB3] hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}
      </AuthWorkspace>
    </main>
  );
}

export function LoginPage({ slug, returnTo }: { slug: string; returnTo?: string }) {
  return <AuthForm mode="login" slug={slug} returnTo={returnTo} />;
}

export function SignupPage({ slug, returnTo }: { slug: string; returnTo?: string }) {
  return <AuthForm mode="signup" slug={slug} returnTo={returnTo} />;
}

export function ForgotPasswordPage({ slug }: { slug: string }) {
  return (
    <main className="min-h-screen bg-white">
      <PageTitleBar title="Reset Password" subtitle={defaultMasjidName} tone="teal" />
      <AuthWorkspace>
        <ForgotPasswordPanel slug={slug} />
      </AuthWorkspace>
    </main>
  );
}

export function ResetPasswordPage({ slug }: { slug: string }) {
  return (
    <main className="min-h-screen bg-white">
      <PageTitleBar title="New Password" subtitle={defaultMasjidName} tone="teal" />
      <AuthWorkspace>
        <ResetPasswordPanel slug={slug} />
      </AuthWorkspace>
    </main>
  );
}

export function GoogleAuthCallbackPage({ slug }: { slug: string }) {
  return (
    <PageShell slug={slug}>
      <PageTitleBar title="Signing in" subtitle={defaultMasjidName} tone="teal" />
      <AuthWorkspace>
        <GoogleAuthCallback slug={slug} />
      </AuthWorkspace>
    </PageShell>
  );
}

export function CompleteOAuthProfilePage({ slug }: { slug: string }) {
  return (
    <main className="min-h-screen bg-white">
      <PageTitleBar title="Profile" subtitle="Finish your account setup." tone="teal" />
      <AuthWorkspace>
        <OAuthProfileCompletion slug={slug} />
      </AuthWorkspace>
    </main>
  );
}
