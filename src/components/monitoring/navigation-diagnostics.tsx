"use client";

import { useEffect, useRef } from "react";

type QuerySample = { key: string; source: "network" | "memory"; durationMs: number; ok: boolean };

// Opt-in local QA only. Measures from the input event to the destination's first
// frame and to its loading indicators disappearing. No records or credentials are
// collected. Read the hidden output from a browser test; nothing enters the UI.
export function NavigationDiagnostics() {
  const outputRef = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_NAVIGATION_QA !== "1" || !/^(localhost|.+\.localhost)$/.test(window.location.hostname)) return;
    type Sample = { destination: string; start: number; routeMs: number | null; contentMs: number | null; routeRequests: number; queries: QuerySample[] };
    const samples: Sample[] = [];
    let inputAt = 0;
    let frame = 0;
    const onInput = () => { inputAt = performance.now(); };
    function report() {
      frame = 0;
      const sample = samples.at(-1);
      const page = document.querySelector<HTMLElement>("[data-workspace-page]");
      if (!sample || page?.dataset.workspacePage !== sample.destination) return;
      const elapsed = Math.round(performance.now() - sample.start);
      if (sample.routeMs === null) sample.routeMs = elapsed;
      if (sample.contentMs === null && !page.querySelector('[aria-busy="true"]')) sample.contentMs = elapsed;
      sample.routeRequests = performance.getEntriesByType("resource").filter(entry => entry.startTime >= sample.start && entry.name.includes("_rsc=")).length;
      const results = samples.map(({ start, ...result }) => { void start; return result; });
      if (outputRef.current) outputRef.current.textContent = JSON.stringify(results);
      try { window.sessionStorage.setItem("madrasa:navigation-diagnostics", JSON.stringify(results)); } catch { /* local QA remains best effort */ }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(report); };
    const onNavigate = (event: Event) => {
      const destination = (event as CustomEvent<string>).detail;
      const now = performance.now();
      samples.push({ destination, start: now - inputAt < 1000 ? inputAt : now, routeMs: null, contentMs: null, routeRequests: 0, queries: [] });
      if (samples.length > 12) samples.shift();
      schedule();
    };
    const onQueryTiming = (event: Event) => {
      const sample = samples.at(-1);
      if (!sample) return;
      sample.queries.push((event as CustomEvent<QuerySample>).detail);
      schedule();
    };
    const observer = new MutationObserver(schedule);
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy", "data-workspace-page"] });
    document.addEventListener("click", onInput, true);
    window.addEventListener("tareeqah:navigation-start", onNavigate);
    window.addEventListener("madrasa:query-timing", onQueryTiming);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onInput, true);
      window.removeEventListener("tareeqah:navigation-start", onNavigate);
      window.removeEventListener("madrasa:query-timing", onQueryTiming);
    };
  }, []);
  return process.env.NEXT_PUBLIC_NAVIGATION_QA === "1" ? <output ref={outputRef} hidden data-navigation-diagnostics /> : null;
}
