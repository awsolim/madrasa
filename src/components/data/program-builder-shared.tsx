"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DirectorySkeleton, GenericLoadingState, QuietPageLoadingState } from "@/components/data/data-loading";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { clearPrivatePage, invalidatePrivateSnapshots, invalidateQuery, invalidateQueryPrefix, loadPrivateSnapshot, operationalSnapshotKey, prefetchQuery, readPrivatePage, useCachedQuery, writePrivatePage } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { deriveLifecycleStatus, getApplicationButtonState, getProgramPrimaryCta, getProgramStatusBadges, isPubliclyListed, toProgramStatusFields, validateProgramStatusCombination, type ApplicationStatus as ProgramApplicationStatus, type LifecycleStatus as ProgramLifecycleStatus, type PublicationStatus as ProgramPublicationStatus, type ProgramStatusFields } from "@/lib/programs/status";
import {
  dayFromSessionDate,
  dayKey,
  formatClockLabel,
  formatDayAbbreviation,
  formatScheduleRange,
  normalizeScheduleDay,
  normalizeScheduleTime,
  parseProgramSchedule,
  rosterSessionKey,
  scheduleDayOptions,
  scheduleLabel,
  scheduleRowKey,
  scheduleRowsToJson,
  sortScheduleRows,
  type ProgramScheduleRow,
  uniqueScheduleRows,
  weekdayName,
} from "@/lib/programs/schedule";
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

export function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function programPaymentOptions(program: ProgramPaymentOptionsInput) {
  if (!program.is_paid) {
    return [];
  }
  const monthlyEnabled = program.offers_monthly_payment !== false && Boolean(program.price_monthly_cents);
  const annualEnabled = Boolean(program.offers_annual_payment && program.price_annual_cents);
  const durationMonths = pricingComparisonDurationMonths(program);
  const options: Array<{ type: PaymentType; title: string; price: string; subtitle: string; badge?: string }> = [];
  if (monthlyEnabled) {
    const monthlyBadge = monthlyEnabled && annualEnabled ? monthlyDealText(program) : "";
    const fixedRange = !program.is_ongoing && program.start_date && program.end_date ? `${formatDurationDate(program.start_date)} to ${formatDurationDate(program.end_date)}` : null;
    options.push({
      type: "monthly",
      title: "Monthly plan",
      price: `${formatPrice(program.price_monthly_cents)}/month`,
      subtitle: program.is_ongoing
        ? "This class is ongoing. Subscription continues monthly until ended."
        : fixedRange
          ? `Runs from ${fixedRange}. Subscription is scheduled to end when the program ends.`
          : "Billed monthly for the length of the program.",
      badge: monthlyBadge || undefined,
    });
  }
  if (annualEnabled) {
    const monthlyEquivalent = durationMonths && program.price_annual_cents ? Math.round(program.price_annual_cents / durationMonths) : null;
    options.push({
      type: "annual",
      title: program.is_ongoing ? "Annual subscription" : "Pay in Full",
      price: program.is_ongoing ? `${formatPrice(program.price_annual_cents)}/year` : formatPrice(program.price_annual_cents),
      subtitle: program.is_ongoing
        ? monthlyEquivalent
          ? `Equivalent to ${formatPrice(monthlyEquivalent)}/month, billed once a year. Renews automatically until cancelled.`
          : "Billed once a year. Renews automatically until cancelled."
        : monthlyEquivalent
          ? `Equivalent to ${formatPrice(monthlyEquivalent)}/month for the ${durationMonths}-month program.`
          : "One payment covers the full program.",
      badge: monthlyEnabled && annualEnabled ? annualDealText(program) : "",
    });
  }
  return options;
}

export function annualDealText(program: Pick<Program, "price_monthly_cents" | "price_annual_cents" | "start_date" | "end_date" | "duration_months" | "billing_duration_months" | "is_ongoing">) {
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return "";
  }
  const monthlyTotal = (program.price_monthly_cents ?? 0) * durationMonths;
  const annual = program.price_annual_cents ?? 0;
  if (!monthlyTotal || !annual || annual >= monthlyTotal) {
    return "";
  }
  const savings = monthlyTotal - annual;
  return program.is_ongoing ? `Save ${formatPrice(savings)} per year by paying annually` : `Save ${formatPrice(savings)} by paying in full`;
}

export function pricingComparisonDurationMonths(program: Pick<Program, "is_ongoing" | "start_date" | "end_date" | "duration_months" | "billing_duration_months">) {
  return program.is_ongoing ? 12 : programPayInFullDurationMonths(program);
}

export function programPayInFullDurationMonths(program: Pick<Program, "start_date" | "end_date" | "duration_months" | "billing_duration_months">) {
  return program.billing_duration_months ?? program.duration_months ?? estimateBillingMonths(program.start_date ?? "", program.end_date ?? "") ?? null;
}

export function estimateBillingMonths(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const monthMark = new Date(start);
  monthMark.setMonth(monthMark.getMonth() + months);
  let leftoverDays = Math.round((end.getTime() - monthMark.getTime()) / 86400000);
  if (leftoverDays < 0) {
    months -= 1;
    monthMark.setMonth(monthMark.getMonth() - 1);
    leftoverDays = Math.round((end.getTime() - monthMark.getTime()) / 86400000);
  }
  if (leftoverDays >= 20) {
    months += 1;
  }
  return Math.max(1, months);
}

export type Program = Database["public"]["Tables"]["programs"]["Row"];

export function formatDurationDate(value: string | null | undefined) {
  return formatDateOnly(value);
}

export function monthlyDealText(program: Pick<Program, "price_monthly_cents" | "price_annual_cents" | "start_date" | "end_date" | "duration_months" | "billing_duration_months" | "is_ongoing">) {
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return "";
  }
  const monthlyTotal = (program.price_monthly_cents ?? 0) * durationMonths;
  const annual = program.price_annual_cents ?? 0;
  if (!monthlyTotal || !annual || monthlyTotal >= annual) {
    return "";
  }
  return `Save ${formatPrice(annual - monthlyTotal)} by paying monthly`;
}

export type PaymentType = "monthly" | "annual";

export type ProgramPaymentOptionsInput = Pick<
  Program,
  "is_paid" | "offers_monthly_payment" | "offers_annual_payment" | "price_monthly_cents" | "price_annual_cents" | "is_ongoing" | "start_date" | "end_date" | "duration_months" | "billing_duration_months"
>;

export function trackPricingDeal(track: ProgramTrack | null, program: Program): { annualPriceCents: number; savingsCents: number } | null {
  if (!program.is_paid) {
    return null;
  }
  const { monthlyCents, annualCents } = track ? trackEffectivePriceCents(track, program) : { monthlyCents: program.price_monthly_cents, annualCents: program.price_annual_cents };
  const offersMonthly = program.offers_monthly_payment !== false && Boolean(monthlyCents);
  const offersAnnual = Boolean(program.offers_annual_payment && annualCents);
  if (!offersMonthly || !offersAnnual) {
    return null;
  }
  const durationMonths = pricingComparisonDurationMonths(program);
  if (!durationMonths) {
    return null;
  }
  const monthlyTotal = (monthlyCents ?? 0) * durationMonths;
  const annual = annualCents ?? 0;
  if (!monthlyTotal || !annual || annual >= monthlyTotal) {
    return null;
  }
  return { annualPriceCents: annual, savingsCents: monthlyTotal - annual };
}

export function trackEffectivePriceCents(track: ProgramTrack, program: Program) {
  const monthlyCents = track.pricing_override_enabled ? track.price_monthly_cents : program.price_monthly_cents;
  const annualCents = track.pricing_override_enabled ? track.price_annual_cents : program.price_annual_cents;
  return { monthlyCents, annualCents };
}

export type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];

export function trackCapacityBadge(track: ProgramTrack, enrolledCountByTrackId: Record<string, number>): { label: string; tone: "full" | "low" } | null {
  if (track.capacity == null) {
    return null;
  }
  const remaining = track.capacity - (enrolledCountByTrackId[track.id] ?? 0);
  if (remaining <= 0) {
    return { label: "Full", tone: "full" };
  }
  if (remaining < 10) {
    return { label: "Few Spots Left!", tone: "low" };
  }
  return null;
}

export function scheduleSessionLines(schedule: Json | null, notes: string | null): string[] {
  if (notes) {
    return [notes];
  }
  const rows = parseProgramSchedule(schedule);
  if (rows.length === 0) {
    return ["Schedule will be announced"];
  }
  return rows.map((row) => `${row.day}, ${formatScheduleRange(row.start, row.end)}`);
}

export function mediaType(item: ProgramMedia) {
  const inferred = inferMediaTypeFromUrl(item.url) ?? inferMediaTypeFromUrl(item.thumbnail_url ?? "");
  return inferred ?? item.media_type;
}

export function inferMediaTypeFromUrl(url: string | null | undefined): "photo" | "video" | null {
  if (!url) {
    return null;
  }
  const pathname = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  const extension = pathname.split(".").pop() ?? "";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) {
    return "video";
  }
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(extension)) {
    return "photo";
  }
  return null;
}

export type ProgramMedia = Database["public"]["Tables"]["program_media"]["Row"];

export function applyLinkedSessionsToTracks(tracks: ProgramTrack[], sessions: ProgramSession[], links: ProgramTrackSession[]) {
  if (!tracks.length || !sessions.length || !links.length) {
    return tracks;
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const linksByTrackId = new Map<string, ProgramTrackSession[]>();
  for (const link of links) {
    linksByTrackId.set(link.program_track_id, [...(linksByTrackId.get(link.program_track_id) ?? []), link]);
  }

  return tracks.map((track) => {
    const rows = (linksByTrackId.get(track.id) ?? [])
      .map((link) => sessionById.get(link.program_session_id))
      .filter((session): session is ProgramSession => Boolean(session))
      .map(scheduleRowFromProgramSession);
    return rows.length ? { ...track, schedule: scheduleRowsToJson(rows) } : track;
  });
}

export function scheduleRowFromProgramSession(session: ProgramSession): ProgramScheduleRow {
  const day = session.day_of_week ? normalizeScheduleDay(session.day_of_week) : dayFromSessionDate(session.session_date);
  const start = normalizeScheduleTime(String(session.start_time)) || "18:00";
  const end = normalizeScheduleTime(String(session.end_time ?? session.start_time)) || start;
  return {
    id: session.id,
    date: session.session_date ?? undefined,
    day: (day || "Monday") as (typeof scheduleDayOptions)[number],
    start,
    end,
  };
}

export type ProgramSession = Database["public"]["Tables"]["program_sessions"]["Row"];

export type ProgramTrackSession = Database["public"]["Tables"]["program_track_sessions"]["Row"];

export function mosqueProgramsQueryKey(slug: string) {
  return `mosque-programs:${slug}`;
}

export function programStatusBadgeToneClass(tone: "neutral" | "positive" | "warning" | "danger") {
  switch (tone) {
    case "positive":
      return "bg-[#E3F5EE] text-[#228763]";
    case "warning":
      return "bg-[#FFF7E6] text-[#8A5A00]";
    case "danger":
      return "bg-[#FDEDEA] text-[#C83F31]";
    default:
      return "bg-[#EEF3F5] text-[#52616A]";
  }
}

export function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
    </svg>
  );
}

export type ProgramBuilderStatus = {
  internalName: string;
  summary: string;
  category: string;
  programType: "recurring" | "event";
  publicationStatus: ProgramPublicationStatus;
  applicationStatus: ProgramApplicationStatus;
  lifecycleStatus: ProgramLifecycleStatus;
  applicationMode: "application_required" | "open_enrollment" | "invite_only" | "hidden_private";
  acceptingApplications: boolean;
  applicationOpenAt: string;
  applicationCloseAt: string;
  waitlistEnabled: boolean;
  capacityBehavior: "manual_review" | "close_when_full" | "allow_waitlist";
  defaultCapacity: string;
  durationType: "ongoing" | "fixed_months";
  startNow: boolean;
  startDate: string;
  endDate: string;
  durationMonths: string;
  schedulePattern: "weekly" | "custom_dates";
  registrationDeadline: string;
  location: string;
  room: string;
  roomArea: string;
  paymentKind: "free" | "tareeqah";
  billingStartBehavior: "on_payment" | "program_start";
  monthlyBillingAnchor: "signup_date" | "first_of_month";
  billingEndBehavior: "manual_cancel" | "program_end" | "fixed_months";
  billingDurationMonths: string;
  allowCustomPrices: boolean;
  allowWaivedPayments: boolean;
  manualPaymentNote: string;
  financialAssistanceNote: string;
  receiptNote: string;
  taxReceiptPolicy: "not_applicable" | "admin_review_required" | "eligible_confirmed";
  trackSwitchPolicy: "disabled" | "request_only" | "allowed";
  trackSwitchAllowAll: boolean;
  contactEmail: string;
  contactPhone: string;
  coverPriceLabelEnabled: boolean;
  coverPriceLabel: string;
};

export function ImageCropModal({
  file,
  aspectRatio,
  outputWidth,
  outputHeight,
  title,
  onCancel,
  onConfirm,
}: {
  file: File;
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const cropModalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(cropModalRef, true, onCancel);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const maxFrameSize = imageCropWorkspaceSize - 40;
  const frameWidth = aspectRatio >= 1 ? maxFrameSize : maxFrameSize * aspectRatio;
  const frameHeight = aspectRatio >= 1 ? maxFrameSize / aspectRatio : maxFrameSize;

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y });
  }

  function dragImage(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setOffset({ x: dragState.originX + event.clientX - dragState.startX, y: dragState.originY + event.clientY - dragState.startY });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  }

  function zoomImage(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    setScale((current) => Math.min(2.5, Math.max(0.6, Number((current + delta).toFixed(2)))));
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  async function handleConfirm() {
    setSaving(true);
    setCropError(null);
    try {
      const cropped = await cropImageToFile(objectUrl, scale, offset, {
        frameWidth,
        frameHeight,
        outputWidth,
        outputHeight,
        fileName: `${file.name.replace(/\.[^./\\]+$/, "")}.jpg`,
      });
      onConfirm(cropped);
    } catch {
      setSaving(false);
      setCropError("This photo couldn’t be prepared. Try another JPEG, PNG or WebP photo.");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/60 px-5 backdrop-blur-sm">
      <div ref={cropModalRef} role="dialog" aria-modal="true" aria-labelledby="image-crop-title" className="w-full max-w-sm rounded-[28px] bg-white px-5 py-5 shadow-[0_24px_70px_rgba(38,50,58,0.28)]">
        {cropError ? <p role="alert" className="mb-3 text-sm text-[#B4352B]">{cropError}</p> : null}
        <h2 id="image-crop-title" className="text-base font-semibold text-[#26323A]">
          {title}
        </h2>
        <div className="mt-4 flex justify-center">
          <div
            className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#EEF0F0] active:cursor-grabbing"
            style={{ width: imageCropWorkspaceSize, height: imageCropWorkspaceSize }}
            onPointerDown={beginDrag}
            onPointerMove={dragImage}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={zoomImage}
          >
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 bg-contain bg-center bg-no-repeat will-change-transform"
              style={{
                width: imageCropWorkspaceSize,
                height: imageCropWorkspaceSize,
                backgroundImage: `url("${objectUrl}")`,
                transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-white"
              style={{ width: frameWidth, height: frameHeight, boxShadow: "0 0 0 9999px rgba(38,50,58,0.55)" }}
              aria-hidden
            />
          </div>
        </div>
        <div className="mx-auto mt-4 flex w-fit items-center overflow-hidden rounded-full bg-[#F2F4F5]">
          <button type="button" onClick={() => setScale((current) => Math.max(0.6, Number((current - 0.1).toFixed(1))))} className="flex h-10 w-12 items-center justify-center text-xl text-[#26323A]" aria-label="Zoom out">
            -
          </button>
          <button type="button" onClick={() => setScale((current) => Math.min(2.5, Number((current + 0.1).toFixed(1))))} className="flex h-10 w-12 items-center justify-center border-l border-white text-xl text-[#26323A]" aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={reset} className="h-10 border-l border-white px-4 text-sm font-semibold text-[#26323A]">
            Reset
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-full bg-[#F2F4F5] px-4 text-sm font-semibold text-[#26323A]">
            Cancel
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={saving} className="min-h-11 rounded-full bg-[#171717] px-4 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function cropImageToFile(
  source: string,
  scale: number,
  offset: { x: number; y: number },
  options: { frameWidth: number; frameHeight: number; outputWidth: number; outputHeight: number; fileName: string },
) {
  return new Promise<File>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = options.outputWidth;
      canvas.height = options.outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas not available"));
        return;
      }

      const fitScale = Math.min(imageCropWorkspaceSize / image.naturalWidth, imageCropWorkspaceSize / image.naturalHeight);
      const totalScale = fitScale * scale;
      const displayWidth = image.naturalWidth * totalScale;
      const displayHeight = image.naturalHeight * totalScale;
      const imageLeft = imageCropWorkspaceSize / 2 - displayWidth / 2 + offset.x;
      const imageTop = imageCropWorkspaceSize / 2 - displayHeight / 2 + offset.y;
      const cropLeft = (imageCropWorkspaceSize - options.frameWidth) / 2;
      const cropTop = (imageCropWorkspaceSize - options.frameHeight) / 2;
      const sourceX = (cropLeft - imageLeft) / totalScale;
      const sourceY = (cropTop - imageTop) / totalScale;
      const sourceWidth = options.frameWidth / totalScale;
      const sourceHeight = options.frameHeight / totalScale;

      context.fillStyle = "#F2F4F5";
      context.fillRect(0, 0, options.outputWidth, options.outputHeight);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, options.outputWidth, options.outputHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not export image"));
            return;
          }
          resolve(new File([blob], options.fileName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = source;
  });
}

export const imageCropWorkspaceSize = 280;

export function ClassesLoadingPlaceholders({ count = 2 }: { count?: number }) {
  void count;
  return <GenericLoadingState label="Loading classes" layout="classes" />;
}

export const scheduleTimeOptions = Array.from({ length: 33 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

export function invalidateProgramCaches(slug: string, programId: string) {
  invalidatePrivateSnapshots(`program-editor:${slug}:${programId}:`);
  invalidateQuery(mosqueProgramsQueryKey(slug));
  invalidateQueryPrefix(`teacher-programs:${slug}:`);
  invalidateQueryPrefix(`admin-programs:${slug}:`);
  invalidateQueryPrefix(`program-detail:${slug}:${programId}:`);
}

export function PhotoIcon({ className = "h-5 w-5" }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m6.5 17 4.2-4.2a1.4 1.4 0 0 1 2 0L15.5 15l1.2-1.2a1.4 1.4 0 0 1 2 0l1.8 1.8" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function trackSelectionRuleText(program: Pick<Program, "track_selection_mode" | "track_selection_count">, trackCount: number) {
  void program;
  void trackCount;
  return "Select one";
}

export function TrackPayInFullPriceCaption({ track, program }: { track: ProgramTrack | null; program: Program }) {
  if (program.is_ongoing) {
    return null;
  }
  const deal = trackPricingDeal(track, program);
  if (!deal) {
    return null;
  }
  return <p className="shrink-0 text-xs font-semibold text-[#6B747B]">Pay in full: {formatPrice(deal.annualPriceCents)}</p>;
}

export function TrackPricingDealCaption({ track, program, paymentType }: { track: ProgramTrack | null; program: Program; paymentType?: PaymentType }) {
  const deal = trackPricingDeal(track, program);
  if (!deal) {
    return null;
  }
  return (
    <p className="mt-1 text-xs font-semibold text-[#8A6418]">
      {paymentType === "annual"
        ? `Saves ${formatPrice(deal.savingsCents)}`
        : paymentType === "monthly"
          ? `Save ${formatPrice(deal.savingsCents)} paying ${program.is_ongoing ? "annually" : "in full"}`
          : `Save ${formatPrice(deal.savingsCents)} by paying ${program.is_ongoing ? "annually" : "in full"}`}
    </p>
  );
}

export function TrackPriceNumber({ price }: { price: { label: string } | null }) {
  if (!price) {
    return null;
  }
  return <span className="block font-mono text-2xl font-black leading-none tracking-tight tabular-nums text-[#17624F]">{price.label}</span>;
}

export function trackPriceLine(track: ProgramTrack | null, program: Program, forType?: PaymentType, options?: { bareLabel?: boolean }): { label: string } | null {
  if (!program.is_paid) {
    return { label: "Free" };
  }
  const { monthlyCents, annualCents } = track ? trackEffectivePriceCents(track, program) : { monthlyCents: program.price_monthly_cents, annualCents: program.price_annual_cents };
  const offersMonthly = program.offers_monthly_payment !== false && Boolean(monthlyCents);
  const offersAnnual = Boolean(program.offers_annual_payment && annualCents);
  if (!offersMonthly && !offersAnnual) {
    return null;
  }
  const useAnnual =
    forType === "annual" && offersAnnual
      ? true
      : forType === "monthly" && offersMonthly
        ? false
        : !offersMonthly && offersAnnual;
  const label = useAnnual
    ? options?.bareLabel
      ? formatPrice(annualCents)
      : program.is_ongoing
        ? `${formatPrice(annualCents)}/yr`
        : `${formatPrice(annualCents)} pay in full`
    : `${formatPrice(monthlyCents)}/mo`;
  return { label };
}

export function ProgramFaqSection({ faqs }: { faqs: Array<Pick<ProgramFaq, "id" | "question" | "answer">> }) {
  const [openId, setOpenId] = useState("");
  return (
    <section className="overflow-hidden rounded-[28px] bg-[#F6F1FF] p-4 shadow-[0_14px_36px_rgba(75,52,117,0.10)]">
      <div className="rounded-[24px] bg-white/72 p-4 ring-1 ring-white">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#5D4A86] shadow-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EEE6FF] text-[#5D4A86]">?</span>
          Frequently Asked Questions
        </div>
        <div className="mt-5 space-y-3">
          {faqs.map((faq) => {
            const open = faq.id === openId;
            return (
              <button
                key={faq.id}
                type="button"
                onClick={() => setOpenId(open ? "" : faq.id)}
                className={cn(
                  "w-full rounded-[18px] bg-white p-4 text-left shadow-[0_10px_24px_rgba(38,50,58,0.08)] ring-1 ring-[#E7E0F2] transition",
                  open && "ring-[#BFA9E8]",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold leading-5 text-[#26323A]">{faq.question}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3EEFC] text-[#5D4A86]">
                    <ChevronIcon expanded={open} />
                  </span>
                </span>
                {open ? <span className="mt-3 block text-sm leading-6 text-[#52616A]">{faq.answer}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export type ProgramFaq = Database["public"]["Tables"]["program_faqs"]["Row"];

export function ProgramPaymentOptionsDisplay({ program, tracks = [] }: { program: Program; tracks?: ProgramTrack[] }) {
  const options = programPaymentOptions(program);
  if (!program.is_paid) {
    return (
      <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Price options</p>
        <div className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <p className="text-sm font-semibold text-[#26323A]">Free</p>
          <p className="mt-1 text-xs leading-5 text-[#6B747B]">No payment is required for this class.</p>
        </div>
      </div>
    );
  }
  if (hasPerTrackPricing(tracks)) {
    return null;
  }
  const primaryPrice = trackPriceLine(null, program);
  return (
    <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Price options</p>
      {primaryPrice ? (
        <div className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Program price</p>
          <p className="mt-1 font-mono text-3xl font-black leading-none tracking-tight tabular-nums text-[#17624F]">{primaryPrice.label}</p>
          <TrackPricingDealCaption track={null} program={program} />
        </div>
      ) : null}
      {options.map((option) => (
        <div key={option.type} className="rounded-[14px] bg-[#F7FAFB] p-3 ring-1 ring-[#E6ECEF]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-[#26323A]">{option.title}</p>
            {option.badge ? <span className="rounded-full bg-[#EAF7F1] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#17624F]">{option.badge}</span> : null}
          </div>
          <p className="mt-1 text-sm font-bold text-[#17624F]">{option.price}</p>
          <p className="mt-1 text-xs leading-5 text-[#6B747B]">{option.subtitle}</p>
        </div>
      ))}
    </div>
  );
}

export function hasPerTrackPricing(tracks: ProgramTrack[]) {
  return tracks.some((track) => Boolean(track.pricing_override_enabled && (track.price_monthly_cents || track.price_annual_cents)));
}

export function ProgramScheduleOptionsDisplay({
  tracks,
  program,
  fallbackSchedule,
  enrolledCountByTrackId = {},
}: {
  tracks: ProgramTrack[];
  program?: Program | null;
  fallbackSchedule: string;
  enrolledCountByTrackId?: Record<string, number>;
}) {
  const showTrackPrices = program ? hasPerTrackPricing(tracks) : false;
  return (
    <div className="mt-4 space-y-2 border-t border-[#E6ECEF] pt-4">
      {tracks.length ? (
        <div className="space-y-2">
          {tracks.map((track) => {
            const scheduleLines = scheduleSessionLines(track.schedule, null);
            const price = program && showTrackPrices ? trackPriceLine(track, program) : null;
            const capacityBadge = trackCapacityBadge(track, enrolledCountByTrackId);
            return (
              <div key={track.id} className={cn("relative overflow-hidden rounded-[14px] p-3 ring-1", capacityBadge?.tone === "full" ? "bg-[#F3F4F5] ring-[#E1E8EC] opacity-75" : "bg-[#F8FBFC] ring-[#E6ECEF]", capacityBadge?.tone === "low" ? "pt-7" : "")}>
                {capacityBadge?.tone === "low" ? (
                  <span className="absolute right-0 top-0 rounded-bl-[10px] bg-[#C0392B] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{capacityBadge.label}</span>
                ) : null}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#26323A]">{track.name}</p>
                    <div className="mt-1 space-y-0.5">
                      {scheduleLines.map((line) => (
                        <p key={line} className="text-xs font-medium leading-5 text-[#52616A]">{line}</p>
                      ))}
                    </div>
                    {program ? <TrackPricingDealCaption track={track} program={program} /> : null}
                  </div>
                  {price ? <div className="shrink-0 text-right"><TrackPriceNumber price={price} /></div> : null}
                </div>
                {program ? <TrackPayInFullPriceCaption track={track} program={program} /> : null}
                {track.eligibility_comment ? <p className="mt-1.5 text-xs leading-5 text-[#7B858C]">{track.eligibility_comment}</p> : null}
                {capacityBadge?.tone === "full" ? <span className="mt-2 inline-block rounded-full bg-[#E1E8EC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7B858C]">Full</span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
          const price = program ? trackPriceLine(null, program) : null;
          const scheduleLines = fallbackSchedule ? [fallbackSchedule] : ["Schedule will be announced"];
          return (
            <div className="rounded-[14px] bg-[#F8FBFC] p-3 ring-1 ring-[#E6ECEF]">
              <p className="text-sm font-semibold text-[#26323A]">Class schedule</p>
              <div className="mt-1 space-y-0.5">
                {scheduleLines.map((line) => (
                  <p key={line} className="text-xs font-medium leading-5 text-[#52616A]">{line}</p>
                ))}
              </div>
              {price ? <div className="mt-3"><TrackPriceNumber price={price} /></div> : null}
              {program ? <TrackPricingDealCaption track={null} program={program} /> : null}
              {program ? <TrackPayInFullPriceCaption track={null} program={program} /> : null}
            </div>
          );
        })()
      )}
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E1E8EC] bg-white p-5 shadow-[0_10px_28px_rgba(38,50,58,0.06)] md:p-6">
      <h2 className="text-base font-semibold text-[#26323A]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProgramHero({ program }: { program: Program }) {
  if (program.thumbnail_url) {
    return (
      <div className="relative aspect-[4/3] bg-[#DDE8EE]">
        <Image src={program.thumbnail_url} alt="" fill className="object-cover" />
      </div>
    );
  }

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top_left,#E5FFF0_0,#7ECFC2_52%,#2E9B82_100%)] p-4 text-white/80">
      <PhotoIcon className="h-12 w-12" />
    </div>
  );
}

export function scheduleSummary(schedule: Json | null, notes: string | null) {
  const day = scheduleLabel(schedule, "Schedule will be announced");
  const time = scheduleTime(schedule);
  const full = notes || (time === "TBA" ? day : `${day}, ${time}`);
  return { day, time, full };
}

export function scheduleTime(schedule: Json | null) {
  const rows = parseProgramSchedule(schedule);
  if (rows.length === 0) {
    return "TBA";
  }

  const firstTime = `${rows[0].start}-${rows[0].end}`;
  return rows.every((row) => `${row.start}-${row.end}` === firstTime) ? formatScheduleRange(rows[0].start, rows[0].end) : "Multiple times";
}

export type ProgramDetails = Database["public"]["Tables"]["program_details"]["Row"];

export async function getCurrentAccessToken() {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

export type Mosque = Database["public"]["Tables"]["mosques"]["Row"];

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
