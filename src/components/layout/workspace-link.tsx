"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useWorkspaceNavigation } from "@/components/layout/workspace-navigation";

export default function WorkspaceLink({ href, onNavigate, ...props }: ComponentProps<typeof Link>) {
  const navigation = useWorkspaceNavigation();
  const destination = typeof href === "string" ? navigation?.href(href) ?? href : href;
  return <Link {...props} href={destination} prefetch={typeof href === "string" && navigation?.isLocal(href) ? false : props.prefetch} onNavigate={(event) => {
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; event.preventDefault(); } });
    if (!cancelled && typeof href === "string" && navigation?.navigate(href, props.replace, props.scroll)) event.preventDefault();
  }} />;
}
