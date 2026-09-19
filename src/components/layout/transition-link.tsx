"use client";

import Link from "@/components/layout/workspace-link";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { getCachedSessionSnapshot, loadCachedSession } from "@/lib/client-cache";
import { operationalSnapshotKey, prefetchPrivateSnapshot } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadProgramEditor, loadProgramDirectorOptions } from "@/lib/program-editor-data";

type TransitionDirection = "from-right" | "from-left";
type PreviewKind = "home" | "classes" | "inbox" | "me" | "subpage";

function canHandleClientClick(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function dispatchPreview({ href, label, direction, fromPath, kind }: { href: string; label: string; direction: TransitionDirection; fromPath: string; kind?: PreviewKind }) {
  window.dispatchEvent(
    new CustomEvent("tareeqah:nav-preview", {
      detail: { href, label, direction, fromPath, kind },
    }),
  );
}

function rememberNavigationParent(href: string, parentPath: string) {
  try {
    window.sessionStorage.setItem(`tareeqah:nav-parent:${new URL(href, window.location.href).pathname}`, parentPath);
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

function returnToPreviousParent(pathname: string, fallbackHref: string) {
  try {
    const key = `tareeqah:nav-parent:${pathname}`;
    if (window.sessionStorage.getItem(key) !== new URL(fallbackHref, window.location.href).pathname || window.history.length <= 1) return false;
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function TransitionLink({
  href,
  label,
  direction = "from-right",
  kind = "subpage",
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  label: string;
  direction?: TransitionDirection;
  kind?: PreviewKind;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function warmDestination() {
    router.prefetch(href);
    const destination = new URL(href, window.location.href).pathname;
    const match = destination.match(/^\/m\/([^/]+)\/(?:teacher\/classes|admin\/programs)\/([^/]+)\/(applications|finances)$/);
    const wizardMatch = destination.match(/^\/m\/([^/]+)\/(?:teacher\/classes|admin\/programs)\/new$/);
    const editorMatch = destination.match(/^\/m\/([^/]+)\/(?:teacher\/classes|admin\/programs)\/([a-f0-9-]{36})$/i);
    if (editorMatch) {
      void loadProgramEditor(editorMatch[1], editorMatch[2]).catch(() => undefined);
      void loadProgramDirectorOptions(editorMatch[1]).catch(() => undefined);
      return;
    }
    if (!match && !wizardMatch) return;
    void (getCachedSessionSnapshot() === undefined ? loadCachedSession() : Promise.resolve(getCachedSessionSnapshot())).then((session) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (wizardMatch) {
        const slug = wizardMatch[1];
        prefetchPrivateSnapshot(`wizard-defaults:${slug}:${userId}`, async () => {
          const { data, error } = await createSupabaseBrowserClient().rpc("get_program_create_defaults_snapshot", { p_slug: slug });
          if (error) throw error;
          return data;
        });
        return;
      }
      if (!match) return;
      const [, slug, programId, kind] = match;
      const key = operationalSnapshotKey(kind as "applications" | "finances", slug, programId, userId);
      prefetchPrivateSnapshot(key, async () => {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = kind === "applications"
          ? await supabase.rpc("get_program_applications_snapshot", { p_slug: slug, p_program_id: programId })
          : await supabase.rpc("get_program_finances_snapshot", { p_slug: slug, p_program_id: programId });
        if (error) throw error;
        return data;
      });
    });
  }

  return (
    <Link
      {...props}
      href={href}
      onPointerEnter={(event) => { props.onPointerEnter?.(event); warmDestination(); }}
      onFocus={(event) => { props.onFocus?.(event); warmDestination(); }}
      onTouchStart={(event) => { props.onTouchStart?.(event); warmDestination(); }}
      onClick={(event) => {
        props.onClick?.(event);
        if (!canHandleClientClick(event) || href === pathname) {
          return;
        }

        event.preventDefault();
        rememberNavigationParent(href, pathname);
        dispatchPreview({ href, label, direction, fromPath: pathname, kind });
        router.push(href);
      }}
    >
      {children}
    </Link>
  );
}

export function TransitionBackButton({
  fallbackHref,
  label,
  className,
  ariaLabel = "Back",
}: {
  fallbackHref: string;
  label: string;
  className?: string;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        dispatchPreview({ href: fallbackHref, label, direction: "from-left", fromPath: pathname, kind: label === "Classes" || label === "Programs" ? "classes" : "subpage" });
        if (returnToPreviousParent(pathname, fallbackHref)) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// For card-triggered deep links into another page (e.g. a home-page "View Students"
// action): closes back to wherever the link originated, rather than a back chevron
// implying linear up-the-hierarchy navigation.
export function TransitionCloseButton({
  closeHref,
  label,
  className,
  ariaLabel = "Close",
}: {
  closeHref: string;
  label: string;
  className?: string;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        dispatchPreview({ href: closeHref, label, direction: "from-left", fromPath: pathname, kind: "subpage" });
        router.push(closeHref);
      }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
