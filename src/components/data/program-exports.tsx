"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { EmptyState } from "@/components/data/empty-state";
import { friendlyErrorMessage } from "@/lib/errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramExportType = "students" | "applications" | "finance_summary" | "payment_history";

const programExportOptions: Array<{ id: ProgramExportType; title: string; description: string; access: "program" | "finance" }> = [
  {
    id: "students",
    title: "Student roster",
    description: "Student details, enrollment status, selected tracks, family contact, and session days.",
    access: "program",
  },
  {
    id: "applications",
    title: "Applications",
    description: "Application status, selected tracks, payment decisions, review notes, and reviewers.",
    access: "program",
  },
  {
    id: "finance_summary",
    title: "Finance summary",
    description: "Enrollment payment terms, subscription status, payment counts, last payment, and approver.",
    access: "finance",
  },
  {
    id: "payment_history",
    title: "Payment history",
    description: "Individual payment records, Stripe references, and tax receipt tracking fields.",
    access: "finance",
  },
];

async function downloadProgramExport(programId: string, type: ProgramExportType, fallbackName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: "Please sign in again to continue." };
  }

  const response = await fetch(`/api/programs/${programId}/exports?type=${encodeURIComponent(type)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: result.error ?? "Could not export class data." };
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fallbackName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "class"}-${type}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}

function ExportLoadingState() {
  return (
    <section className="space-y-4 bg-white px-4 pb-28 pt-5">
      <div className="h-8 w-48 animate-pulse rounded-full bg-[#EEF3F5]" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-[#EEF3F5]" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-[18px] bg-[#F4F7F8]" />
        ))}
      </div>
    </section>
  );
}

function ExportWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 min-h-[calc(100vh-260px)]" style={{ marginTop: "-172px" }}>
      <div className="min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px] bg-white">{children}</div>
    </div>
  );
}

function ProgramExportsData({ slug, programId }: { slug: string; programId: string }) {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type");
  const [program, setProgram] = useState<Program | null>(null);
  const [selectedType, setSelectedType] = useState<ProgramExportType>(
    programExportOptions.some((option) => option.id === initialType) ? (initialType as ProgramExportType) : "students",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProgram() {
      setLoading(true);
      const supabase = createSupabaseBrowserClient();
      const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
      if (!mosque) {
        if (active) {
          setError("Masjid not found.");
          setLoading(false);
        }
        return;
      }

      const { data: programRow, error: programError } = await supabase.from("programs").select("*").eq("id", programId).eq("mosque_id", mosque.id).maybeSingle();
      if (!active) {
        return;
      }
      if (programError || !programRow) {
        setError(friendlyErrorMessage(programError, "Class not found."));
        setProgram(null);
      } else {
        setProgram(programRow);
        setError(null);
      }
      setLoading(false);
    }

    void loadProgram();

    return () => {
      active = false;
    };
  }, [programId, slug]);

  const selectedOption = programExportOptions.find((option) => option.id === selectedType) ?? programExportOptions[0];

  async function handleDownload() {
    setBusy(true);
    setError(null);
    const result = await downloadProgramExport(programId, selectedType, program?.title ?? selectedOption.title);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
    }
  }

  if (loading) {
    return <ExportLoadingState />;
  }

  if (error && !program) {
    return <EmptyState title="Could not load exports" text={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <section className="space-y-6 bg-white px-4 pb-28 pt-5 text-[#26323A]">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold leading-7">{program?.title ?? "Class data"}</h2>
        <p className="max-w-2xl text-sm font-medium leading-6 text-[#6B747B]">
          Download class records as CSV files. Finance exports use finance permissions; roster and application exports use class management permissions.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {programExportOptions.map((option) => {
          const selected = selectedType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedType(option.id)}
              className={cn(
                "min-h-[124px] rounded-[18px] border p-4 text-left transition-colors",
                selected ? "border-[#17624F] bg-[#F3FAF7] text-[#17624F]" : "border-[#DDE5E9] bg-white text-[#26323A] hover:bg-[#F8FAFB]",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7B858C]">{option.access === "finance" ? "Finance" : "Class"}</span>
              <span className="mt-2 block text-sm font-semibold leading-5">{option.title}</span>
              <span className="mt-2 block text-xs font-medium leading-5 text-[#6B747B]">{option.description}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#E1E8EC] pt-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B858C]">Selected export</p>
            <h3 className="mt-1 text-xl font-semibold text-[#26323A]">{selectedOption.title}</h3>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[#6B747B]">{selectedOption.description}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17624F] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Preparing CSV..." : "Download CSV"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-[#C0392B]">{error}</p> : null}
      </div>
    </section>
  );
}

export function ProgramExportsPage({
  slug,
  programId,
  mode,
}: {
  slug: string;
  programId: string;
  mode: "teacher" | "admin";
}) {
  const backHref = mode === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;

  return (
    <>
      <PageTitleBar title="Export Center" backHref={backHref} backLabel="Classes" tone="teal" />
      <ExportWorkspace>
        <ProgramExportsData slug={slug} programId={programId} />
      </ExportWorkspace>
    </>
  );
}
