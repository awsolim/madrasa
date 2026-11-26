import { ClassDirectoryLink } from "@/components/auth/class-directory-link";

export const accountConnectionMessage = "The app is temporarily unavailable or your connection was interrupted. Please try again shortly.";

export function AccountConnectionError({ onRetry, slug }: { onRetry: () => void; slug: string }) {
  return (
    <main className="flex min-h-[60svh] items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <p role="alert" className="text-sm leading-6 text-[#52616A]">{accountConnectionMessage}</p>
        <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-xl bg-[#17624F] px-6 text-sm font-semibold !text-white">Try again</button>
        <ClassDirectoryLink slug={slug} />
      </div>
    </main>
  );
}
