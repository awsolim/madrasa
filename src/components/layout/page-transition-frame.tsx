"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useStandaloneMode } from "@/lib/pwa/install";

type Direction = "from-right" | "from-left";
type PendingSlide = { href: string; label: string; direction: Direction; arrived: boolean; finished: boolean };

function tabIndex(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "m" || !parts[1]) return -1;
  const area = parts[2];
  const section = ["portal", "teacher", "admin"].includes(area) ? parts[3] : area;
  if (!section) return 0;
  if (section === "classes" || section === "programs") return 1;
  if (section === "inbox" || section === "announcements" || section === "masjid") return 2;
  if (section === "account" || section === "settings") return 3;
  return -1;
}

export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const standalone = useStandaloneMode();
  const pathRef = useRef(pathname);
  const lastPreviewHrefRef = useRef<string | null>(null);
  const [slide, setSlide] = useState<PendingSlide | null>(null);

  useEffect(() => {
    pathRef.current = pathname;
    lastPreviewHrefRef.current = null;
    setSlide((current) => {
      if (!current) return current;
      if (current.href !== pathname) return null;
      return current.finished ? null : { ...current, arrived: true };
    });
  }, [pathname]);

  useEffect(() => {
    function begin(href: string, label: string, direction: Direction) {
      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === pathRef.current) return;
      lastPreviewHrefRef.current = destination.pathname;
      // Paint the moving surface before the router waits for the destination payload.
      flushSync(() => setSlide({ href: destination.pathname, label, direction, arrived: false, finished: false }));
    }

    function handlePreview(event: Event) {
      const detail = (event as CustomEvent<{ href?: string; label?: string; direction?: Direction; fromPath?: string; kind?: string }>).detail;
      if (!detail?.href || detail.fromPath !== pathRef.current) return;
      const fromIndex = tabIndex(pathRef.current);
      const toIndex = tabIndex(new URL(detail.href, window.location.href).pathname);
      const direction = detail.direction ?? (detail.kind === "tab" && fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex ? "from-left" : "from-right");
      begin(detail.href, detail.label ?? "", direction);
    }

    function handleLinkClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin || destination.pathname === pathRef.current) return;
      if (lastPreviewHrefRef.current === destination.pathname) {
        lastPreviewHrefRef.current = null;
        return;
      }
      const mainNav = Boolean(anchor.closest('nav[aria-label="Primary navigation"], nav[aria-label="Mobile primary navigation"], nav[aria-label="Mobile web navigation"]'));
      const fromIndex = tabIndex(pathRef.current);
      const toIndex = tabIndex(destination.pathname);
      const direction: Direction = mainNav && fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex ? "from-left" : "from-right";
      const label = anchor.getAttribute("aria-label") ?? anchor.textContent?.trim().replace(/\s+/g, " ") ?? "";
      begin(destination.pathname, label.slice(0, 60), direction);
      lastPreviewHrefRef.current = null;
    }

    window.addEventListener("tareeqah:nav-preview", handlePreview);
    document.addEventListener("click", handleLinkClick);
    return () => {
      window.removeEventListener("tareeqah:nav-preview", handlePreview);
      document.removeEventListener("click", handleLinkClick);
    };
  }, []);

  useEffect(() => {
    if (!slide) return;
    const timeout = window.setTimeout(() => setSlide(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [slide?.href]);

  return (
    <main className={`relative ${standalone === true ? "pb-20" : "pb-0"} md:pb-0`}>
      {children}
      {slide ? (
        <div
          className={`page-navigation-surface ${slide.direction}`}
          aria-hidden="true"
          onAnimationEnd={() => setSlide((current) => current?.href === slide.href ? current.arrived ? null : { ...current, finished: true } : current)}
        >
          <div className="page-navigation-label">{slide.label}</div>
        </div>
      ) : null}
    </main>
  );
}
