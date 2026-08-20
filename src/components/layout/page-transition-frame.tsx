"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStandaloneMode } from "@/lib/pwa/install";

type TransitionDirection = "from-right" | "from-left";

export function PageTransitionFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const standalone = useStandaloneMode();
  const previousPathnameRef = useRef(pathname);
  const pendingDirectionRef = useRef<TransitionDirection | null>(null);
  const [transition, setTransition] = useState<{ pathname: string; direction: TransitionDirection } | null>(null);

  useEffect(() => {
    function handlePreview(event: Event) {
      const detail = (event as CustomEvent<{ direction?: TransitionDirection; fromPath?: string }>).detail;
      if (detail?.fromPath === previousPathnameRef.current && detail.direction) {
        pendingDirectionRef.current = detail.direction;
      }
    }

    window.addEventListener("tareeqah:nav-preview", handlePreview);
    return () => window.removeEventListener("tareeqah:nav-preview", handlePreview);
  }, []);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    if (pathname === previousPathname) {
      return;
    }

    const previousDepth = previousPathname.split("/").filter(Boolean).length;
    const nextDepth = pathname.split("/").filter(Boolean).length;
    const direction = pendingDirectionRef.current ?? (nextDepth < previousDepth ? "from-left" : "from-right");

    setTransition({ pathname, direction });
    pendingDirectionRef.current = null;
    previousPathnameRef.current = pathname;
  }, [pathname]);

  const transitionClass = transition?.pathname === pathname
    ? transition.direction === "from-left" ? "page-slide-in-from-left" : "page-slide-in-from-right"
    : undefined;

  return <main className={`relative ${standalone === true ? "pb-20" : "pb-0"} md:pb-0${transitionClass ? ` ${transitionClass}` : ""}`}>{children}</main>;
}
