"use client";

import type { Mosque, PaymentType, Profile, Program, ProgramBuilderStatus, ProgramDetails, ProgramFaq, ProgramMedia, ProgramSession, ProgramTrack, ProgramTrackSession } from "@/components/data/program-builder-shared";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  formatAgeRange,
  formatCurrencyAmount,
  formatDateOnly,
  formatFullDate,
  formatGender,
  formatPrice,
  formatShortDate,
  formatStudentDetailGender,
} from "@/lib/programs/display";

export function applicationPaymentPlanLabel(row: { request: EnrollmentRequest; track: ProgramTrack | null; subscription?: ProgramSubscription | null }, program: Program | null) {
  const current = row.request.status === "approved" ? row.subscription : null;
  if (current?.payment_waived) return "Waived";
  if (current?.payment_type && current.amount_cents != null && current.amount_cents > 0) return current.payment_type === "monthly" ? "Monthly subscription" : program?.is_ongoing ? "Annual subscription" : "Pay in Full";
  if (!program?.is_paid) {
    return "Free";
  }
  if (row.request.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid externally" : "Waived after approval";
  }
  return row.request.payment_type === "annual" ? (program.is_ongoing ? "Annual subscription" : "Pay in Full") : "Monthly subscription";
}

export type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];

export type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

export function DefaultProfileIcon({ className = "h-6 w-6", compact = false }: { className?: string; compact?: boolean } = {}) {
  const icon = (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1-3.2 3.2-5 6.5-5s5.5 1.8 6.5 5" />
    </svg>
  );

  if (compact) {
    return icon;
  }

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF6F7] text-[#2F8FB3]" aria-hidden>
      {icon}
    </span>
  );
}

export type ProgramFinanceAuditEvent = Database["public"]["Tables"]["program_finance_audit_events"]["Row"];

export function ChevronRightIcon({ className = "text-[#9AA4AA]" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function formatFinanceDate(value: string | null | undefined) {
  return formatFullDate(value);
}

export function resolveRequestTrack(
  request: Pick<EnrollmentRequest, "id" | "program_track_id">,
  requestTrackIdsByRequestId: Map<string, string[]>,
  tracks: ProgramTrack[],
): ProgramTrack | null {
  const primaryTrackId = request.program_track_id ?? requestTrackIdsByRequestId.get(request.id)?.[0] ?? null;
  return primaryTrackId ? tracks.find((track) => track.id === primaryTrackId) ?? null : null;
}

export type ParentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url">;

export type StudentDisplay = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type">;

export function applicationListedPrice(row: { request: EnrollmentRequest; track: ProgramTrack | null; subscription?: ProgramSubscription | null }, program: Program | null) {
  const current = row.request.status === "approved" ? row.subscription : null;
  if (current?.payment_waived) return "Waived";
  if (current?.amount_cents != null) return formatPrice(current.amount_cents);
  if (row.request.payment_bypassed) {
    return row.request.payment_bypass_external ? "Paid externally" : "Waived";
  }
  if (!program?.is_paid) {
    return "Free";
  }
  const isAnnual = row.request.payment_type === "annual";
  const cents = isAnnual
    ? row.request.approved_price_annual_cents ?? row.track?.price_annual_cents ?? program.price_annual_cents
    : row.request.approved_price_monthly_cents ?? row.track?.price_monthly_cents ?? program.price_monthly_cents;
  return formatPrice(cents);
}
