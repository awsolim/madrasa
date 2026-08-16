"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type AuditEvent = Database["public"]["Tables"]["program_finance_audit_events"]["Row"];

export function FinanceAuditTrail({ programId }: { programId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [programTitle, setProgramTitle] = useState("Class audit trail");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    Promise.all([
      supabase.from("programs").select("title").eq("id", programId).maybeSingle(),
      supabase.from("program_finance_audit_events").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
    ]).then(async ([programResult, auditResult]) => {
      if (!active) return;
      if (auditResult.error) {
        setError(auditResult.error.message);
        setLoading(false);
        return;
      }
      const rows = auditResult.data ?? [];
      const actorIds = Array.from(new Set(rows.map((event) => event.actor_profile_id).filter(Boolean) as string[]));
      const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
      if (!active) return;
      setProgramTitle(programResult.data?.title ?? "Class audit trail");
      setEvents(rows);
      setActors(Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "Staff member"])));
      setLoading(false);
    });
    return () => { active = false; };
  }, [programId]);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => sort === "newest" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)), [events, sort]);

  if (loading) return <div className="p-5 text-sm font-semibold text-[#6B747B]">Loading audit trail…</div>;
  if (error) return <div className="p-5 text-sm font-semibold text-[#C0392B]">{error}</div>;

  return (
    <section className="min-h-[calc(100vh-120px)] bg-white px-4 pb-28 pt-5 text-[#26323A]">
      <div className="flex items-end justify-between gap-4 border-b border-[#E1E8EC] pb-4">
        <div className="min-w-0"><h2 className="truncate text-xl font-semibold">{programTitle}</h2><p className="mt-1 text-xs text-[#7B858C]">{events.length} recorded events</p></div>
        <select value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest")} className="h-9 rounded-[10px] border border-[#D6DCE0] bg-white px-2 text-xs font-semibold">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
        </select>
      </div>
      <div className="divide-y divide-[#EEF2F4]">
        {sortedEvents.map((event) => (
          <article key={event.id} className="py-4">
            <p className="text-sm font-semibold leading-5">{event.summary}</p>
            <p className="mt-1 text-xs text-[#7B858C]">{new Date(event.created_at).toLocaleString()} · {event.actor_profile_id ? actors[event.actor_profile_id] ?? "Staff member" : "System"}</p>
          </article>
        ))}
        {!sortedEvents.length ? <p className="py-10 text-center text-sm font-semibold text-[#7B858C]">No audit events yet.</p> : null}
      </div>
    </section>
  );
}
