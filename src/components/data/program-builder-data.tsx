"use client";

import { programMediaType, validateProgramMediaFile } from "@/lib/program-media";
import { useWizardExit } from "@/components/data/use-wizard-exit";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Upload } from "tus-js-client";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/data/empty-state";
import { EditorToast, queueEditorToast, readQueuedEditorToast, type EditorToastState } from "@/components/data/editor-toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useHideMobileChromeWhileMounted, useModalFocusTrap } from "@/hooks/use-modal-behavior";
import { getCachedMosqueChrome, getCachedProfileSummary, getCachedSessionSnapshot, getCachedUserAccess, loadCachedSession, loadCachedUserAccess, loadMosqueChrome, performClientLogout, setCachedProfileName, setCachedProfileSummary, subscribeCachedSession } from "@/lib/client-cache";
import { friendlyErrorMessage } from "@/lib/errors";
import { clearPrivatePage, invalidatePrivateSnapshots, invalidateQuery, invalidateQueryPrefix, loadPrivateSnapshot, operationalSnapshotKey, prefetchQuery, readPrivatePage, useCachedQuery, writePrivatePage } from "@/lib/query-cache";
import { loadProgramEditor, loadProgramDirectorOptions } from "@/lib/program-editor-data";
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
import { ClassesLoadingPlaceholders, DetailSection, ImageCropModal, Mosque, PhotoIcon, Profile, Program, ProgramBuilderStatus, ProgramDetails, ProgramFaqSection, ProgramHero, ProgramPaymentOptionsDisplay, ProgramScheduleOptionsDisplay, ProgramSession, ProgramTrack, ProgramTrackSession, TrashIcon, applyLinkedSessionsToTracks, estimateBillingMonths, getCurrentAccessToken, invalidateProgramCaches, mediaType, programStatusBadgeToneClass, scheduleRowFromProgramSession, scheduleSummary, scheduleTimeOptions, startOfToday, titleCase, trackSelectionRuleText } from "@/components/data/program-builder-shared";

export function TeacherProgramSettingsData({ slug, programId, returnHref }: { slug: string; programId: string; returnHref?: string }) {
  const [builderStep, setBuilderStep] = useState<ProgramBuilderStep>("basics");
  const [builderStatus, setBuilderStatus] = useState<ProgramBuilderStatus>(() => defaultBuilderStatus());
  const [program, setProgram] = useState<Program | null>(null);
  const [details, setDetails] = useState<ProgramDetails | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdminEditor, setIsAdminEditor] = useState(false);
  const [billingPolicyLocked, setBillingPolicyLocked] = useState(false);
  const [directorOptions, setDirectorOptions] = useState<DirectorOption[]>([]);
  const [selectedDirectorId, setSelectedDirectorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [allAges, setAllAges] = useState(true);
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [noRegistrationDeadline, setNoRegistrationDeadline] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);
  const [eventTimeVisible, setEventTimeVisible] = useState(false);
  const [audienceGender, setAudienceGender] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [offersMonthlyPayment, setOffersMonthlyPayment] = useState(true);
  const [offersAnnualPayment, setOffersAnnualPayment] = useState(false);
  const [annualPrice, setAnnualPrice] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [learningVisible, setLearningVisible] = useState(true);
  const [learningTitle, setLearningTitle] = useState("What You Will Learn");
  const [learningIntro, setLearningIntro] = useState("");
  const [learningDescriptionVisible, setLearningDescriptionVisible] = useState(false);
  const [topicsIntro, setTopicsIntro] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [policiesText, setPoliciesText] = useState("");
  const [outcomeRows, setOutcomeRows] = useState<Array<{ id: string; text: string }>>([]);
  const [faqVisible, setFaqVisible] = useState(false);
  const [faqRows, setFaqRows] = useState<ProgramEditorFaqRow[]>([]);
  const [contentSectionsVisible, setContentSectionsVisible] = useState(false);
  const [contentSectionRows, setContentSectionRows] = useState<ProgramEditorContentSectionRow[]>([]);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaRows, setMediaRows] = useState<ProgramEditorMediaRow[]>([]);
  const [trackRows, setTrackRows] = useState<ProgramEditorTrackRow[]>([]);
  const [transferRules, setTransferRules] = useState<ProgramEditorTransferRule[]>([]);
  const [trackSelectionMode, setTrackSelectionMode] = useState<TrackSelectionMode>("exact");
  const [trackSelectionCount, setTrackSelectionCount] = useState(1);
  const [instructorDisplayName, setInstructorDisplayName] = useState("");
  const [instructorCredentials, setInstructorCredentials] = useState("");
  const [instructorContactPhone, setInstructorContactPhone] = useState("");
  const [coverDirectorVisibility, setCoverDirectorVisibility] = useState("name_and_photo");
  const [contactPhoneOmitted, setContactPhoneOmitted] = useState(false);
  const [contactEmailOmitted, setContactEmailOmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [missingFieldsModal, setMissingFieldsModal] = useState<{ fields: ProgramBuilderMissingField[]; allowContinue: boolean } | null>(null);
  const [pendingFutureApplicantsConfirm, setPendingFutureApplicantsConfirm] = useState<{ statusOverride?: Partial<ProgramBuilderStatus> } | null>(null);
  const [startDateChangeConfirmOpen, setStartDateChangeConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [thumbnailCropFile, setThumbnailCropFile] = useState<File | null>(null);
  const wizardExit = useWizardExit(slug, { builderStatus, title, description, thumbnailUrl, allAges, ageStart, ageEnd, noRegistrationDeadline, audienceGender, price, offersMonthlyPayment, offersAnnualPayment, annualPrice, eventDate, learningVisible, learningTitle, learningIntro, topicsIntro, requirementsText, policiesText, outcomeRows, faqVisible, faqRows, contentSectionsVisible, contentSectionRows, mediaVisible, mediaRows, trackRows, transferRules, trackSelectionMode, trackSelectionCount, selectedDirectorId, instructorDisplayName, instructorCredentials, instructorContactPhone, coverDirectorVisibility, contactPhoneOmitted, contactEmailOmitted });
  const loadedDirectorRef = useRef<string | null>(null);
  const loadedTrackIdsRef = useRef<Set<string>>(new Set());
  const startDateChangeModalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(startDateChangeModalRef, startDateChangeConfirmOpen, () => setStartDateChangeConfirmOpen(false));
  // Annual pricing is compared against one year of monthly payments: 12 months for an
  // ongoing program (which bills annually, not for a known total length), or the program's
  // actual fixed duration for a fixed-length program (its annual price is a one-time lump
  // sum covering that whole length, not a yearly renewal).
  const pricingDurationMonths =
    builderStatus.durationType === "ongoing"
      ? "12"
      : builderStatus.billingDurationMonths || String(builderStatus.durationMonths || monthsBetweenDates(builderStatus.startDate, builderStatus.endDate) || "");

  useEffect(() => {
    let cancelled = false;
    void loadProgramDirectorOptions(slug).then(options => {
      if (!cancelled) setDirectorOptions(options);
    }).catch(() => { /* The class can still be edited without changing its director. */ });

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadProgramEditor(slug, programId);
        if (cancelled) return;
        const programRow = snapshot.program;
        const detailResult = { data: snapshot.details };
        const outcomeResult = { data: snapshot.outcomes };
        const contentSectionResult = { data: snapshot.contentSections };
        const faqResult = { data: snapshot.faqs };
        const mediaResult = { data: snapshot.media };
        const trackResult = { data: snapshot.tracks };
        const sessionResult = { data: snapshot.sessions };
        const transferRuleResult = { data: snapshot.transferRules };
        const trackSessionLinks = snapshot.trackSessionLinks;
        const directorProfile = snapshot.director;
        setProgram(programRow);
        setDetails(snapshot.details);
        setCanEdit(true);
        setIsAdminEditor(snapshot.isAdminEditor);
        setBillingPolicyLocked(snapshot.billingPolicyLocked);
        const directorProfileId = programRow.director_profile_id ?? programRow.teacher_profile_id;
        setSelectedDirectorId(directorProfileId ?? "");
        loadedDirectorRef.current = directorProfileId ?? "";
        const rows = parseProgramSchedule(programRow.schedule);
        const firstRow = rows[0];
        const parsedAge = parseAgeRangeForEdit(programRow.age_range_text);
        const nextLearningVisible = Boolean(detailResult.data || (outcomeResult.data ?? []).length);
        const nextLearningTitle = detailResult.data?.learning_title?.trim() || "What You Will Learn";
        const nextLearningIntro = detailResult.data?.learning_intro ?? "";
        setLearningDescriptionVisible(Boolean(nextLearningIntro.trim()));
        setTopicsIntro(detailResult.data?.topics_intro ?? "");
        setRequirementsText(detailResult.data?.requirements_text ?? "");
        setPoliciesText(detailResult.data?.policies_text ?? "");
        const nextInstructorDisplayName = detailResult.data?.instructor_display_name ?? directorProfile?.full_name ?? "";
        const nextInstructorCredentials = detailResult.data?.instructor_credentials ?? "";
        const nextInstructorContactPhone = detailResult.data?.instructor_contact_phone ?? directorProfile?.phone_number ?? directorProfile?.teacher_whatsapp_number ?? "";
        setNoRegistrationDeadline(!programRow.registration_deadline_at);
        setRoomVisible(Boolean(programRow.room_area));
        setSummaryVisible(Boolean(programRow.summary?.trim()));
        setDescriptionVisible(Boolean(programRow.description?.trim()));
        setEventTimeVisible(programRow.program_type === "event" && Boolean((sessionResult.data ?? [])[0]));
        setEventDate((sessionResult.data ?? [])[0]?.session_date ?? programRow.start_date ?? "");
        setBuilderStatus({
          internalName: programRow.internal_name ?? "",
          summary: programRow.summary ?? "",
          category: programRow.category ?? "",
          programType: programRow.program_type === "event" ? "event" : "recurring",
          publicationStatus: ["draft", "published", "hidden", "archived"].includes(programRow.publication_status) ? programRow.publication_status as ProgramBuilderStatus["publicationStatus"] : "published",
          applicationStatus: ["accepting", "not_accepting", "opens_later", "waitlist_only", "closed", "invite_only"].includes(programRow.application_status) ? programRow.application_status as ProgramBuilderStatus["applicationStatus"] : "accepting",
          lifecycleStatus: ["upcoming", "active", "paused", "completed", "cancelled", "archived"].includes(programRow.lifecycle_status) ? programRow.lifecycle_status as ProgramBuilderStatus["lifecycleStatus"] : "upcoming",
          applicationMode: ["application_required", "open_enrollment", "invite_only", "hidden_private"].includes(programRow.application_mode) ? programRow.application_mode as ProgramBuilderStatus["applicationMode"] : "application_required",
          acceptingApplications: programRow.accepting_applications !== false,
          waitlistEnabled: programRow.waitlist_enabled !== false,
          capacityBehavior: ["manual_review", "close_when_full", "allow_waitlist"].includes(programRow.capacity_behavior) ? programRow.capacity_behavior as ProgramBuilderStatus["capacityBehavior"] : "manual_review",
          defaultCapacity: programRow.default_capacity ? String(programRow.default_capacity) : "",
          durationType: ["ongoing", "fixed_months"].includes(programRow.duration_type) ? programRow.duration_type as ProgramBuilderStatus["durationType"] : "ongoing",
          startNow: programRow.start_now ?? false,
          startDate: programRow.start_date ?? "",
          endDate: programRow.end_date ?? "",
          durationMonths: programRow.duration_months ? String(programRow.duration_months) : "10",
          schedulePattern: ["weekly", "custom_dates"].includes(programRow.schedule_pattern) ? programRow.schedule_pattern as ProgramBuilderStatus["schedulePattern"] : "weekly",
          registrationDeadline: programRow.registration_deadline_at ? programRow.registration_deadline_at.slice(0, 16) : "",
          applicationOpenAt: programRow.application_open_at ? programRow.application_open_at.slice(0, 16) : "",
          applicationCloseAt: programRow.application_close_at ? programRow.application_close_at.slice(0, 16) : "",
          location: programRow.location ?? "",
          room: programRow.room ?? "",
          roomArea: programRow.room_area ?? "",
          paymentKind: ["free", "tareeqah"].includes(programRow.payment_kind) ? programRow.payment_kind as ProgramBuilderStatus["paymentKind"] : (programRow.is_paid ? "tareeqah" : "free"),
          billingStartBehavior: ["on_payment", "program_start"].includes(programRow.billing_start_behavior) ? programRow.billing_start_behavior as ProgramBuilderStatus["billingStartBehavior"] : "on_payment",
          monthlyBillingAnchor: programRow.monthly_billing_anchor === "first_of_month" ? "first_of_month" : "signup_date",
          billingEndBehavior: ["manual_cancel", "program_end", "fixed_months"].includes(programRow.billing_end_behavior) ? programRow.billing_end_behavior as ProgramBuilderStatus["billingEndBehavior"] : "fixed_months",
          billingDurationMonths: programRow.billing_duration_months ? String(programRow.billing_duration_months) : "",
          allowCustomPrices: programRow.allow_custom_prices !== false,
          allowWaivedPayments: programRow.allow_waived_payments !== false,
          manualPaymentNote: programRow.manual_payment_note ?? "",
          financialAssistanceNote: programRow.financial_assistance_note ?? defaultBuilderStatus().financialAssistanceNote,
          receiptNote: programRow.receipt_note ?? defaultBuilderStatus().receiptNote,
          taxReceiptPolicy: ["not_applicable", "admin_review_required", "eligible_confirmed"].includes(programRow.tax_receipt_policy) ? programRow.tax_receipt_policy as ProgramBuilderStatus["taxReceiptPolicy"] : "not_applicable",
          trackSwitchPolicy: ["disabled", "request_only", "allowed"].includes(programRow.track_switch_policy) ? programRow.track_switch_policy as ProgramBuilderStatus["trackSwitchPolicy"] : "disabled",
          trackSwitchAllowAll: Boolean(programRow.track_switch_allow_all),
          contactEmail: programRow.contact_email ?? directorProfile?.email ?? "",
          contactPhone: programRow.contact_phone ?? "",
          coverPriceLabelEnabled: programRow.cover_price_label_enabled !== false,
          coverPriceLabel: programRow.cover_price_label ?? "",
        });
        const nextOutcomeRows = (outcomeResult.data ?? []).map((row) => ({ id: row.id, text: row.text }));
        const nextFaqRows = (faqResult.data ?? []).map((row) => ({ id: row.id, question: row.question, answer: row.answer }));
        const nextContentSectionRows = (contentSectionResult.data ?? []).map((row) => ({ id: row.id, title: row.title, description: row.description ?? "", durationText: row.duration_text ?? "" }));
        const nextMediaRows = (mediaResult.data ?? []).map((row) => ({ id: row.id, url: row.url, title: row.title ?? "", mediaType: row.media_type }));
        const storedSessions: ProgramScheduleRow[] = (sessionResult.data ?? []).map(scheduleRowFromProgramSession);
        const defaultSession: ProgramScheduleRow = firstRow ?? { day: "Monday", start: "18:00", end: "20:00" };
        loadedTrackIdsRef.current = new Set((trackResult.data ?? []).map((track) => track.id));
        const storedPrimaryTrack = (trackResult.data ?? [])[0];
        const nextTrackRows: ProgramEditorTrackRow[] =
          programRow.program_type === "event"
            ? [{ id: storedPrimaryTrack?.id ?? "event", name: storedPrimaryTrack?.name ?? "Event", sessions: [storedSessions[0] ?? defaultSession], capacity: storedPrimaryTrack?.capacity ? String(storedPrimaryTrack.capacity) : "" }]
            : programRow.schedule_pattern === "custom_dates"
              ? [{ id: storedPrimaryTrack?.id ?? "sessions", name: storedPrimaryTrack?.name ?? "Sessions", sessions: storedSessions.length ? storedSessions : [{ ...defaultSession, date: "" }], capacity: storedPrimaryTrack?.capacity ? String(storedPrimaryTrack.capacity) : "" }]
              : (trackResult.data ?? []).length
            ? linkedEditorTrackRows(trackResult.data ?? [], sessionResult.data ?? [], trackSessionLinks ?? [], defaultSession)
            : [
                {
                  id: "default",
                  name: "Main Track",
                  sessions: [defaultSession],
                },
              ];
        setTitle(programRow.title);
        setDescription(programRow.description ?? "");
        setThumbnailUrl(programRow.thumbnail_url ?? "");
        setAllAges(parsedAge.allAges);
        setAgeStart(parsedAge.start);
        setAgeEnd(parsedAge.end);
        setAudienceGender(normalizeAudienceGender(programRow.audience_gender));
        setIsPaid(Boolean(programRow.is_paid));
        setOffersMonthlyPayment(programRow.offers_monthly_payment !== false);
        setOffersAnnualPayment(Boolean(programRow.offers_annual_payment));
        setPrice(programRow.price_monthly_cents ? String(programRow.price_monthly_cents / 100) : "");
        setAnnualPrice(programRow.price_annual_cents ? String(programRow.price_annual_cents / 100) : "");
        setLearningVisible(nextLearningVisible);
        setLearningTitle(nextLearningTitle);
        setLearningIntro(nextLearningIntro);
        setInstructorDisplayName(nextInstructorDisplayName);
        setInstructorCredentials(nextInstructorCredentials);
        setInstructorContactPhone(nextInstructorContactPhone);
        setCoverDirectorVisibility(detailResult.data?.cover_director_visibility ?? "name_and_photo");
        setTrackSelectionMode("exact");
        setTrackSelectionCount(1);
        setOutcomeRows(nextOutcomeRows);
        setFaqRows(nextFaqRows);
        setFaqVisible(nextFaqRows.length > 0);
        setContentSectionRows(nextContentSectionRows);
        setContentSectionsVisible(nextContentSectionRows.length > 0);
        setMediaRows(nextMediaRows);
        setMediaVisible(nextMediaRows.length > 0);
        setTrackRows(nextTrackRows);
        setTransferRules((transferRuleResult.data ?? []).map((row) => ({ id: row.id, fromTrackId: row.from_track_id, toTrackId: row.to_track_id })));
      } catch (loadError) {
        if (!cancelled) setError(friendlyErrorMessage(loadError, "Could not load this class."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [programId, slug]);

  useEffect(() => {
    if (!isAdminEditor || !selectedDirectorId || loading || loadedDirectorRef.current === selectedDirectorId) {
      return;
    }
    const director = directorOptions.find((teacher) => teacher.id === selectedDirectorId);
    if (!director) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstructorDisplayName(director.full_name ?? "");
    setInstructorCredentials(director.teacher_credentials ?? "");
    setInstructorContactPhone(director.phone_number ?? director.teacher_whatsapp_number ?? "");
    setBuilderStatus((current) => ({ ...current, contactEmail: director.email ?? "" }));
    loadedDirectorRef.current = selectedDirectorId;
  }, [directorOptions, isAdminEditor, loading, selectedDirectorId]);

  // Billing-cycle count is purely derived from the date range for a fixed-duration program —
  // not directly editable, so it always tracks the current start/end dates.
  useEffect(() => {
    if (builderStatus.durationType !== "fixed_months") {
      return;
    }
    const estimate = estimateBillingMonths(builderStatus.startDate, builderStatus.endDate);
    if (estimate == null) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuilderStatus((current) => (current.billingDurationMonths === String(estimate) ? current : { ...current, billingDurationMonths: String(estimate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderStatus.durationType, builderStatus.startDate, builderStatus.endDate]);

  const billingMonthsFieldVisible =
    builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" && offersMonthlyPayment && builderStatus.durationType === "fixed_months" && builderStatus.billingEndBehavior === "fixed_months";

  function handleThumbnailFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setThumbnailUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function addLearningSection() {
    setLearningVisible(true);
    setLearningTitle("What You Will Learn");
    setLearningIntro("Describe what students will gain from this program.");
    setOutcomeRows([{ id: crypto.randomUUID(), text: "learning outcome #1" }]);
  }

  function addTrack() {
    setTrackRows((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "New Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] },
    ]);
  }

  function addMedia() {
    setMediaRows((current) => [...current, { id: crypto.randomUUID(), url: "", title: "", mediaType: "photo" }]);
  }

  async function uploadProgramMedia(rowId: string, file: File | null) {
    if (!program || !file) {
      return;
    }
    const validationError = validateProgramMediaFile(file);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const previous = mediaRows.find((row) => row.id === rowId);
    const previewUrl = URL.createObjectURL(file);
    setMediaRows((current) => current.map((row) => row.id === rowId ? { ...row, mediaType: programMediaType(file) ?? "photo", previewUrl, progress: 0, uploadError: undefined } : row));
    setBusy(true);
    setMessage(null);
    try {
      const result = await uploadProgramMediaFile(program.id, file, (progress) => {
        setMediaRows((current) => current.map((row) => row.id === rowId ? { ...row, progress } : row));
      });
      setMediaRows((current) => current.map((row) => row.id === rowId ? { ...row, url: result.url, mediaType: result.mediaType, previewUrl: undefined, progress: undefined } : row));
      setToast({ tone: "success", message: "Media uploaded. Save the class to publish it." });
    } catch {
      setMediaRows((current) => current.map((row) => row.id === rowId ? { ...(previous ?? row), progress: undefined, uploadError: "Upload didn’t finish. Check your connection and select the file again." } : row));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setBusy(false);
    }
  }

  async function saveProgram(statusOverride?: Partial<ProgramBuilderStatus>, confirmFutureApplicantsOnly = false) {
    if (!program) {
      return;
    }

    const effectiveBuilderStatus = { ...builderStatus, ...statusOverride };
    const savedOffersMonthlyPayment = effectiveBuilderStatus.programType === "event" ? false : offersMonthlyPayment;
    const savedOffersAnnualPayment = effectiveBuilderStatus.programType === "event" ? true : offersAnnualPayment;
    const usesPerTrackPricing =
      effectiveBuilderStatus.paymentKind === "tareeqah" &&
      effectiveBuilderStatus.programType === "recurring" &&
      trackRows.some((track) => track.pricingOverrideEnabled);
    const savedTrackSelectionMode: TrackSelectionMode = "exact";
    const savedTrackSelectionCount = 1;

    setMessage(null);
    setToast(null);
    if (!title.trim()) {
      setToast({ tone: "error", message: "Add a public title before saving." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && !title.trim()) {
      setToast({ tone: "error", message: "Public title is required before publishing." });
      setBuilderStep("basics");
      return;
    }

    if (learningVisible && !learningTitle.trim()) {
      setToast({ tone: "error", message: "Learning section title cannot be blank." });
      return;
    }

    if (learningVisible && outcomeRows.some((row) => !row.text.trim())) {
      setToast({ tone: "error", message: "Checklist points cannot be blank." });
      return;
    }

    if (faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
      setToast({ tone: "error", message: "FAQ questions and answers cannot be blank." });
      return;
    }

    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "event" && !eventDate) {
      setToast({ tone: "error", message: "Choose an event date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.schedulePattern === "custom_dates" && effectiveBuilderStatus.programType !== "event" && trackRows.every((track) => track.sessions.every((session) => !session.date))) {
      setToast({ tone: "error", message: "Add at least one session date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && trackRows.some((track) => !track.name.trim() || track.sessions.length === 0 || track.sessions.some((session) => session.end <= session.start))) {
      setToast({ tone: "error", message: "Each track needs a name and an end time after the start time." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft") {
      const statusValidation = validateProgramStatusCombination({
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.applicationStatus,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationOpenAt: effectiveBuilderStatus.applicationOpenAt || null,
        applicationCloseAt: effectiveBuilderStatus.applicationCloseAt || null,
        startDate: effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.endDate || null,
        isOngoing: effectiveBuilderStatus.durationType === "ongoing",
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
      });
      if (!statusValidation.valid) {
        setToast({ tone: "error", message: statusValidation.errors[0].message });
        setBuilderStep(statusValidation.errors[0].field === "endDate" ? "schedule" : "pricing");
        return;
      }
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !savedOffersMonthlyPayment && !savedOffersAnnualPayment) {
      setToast({ tone: "error", message: "Choose at least one payment option before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment && Number(price || "0") <= 0) {
      setToast({ tone: "error", message: "Add a valid monthly price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment && Number(annualPrice || "0") <= 0) {
      setToast({ tone: "error", message: effectiveBuilderStatus.durationType === "ongoing" ? "Add a valid annual subscription price before publishing." : "Add a valid Pay in Full price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (
      effectiveBuilderStatus.publicationStatus !== "draft" &&
      usesPerTrackPricing &&
      trackRows.some((track) =>
        (savedOffersMonthlyPayment && Number(track.priceMonthly || "0") <= 0) ||
        (savedOffersAnnualPayment && Number(track.priceAnnual || "0") <= 0)
      )
    ) {
      setToast({ tone: "error", message: "Add valid prices for every track before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (isAdminEditor && !selectedDirectorId) {
      setToast({ tone: "error", message: "Choose a director for this class." });
      return;
    }
    setBusy(true);
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      setToast({ tone: "error", message: "Log in required." });
      setBusy(false);
      return;
    }

    const nextAgeRangeText = allAges ? null : formatAgeRangeForSave(ageStart, ageEnd);
    const schedule = trackRows[0] ? (trackRows[0].sessions as unknown as Json) : null;
    const response = await fetch(`/api/programs/${program.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        internalName: null,
        title: title.trim(),
        summary: effectiveBuilderStatus.summary.trim() || null,
        description: description.trim() || null,
        category: effectiveBuilderStatus.category.trim() || null,
        programType: effectiveBuilderStatus.programType,
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
        applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
        applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationMode: effectiveBuilderStatus.applicationMode,
        acceptingApplications: effectiveBuilderStatus.acceptingApplications,
        waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
        capacityBehavior: effectiveBuilderStatus.capacityBehavior,
        defaultCapacity: null,
        durationType: effectiveBuilderStatus.programType === "event" ? "ongoing" : effectiveBuilderStatus.durationType,
        startNow: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.startNow,
        startDate: effectiveBuilderStatus.programType === "event" ? eventDate || null : effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
        durationMonths: effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
        schedulePattern: effectiveBuilderStatus.programType === "event" ? "custom_dates" : effectiveBuilderStatus.schedulePattern,
        registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
        location: effectiveBuilderStatus.location.trim() || null,
        room: effectiveBuilderStatus.room.trim() || null,
        roomArea: effectiveBuilderStatus.roomArea.trim() || null,
        paymentKind: effectiveBuilderStatus.paymentKind,
        billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
        monthlyBillingAnchor: effectiveBuilderStatus.monthlyBillingAnchor,
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
        billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : null,
        allowCustomPrices: true,
        allowWaivedPayments: true,
        manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
        financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
        receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
        taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
        trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
        trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
        contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
        contactPhone: effectiveBuilderStatus.contactPhone.trim() || null,
        coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
        coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
        thumbnailUrl: thumbnailUrl.trim() || null,
        audienceGender: audienceGender || null,
        ageRangeText: nextAgeRangeText,
        isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
        offersMonthlyPayment: savedOffersMonthlyPayment,
        offersAnnualPayment: savedOffersAnnualPayment,
        usesPerTrackPricing,
        priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
        priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
        schedule,
        scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scheduleNotes: null,
        trackSelectionMode: savedTrackSelectionMode,
        trackSelectionCount: savedTrackSelectionCount,
        directorProfileId: isAdminEditor ? selectedDirectorId : null,
        confirmFutureApplicantsOnly,
      }),
    });

    const result = (await response.json()) as { program?: Program; error?: string; requiresFutureApplicantConfirmation?: boolean };
    if (!response.ok && result.requiresFutureApplicantConfirmation) {
      setBusy(false);
      setPendingFutureApplicantsConfirm({ statusOverride });
      return;
    }
    if (!response.ok || !result.program) {
      setToast({ tone: "error", message: result.error ?? "Could not save class." });
      setBusy(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const detailsPayload = {
      program_id: program.id,
      learning_title: learningVisible ? learningTitle.trim() : "What You Will Learn",
      learning_intro: learningVisible ? learningIntro.trim() || null : null,
      topics_intro: topicsIntro.trim() || null,
      requirements_text: requirementsText.trim() || null,
      policies_text: policiesText.trim() || null,
      instructor_display_name: instructorDisplayName.trim() || null,
      instructor_credentials: instructorCredentials.trim() || null,
      instructor_contact_phone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
      cover_director_visibility: coverDirectorVisibility,
      updated_at: new Date().toISOString(),
    };
    const { error: detailsError } = await supabase.from("program_details").upsert(detailsPayload, { onConflict: "program_id" });
    if (detailsError) {
      setToast({ tone: "error", message: friendlyErrorMessage(detailsError, "Could not save class details.") });
      setBusy(false);
      return;
    }

    await supabase.from("program_outcomes").delete().eq("program_id", program.id);
    if (learningVisible && outcomeRows.length) {
      const { error: outcomesError } = await supabase.from("program_outcomes").insert(
        outcomeRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          text: row.text.trim(),
        })),
      );
      if (outcomesError) {
        setToast({ tone: "error", message: friendlyErrorMessage(outcomesError, "Could not save learning outcomes.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_faqs").delete().eq("program_id", program.id);
    if (faqRows.length) {
      const { error: faqsError } = await supabase.from("program_faqs").insert(
        faqRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          question: row.question.trim(),
          answer: row.answer.trim(),
        })),
      );
      if (faqsError) {
        setToast({ tone: "error", message: friendlyErrorMessage(faqsError, "Could not save FAQs.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_content_sections").delete().eq("program_id", program.id);
    if (contentSectionRows.length) {
      const { error: contentSectionsError } = await supabase.from("program_content_sections").insert(
        contentSectionRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          title: row.title.trim(),
          description: row.description.trim() || null,
          duration_text: row.durationText.trim() || null,
        })),
      );
      if (contentSectionsError) {
        setToast({ tone: "error", message: friendlyErrorMessage(contentSectionsError, "Could not save class schedule.") });
        setBusy(false);
        return;
      }
    }

    await supabase.from("program_media").delete().eq("program_id", program.id);
    const filledMediaRows = mediaRows.filter((row) => row.url.trim());
    if (filledMediaRows.length) {
      const { error: mediaError } = await supabase.from("program_media").insert(
        filledMediaRows.map((row, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          media_type: row.mediaType === "video" ? "video" : "photo",
          url: row.url.trim(),
          thumbnail_url: row.url.trim(),
          title: row.title.trim() || null,
          short_label: row.title.trim() || null,
        })),
      );
      if (mediaError) {
        setToast({ tone: "error", message: friendlyErrorMessage(mediaError, "Could not save class photos.") });
        setBusy(false);
        return;
      }
    }

    if (trackRows.length) {
      try {
        const insertedTracks = await synchronizeExistingProgramTracks(supabase, program.id, trackRows, loadedTrackIdsRef.current, {
          location: effectiveBuilderStatus.location.trim() || null,
          room: effectiveBuilderStatus.room.trim() || null,
        });
        await saveCanonicalProgramSessions(supabase, program.id, insertedTracks ?? [], trackRows, {
          programType: effectiveBuilderStatus.programType,
          schedulePattern: effectiveBuilderStatus.schedulePattern,
          eventDate,
          title: title.trim(),
          location: effectiveBuilderStatus.location.trim() || null,
          room: effectiveBuilderStatus.room.trim() || null,
        });
        await saveTrackTransferRules(supabase, program.id, insertedTracks ?? [], trackRows, transferRules);
      } catch (sessionError) {
        setToast({ tone: "error", message: sessionError instanceof Error ? sessionError.message : "Could not save sessions." });
        setBusy(false);
        return;
      }
    }

    setProgram(result.program);
    setDetails(detailsPayload as ProgramDetails);
    invalidateProgramCaches(slug, program.id);
    window.dispatchEvent(new Event("tareeqah:programs-changed"));
    queueEditorToast({ tone: "success", message: "Changes saved successfully." });
    window.location.href = returnHref ?? `/m/${slug}/teacher/classes`;
  }

  if (loading) {
    return <ClassesLoadingPlaceholders count={1} />;
  }

  if (error) {
    return <EmptyState title="Could not load class settings" text={error} onRetry={() => window.location.reload()} />;
  }

  if (!program) {
    return <EmptyState title="Class not found" text="This class may no longer be available." />;
  }

  if (!canEdit) {
    return <EmptyState title="Director access required" text="Only the class director can edit this class." />;
  }

  const startDateLocked = programAlreadyStarted(program);

  function goToPreviousStep() {
    if (builderStep === "basics") { wizardExit.requestExit(); return; }
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.max(0, index - 1)]?.id ?? "basics");
    scrollBuilderToTop();
  }

  function getMissingBuilderFields() {
    return computeProgramBuilderMissingFields({
      title,
      programType: builderStatus.programType,
      location: builderStatus.location,
      room: builderStatus.room,
      allAges,
      ageStart,
      ageEnd,
      learningVisible,
      learningTitle,
      outcomeRows,
      faqVisible,
      faqRows,
      contentSectionsVisible,
      contentSectionRows,
      contactPhone: instructorContactPhone,
      contactPhoneOmitted,
      contactEmail: builderStatus.contactEmail,
      contactEmailOmitted,
      durationType: builderStatus.durationType,
      endDate: builderStatus.endDate,
      startNow: builderStatus.startNow,
      startDate: builderStatus.startDate,
      eventDate,
      schedulePattern: builderStatus.schedulePattern,
      noRegistrationDeadline,
      registrationDeadline: builderStatus.registrationDeadline,
      trackRows,
      paymentKind: builderStatus.paymentKind,
      offersMonthlyPayment,
      price,
      offersAnnualPayment,
      annualPrice,
      coverPriceLabelEnabled: builderStatus.coverPriceLabelEnabled,
      coverPriceLabel: builderStatus.coverPriceLabel,
    });
  }

  function advanceStepAnyway() {
    setMissingFieldsModal(null);
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
    scrollBuilderToTop();
  }

  function publishNow() {
    const publishOverride = { publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published" } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveProgram(publishOverride);
  }

  function confirmStartDateChangeAndPublish() {
    setStartDateChangeConfirmOpen(false);
    const publishOverride = {
      publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published",
      lifecycleStatus: "paused",
    } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveProgram(publishOverride);
  }

  function handleContinueOrPublishClick() {
    const missing = getMissingBuilderFields();
    if (builderStep !== "review") {
      const missingOnThisStep = missing.filter((field) => field.step === builderStep);
      if (missingOnThisStep.length) {
        setMissingFieldsModal({ fields: missingOnThisStep, allowContinue: true });
        return;
      }
      const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
      setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
      scrollBuilderToTop();
      return;
    }
    if (missing.length) {
      setMissingFieldsModal({ fields: missing, allowContinue: false });
      return;
    }
    const startDateChanged = startDateLocked && builderStatus.startDate.trim() && builderStatus.startDate !== (program?.start_date ?? "");
    if (startDateChanged) {
      setStartDateChangeConfirmOpen(true);
      return;
    }
    publishNow();
  }

  const editWizardContent = (
    <>
      <ProgramBuilderStepper activeStep={builderStep} />
      <h1 className="px-1 text-2xl font-semibold text-[#26323A]">{programBuilderSteps.find((step) => step.id === builderStep)?.label}</h1>

      {builderStep === "schedule" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <ProgramTimingFields
            builderStatus={builderStatus}
            setBuilderStatus={setBuilderStatus}
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventTimeVisible={eventTimeVisible}
            setEventTimeVisible={setEventTimeVisible}
            noRegistrationDeadline={noRegistrationDeadline}
            setNoRegistrationDeadline={setNoRegistrationDeadline}
            startDateLocked={startDateLocked}
          />
        </section>
      ) : null}

      {builderStep === "pricing" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("How payments are handled", true)}</span>
              <select value={builderStatus.paymentKind} onChange={(event) => { const value = event.target.value as ProgramBuilderStatus["paymentKind"]; setBuilderStatus((current) => ({ ...current, paymentKind: value })); setIsPaid(value === "tareeqah"); }} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="free">Free</option>
                <option value="tareeqah">Paid through Madrasa</option>
              </select>
            </label>
            {billingMonthsFieldVisible ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Billing months</span>
                <BillingMonthsHint
                  startDate={builderStatus.startDate}
                  endDate={builderStatus.endDate}
                  chosenMonths={builderStatus.billingDurationMonths}
                />
              </label>
            ) : builderStatus.paymentKind === "tareeqah" && builderStatus.durationType === "ongoing" && builderStatus.programType !== "event" && (offersMonthlyPayment || offersAnnualPayment) ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Number of billing months</span>
                <input value="Ongoing — billed until cancelled" disabled className="h-10 w-full rounded-[8px] border border-[#D6DCE0] bg-[#F1F4F5] px-3 text-sm font-medium text-[#8A949B] outline-none" />
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" && offersMonthlyPayment && builderStatus.programType !== "event" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Monthly billing date</span>
                <select disabled={billingPolicyLocked} value={builderStatus.monthlyBillingAnchor} onChange={(event) => setBuilderStatus((current) => ({ ...current, monthlyBillingAnchor: event.target.value as ProgramBuilderStatus["monthlyBillingAnchor"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] disabled:cursor-not-allowed disabled:bg-[#F1F4F5] disabled:text-[#6B747B]">
                  <option value="signup_date">Each family’s signup date</option>
                  <option value="first_of_month">First of every month</option>
                </select>
                <p className="mt-1 text-xs text-[#6B747B]">{billingPolicyLocked ? "Locked because recurring billing has begun. This protects existing families from an accidental billing-date change." : "Choose the program policy before recurring billing begins. First-of-month billing prorates the initial payment."}</p>
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Tax receipt policy</span>
                <select
                  value={builderStatus.taxReceiptPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, taxReceiptPolicy: event.target.value as ProgramBuilderStatus["taxReceiptPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="not_applicable">Not a tax-deductible donation</option>
                  <option value="admin_review_required">May be eligible - admin reviews each payment</option>
                  <option value="eligible_confirmed">Eligible as a charitable donation (confirmed)</option>
                </select>
              </label>
            ) : null}
            <ProgramApplicationAvailabilityFields builderStatus={builderStatus} setBuilderStatus={setBuilderStatus} />
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <div className="space-y-5 bg-[var(--workspace)] p-4 pb-40" onPointerDownCapture={wizardExit.capture} onKeyDownCapture={wizardExit.capture} onChangeCapture={wizardExit.capture}>
      {wizardExit.dialog}
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {missingFieldsModal ? (
        <MissingFieldsModal
          missingFields={missingFieldsModal.fields}
          allowContinue={missingFieldsModal.allowContinue}
          onContinueAnyway={advanceStepAnyway}
          onClose={() => setMissingFieldsModal(null)}
        />
      ) : null}
      {startDateChangeConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
              <div ref={startDateChangeModalRef} role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-md rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_70px_rgba(38,50,58,0.22)] outline-none">
                <h2 className="text-lg font-semibold">Change start date?</h2>
                <p className="mt-2 text-sm leading-6 text-[#6B747B]">
                  This class has already started. Changing the start date will pause the class until then, and it won&apos;t be treated as an active class in the meantime.
                </p>
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setStartDateChangeConfirmOpen(false)} className="min-h-10 px-3 text-sm font-semibold text-[#6B747B]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmStartDateChangeAndPublish}
                    className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-xs font-semibold text-white"
                  >
                    Pause and update start date
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {pendingFutureApplicantsConfirm ? (
        <ConfirmModal
          title="Apply to future applicants only?"
          text="Existing students will keep their current approved payment terms. These changes apply only to future applicants. To change a current student's billing, use Manage Finances."
          confirmLabel="Apply Changes"
          onConfirm={async () => {
            const statusOverride = pendingFutureApplicantsConfirm.statusOverride;
            setPendingFutureApplicantsConfirm(null);
            await saveProgram(statusOverride, true);
          }}
          onCancel={() => setPendingFutureApplicantsConfirm(null)}
        />
      ) : null}
      {editWizardContent}

      {builderStep === "basics" ? (
        <section className="overflow-hidden rounded-2xl border border-[#E1E8EC] bg-white">
          <div className="relative">
            <ProgramHero program={{ ...program, title, thumbnail_url: thumbnailUrl || null }} />
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (file) {
                  const validationError = validateProgramMediaFile(file);
                  if (validationError || programMediaType(file) !== "photo") { setToast({ tone: "error", message: validationError || "Choose a photo for the class cover." }); return; }
                  setThumbnailCropFile(file);
                }
              }}
            />
            <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#26323A] shadow-lg" aria-label="Replace thumbnail">
              <PhotoIcon />
            </button>
          </div>
          {thumbnailCropFile ? (
            <ImageCropModal
              file={thumbnailCropFile}
              title="Crop thumbnail"
              aspectRatio={4 / 3}
              outputWidth={1200}
              outputHeight={900}
              onCancel={() => setThumbnailCropFile(null)}
              onConfirm={(croppedFile) => {
                handleThumbnailFile(croppedFile);
                setThumbnailCropFile(null);
              }}
            />
          ) : null}
          <div className="space-y-3 p-4">
            <EditBox label="Public name" required value={title} onChange={setTitle} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Class type", true)}</span>
              <select value={builderStatus.programType} onChange={(event) => setBuilderStatus((current) => ({ ...current, programType: event.target.value as ProgramBuilderStatus["programType"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="recurring">Recurring program</option>
                <option value="event">One-time event</option>
              </select>
            </label>
            {summaryVisible || builderStatus.summary.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Short summary / tagline" value={builderStatus.summary} onChange={(value) => setBuilderStatus((current) => ({ ...current, summary: value }))} />
                <button type="button" onClick={() => { setSummaryVisible(false); setBuilderStatus((current) => ({ ...current, summary: "" })); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove summary
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSummaryVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add short summary / tagline
              </button>
            )}
            {descriptionVisible || description.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Description" value={description} onChange={setDescription} multiline />
                <button type="button" onClick={() => { setDescriptionVisible(false); setDescription(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove description
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDescriptionVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add description
              </button>
            )}
            <div className="grid gap-3">
              <EditBox label="Location name" required value={builderStatus.location} onChange={(value) => setBuilderStatus((current) => ({ ...current, location: value }))} />
              <EditBox label="Location address" required value={builderStatus.room} onChange={(value) => setBuilderStatus((current) => ({ ...current, room: value }))} />
              {roomVisible || builderStatus.roomArea.trim() ? (
                <div className="space-y-1.5">
                  <EditBox label="Room / Area" value={builderStatus.roomArea} onChange={(value) => setBuilderStatus((current) => ({ ...current, roomArea: value }))} />
                  <button
                    type="button"
                    onClick={() => {
                      setRoomVisible(false);
                      setBuilderStatus((current) => ({ ...current, roomArea: "" }));
                    }}
                    className="justify-self-start text-sm font-semibold text-[#C0392B]"
                  >
                    Remove Room / Area
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setRoomVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add Room / Area
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {builderStep === "basics" && isAdminEditor ? (
        <section className="space-y-2 bg-white px-4 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B747B]" htmlFor="edit-program-director">
            Class Director
          </label>
          <select id="edit-program-director" value={selectedDirectorId} onChange={(event) => setSelectedDirectorId(event.target.value)} className="h-12 w-full rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="">Choose director</option>
            {directorOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name || teacher.email || "Unnamed teacher"}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      <ProgramEditorFields
        masjidLabel={slug.charAt(0).toUpperCase() + slug.slice(1)}
        builderStatus={builderStatus}
        setBuilderStatus={setBuilderStatus}
        isEditMode
        activeStep={builderStep}
        programType={builderStatus.programType}
        schedulePattern={builderStatus.schedulePattern}
        previewProgram={buildProgramPreview({
          id: program.id,
          title: title || program.title,
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: builderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
          base: program,
        })}
        eventDate={eventDate}
        setEventDate={setEventDate}
        eventTimeVisible={eventTimeVisible}
        setEventTimeVisible={setEventTimeVisible}
        learningVisible={learningVisible}
        setLearningVisible={setLearningVisible}
        learningTitle={learningTitle}
        setLearningTitle={setLearningTitle}
        learningIntro={learningIntro}
        setLearningIntro={setLearningIntro}
        learningDescriptionVisible={learningDescriptionVisible}
        setLearningDescriptionVisible={setLearningDescriptionVisible}
        topicsIntro={topicsIntro}
        setTopicsIntro={setTopicsIntro}
        requirementsText={requirementsText}
        setRequirementsText={setRequirementsText}
        policiesText={policiesText}
        setPoliciesText={setPoliciesText}
        outcomeRows={outcomeRows}
        setOutcomeRows={setOutcomeRows}
        faqVisible={faqVisible}
        setFaqVisible={setFaqVisible}
        faqRows={faqRows}
        setFaqRows={setFaqRows}
        contentSectionsVisible={contentSectionsVisible}
        setContentSectionsVisible={setContentSectionsVisible}
        contentSectionRows={contentSectionRows}
        setContentSectionRows={setContentSectionRows}
        mediaVisible={mediaVisible}
        setMediaVisible={setMediaVisible}
        mediaRows={mediaRows}
        setMediaRows={setMediaRows}
        onMediaFile={uploadProgramMedia}
        addMedia={addMedia}
        trackRows={trackRows}
        setTrackRows={setTrackRows}
        addTrack={addTrack}
        transferRules={transferRules}
        setTransferRules={setTransferRules}
        trackSelectionMode={trackSelectionMode}
        setTrackSelectionMode={setTrackSelectionMode}
        trackSelectionCount={trackSelectionCount}
        setTrackSelectionCount={setTrackSelectionCount}
        allAges={allAges}
        setAllAges={setAllAges}
        ageStart={ageStart}
        setAgeStart={setAgeStart}
        ageEnd={ageEnd}
        setAgeEnd={setAgeEnd}
        audienceGender={audienceGender}
        setAudienceGender={setAudienceGender}
        paymentKind={builderStatus.paymentKind}
        durationMonthsForPricing={pricingDurationMonths}
        isPaid={builderStatus.paymentKind === "tareeqah"}
        setIsPaid={setIsPaid}
        offersMonthlyPayment={offersMonthlyPayment}
        setOffersMonthlyPayment={setOffersMonthlyPayment}
        offersAnnualPayment={offersAnnualPayment}
        setOffersAnnualPayment={setOffersAnnualPayment}
        price={price}
        setPrice={setPrice}
        annualPrice={annualPrice}
        setAnnualPrice={setAnnualPrice}
        instructorDisplayName={instructorDisplayName}
        setInstructorDisplayName={setInstructorDisplayName}
        instructorCredentials={instructorCredentials}
        setInstructorCredentials={setInstructorCredentials}
        instructorContactPhone={instructorContactPhone}
        setInstructorContactPhone={setInstructorContactPhone}
        coverDirectorVisibility={coverDirectorVisibility}
        setCoverDirectorVisibility={setCoverDirectorVisibility}
        contactEmail={builderStatus.contactEmail}
        setContactEmail={(value) => setBuilderStatus((current) => ({ ...current, contactEmail: value }))}
        contactPhoneOmitted={contactPhoneOmitted}
        setContactPhoneOmitted={setContactPhoneOmitted}
        contactEmailOmitted={contactEmailOmitted}
        setContactEmailOmitted={setContactEmailOmitted}
        coverPriceLabelEnabled={builderStatus.coverPriceLabelEnabled}
        setCoverPriceLabelEnabled={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabelEnabled: value }))}
        coverPriceLabel={builderStatus.coverPriceLabel}
        setCoverPriceLabel={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabel: value }))}
      />

      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} sticky message={message} />
    </div>
  );
}

function ProgramBuilderActionBar({
  busy,
  builderStep,
  onBack,
  onContinueOrPublish,
  sticky = false,
  message,
}: {
  busy: boolean;
  builderStep: ProgramBuilderStep;
  onBack: () => void;
  onContinueOrPublish: () => void;
  sticky?: boolean;
  message?: string | null;
}) {
  return (
    <div className={cn("z-10 space-y-2 bg-white py-2 md:max-w-[420px]", sticky ? "sticky bottom-[92px] md:bottom-4" : "")}>
      {message ? <p className="text-sm font-medium text-[#52616A]">{message}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={onBack} className="min-h-11 shrink-0 rounded-md border border-[#C9D3D8] bg-white px-6 text-sm font-semibold text-[#17624F] transition active:scale-95 active:bg-[#F2F4F5] disabled:opacity-40">
          Back
        </button>
        <button type="button" disabled={busy} onClick={onContinueOrPublish} className="min-h-11 shrink-0 rounded-md bg-[#17624F] px-6 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Saving..." : builderStep === "review" ? "Publish" : "Continue"}
        </button>
      </div>
    </div>
  );
}

type ProgramBuilderStep = "basics" | "public" | "schedule" | "pricing" | "review";

function buildProgramPreview({
  id,
  title,
  description,
  thumbnailUrl,
  audienceGender,
  ageRangeText,
  isPaid,
  offersMonthlyPayment,
  offersAnnualPayment,
  priceMonthlyCents,
  priceAnnualCents,
  schedule,
  trackSelectionMode,
  trackSelectionCount,
  base,
}: {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  audienceGender: string;
  ageRangeText: string | null;
  isPaid: boolean;
  offersMonthlyPayment?: boolean;
  offersAnnualPayment?: boolean;
  priceMonthlyCents: number | null;
  priceAnnualCents?: number | null;
  schedule: Json | null;
  trackSelectionMode: TrackSelectionMode;
  trackSelectionCount: number;
  base?: Program;
}): Program {
  return {
    id,
    mosque_id: base?.mosque_id ?? "",
    teacher_profile_id: base?.teacher_profile_id ?? null,
    director_profile_id: base?.director_profile_id ?? null,
    ...defaultProgramBuilderColumns(),
    internal_name: base?.internal_name ?? null,
    summary: base?.summary ?? null,
    category: base?.category ?? null,
    program_type: base?.program_type ?? "recurring",
    publication_status: base?.publication_status ?? "draft",
    application_status: base?.application_status ?? "not_accepting",
    lifecycle_status: base?.lifecycle_status ?? "upcoming",
    application_mode: base?.application_mode ?? "application_required",
    accepting_applications: base?.accepting_applications ?? false,
    title,
    description: description.trim() || null,
    is_active: true,
    is_paid: isPaid,
    offers_monthly_payment: isPaid ? offersMonthlyPayment !== false : false,
    offers_annual_payment: isPaid ? Boolean(offersAnnualPayment) : false,
    thumbnail_url: thumbnailUrl.trim() || null,
    price_monthly_cents: isPaid ? priceMonthlyCents : null,
    price_annual_cents: isPaid ? priceAnnualCents ?? null : null,
    stripe_product_id: base?.stripe_product_id ?? null,
    stripe_price_id: base?.stripe_price_id ?? null,
    stripe_annual_price_id: base?.stripe_annual_price_id ?? null,
    audience_gender: audienceGender || null,
    age_range_text: ageRangeText,
    schedule,
    schedule_timezone: base?.schedule_timezone ?? null,
    schedule_notes: null,
    track_selection_mode: trackSelectionMode,
    track_selection_count: Math.max(1, trackSelectionCount),
    tags: base?.tags ?? null,
    created_at: base?.created_at ?? "",
    updated_at: base?.updated_at ?? "",
  };
}

function defaultProgramBuilderColumns(): Pick<Program,
  | "internal_name"
  | "summary"
  | "category"
  | "program_type"
  | "publication_status"
  | "application_status"
  | "lifecycle_status"
  | "application_mode"
  | "accepting_applications"
  | "application_open_at"
  | "application_close_at"
  | "waitlist_enabled"
  | "capacity_behavior"
  | "default_capacity"
  | "duration_type"
  | "start_now"
  | "start_date"
  | "end_date"
  | "duration_months"
  | "is_ongoing"
  | "schedule_pattern"
  | "registration_deadline_at"
  | "location"
  | "room"
  | "room_area"
  | "payment_kind"
  | "billing_start_behavior"
  | "monthly_billing_anchor"
  | "billing_end_behavior"
  | "billing_duration_months"
  | "allow_custom_prices"
  | "allow_waived_payments"
  | "manual_payment_note"
  | "financial_assistance_note"
  | "receipt_note"
  | "tax_receipt_policy"
  | "track_switch_policy"
  | "track_switch_allow_all"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "cover_price_label_enabled"
  | "cover_price_label"
> {
  const defaults = defaultBuilderStatus();
  return {
    internal_name: null,
    summary: null,
    category: null,
    program_type: defaults.programType,
    publication_status: defaults.publicationStatus,
    application_status: defaults.applicationStatus,
    lifecycle_status: defaults.lifecycleStatus,
    application_mode: defaults.applicationMode,
    accepting_applications: defaults.acceptingApplications,
    application_open_at: null,
    application_close_at: null,
    waitlist_enabled: defaults.waitlistEnabled,
    capacity_behavior: defaults.capacityBehavior,
    default_capacity: null,
    duration_type: defaults.durationType,
    start_now: defaults.startNow,
    start_date: null,
    end_date: null,
    duration_months: Number(defaults.durationMonths),
    is_ongoing: defaults.durationType === "ongoing",
    schedule_pattern: defaults.schedulePattern,
    registration_deadline_at: null,
    location: null,
    room: null,
    room_area: null,
    payment_kind: defaults.paymentKind,
    billing_start_behavior: defaults.billingStartBehavior,
    monthly_billing_anchor: defaults.monthlyBillingAnchor,
    billing_end_behavior: defaults.billingEndBehavior,
    billing_duration_months: Number(defaults.billingDurationMonths || "10"),
    allow_custom_prices: true,
    allow_waived_payments: true,
    manual_payment_note: null,
    financial_assistance_note: defaults.financialAssistanceNote,
    receipt_note: defaults.receiptNote,
    tax_receipt_policy: defaults.taxReceiptPolicy,
    track_switch_policy: defaults.trackSwitchPolicy,
    track_switch_allow_all: defaults.trackSwitchAllowAll,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    cover_price_label_enabled: defaults.coverPriceLabelEnabled,
    cover_price_label: null,
  };
}

function defaultBuilderStatus(): ProgramBuilderStatus {
  return {
    internalName: "",
    summary: "",
    category: "",
    programType: "recurring",
    publicationStatus: "draft",
    applicationStatus: "accepting",
    lifecycleStatus: "upcoming",
    applicationMode: "application_required",
    acceptingApplications: true,
    applicationOpenAt: "",
    applicationCloseAt: "",
    waitlistEnabled: true,
    capacityBehavior: "manual_review",
    defaultCapacity: "",
    durationType: "ongoing",
    startNow: false,
    startDate: "",
    endDate: "",
    durationMonths: "10",
    schedulePattern: "weekly",
    registrationDeadline: "",
    location: "",
    room: "",
    roomArea: "",
    paymentKind: "free",
    billingStartBehavior: "on_payment",
    monthlyBillingAnchor: "signup_date",
    billingEndBehavior: "fixed_months",
    billingDurationMonths: "",
    allowCustomPrices: true,
    allowWaivedPayments: true,
    manualPaymentNote: "",
    financialAssistanceNote: "Financial assistance or custom payment arrangements may be available. Please apply and contact the class Director for details.",
    receiptNote: "Receipt eligibility may depend on class type and masjid policy. Please contact administration for details.",
    taxReceiptPolicy: "not_applicable",
    trackSwitchPolicy: "disabled",
    trackSwitchAllowAll: false,
    contactEmail: "",
    contactPhone: "",
    coverPriceLabelEnabled: true,
    coverPriceLabel: "",
  };
}

type TrackSelectionMode = "exact" | "minimum" | "maximum";

function ProgramEditorFields({
  masjidLabel = "Masjid",
  activeStep,
  programType = "recurring",
  schedulePattern = "weekly",
  previewProgram,
  eventDate = "",
  setEventDate,
  eventTimeVisible = false,
  setEventTimeVisible,
  learningVisible,
  setLearningVisible,
  learningTitle,
  setLearningTitle,
  learningIntro,
  setLearningIntro,
  learningDescriptionVisible = true,
  setLearningDescriptionVisible,
  topicsIntro = "",
  setTopicsIntro,
  requirementsText = "",
  setRequirementsText,
  policiesText = "",
  setPoliciesText,
  outcomeRows,
  setOutcomeRows,
  faqVisible,
  setFaqVisible,
  faqRows,
  setFaqRows,
  contentSectionsVisible,
  setContentSectionsVisible,
  contentSectionRows,
  setContentSectionRows,
  mediaVisible,
  setMediaVisible,
  mediaRows,
  setMediaRows,
  onMediaFile,
  addMedia,
  trackRows,
  setTrackRows,
  addTrack,
  transferRules = [],
  setTransferRules,
  trackSelectionMode,
  setTrackSelectionMode,
  trackSelectionCount,
  setTrackSelectionCount,
  allAges,
  setAllAges,
  ageStart,
  setAgeStart,
  ageEnd,
  setAgeEnd,
  audienceGender,
  setAudienceGender,
  paymentKind = "free",
  durationMonthsForPricing = "10",
  isPaid,
  setIsPaid: _setIsPaid,
  offersMonthlyPayment,
  setOffersMonthlyPayment,
  offersAnnualPayment,
  setOffersAnnualPayment,
  price,
  setPrice,
  annualPrice,
  setAnnualPrice,
  instructorDisplayName,
  setInstructorDisplayName,
  instructorCredentials,
  setInstructorCredentials,
  instructorContactPhone,
  setInstructorContactPhone,
  coverDirectorVisibility = "name_and_photo",
  setCoverDirectorVisibility,
  contactEmail = "",
  setContactEmail,
  contactPhoneOmitted = false,
  setContactPhoneOmitted,
  contactEmailOmitted = false,
  setContactEmailOmitted,
  coverPriceLabelEnabled = true,
  setCoverPriceLabelEnabled,
  coverPriceLabel = "",
  setCoverPriceLabel,
  builderStatus,
  setBuilderStatus,
  isEditMode = false,
}: ProgramEditorFieldsProps) {
  const showAll = !activeStep;
  const showBasics = showAll || activeStep === "basics";
  const showPublic = showAll || activeStep === "public";
  const showSchedule = showAll || activeStep === "schedule";
  const showPricing = showAll || activeStep === "pricing";
  const showReview = activeStep === "review";
  const canUsePerTrackPricing = paymentKind === "tareeqah" && programType === "recurring" && schedulePattern === "weekly" && trackRows.length > 0;
  const perTrackPricingEnabled = canUsePerTrackPricing && trackRows.some((track) => track.pricingOverrideEnabled);
  const weeklySessionLibrary = useMemo(() => uniqueScheduleRows(trackRows.flatMap((track) => track.sessions)), [trackRows]);
  const isOngoingDuration = builderStatus?.durationType === "ongoing";

  function setPerTrackPricingEnabled(enabled: boolean) {
    setTrackRows((current) =>
      current.map((track) => ({
        ...track,
        pricingOverrideEnabled: enabled,
      })),
    );
  }

  function addSharedWeeklySession() {
    const nextSession: ProgramScheduleRow = { day: "Monday", start: "18:00", end: "20:00" };
    setTrackRows((current) => current.map((track) => ({ ...track, sessions: uniqueScheduleRows([...track.sessions, nextSession]) })));
  }

  function updateSharedWeeklySession(previous: ProgramScheduleRow, next: ProgramScheduleRow) {
    const previousKey = scheduleRowKey(previous);
    setTrackRows((current) =>
      current.map((track) => ({
        ...track,
        sessions: uniqueScheduleRows(track.sessions.map((session) => scheduleRowKey(session) === previousKey ? next : session)),
      })),
    );
  }

  function removeSharedWeeklySession(session: ProgramScheduleRow) {
    const key = scheduleRowKey(session);
    setTrackRows((current) =>
      current.map((track) => {
        const remaining = track.sessions.filter((row) => scheduleRowKey(row) !== key);
        return { ...track, sessions: remaining.length ? remaining : track.sessions };
      }),
    );
  }

  function toggleTrackWeeklySession(trackId: string, session: ProgramScheduleRow, selected: boolean) {
    const key = scheduleRowKey(session);
    setTrackRows((current) =>
      current.map((track) => {
        if (track.id !== trackId) {
          return track;
        }
        const hasSession = track.sessions.some((row) => scheduleRowKey(row) === key);
        if (selected && !hasSession) {
          return { ...track, sessions: uniqueScheduleRows([...track.sessions, session]) };
        }
        if (!selected && hasSession && track.sessions.length > 1) {
          return { ...track, sessions: track.sessions.filter((row) => scheduleRowKey(row) !== key) };
        }
        return track;
      }),
    );
  }

  function addLearningSection() {
    setLearningVisible(true);
    setLearningTitle("What You Will Learn");
    setLearningIntro("");
    setLearningDescriptionVisible?.(false);
    setOutcomeRows([
      { id: crypto.randomUUID(), text: "Learning outcome #1" },
      { id: crypto.randomUUID(), text: "Learning outcome #2" },
      { id: crypto.randomUUID(), text: "Learning outcome #3" },
    ]);
  }

  const [topicsVisible, setTopicsVisible] = useState(false);
  const [requirementsVisible, setRequirementsVisible] = useState(false);
  const [policiesVisible, setPoliciesVisible] = useState(false);
  const [credentialsVisible, setCredentialsVisible] = useState(false);
  const showTopicsField = topicsVisible || Boolean(topicsIntro.trim());
  const showRequirementsField = requirementsVisible || Boolean(requirementsText.trim());
  const showPoliciesField = policiesVisible || Boolean(policiesText.trim());
  const showCredentialsField = credentialsVisible || Boolean(instructorCredentials.trim());

  function removeLearningSection() {
    setLearningVisible(false);
    setOutcomeRows([]);
    setLearningTitle("");
    setLearningIntro("");
    setLearningDescriptionVisible?.(false);
  }

  function removeTopicsSection() {
    setTopicsVisible(false);
    setTopicsIntro?.("");
  }

  function removeRequirementsSection() {
    setRequirementsVisible(false);
    setRequirementsText?.("");
  }

  function removePoliciesSection() {
    setPoliciesVisible(false);
    setPoliciesText?.("");
  }

  function removeFaqSection() {
    setFaqVisible(false);
    setFaqRows([]);
  }

  function removeContentSection() {
    setContentSectionsVisible(false);
    setContentSectionRows([]);
  }

  function removeMediaSection() {
    setMediaVisible(false);
    setMediaRows([]);
  }

  if (showReview) {
    const program = previewProgram;
    const previewTracks = trackRows.map((track, index): ProgramTrack => ({
      id: track.id,
      program_id: program?.id ?? "preview",
      name: track.name.trim() || `Track ${index + 1}`,
      description: null,
      schedule: track.sessions as unknown as Json,
      ...defaultProgramTrackBuilderColumns(),
      location: track.location?.trim() || null,
      room: track.room?.trim() || null,
      capacity: track.capacity ? Number(track.capacity) : null,
      pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
      price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
      price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
      ...trackEligibilityOverrideColumns(track),
      sort_order: index + 1,
      is_active: true,
      created_at: "",
      updated_at: "",
    }));
    const visibleMediaRows = mediaRows.filter((row) => row.previewUrl || row.url);
    const statusFields: ProgramStatusFields | null = builderStatus
      ? {
          publicationStatus: builderStatus.publicationStatus,
          applicationStatus: builderStatus.applicationStatus,
          lifecycleStatus: deriveLifecycleStatus({
            lifecycleStatus: builderStatus.lifecycleStatus,
            startNow: builderStatus.startNow,
            startDate: builderStatus.startDate || null,
            endDate: builderStatus.endDate || null,
            isOngoing: builderStatus.durationType === "ongoing",
          }),
          applicationOpenAt: builderStatus.applicationOpenAt || null,
          applicationCloseAt: builderStatus.applicationCloseAt || null,
          startDate: builderStatus.startDate || null,
          endDate: builderStatus.endDate || null,
          isOngoing: builderStatus.durationType === "ongoing",
          billingEndBehavior: builderStatus.billingEndBehavior,
        }
      : null;
    return (
      <div className="space-y-5">
        {statusFields && builderStatus && setBuilderStatus ? (
          <section className="divide-y divide-[#E1E8EC] rounded-2xl border border-[#E1E8EC] bg-white p-4 md:p-6">
            <div className="pb-5 first:pt-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Where should this program appear?</h2>
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-3 rounded-[10px] border border-[#E1E8EC] p-3 text-sm font-semibold text-[#26323A]">
                  <input
                    type="radio"
                    name="program-visibility"
                    className="mt-1"
                    checked={builderStatus.publicationStatus !== "hidden"}
                    onChange={() => setBuilderStatus((current) => ({ ...current, publicationStatus: current.publicationStatus === "draft" ? "draft" : "published" }))}
                  />
                  <span>
                    Show on {masjidLabel} Program page
                    <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Appears on the public masjid classes page.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-[10px] border border-[#E1E8EC] p-3 text-sm font-semibold text-[#26323A]">
                  <input
                    type="radio"
                    name="program-visibility"
                    className="mt-1"
                    checked={builderStatus.publicationStatus === "hidden"}
                    onChange={() => setBuilderStatus((current) => ({ ...current, publicationStatus: "hidden" }))}
                  />
                  <span>
                    Hide from list, private entry only
                    <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Reachable by a direct or private link only.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className={cn("py-5", !isEditMode && "last:pb-0")}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Status summary</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {getProgramStatusBadges(statusFields).map((badge) => (
                  <span key={badge.label} className={cn("rounded-full px-3 py-1 text-xs font-semibold", programStatusBadgeToneClass(badge.tone))}>
                    {badge.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-[#52616A]">{getApplicationButtonState(statusFields).label}</p>
            </div>

            {isEditMode ? (
              <div className="pt-5 last:pb-0">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Program status</span>
                  <select
                    value={statusFields.lifecycleStatus}
                    onChange={(event) => setBuilderStatus((current) => ({ ...current, lifecycleStatus: event.target.value as ProgramLifecycleStatus }))}
                    className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <span className="mt-1 block text-xs leading-5 text-[#6B747B]">
                    Upcoming, Active, and Completed are set automatically from the start and end dates. Choose Paused, Cancelled, or Archived to override manually.
                  </span>
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

      <div className="mx-auto max-w-[520px] space-y-5">
        {program ? (
          <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
            <ProgramHero program={program} />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#17624F]">
                <span>{formatAgeRange(program.age_range_text)}</span>
                <span aria-hidden>•</span>
                <span>{formatGender(program.audience_gender)}</span>
              </div>
              <div>
                <h1 className="text-2xl font-semibold leading-8 text-[#26323A]">{program.title}</h1>
                {program.description?.trim() ? <p className="mt-2 text-sm leading-7 text-[#52616A]">{program.description.trim()}</p> : null}
              </div>
            </div>
          </section>
        ) : null}

        <aside className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
          <ProgramScheduleOptionsDisplay tracks={previewTracks} program={program} fallbackSchedule={previewTracks[0] ? scheduleSummary(previewTracks[0].schedule, null).full : "Schedule TBA"} />
          {program ? <ProgramPaymentOptionsDisplay program={program} tracks={previewTracks} /> : null}
          <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold text-white opacity-70 md:w-auto md:px-10">
            Request Enrollment
          </button>
        </aside>

        {(learningIntro.trim() || outcomeRows.length) && learningTitle.trim() ? (
          <DetailSection title={learningTitle.trim()}>
            {learningIntro.trim() ? <p className="text-sm leading-7 text-[#52616A]">{learningIntro}</p> : null}
            {outcomeRows.length ? (
              <div className={cn("grid gap-3 sm:grid-cols-2", learningIntro.trim() ? "mt-5" : "")}>
                {outcomeRows.map((row) => (
                  <div key={row.id} className="flex gap-3 text-sm text-[#26323A]">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E3F5EE] text-xs font-semibold text-[#228763]">✓</span>
                    <span>{row.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        {contentSectionRows.some((row) => row.title.trim()) ? (
          <DetailSection title="Class Schedule">
            <div className="divide-y divide-[#E6ECEF]">
              {contentSectionRows.filter((row) => row.title.trim()).map((row, index) => (
                <div key={row.id} className="flex min-h-14 items-center gap-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0F8FB] text-xs font-medium text-[#2F8FB3]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#26323A]">{row.title}</p>
                    {row.description.trim() ? <p className="text-xs text-[#6B747B]">{row.description}</p> : null}
                  </div>
                  {row.durationText.trim() ? <span className="rounded-full bg-[#EAF7F1] px-2 py-1 text-xs text-[#228763]">{row.durationText}</span> : null}
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {[{ title: "Topics Covered", body: topicsIntro }, { title: "Requirements", body: requirementsText }, { title: "Policies", body: policiesText }].some((row) => row.body.trim()) ? (
          <DetailSection title="Class Details">
            <div className="divide-y divide-[#E6ECEF]">
              {[{ title: "Topics Covered", body: topicsIntro }, { title: "Requirements", body: requirementsText }, { title: "Policies", body: policiesText }]
                .filter((row) => row.body.trim())
                .map((row) => (
                  <div key={row.title} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-semibold text-[#26323A]">{row.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-[#52616A]">{row.body}</p>
                  </div>
                ))}
            </div>
          </DetailSection>
        ) : null}

        {visibleMediaRows.length ? (
          <DetailSection title="Class Media">
            <div className="space-y-3">
              {visibleMediaRows.map((row) => (
                <div key={row.id} className="overflow-hidden rounded-[16px] border border-[#E6ECEF]">
                  <div className="relative h-40 bg-[#E7EEF2]">
                    <Image src={row.previewUrl || row.url} alt="" fill className="object-cover" sizes="360px" />
                  </div>
                  {row.title.trim() ? <p className="p-3 text-sm font-semibold text-[#26323A]">{row.title}</p> : null}
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {faqRows.length ? (
          <ProgramFaqSection
            faqs={faqRows.map((row, index) => ({
              id: row.id || `preview-faq-${index}`,
              question: row.question.trim() || `Question ${index + 1}`,
              answer: row.answer.trim() || "Add an answer for this FAQ.",
            }))}
          />
        ) : null}
      </div>
      </div>
    );
  }

  void _setIsPaid;

  return (
    <div className="space-y-4">
        {showPublic ? (learningVisible ? (
          <EditorFieldSection title="Learning Outcomes" action={<RemoveSectionButton onClick={removeLearningSection} />}>
            <div className="space-y-4">
              <EditBox label="Section title" required value={learningTitle} onChange={setLearningTitle} />
              {learningDescriptionVisible || learningIntro.trim() ? (
                <EditBox label="Section description" value={learningIntro} onChange={setLearningIntro} multiline />
              ) : (
                <button type="button" onClick={() => setLearningDescriptionVisible?.(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add section description
                </button>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#26323A]">Outcome points</p>
                  <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={() => setOutcomeRows((current) => [...current, { id: crypto.randomUUID(), text: `Learning outcome #${current.length + 1}` }])} aria-label="Add outcome point">
                    +
                  </RowIconButton>
                </div>
                {outcomeRows.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-2 border-t border-[#E6ECEF] py-2 first:border-t-0 first:pt-0">
                    <span className="mt-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#26323A] text-[10px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                    <textarea
                      value={row.text}
                      onChange={(event) => setOutcomeRows((current) => current.map((item) => item.id === row.id ? { ...item, text: event.target.value } : item))}
                      className="min-h-14 min-w-0 resize-y rounded-[8px] border border-[#D6E1E6] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
                      aria-label={`Checklist point ${index + 1}`}
                    />
                    <RowIconButton tone="danger" className="mt-1" onClick={() => setOutcomeRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Delete checklist point">
                      <TrashIcon />
                    </RowIconButton>
                  </div>
                ))}
              </div>
            </div>
          </EditorFieldSection>
        ) : (
          <button type="button" onClick={addLearningSection} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
            Add checklist section
          </button>
        )) : null}

        {showPublic && setTopicsIntro ? (
          showTopicsField ? (
            <EditorFieldSection title="Topics Covered" action={<RemoveSectionButton onClick={removeTopicsSection} />}>
              <EditBox label="Topics covered" value={topicsIntro} onChange={setTopicsIntro} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setTopicsVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Topics Covered section
            </button>
          )
        ) : null}

        {showPublic ? (contentSectionsVisible ? (
          <EditorFieldSection
            title="Class Schedule"
            action={
              <div className="flex items-center gap-3">
                <RemoveSectionButton onClick={removeContentSection} />
                <RowIconButton
                  tone="accent"
                  className="border border-[#A8D4E2] text-lg"
                  onClick={() => setContentSectionRows((current) => [...current, { id: crypto.randomUUID(), title: "", description: "", durationText: "" }])}
                  aria-label="Add schedule item"
                >
                  +
                </RowIconButton>
              </div>
            }
          >
            <div className="divide-y divide-[#E6ECEF]">
              {contentSectionRows.map((row, index) => (
                <div key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Item {index + 1}</p>
                    <RowIconButton
                      tone="danger"
                      onClick={() => {
                        const next = contentSectionRows.filter((item) => item.id !== row.id);
                        setContentSectionRows(next);
                        if (next.length === 0) {
                          setContentSectionsVisible(false);
                        }
                      }}
                      aria-label="Remove schedule item"
                    >
                      <TrashIcon />
                    </RowIconButton>
                  </div>
                  <input
                    value={row.title}
                    onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))}
                    placeholder="Title"
                    className="h-11 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm font-semibold outline-none focus:border-[#2F8FB3]"
                  />
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <input
                      value={row.description}
                      onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, description: event.target.value } : item))}
                      placeholder="Description (optional)"
                      className="h-10 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
                    />
                    <input
                      value={row.durationText}
                      onChange={(event) => setContentSectionRows((current) => current.map((item) => item.id === row.id ? { ...item, durationText: event.target.value } : item))}
                      placeholder="Duration (optional)"
                      className="h-10 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </EditorFieldSection>
        ) : (
          <button
            type="button"
            onClick={() => {
              setContentSectionsVisible(true);
              setContentSectionRows([{ id: crypto.randomUUID(), title: "", description: "", durationText: "" }]);
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add Class Schedule section
          </button>
        )) : null}

        {showPublic && setRequirementsText ? (
          showRequirementsField ? (
            <EditorFieldSection title="Prerequisites" action={<RemoveSectionButton onClick={removeRequirementsSection} />}>
              <EditBox label="Prerequisites" value={requirementsText} onChange={setRequirementsText} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setRequirementsVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Prerequisites section
            </button>
          )
        ) : null}

        {showPublic && setPoliciesText ? (
          showPoliciesField ? (
            <EditorFieldSection title="Policies" action={<RemoveSectionButton onClick={removePoliciesSection} />}>
              <EditBox label="Policies" value={policiesText} onChange={setPoliciesText} multiline />
            </EditorFieldSection>
          ) : (
            <button type="button" onClick={() => setPoliciesVisible(true)} className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]">
              Add Policies section
            </button>
          )
        ) : null}

        {showPublic ? (faqVisible ? (
          <ProgramFaqEditor faqRows={faqRows} onChange={setFaqRows} onRemoveSection={removeFaqSection} />
        ) : (
          <button
            type="button"
            onClick={() => {
              setFaqVisible(true);
              setFaqRows([{ id: crypto.randomUUID(), question: "", answer: "" }]);
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add FAQ section
          </button>
        )) : null}

        {showPublic ? (mediaVisible ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-base font-semibold text-[#26323A]">Class Media</h2>
                <p className="mt-0.5 text-xs text-[#6B747B]">Images up to 10 MB · videos up to 50 MB</p>
              </div>
              <RemoveSectionButton onClick={removeMediaSection} />
            </div>
            <div className="rounded-[14px] border border-[#D6DCE0] bg-white p-3">
            <div className="divide-y divide-[#E6ECEF]">
              {mediaRows.map((row) => {
                const previewUrl = row.previewUrl || row.url;
                return (
                  <div key={row.id} className="grid gap-2 py-3 first:pt-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                      {previewUrl ? (
                        <div className="relative h-28 overflow-hidden rounded-[8px] bg-[#E7EEF2]">
                          {row.mediaType === "video" ? <video src={previewUrl} className="h-full w-full object-cover" controls preload="metadata" /> : <Image src={previewUrl} alt="" fill className="object-cover" sizes="280px" />}
                        </div>
                      ) : <div className="flex h-28 items-center justify-center rounded-[8px] bg-[#F2F6F7] text-[#7B858C]"><PhotoIcon /></div>}
                      <div className="flex flex-col gap-2">
                        <ProgramMediaPicker disabled={row.progress !== undefined} onConfirm={(file) => onMediaFile(row.id, file)} />
                        <RowIconButton onClick={() => setMediaRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove media item"><TrashIcon /></RowIconButton>
                      </div>
                    </div>
                    {row.progress !== undefined ? <p role="status" className="text-xs text-[#52616A]">Uploading… {row.progress}%</p> : null}
                    {row.uploadError ? <p role="alert" className="text-xs text-[#B4352B]">{row.uploadError}</p> : null}
                    <input value={row.title} onChange={(event) => setMediaRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))} placeholder="Optional title" className="h-10 rounded-[8px] border border-[#B9C3C8] px-3 text-sm" />
                  </div>
                );
              })}
              <button type="button" onClick={addMedia} className="min-h-10 rounded-[8px] border border-[#D6DCE0] px-4 text-sm font-semibold text-[#26323A]">
                Add media
              </button>
            </div>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMediaVisible(true);
              addMedia();
            }}
            className="min-h-20 w-full rounded-[10px] border border-dashed border-[#9EB4BD] bg-white text-sm font-semibold text-[#2F6077]"
          >
            Add media section
          </button>
        )) : null}

        {showSchedule && programType === "event" && eventTimeVisible ? (
          <EditorFieldSection title="Event Time">
            <div className="flex flex-wrap items-end gap-2">
              <span className="text-sm font-semibold text-[#52616A]">One-time event</span>
              <select
                value={trackRows[0]?.sessions[0]?.start ?? "18:00"}
                onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [{ ...(track.sessions[0] ?? { day: "Monday", end: "20:00" }), start: event.target.value }] } : track))}
                className="h-10 min-w-[104px] flex-1 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
              >
                {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
              </select>
              <span className="text-xs font-semibold text-[#6B747B]">to</span>
              <select
                value={trackRows[0]?.sessions[0]?.end ?? "20:00"}
                onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [{ ...(track.sessions[0] ?? { day: "Monday", start: "18:00" }), end: event.target.value }] } : track))}
                className="h-10 min-w-[104px] flex-1 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
              >
                {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
              </select>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "custom_dates" ? (
          <EditorFieldSection title="Sessions">
            <div className="divide-y divide-[#E6ECEF]">
              {(trackRows[0]?.sessions ?? []).map((session, sessionIndex) => (
                <div key={`session-${sessionIndex}`} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_minmax(0,1fr)_32px] items-center gap-2 py-2 first:pt-0">
                  <input
                    type="date"
                    value={session.date ?? ""}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, date: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  />
                  <select
                    value={session.start}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, start: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  >
                    {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                  </select>
                  <span className="text-xs font-semibold text-[#6B747B]">to</span>
                  <select
                    value={session.end}
                    onChange={(event) => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.map((row, index) => index === sessionIndex ? { ...row, end: event.target.value } : row) } : track))}
                    className="h-10 min-w-0 rounded-[8px] border border-[#B9C3C8] px-2 text-sm"
                  >
                    {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                  </select>
                  {trackRows[0]?.sessions.length > 1 ? (
                    <RowIconButton tone="danger" onClick={() => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: track.sessions.filter((_row, index) => index !== sessionIndex) } : track))} aria-label="Remove session">
                      <TrashIcon />
                    </RowIconButton>
                  ) : <span aria-hidden />}
                </div>
              ))}
              <button type="button" onClick={() => setTrackRows((current) => current.map((track, trackIndex) => trackIndex === 0 ? { ...track, sessions: [...track.sessions, { day: "Monday", date: "", start: "18:00", end: "20:00" }] } : track))} className="mt-3 min-h-9 rounded-[8px] border border-[#D6DCE0] px-3 text-sm font-semibold text-[#26323A]">
                Add session
              </button>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "weekly" ? (
          <EditorFieldSection
            title="Weekly Sessions"
            action={
              <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={addSharedWeeklySession} aria-label="Add weekly session">
                +
              </RowIconButton>
            }
          >
            <p className="-mt-1 mb-3 text-xs leading-5 text-[#6B747B]">Add all meeting times, then build tracks from them </p>
            <div className="overflow-hidden rounded-xl border border-[#E1E8EC] bg-[#FAFCFC]">
              <div className="grid grid-cols-[28px_1fr_auto] gap-2 border-b border-[#E1E8EC] bg-[#F3F7F8] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#7B858C]">
                <span />
                <span>Day &amp; Time</span>
                <span />
              </div>
              <div className="divide-y divide-[#E6ECEF]">
                {weeklySessionLibrary.map((session, sessionIndex) => (
                  <div key={scheduleRowKey(session)} className="space-y-2 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#17624F] text-[10px] font-bold tabular-nums text-white">
                        {String(sessionIndex + 1).padStart(2, "0")}
                      </span>
                      <select
                        value={session.day}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, day: event.target.value as (typeof scheduleDayOptions)[number] })}
                        className="h-10 flex-1 rounded-lg border border-[#CBE3EA] bg-white px-2 text-xs font-bold uppercase tracking-wide text-[#17624F] outline-none focus:border-[#2F8FB3] sm:max-w-[160px]"
                      >
                        {scheduleDayOptions.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                      {weeklySessionLibrary.length > 1 ? (
                        <RowIconButton tone="danger" onClick={() => removeSharedWeeklySession(session)} aria-label="Remove weekly session">
                          <TrashIcon />
                        </RowIconButton>
                      ) : <span className="h-8 w-8 shrink-0" aria-hidden />}
                    </div>
                    <div className="flex items-center gap-2 pl-9">
                      <select
                        value={session.start}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, start: event.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#B9C3C8] bg-white px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#2F8FB3]"
                      >
                        {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                      </select>
                      <span className="shrink-0 text-xs font-semibold text-[#6B747B]">to</span>
                      <select
                        value={session.end}
                        onChange={(event) => updateSharedWeeklySession(session, { ...session, end: event.target.value })}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#B9C3C8] bg-white px-2 text-sm font-semibold tabular-nums outline-none focus:border-[#2F8FB3]"
                      >
                        {scheduleTimeOptions.map((time) => <option key={time} value={time}>{formatClockLabel(time)}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && programType === "recurring" && schedulePattern === "weekly" ? (
          <EditorFieldSection
            title="Tracks"
            action={
              <RowIconButton tone="accent" className="border border-[#A8D4E2] text-lg" onClick={addTrack} aria-label="Add track">
                +
              </RowIconButton>
            }
          >
            <div className="space-y-3">
              {trackRows.map((track, trackIndex) => (
                <div key={track.id} className="rounded-xl border border-[#DCE7EB] bg-[#FAFCFC] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#26323A] text-[10px] font-bold tabular-nums text-white">
                      {String(trackIndex + 1).padStart(2, "0")}
                    </span>
                    {trackRows.length > 1 ? (
                      <RowIconButton tone="danger" onClick={() => setTrackRows((current) => current.filter((item) => item.id !== track.id))} aria-label="Remove track">
                        <TrashIcon />
                      </RowIconButton>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <EditBox label="Track name" required value={track.name} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, name: value } : item))} />
                    <div className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Capacity</span>
                      {track.capacity ? <div className="flex items-center gap-2">
                        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-[#B9C3C8] bg-white">
                          <button
                            type="button"
                            onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: String(Math.max(0, (Number(item.capacity) || 0) - 1)) } : item))}
                            className="flex h-full w-9 shrink-0 items-center justify-center text-base font-semibold text-[#26323A] hover:bg-[#F1F4F5]"
                            aria-label="Decrease capacity"
                          >
                            −
                          </button>
                          <input
                            value={track.capacity ?? ""}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: event.target.value.replace(/\D/g, "") } : item))}
                            className="h-full w-14 shrink-0 border-x border-[#EEF1F2] bg-transparent text-center text-sm font-semibold tabular-nums text-[#26323A] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: String((Number(item.capacity) || 0) + 1) } : item))}
                            className="flex h-full w-9 shrink-0 items-center justify-center text-base font-semibold text-[#26323A] hover:bg-[#F1F4F5]"
                            aria-label="Increase capacity"
                          >
                            +
                          </button>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#52616A]">students</span>
                        <button type="button" onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: "" } : item))} className="text-xs font-semibold text-[#C0392B]">Disable</button>
                      </div> : (
                        <button type="button" onClick={() => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, capacity: "20" } : item))} className="flex h-10 items-center rounded-lg border border-dashed border-[#9EB4BD] bg-white px-3 text-sm font-semibold text-[#2F6F83]">
                          Add capacity limit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Sessions in this track</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklySessionLibrary.map((session, sessionIndex) => {
                        const checked = track.sessions.some((row) => scheduleRowKey(row) === scheduleRowKey(session));
                        return (
                          <button
                            key={`${track.id}-${scheduleRowKey(session)}`}
                            type="button"
                            onClick={() => toggleTrackWeeklySession(track.id, session, !checked)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors",
                              checked ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#D6E1E6] bg-white text-[#52616A] hover:border-[#9EB4BD]",
                            )}
                          >
                            {String(sessionIndex + 1).padStart(2, "0")} · {formatDayAbbreviation(session.day)} {formatScheduleRange(session.start, session.end)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[#E6ECEF] pt-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                      <input
                        type="checkbox"
                        checked={Boolean(track.eligibilityOverrideEnabled)}
                        onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, eligibilityOverrideEnabled: event.target.checked } : item))}
                      />
                      Override eligibility for this track
                    </label>
                    {track.eligibilityOverrideEnabled ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <EditBox label="From age" value={track.ageMin ?? ""} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, ageMin: value } : item))} />
                          <EditBox label="To age" value={track.ageMax ?? ""} onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, ageMax: value } : item))} />
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Gender</span>
                          <select
                            value={track.genderOverride ?? "all"}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, genderOverride: event.target.value } : item))}
                            className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]"
                          >
                            <option value="all">All</option>
                            <option value="brothers">Brothers only</option>
                            <option value="sisters">Sisters only</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Comment (shown on public page, not validated)</span>
                          <textarea
                            value={track.eligibilityComment ?? ""}
                            onChange={(event) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, eligibilityComment: event.target.value } : item))}
                            rows={2}
                            className="w-full resize-none rounded-[10px] border border-[#B9C3C8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </EditorFieldSection>
        ) : null}

        {showSchedule && trackRows.length > 1 && builderStatus && setBuilderStatus && setTransferRules ? (
          <EditorFieldSection title="Track Switching">
            <div className="space-y-3">
              <p className="text-xs leading-5 text-[#7B858C]">Choose whether enrolled students can switch between schedule options after joining, and configure exactly which switches are allowed.</p>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Track switching</span>
                <select
                  value={builderStatus.trackSwitchPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, trackSwitchPolicy: event.target.value as ProgramBuilderStatus["trackSwitchPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="disabled">Disabled</option>
                  <option value="request_only">Allowed by request</option>
                  <option value="allowed">Allowed without requesting</option>
                </select>
              </label>
              {builderStatus.trackSwitchPolicy !== "disabled" ? (
                <div className="space-y-3 rounded-[10px] border border-[#E1E8EC] bg-[#FAFCFC] p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                    <input
                      type="checkbox"
                      checked={builderStatus.trackSwitchAllowAll}
                      onChange={(event) => setBuilderStatus((current) => ({ ...current, trackSwitchAllowAll: event.target.checked }))}
                    />
                    Allow switching between any schedule options
                  </label>
                  {!builderStatus.trackSwitchAllowAll ? (
                    <TrackTransferRuleBuilder trackRows={trackRows} transferRules={transferRules} setTransferRules={setTransferRules} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </EditorFieldSection>
        ) : null}

        {showBasics ? <EditorFieldSection title="Target Audience">
          <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
            <input type="checkbox" checked={allAges} onChange={(event) => setAllAges(event.target.checked)} />
            All ages
          </label>
          {!allAges ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EditBox label="From age" value={ageStart} onChange={setAgeStart} />
              <EditBox label="To age" value={ageEnd} onChange={setAgeEnd} />
            </div>
          ) : null}
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Gender</span>
            <select value={audienceGender} onChange={(event) => setAudienceGender(event.target.value)} className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
              <option value="all">All</option>
              <option value="brothers">Brothers only</option>
              <option value="sisters">Sisters only</option>
            </select>
          </label>
        </EditorFieldSection> : null}

        {showBasics ? <EditorFieldSection title="Director Information">
          <div className="space-y-3">
            <EditBox label="Display name" value={instructorDisplayName} onChange={setInstructorDisplayName} />
            {showCredentialsField ? (
              <div className="space-y-1.5">
                <EditBox label="Credentials (optional)" value={instructorCredentials} onChange={setInstructorCredentials} />
                <button type="button" onClick={() => { setCredentialsVisible(false); setInstructorCredentials(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove credentials
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCredentialsVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add credentials
              </button>
            )}
            <div>
              <EditBox label="Contact phone" required={!contactPhoneOmitted} disabled={contactPhoneOmitted} value={contactPhoneOmitted ? "" : instructorContactPhone} onChange={setInstructorContactPhone} />
              {setContactPhoneOmitted ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                  <input type="checkbox" checked={contactPhoneOmitted} onChange={(event) => setContactPhoneOmitted(event.target.checked)} />
                  Do not include phone number
                </label>
              ) : null}
            </div>
            {setContactEmail ? (
              <div>
                <EditBox label="Contact email" required={!contactEmailOmitted} disabled={contactEmailOmitted} value={contactEmailOmitted ? "" : contactEmail} onChange={setContactEmail} />
                {setContactEmailOmitted ? (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                    <input type="checkbox" checked={contactEmailOmitted} onChange={(event) => setContactEmailOmitted(event.target.checked)} />
                    Do not include email
                  </label>
                ) : null}
              </div>
            ) : null}
            {setCoverDirectorVisibility ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Show on class cover</span>
                <select
                  value={coverDirectorVisibility}
                  onChange={(event) => setCoverDirectorVisibility(event.target.value)}
                  className="h-11 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="name_and_photo">Name and photo</option>
                  <option value="name_only">Name only</option>
                  <option value="none">Neither</option>
                </select>
              </label>
            ) : null}
          </div>
        </EditorFieldSection> : null}

        {showPricing && paymentKind === "tareeqah" ? <EditorFieldSection title="Price">
            {programType === "event" ? (
              <div>
                <EditBox label="One-time price amount" required value={annualPrice} onChange={setAnnualPrice} />
              </div>
            ) : (
            <div className="mt-3 space-y-3">
              {canUsePerTrackPricing ? (
                <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#F3F7F8] p-1">
                  <button
                    type="button"
                    onClick={() => setPerTrackPricingEnabled(false)}
                    className={cn(
                      "min-h-10 rounded-[10px] px-3 text-sm font-semibold transition",
                      !perTrackPricingEnabled ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]",
                    )}
                  >
                    Program price
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerTrackPricingEnabled(true)}
                    className={cn(
                      "min-h-10 rounded-[10px] px-3 text-sm font-semibold transition",
                      perTrackPricingEnabled ? "bg-white text-[#26323A] shadow-sm" : "text-[#6B747B]",
                    )}
                  >
                    Per-track prices
                  </button>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                <input type="checkbox" checked={offersMonthlyPayment} onChange={(event) => setOffersMonthlyPayment(event.target.checked)} />
                Offer monthly payments
              </label>
              {offersMonthlyPayment && !perTrackPricingEnabled ? (
                <div>
                  <EditBox label="Monthly price" required value={price} onChange={setPrice} />
                  {formatMonthlyCycle(price, durationMonthsForPricing) ? <p className="mt-1 text-xs leading-5 text-[#6B747B]">{formatMonthlyCycle(price, durationMonthsForPricing)}</p> : null}
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium text-[#26323A]">
                <input type="checkbox" checked={offersAnnualPayment} onChange={(event) => setOffersAnnualPayment(event.target.checked)} />
                {isOngoingDuration ? "Offer annual subscription" : "Offer Pay in Full"}
              </label>
              {offersAnnualPayment && !perTrackPricingEnabled ? (
                <div className="space-y-2">
                  <EditBox label={isOngoingDuration ? "Annual price" : "Pay in Full price"} required value={annualPrice} onChange={setAnnualPrice} />
                  {isOngoingDuration ? (
                    <p className="text-xs leading-5 text-[#6B747B]">Bills once a year and renews automatically until the family cancels — same as monthly, just yearly.</p>
                  ) : null}
                  {offersMonthlyPayment && formatAnnualSavings(price, annualPrice, durationMonthsForPricing) ? <p className="inline-flex rounded-full bg-[#E9F4F8] px-3 py-1 text-xs font-semibold text-[#2F6077]">{formatAnnualSavings(price, annualPrice, durationMonthsForPricing)}</p> : null}
                </div>
              ) : null}
              {perTrackPricingEnabled ? (
                <div className="divide-y divide-[#E6ECEF] rounded-[8px] border border-[#E1E8EC]">
                  {trackRows.map((track) => (
                    <div key={track.id} className="p-3">
                      <p className="truncate text-sm font-semibold text-[#26323A]">{track.name || "Untitled track"}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {offersMonthlyPayment ? (
                          <div>
                            <EditBox
                              label="Monthly price"
                              required
                              value={track.priceMonthly ?? ""}
                              onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, priceMonthly: value, pricingOverrideEnabled: true } : item))}
                            />
                            {formatMonthlyCycle(track.priceMonthly ?? "", durationMonthsForPricing) ? <p className="mt-1 text-xs leading-5 text-[#6B747B]">{formatMonthlyCycle(track.priceMonthly ?? "", durationMonthsForPricing)}</p> : null}
                          </div>
                        ) : null}
                        {offersAnnualPayment ? (
                          <div className="space-y-2">
                            <EditBox
                              label={isOngoingDuration ? "Annual price" : "Pay in Full price"}
                              required
                              value={track.priceAnnual ?? ""}
                              onChange={(value) => setTrackRows((current) => current.map((item) => item.id === track.id ? { ...item, priceAnnual: value, pricingOverrideEnabled: true } : item))}
                            />
                            {offersMonthlyPayment && formatAnnualSavings(track.priceMonthly ?? "", track.priceAnnual ?? "", durationMonthsForPricing) ? <p className="inline-flex rounded-full bg-[#E9F4F8] px-3 py-1 text-xs font-semibold text-[#2F6077]">{formatAnnualSavings(track.priceMonthly ?? "", track.priceAnnual ?? "", durationMonthsForPricing)}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            )}
        </EditorFieldSection> : null}

        {showPricing ? <EditorFieldSection title="Cover Price Tag">
          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-[8px] border border-[#E1E8EC] bg-[#FAFCFC] p-3 text-sm font-semibold text-[#26323A]">
              <input
                type="checkbox"
                checked={coverPriceLabelEnabled}
                onChange={(event) => setCoverPriceLabelEnabled?.(event.target.checked)}
                className="mt-1"
              />
              <span>
                Show a price tag on the class cover
                <span className="mt-1 block text-xs font-medium leading-5 text-[#6B747B]">Leave the label blank to use the automatic public price summary.</span>
              </span>
            </label>
            {coverPriceLabelEnabled ? (
              <EditBox label="Price tag label" value={coverPriceLabel} onChange={(value) => setCoverPriceLabel?.(value)} />
            ) : null}
          </div>
        </EditorFieldSection> : null}

    </div>
  );
}

function formatAnnualSavings(priceText: string, annualText: string, monthsText: string) {
  const monthly = Number(priceText || "0");
  const annual = Number(annualText || "0");
  const months = Number(monthsText || "0");
  if (!monthly || !annual || !months) {
    return "";
  }
  const monthlyTotal = monthly * months;
  const diff = Math.abs(monthlyTotal - annual);
  if (annual < monthlyTotal) {
    return `One-time saves $${diff.toFixed(2)} CAD compared with monthly.`;
  }
  if (annual > monthlyTotal) {
    return `Monthly saves $${diff.toFixed(2)} CAD compared with one-time.`;
  }
  return "Monthly and one-time totals match.";
}

function formatMonthlyCycle(priceText: string, monthsText: string) {
  const monthly = Number(priceText || "0");
  const months = Number(monthsText || "0");
  if (!monthly || !months) {
    return "";
  }
  return `$${monthly.toFixed(2)} x ${months} months = $${(monthly * months).toFixed(2)} CAD for one cycle.`;
}

function TrackTransferRuleBuilder({
  trackRows,
  transferRules,
  setTransferRules,
}: {
  trackRows: ProgramEditorTrackRow[];
  transferRules: ProgramEditorTransferRule[];
  setTransferRules: Dispatch<SetStateAction<ProgramEditorTransferRule[]>>;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  function addRule() {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    if (transferRules.some((rule) => rule.fromTrackId === fromId && rule.toTrackId === toId)) {
      return;
    }
    setTransferRules((current) => [...current, { id: crypto.randomUUID(), fromTrackId: fromId, toTrackId: toId }]);
    setFromId("");
    setToId("");
  }

  function trackName(id: string) {
    return trackRows.find((track) => track.id === id)?.name || "Untitled track";
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Allowed switches</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={fromId} onChange={(event) => setFromId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#B9C3C8] bg-white px-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
          <option value="">From...</option>
          {trackRows.map((track) => (
            <option key={track.id} value={track.id}>{track.name || "Untitled track"}</option>
          ))}
        </select>
        <span className="shrink-0 text-[#6B747B]" aria-hidden>→</span>
        <select value={toId} onChange={(event) => setToId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#B9C3C8] bg-white px-2 text-sm text-[#26323A] outline-none focus:border-[#2F8FB3]">
          <option value="">To...</option>
          {trackRows.filter((track) => track.id !== fromId).map((track) => (
            <option key={track.id} value={track.id}>{track.name || "Untitled track"}</option>
          ))}
        </select>
        <button type="button" onClick={addRule} disabled={!fromId || !toId} className="h-10 shrink-0 rounded-[8px] bg-[#17624F] px-3 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </div>
      {transferRules.length ? (
        <div className="divide-y divide-[#EEF2F4] rounded-[8px] border border-[#E1E8EC] bg-white">
          {transferRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[#26323A]">{trackName(rule.fromTrackId)} → {trackName(rule.toTrackId)}</span>
              <button
                type="button"
                onClick={() => setTransferRules((current) => current.filter((item) => item.id !== rule.id))}
                className="shrink-0 text-xs font-semibold text-[#C83F31] hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#7B858C]">No switches allowed yet. Add pairs above.</p>
      )}
    </div>
  );
}

type ProgramEditorTransferRule = { id: string; fromTrackId: string; toTrackId: string };

type ProgramEditorTrackRow = {
  id: string;
  name: string;
  sessions: ProgramScheduleRow[];
  location?: string;
  room?: string;
  capacity?: string;
  pricingOverrideEnabled?: boolean;
  priceMonthly?: string;
  priceAnnual?: string;
  eligibilityOverrideEnabled?: boolean;
  ageMin?: string;
  ageMax?: string;
  genderOverride?: string;
  eligibilityComment?: string;
};

function ProgramMediaPicker({ onConfirm, disabled }: { onConfirm: (file: File) => void; disabled?: boolean }) {
  const [selection, setSelection] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  return <>
    <label className={cn("flex h-10 cursor-pointer items-center justify-center rounded-lg border border-[#D6DCE0] text-[#52616A]", disabled && "opacity-40")} aria-label="Choose or replace media">
      <PhotoIcon />
      <input type="file" disabled={disabled} accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        const issue = validateProgramMediaFile(file);
        setError(issue);
        if (!issue) setSelection(file);
      }} />
    </label>
    {error ? <p role="alert" className="text-xs text-[#B4352B]">{error}</p> : null}
    {selection && programMediaType(selection) === "photo" ? <ImageCropModal file={selection} title="Crop class photo" aspectRatio={16 / 9} outputWidth={1600} outputHeight={900} onCancel={() => setSelection(null)} onConfirm={(file) => { setSelection(null); onConfirm(file); }} /> : null}
    {selection && programMediaType(selection) === "video" ? <VideoSelectionModal file={selection} onCancel={() => setSelection(null)} onConfirm={() => { onConfirm(selection); setSelection(null); }} /> : null}
  </>;
}

function VideoSelectionModal({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusTrap(ref, true, onCancel);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return createPortal(<div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-5">
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="video-selection-title" className="w-full max-w-lg rounded-2xl bg-white p-5">
      <h2 id="video-selection-title" className="text-lg font-semibold">Use this video?</h2>
      <video src={url} controls playsInline preload="metadata" onError={() => setFailed(true)} className="mt-4 max-h-[50vh] w-full rounded-lg bg-black" />
      <p className="mt-3 break-words text-sm text-[#52616A]">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
      {failed ? <p role="alert" className="mt-2 text-sm text-[#B4352B]">This browser can’t preview this video. Please choose an MP4 encoded with H.264.</p> : null}
      <div className="mt-5 flex gap-3"><button onClick={onCancel} className="min-h-11 rounded-md border px-5 text-sm font-semibold text-[#17624F]">Cancel</button><button disabled={failed} onClick={onConfirm} className="min-h-11 rounded-md bg-[#17624F] px-5 text-sm font-semibold text-white disabled:opacity-40">Use video</button></div>
    </div>
  </div>, document.body);
}

function ProgramFaqEditor({
  faqRows,
  onChange,
  onRemoveSection,
}: {
  faqRows: ProgramEditorFaqRow[];
  onChange: Dispatch<SetStateAction<ProgramEditorFaqRow[]>>;
  onRemoveSection?: () => void;
}) {
  return (
    <EditorFieldSection title="FAQs" action={onRemoveSection ? <RemoveSectionButton onClick={onRemoveSection} /> : undefined}>
      <div className="divide-y divide-[#E6ECEF]">
        {faqRows.map((row, index) => (
          <div key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7B858C]">Question {index + 1}</p>
              <RowIconButton tone="danger" onClick={() => onChange((current) => current.filter((item) => item.id !== row.id))} aria-label="Remove FAQ">
                <TrashIcon />
              </RowIconButton>
            </div>
            <input
              value={row.question}
              onChange={(event) => onChange((current) => current.map((item) => item.id === row.id ? { ...item, question: event.target.value } : item))}
              className="h-11 w-full rounded-[8px] border border-[#B9C3C8] px-3 text-sm outline-none focus:border-[#2F8FB3]"
              placeholder="Question"
            />
            <textarea
              value={row.answer}
              onChange={(event) => onChange((current) => current.map((item) => item.id === row.id ? { ...item, answer: event.target.value } : item))}
              className="min-h-24 w-full resize-y rounded-[8px] border border-[#B9C3C8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#2F8FB3]"
              placeholder="Answer"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange((current) => [...current, { id: crypto.randomUUID(), question: "New question", answer: "Add the answer families should see." }])}
          className="mt-3 min-h-10 rounded-[8px] border border-[#D6DCE0] px-4 text-sm font-semibold text-[#26323A]"
        >
          Add FAQ
        </button>
      </div>
    </EditorFieldSection>
  );
}

function RowIconButton({ tone = "neutral", ...props }: React.ComponentPropsWithoutRef<"button"> & { tone?: "neutral" | "danger" | "accent" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        tone === "danger" ? "text-[#C83F31] hover:bg-[#FDEDEA]" : tone === "accent" ? "text-[#2F8FB3] hover:bg-[#E9F4F8]" : "text-[#6B747B] hover:bg-[#F1F4F5]",
        props.className,
      )}
    />
  );
}

function RemoveSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-xs font-semibold text-[#C83F31] hover:underline">
      Remove section
    </button>
  );
}

function EditorFieldSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E1E8EC] bg-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type ProgramEditorFaqRow = { id: string; question: string; answer: string };

function EditBox({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">
        {formatRequiredLabel(label, required)}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="min-h-24 w-full resize-y rounded-[8px] border border-[#B9C3C8] bg-white px-3 py-2 text-sm leading-6 text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#9AA4AA]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#9AA4AA]"
        />
      )}
    </label>
  );
}

function formatRequiredLabel(label: string, required?: boolean) {
  return (
    <>
      {label}
      {required ? <span className="ml-1 text-[#C83F31]" aria-hidden>*</span> : null}
    </>
  );
}

function trackEligibilityOverrideColumns(track: ProgramEditorTrackRow) {
  return {
    gender_override: track.eligibilityOverrideEnabled ? track.genderOverride || "all" : null,
    age_min: track.eligibilityOverrideEnabled && track.ageMin ? Number(track.ageMin) : null,
    age_max: track.eligibilityOverrideEnabled && track.ageMax ? Number(track.ageMax) : null,
    eligibility_comment: track.eligibilityOverrideEnabled ? track.eligibilityComment?.trim() || null : null,
  };
}

function defaultProgramTrackBuilderColumns(): Pick<ProgramTrack, "gender_override" | "age_min" | "age_max" | "location" | "room" | "capacity" | "pricing_override_enabled" | "price_monthly_cents" | "price_annual_cents" | "eligibility_comment"> {
  return {
    gender_override: null,
    age_min: null,
    age_max: null,
    location: null,
    room: null,
    capacity: null,
    pricing_override_enabled: false,
    price_monthly_cents: null,
    price_annual_cents: null,
    eligibility_comment: null,
  };
}

type ProgramEditorFieldsProps = {
  masjidLabel?: string;
  activeStep?: ProgramBuilderStep;
  programType?: ProgramBuilderStatus["programType"];
  schedulePattern?: ProgramBuilderStatus["schedulePattern"];
  previewProgram?: Program;
  eventDate?: string;
  setEventDate?: (value: string) => void;
  eventTimeVisible?: boolean;
  setEventTimeVisible?: (value: boolean) => void;
  learningVisible: boolean;
  setLearningVisible: (value: boolean) => void;
  learningTitle: string;
  setLearningTitle: (value: string) => void;
  learningIntro: string;
  setLearningIntro: (value: string) => void;
  learningDescriptionVisible?: boolean;
  setLearningDescriptionVisible?: (value: boolean) => void;
  topicsIntro?: string;
  setTopicsIntro?: (value: string) => void;
  requirementsText?: string;
  setRequirementsText?: (value: string) => void;
  policiesText?: string;
  setPoliciesText?: (value: string) => void;
  outcomeRows: Array<{ id: string; text: string }>;
  setOutcomeRows: Dispatch<SetStateAction<Array<{ id: string; text: string }>>>;
  faqVisible: boolean;
  setFaqVisible: (value: boolean) => void;
  faqRows: ProgramEditorFaqRow[];
  setFaqRows: Dispatch<SetStateAction<ProgramEditorFaqRow[]>>;
  contentSectionsVisible: boolean;
  setContentSectionsVisible: (value: boolean) => void;
  contentSectionRows: ProgramEditorContentSectionRow[];
  setContentSectionRows: Dispatch<SetStateAction<ProgramEditorContentSectionRow[]>>;
  mediaVisible: boolean;
  setMediaVisible: (value: boolean) => void;
  mediaRows: ProgramEditorMediaRow[];
  setMediaRows: Dispatch<SetStateAction<ProgramEditorMediaRow[]>>;
  onMediaFile: (rowId: string, file: File | null) => void;
  addMedia: () => void;
  trackRows: ProgramEditorTrackRow[];
  setTrackRows: Dispatch<SetStateAction<ProgramEditorTrackRow[]>>;
  addTrack: () => void;
  transferRules?: ProgramEditorTransferRule[];
  setTransferRules?: Dispatch<SetStateAction<ProgramEditorTransferRule[]>>;
  trackSelectionMode: TrackSelectionMode;
  setTrackSelectionMode: (value: TrackSelectionMode) => void;
  trackSelectionCount: number;
  setTrackSelectionCount: (value: number) => void;
  allAges: boolean;
  setAllAges: (value: boolean) => void;
  ageStart: string;
  setAgeStart: (value: string) => void;
  ageEnd: string;
  setAgeEnd: (value: string) => void;
  audienceGender: string;
  setAudienceGender: (value: string) => void;
  paymentKind?: ProgramBuilderStatus["paymentKind"];
  durationMonthsForPricing?: string;
  isPaid: boolean;
  setIsPaid: (value: boolean) => void;
  offersMonthlyPayment: boolean;
  setOffersMonthlyPayment: (value: boolean) => void;
  offersAnnualPayment: boolean;
  setOffersAnnualPayment: (value: boolean) => void;
  price: string;
  setPrice: (value: string) => void;
  annualPrice: string;
  setAnnualPrice: (value: string) => void;
  instructorDisplayName: string;
  setInstructorDisplayName: (value: string) => void;
  instructorCredentials: string;
  setInstructorCredentials: (value: string) => void;
  instructorContactPhone: string;
  setInstructorContactPhone: (value: string) => void;
  coverDirectorVisibility?: string;
  setCoverDirectorVisibility?: (value: string) => void;
  contactEmail?: string;
  setContactEmail?: (value: string) => void;
  contactPhoneOmitted?: boolean;
  setContactPhoneOmitted?: (value: boolean) => void;
  contactEmailOmitted?: boolean;
  setContactEmailOmitted?: (value: boolean) => void;
  coverPriceLabelEnabled?: boolean;
  setCoverPriceLabelEnabled?: (value: boolean) => void;
  coverPriceLabel?: string;
  setCoverPriceLabel?: (value: string) => void;
  builderStatus?: ProgramBuilderStatus;
  setBuilderStatus?: Dispatch<SetStateAction<ProgramBuilderStatus>>;
  isEditMode?: boolean;
};

type ProgramEditorMediaRow = { id: string; url: string; title: string; mediaType: string; file?: File | null; previewUrl?: string; progress?: number; uploadError?: string };

type ProgramEditorContentSectionRow = { id: string; title: string; description: string; durationText: string };

function MissingFieldsModal({
  missingFields,
  allowContinue,
  onContinueAnyway,
  onClose,
}: {
  missingFields: ProgramBuilderMissingField[];
  allowContinue: boolean;
  onContinueAnyway?: () => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(containerRef, true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#26323A]/35 px-5 backdrop-blur-sm">
      <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-5 text-[#26323A] shadow-[0_24px_60px_rgba(38,50,58,0.22)] outline-none">
        <h2 className="text-lg font-semibold">Required fields missing</h2>
        <p className="mt-1 text-sm leading-6 text-[#6B747B]">
          {allowContinue
            ? "You can still move on, but these need to be filled in before this class can be published."
            : "These need to be filled in before you can publish."}
        </p>
        <ul className="mt-4 space-y-2">
          {missingFields.map((field) => (
            <li key={field.label} className="flex items-start gap-2 text-sm text-[#26323A]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C83F31]" aria-hidden />
              {field.label}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-[10px] border border-[#C9D3D8] bg-white px-4 text-sm font-semibold text-[#26323A]">
            {allowContinue ? "Review Fields" : "Close"}
          </button>
          {allowContinue ? (
            <button type="button" onClick={onContinueAnyway} className="min-h-10 rounded-[10px] bg-[#17624F] px-4 text-sm font-semibold text-white">
              Continue Anyway
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ProgramBuilderMissingField = { label: string; step: ProgramBuilderStep };

function ProgramApplicationAvailabilityFields({
  builderStatus,
  setBuilderStatus,
}: {
  builderStatus: ProgramBuilderStatus;
  setBuilderStatus: Dispatch<SetStateAction<ProgramBuilderStatus>>;
}) {
  const choice = applicationAvailabilityChoiceFromStatus(builderStatus.applicationStatus);
  const openBeforeClose =
    !builderStatus.applicationOpenAt ||
    !builderStatus.applicationCloseAt ||
    new Date(builderStatus.applicationCloseAt).getTime() > new Date(builderStatus.applicationOpenAt).getTime();

  return (
    <>
      <label className="block md:col-span-2">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Can students apply?", true)}</span>
        <select
          value={choice}
          onChange={(event) => {
            const nextChoice = event.target.value as ApplicationAvailabilityChoice;
            setBuilderStatus((current) => {
              const applicationStatus: ProgramApplicationStatus =
                nextChoice === "now"
                  ? "accepting"
                  : nextChoice === "later"
                    ? "opens_later"
                    : nextChoice === "invite"
                      ? "invite_only"
                      : nextChoice === "waitlist"
                        ? "waitlist_only"
                        : "not_accepting";
              return {
                ...current,
                applicationStatus,
                acceptingApplications: applicationStatus === "accepting",
                applicationMode: applicationStatus === "invite_only" ? "invite_only" : "application_required",
                applicationOpenAt: applicationStatus === "opens_later" ? current.applicationOpenAt : "",
                applicationCloseAt: applicationStatus === "opens_later" ? current.applicationCloseAt : "",
              };
            });
          }}
          className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
        >
          <option value="not_yet">No, not yet</option>
          <option value="now">Yes, start now</option>
          <option value="later">Yes, starting later</option>
          <option value="waitlist">Waitlist only</option>
          <option value="invite">Invite only</option>
        </select>
      </label>
      {choice === "later" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Applications open", true)}</span>
            <input
              type="datetime-local"
              value={builderStatus.applicationOpenAt}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, applicationOpenAt: event.target.value }))}
              className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Applications close (optional)</span>
            <input
              type="datetime-local"
              value={builderStatus.applicationCloseAt}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, applicationCloseAt: event.target.value }))}
              className={cn("h-10 w-full rounded-[8px] border bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]", openBeforeClose ? "border-[#B9C3C8]" : "border-[#C83F31]")}
            />
            {!openBeforeClose ? <span className="mt-1 block text-xs leading-5 text-[#C83F31]">Close date must be after the open date.</span> : null}
          </label>
        </>
      ) : null}
      {choice === "waitlist" ? (
        <p className="rounded-[10px] border border-[#DCE7EB] bg-[#F7FBFC] px-3 py-3 text-sm font-semibold text-[#52616A] md:col-span-2">Families will see a &quot;Join Waitlist&quot; button instead of Apply.</p>
      ) : null}
      {choice === "invite" ? (
        <p className="rounded-[10px] border border-[#DCE7EB] bg-[#F7FBFC] px-3 py-3 text-sm font-semibold text-[#52616A] md:col-span-2">Families will see &quot;Invite required&quot; instead of Apply. An invite-code flow isn&apos;t built yet — this only controls the public messaging for now.</p>
      ) : null}
    </>
  );
}

type ApplicationAvailabilityChoice = "not_yet" | "now" | "later" | "invite" | "waitlist";

function applicationAvailabilityChoiceFromStatus(status: ProgramApplicationStatus): ApplicationAvailabilityChoice {
  switch (status) {
    case "accepting":
      return "now";
    case "opens_later":
      return "later";
    case "invite_only":
      return "invite";
    case "waitlist_only":
      return "waitlist";
    default:
      return "not_yet";
  }
}

function BillingMonthsHint({ startDate, endDate, chosenMonths }: { startDate: string; endDate: string; chosenMonths: string }) {
  const suggested = estimateBillingMonths(startDate, endDate);
  const exactDuration = monthsBetweenDates(startDate, endDate);
  return (
    <div className="mt-2 rounded-[12px] border border-[#E1E8EC] bg-[#F7FAFB] px-3 py-2 text-xs text-[#52616A]">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-semibold text-[#26323A]">{exactDuration ? `${exactDuration} calendar mo` : "Set dates"}</p>
          <p className="mt-0.5 font-medium">Program duration</p>
        </div>
        <div>
          <p className="font-semibold text-[#26323A]">{suggested ? `${suggested} suggested` : "No suggestion"}</p>
          <p className="mt-0.5 font-medium">Billing cycles</p>
        </div>
      </div>
      {chosenMonths ? <p className="mt-2 font-semibold text-[#17624F]">Using {chosenMonths} monthly {Number(chosenMonths) === 1 ? "charge" : "charges"} for price calculations.</p> : null}
    </div>
  );
}

function monthsBetweenDates(startDate: string, endDate: string): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, months);
}

function ProgramTimingFields({
  builderStatus,
  setBuilderStatus,
  eventDate,
  setEventDate,
  eventTimeVisible,
  setEventTimeVisible,
  noRegistrationDeadline,
  setNoRegistrationDeadline,
  startDateLocked = false,
}: {
  builderStatus: ProgramBuilderStatus;
  setBuilderStatus: Dispatch<SetStateAction<ProgramBuilderStatus>>;
  eventDate: string;
  setEventDate: (value: string) => void;
  eventTimeVisible: boolean;
  setEventTimeVisible: (value: boolean) => void;
  noRegistrationDeadline: boolean;
  setNoRegistrationDeadline: (value: boolean) => void;
  startDateLocked?: boolean;
}) {
  const endDateInvalid = Boolean(
    builderStatus.durationType === "fixed_months" &&
      builderStatus.startDate &&
      builderStatus.endDate &&
      new Date(`${builderStatus.endDate}T00:00:00`).getTime() <= new Date(`${builderStatus.startDate}T00:00:00`).getTime(),
  );

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {builderStatus.programType === "recurring" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("When does it end?", true)}</span>
          <select
            value={builderStatus.durationType}
            onChange={(event) => {
              const value = event.target.value as ProgramBuilderStatus["durationType"];
              setBuilderStatus((current) => ({
                ...current,
                durationType: value,
                billingEndBehavior: value === "ongoing" && current.billingEndBehavior === "program_end" ? "manual_cancel" : current.billingEndBehavior,
                endDate: value === "ongoing" ? "" : current.endDate,
              }));
            }}
            className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
          >
            <option value="ongoing">Ongoing until manually ended</option>
            <option value="fixed_months">Ends on a specific date</option>
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel(builderStatus.programType === "event" ? "Event date" : "Start date", true)}</span>
        {builderStatus.programType === "event" ? (
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]" />
        ) : (
          <>
            <input
              type={builderStatus.startNow ? "text" : "date"}
              disabled={builderStatus.startNow}
              value={builderStatus.startNow ? "Start Immediately" : builderStatus.startDate}
              onChange={(event) => setBuilderStatus((current) => ({ ...current, startDate: event.target.value }))}
              className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#52616A]"
            />
            {startDateLocked ? (
              <p className="mt-2 text-xs leading-5 text-[#8A5A00]">This class has already started. Changing this date will pause the class until then.</p>
            ) : (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
                <input type="checkbox" checked={builderStatus.startNow} onChange={(event) => setBuilderStatus((current) => ({ ...current, startNow: event.target.checked }))} />
                Start now after publishing
              </label>
            )}
          </>
        )}
      </label>
      {builderStatus.programType === "recurring" && builderStatus.durationType === "fixed_months" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("End date", true)}</span>
          <input
            type="date"
            value={builderStatus.endDate}
            onChange={(event) => setBuilderStatus((current) => ({ ...current, endDate: event.target.value }))}
            className={cn("h-10 w-full rounded-[8px] border bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]", endDateInvalid ? "border-[#C83F31]" : "border-[#B9C3C8]")}
          />
          {endDateInvalid ? (
            <span className="mt-1 block text-xs leading-5 text-[#C83F31]">End date must be after the start date.</span>
          ) : null}
        </label>
      ) : null}
      {builderStatus.programType === "recurring" ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Schedule pattern</span>
          <select value={builderStatus.schedulePattern} onChange={(event) => setBuilderStatus((current) => ({ ...current, schedulePattern: event.target.value as ProgramBuilderStatus["schedulePattern"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="weekly">Weekly repeating</option>
            <option value="custom_dates">Custom session dates</option>
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Registration deadline", !noRegistrationDeadline)}</span>
        <input type={noRegistrationDeadline ? "text" : "datetime-local"} disabled={noRegistrationDeadline} value={noRegistrationDeadline ? "None" : builderStatus.registrationDeadline} onChange={(event) => setBuilderStatus((current) => ({ ...current, registrationDeadline: event.target.value }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3] disabled:bg-[#F2F6F7] disabled:text-[#52616A]" />
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#52616A]">
          <input type="checkbox" checked={noRegistrationDeadline} onChange={(event) => { setNoRegistrationDeadline(event.target.checked); if (event.target.checked) setBuilderStatus((current) => ({ ...current, registrationDeadline: "" })); }} />
          No registration deadline
        </label>
      </label>
      {builderStatus.programType === "event" && !eventTimeVisible ? <button type="button" onClick={() => setEventTimeVisible(true)} className="block text-sm font-semibold text-[#2F8FB3]">Add start and end time</button> : null}
    </div>
  );
}

function ProgramBuilderStepper({
  activeStep,
}: {
  activeStep: ProgramBuilderStep;
}) {
  const activeIndex = programBuilderSteps.findIndex((step) => step.id === activeStep);
  return (
    <nav className="px-1 py-1" aria-label="Class builder steps">
      <ol className="grid grid-cols-5 items-center gap-1 sm:gap-2">
        {programBuilderSteps.map((step, index) => {
          const active = step.id === activeStep;
          const complete = index < activeIndex;
          return (
            <li key={step.id} className="relative flex min-w-0 justify-center">
              {index > 0 ? <span className={cn("absolute right-1/2 top-1/2 hidden h-px w-full -translate-y-1/2 sm:block", complete || active ? "bg-[#17624F]" : "bg-[#DDE7EA]")} aria-hidden /> : null}
              <div
                className={cn(
                  "relative z-10 flex min-w-0 items-center justify-center gap-2 bg-[var(--workspace)] px-1 py-1.5 text-xs font-semibold transition sm:px-2",
                  active ? "text-[#17624F]" : "text-[#6B747B]",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs", active || complete ? "border-[#17624F] bg-[#17624F] text-white" : "border-[#C9D3D8] bg-white text-[#7B858C]")}>
                  {complete ? "✓" : index + 1}
                </span>
                <span className="hidden truncate sm:inline">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const programBuilderSteps: Array<{ id: ProgramBuilderStep; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "public", label: "Public Page" },
  { id: "schedule", label: "Schedule" },
  { id: "pricing", label: "Pricing" },
  { id: "review", label: "Review" },
];

function computeProgramBuilderMissingFields(input: {
  title: string;
  programType: ProgramBuilderStatus["programType"];
  location: string;
  room: string;
  allAges: boolean;
  ageStart: string;
  ageEnd: string;
  learningVisible: boolean;
  learningTitle: string;
  outcomeRows: Array<{ text: string }>;
  faqVisible: boolean;
  faqRows: ProgramEditorFaqRow[];
  contentSectionsVisible: boolean;
  contentSectionRows: ProgramEditorContentSectionRow[];
  contactPhone: string;
  contactPhoneOmitted: boolean;
  contactEmail: string;
  contactEmailOmitted: boolean;
  durationType: ProgramBuilderStatus["durationType"];
  endDate: string;
  startNow: boolean;
  startDate: string;
  eventDate: string;
  schedulePattern: ProgramBuilderStatus["schedulePattern"];
  noRegistrationDeadline: boolean;
  registrationDeadline: string;
  trackRows: ProgramEditorTrackRow[];
  paymentKind: ProgramBuilderStatus["paymentKind"];
  offersMonthlyPayment: boolean;
  price: string;
  offersAnnualPayment: boolean;
  annualPrice: string;
  coverPriceLabelEnabled: boolean;
  coverPriceLabel: string;
}): ProgramBuilderMissingField[] {
  const missing: ProgramBuilderMissingField[] = [];

  if (!input.title.trim()) missing.push({ label: "Public name", step: "basics" });
  if (!input.location.trim()) missing.push({ label: "Location name", step: "basics" });
  if (!input.room.trim()) missing.push({ label: "Location address", step: "basics" });
  const ageBounds = [input.ageStart.trim(), input.ageEnd.trim()].filter(Boolean);
  if (!input.allAges && ageBounds.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    missing.push({ label: "Valid age limits", step: "basics" });
  }

  if (input.outcomeRows.length > 0) {
    if (!input.learningTitle.trim()) missing.push({ label: "Learning Outcomes section title", step: "public" });
    if (input.outcomeRows.some((row) => !row.text.trim())) missing.push({ label: "Learning Outcomes: fill in every outcome point", step: "public" });
  }
  if (input.faqRows.length > 0 && input.faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
    missing.push({ label: "FAQ: fill in every question and answer", step: "public" });
  }
  if (input.contentSectionRows.length > 0 && input.contentSectionRows.some((row) => !row.title.trim())) {
    missing.push({ label: "Class Schedule: fill in every item title", step: "public" });
  }
  if (!input.contactPhoneOmitted && !input.contactPhone.trim()) missing.push({ label: "Contact phone (or mark Do not include)", step: "basics" });
  if (!input.contactEmailOmitted && !input.contactEmail.trim()) missing.push({ label: "Contact email (or mark Do not include)", step: "basics" });

  if (input.programType === "event") {
    if (!input.eventDate.trim()) missing.push({ label: "Event date", step: "schedule" });
  } else {
    if (input.durationType === "fixed_months" && !input.endDate.trim()) missing.push({ label: "End date", step: "schedule" });
    if (!input.startNow && !input.startDate.trim()) missing.push({ label: "Start date (or choose Start now)", step: "schedule" });
    if (input.schedulePattern === "weekly") {
      const weeklySessionCount = uniqueScheduleRows(input.trackRows.flatMap((track) => track.sessions)).length;
      if (weeklySessionCount === 0) missing.push({ label: "At least one weekly session", step: "schedule" });
      if (input.trackRows.length === 0 || input.trackRows.some((track) => track.sessions.length === 0)) {
        missing.push({ label: "Every track needs at least one session (no empty tracks)", step: "schedule" });
      }
    }
  }
  if (!input.noRegistrationDeadline && !input.registrationDeadline.trim()) {
    missing.push({ label: "Registration deadline (or choose No registration deadline)", step: "schedule" });
  }

  if (input.paymentKind === "tareeqah") {
    const annualPriceLabel = input.durationType === "ongoing" ? "Annual subscription price" : "Pay in Full price";
    const perTrackPricingEnabled =
      input.programType === "recurring" &&
      input.schedulePattern === "weekly" &&
      input.trackRows.length > 0 &&
      input.trackRows.some((track) => track.pricingOverrideEnabled);
    if (perTrackPricingEnabled) {
      if (input.offersMonthlyPayment && input.trackRows.some((track) => !(Number(track.priceMonthly) > 0))) {
        missing.push({ label: "Monthly price for every track", step: "pricing" });
      }
      if (input.offersAnnualPayment && input.trackRows.some((track) => !(Number(track.priceAnnual) > 0))) {
        missing.push({ label: `${annualPriceLabel} for every track`, step: "pricing" });
      }
    } else {
      if (input.offersMonthlyPayment && !(Number(input.price) > 0)) missing.push({ label: "Monthly price", step: "pricing" });
      if (input.offersAnnualPayment && !(Number(input.annualPrice) > 0)) missing.push({ label: annualPriceLabel, step: "pricing" });
    }
  }
  if (input.coverPriceLabelEnabled && !input.coverPriceLabel.trim()) missing.push({ label: "Price tag label", step: "pricing" });

  return missing;
}

function scrollBuilderToTop() {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function programAlreadyStarted(program: Program | null) {
  if (!program) {
    return false;
  }
  if (program.start_now) {
    return true;
  }
  if (program.lifecycle_status === "active" || program.lifecycle_status === "completed") {
    return true;
  }
  if (!program.start_date) {
    return false;
  }
  return new Date(`${program.start_date}T00:00:00`).getTime() < startOfToday().getTime();
}

async function synchronizeExistingProgramTracks(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  programId: string,
  trackRows: ProgramEditorTrackRow[],
  loadedTrackIds: Set<string>,
  fallback: { location: string | null; room: string | null },
) {
  const savedTracks: Array<{ id: string; sort_order: number | null }> = [];
  const retainedTrackIds = new Set<string>();

  for (const [index, track] of trackRows.entries()) {
    const payload = {
      program_id: programId,
      sort_order: index + 1,
      name: track.name.trim(),
      description: null,
      schedule: track.sessions as unknown as Json,
      location: track.location?.trim() || fallback.location,
      room: track.room?.trim() || fallback.room,
      capacity: track.capacity ? Number(track.capacity) : null,
      pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
      price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
      price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
      ...trackEligibilityOverrideColumns(track),
      is_active: true,
    };

    if (loadedTrackIds.has(track.id)) {
      const { data, error } = await supabase.from("program_tracks").update(payload).eq("id", track.id).eq("program_id", programId).select("id, sort_order").single();
      if (error || !data) throw new Error(friendlyErrorMessage(error, "Could not update this track."));
      retainedTrackIds.add(data.id);
      savedTracks.push(data);
    } else {
      const { data, error } = await supabase.from("program_tracks").insert(payload).select("id, sort_order").single();
      if (error || !data) throw new Error(friendlyErrorMessage(error, "Could not add this track."));
      retainedTrackIds.add(data.id);
      savedTracks.push(data);
    }
  }

  const removedTrackIds = Array.from(loadedTrackIds).filter((trackId) => !retainedTrackIds.has(trackId));
  if (removedTrackIds.length) {
    const { error } = await supabase.from("program_tracks").update({ is_active: false }).eq("program_id", programId).in("id", removedTrackIds);
    if (error) throw new Error(friendlyErrorMessage(error, "Could not safely archive a removed track."));
  }

  return savedTracks;
}

async function saveTrackTransferRules(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  programId: string,
  insertedTracks: Array<{ id: string; sort_order: number | null }>,
  trackRows: ProgramEditorTrackRow[],
  transferRules: ProgramEditorTransferRule[],
) {
  await supabase.from("program_track_transfer_rules").delete().eq("program_id", programId);
  if (!transferRules.length) {
    return;
  }

  const insertedTrackBySortOrder = new Map(insertedTracks.map((track) => [track.sort_order ?? 0, track.id]));
  const realIdByLocalId = new Map<string, string>();
  trackRows.forEach((track, index) => {
    const realId = insertedTrackBySortOrder.get(index + 1);
    if (realId) {
      realIdByLocalId.set(track.id, realId);
    }
  });

  const rows = transferRules
    .map((rule) => {
      const fromId = realIdByLocalId.get(rule.fromTrackId);
      const toId = realIdByLocalId.get(rule.toTrackId);
      return fromId && toId ? { program_id: programId, from_track_id: fromId, to_track_id: toId } : null;
    })
    .filter((row): row is { program_id: string; from_track_id: string; to_track_id: string } => Boolean(row));

  if (rows.length) {
    await supabase.from("program_track_transfer_rules").insert(rows);
  }
}

async function saveCanonicalProgramSessions(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  programId: string,
  insertedTracks: Array<{ id: string; sort_order: number | null }>,
  trackRows: ProgramEditorTrackRow[],
  options: {
    programType: ProgramBuilderStatus["programType"];
    schedulePattern: ProgramBuilderStatus["schedulePattern"];
    eventDate?: string;
    title: string;
    location?: string | null;
    room?: string | null;
  },
) {
  const insertedTrackBySortOrder = new Map(insertedTracks.map((track) => [track.sort_order ?? 0, track.id]));
  const sessionPayloadByKey = new Map<string, Database["public"]["Tables"]["program_sessions"]["Insert"]>();
  const linkKeysByTrackId = new Map<string, Set<string>>();

  for (const [trackIndex, track] of trackRows.entries()) {
    const insertedTrackId = insertedTrackBySortOrder.get(trackIndex + 1);
    if (!insertedTrackId) {
      continue;
    }
    const sessions = options.programType === "event" ? track.sessions.slice(0, 1) : track.sessions;
    for (const session of sessions) {
      const sessionDate = options.programType === "event" ? options.eventDate : options.schedulePattern === "custom_dates" ? session.date : null;
      if ((options.programType === "event" || options.schedulePattern === "custom_dates") && !sessionDate) {
        continue;
      }
      const day = options.schedulePattern === "weekly" && options.programType !== "event"
        ? session.day
        : sessionDate
          ? dayFromSessionDate(sessionDate)
          : session.day;
      const row = {
        ...session,
        date: sessionDate ?? undefined,
        day,
        start: normalizeScheduleTime(session.start) || session.start,
        end: normalizeScheduleTime(session.end) || session.end || session.start,
      };
      const key = scheduleRowKey(row);
      if (!sessionPayloadByKey.has(key)) {
        sessionPayloadByKey.set(key, {
          program_id: programId,
          program_track_id: null,
          session_date: sessionDate ?? null,
          day_of_week: day,
          start_time: row.start,
          end_time: row.end,
          title: options.programType === "event" ? options.title : `${day} Session`,
          location: track.location?.trim() || options.location || null,
          room: track.room?.trim() || options.room || null,
          capacity: track.capacity ? Number(track.capacity) : null,
        });
      }
      const nextKeys = linkKeysByTrackId.get(insertedTrackId) ?? new Set<string>();
      nextKeys.add(key);
      linkKeysByTrackId.set(insertedTrackId, nextKeys);
    }
  }

  const sessionEntries = Array.from(sessionPayloadByKey.entries());
  if (!sessionEntries.length) {
    return;
  }
  const sessionIdByKey = new Map<string, string>();
  const { data: existingSessions, error: existingSessionsError } = await supabase.from("program_sessions").select("*").eq("program_id", programId);
  if (existingSessionsError) throw new Error(friendlyErrorMessage(existingSessionsError, "Could not load existing sessions."));
  const existingSessionByKey = new Map((existingSessions ?? []).map((session) => [scheduleRowKey(scheduleRowFromProgramSession(session)), session]));

  for (const [key, payload] of sessionEntries) {
    const existing = existingSessionByKey.get(key);
    if (existing) {
      const { error } = await supabase.from("program_sessions").update(payload).eq("id", existing.id).eq("program_id", programId);
      if (error) throw new Error(friendlyErrorMessage(error, "Could not update a class session."));
      sessionIdByKey.set(key, existing.id);
    } else {
      const { data, error } = await supabase.from("program_sessions").insert(payload).select("id").single();
      if (error || !data) throw new Error(friendlyErrorMessage(error, "Could not add a class session."));
      sessionIdByKey.set(key, data.id);
    }
  }

  const savedTrackIds = insertedTracks.map((track) => track.id);
  if (savedTrackIds.length) {
    const { error } = await supabase.from("program_track_sessions").delete().in("program_track_id", savedTrackIds);
    if (error) throw new Error(friendlyErrorMessage(error, "Could not refresh track schedules."));
  }

  const linkRows = Array.from(linkKeysByTrackId.entries()).flatMap(([programTrackId, keys]) =>
    Array.from(keys).flatMap((key) => {
      const programSessionId = sessionIdByKey.get(key);
      return programSessionId ? [{ program_track_id: programTrackId, program_session_id: programSessionId }] : [];
    }),
  );

  if (linkRows.length) {
    const { error: linkError } = await supabase.from("program_track_sessions").insert(linkRows);
    if (linkError) {
      throw new Error(friendlyErrorMessage(linkError, "Could not link sessions to tracks."));
    }
  }
}

function formatAgeRangeForSave(start: string, end: string) {
  const cleanStart = start.trim() === "0" ? "" : start.trim();
  const cleanEnd = end.trim() === "0" ? "" : end.trim();
  if (cleanStart && cleanEnd) {
    return `${cleanStart}-${cleanEnd}`;
  }
  if (cleanStart) return `${cleanStart}+`;
  if (cleanEnd) return `${cleanEnd} or younger`;
  return null;
}

async function uploadProgramMediaFile(programId: string, file: File, onProgress?: (value: number) => void) {
  const validationError = validateProgramMediaFile(file);
  if (validationError) throw new Error(validationError);
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error("Log in required.");

  const response = await fetch(`/api/programs/${programId}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  const result = (await response.json().catch(() => ({}))) as { path?: string; token?: string; url?: string; mediaType?: "photo" | "video"; error?: string };
  if (!response.ok || !result.path || !result.token || !result.url || !result.mediaType) {
    throw new Error(response.status === 403 ? "You don’t have permission to upload media for this class." : "Could not start the upload. Please try again.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Media storage is not configured.");
  const endpointUrl = new URL("/storage/v1/upload/resumable", supabaseUrl);
  if (endpointUrl.hostname.endsWith(".supabase.co")) {
    endpointUrl.hostname = endpointUrl.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: endpointUrl.toString(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { "x-signature": result.token as string },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "media",
        objectName: result.path as string,
        contentType: file.type || (result.mediaType === "video" ? "video/mp4" : "image/jpeg"),
        cacheControl: "3600",
      },
      onError: () => reject(new Error("Upload interrupted. Check your connection and try again.")),
      onProgress: (uploaded, total) => onProgress?.(Math.round(uploaded / total * 100)),
      onSuccess: () => resolve(),
    });
    // Each signed URL names a new object; never resume another object’s saved upload.
    upload.start();
  });
  return { url: result.url, mediaType: result.mediaType };
}

function normalizeAudienceGender(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("brother") || normalized === "male" || normalized === "boys") {
    return "brothers";
  }
  if (normalized.includes("sister") || normalized === "female" || normalized === "girls") {
    return "sisters";
  }
  return "all";
}

function linkedEditorTrackRows(tracks: ProgramTrack[], sessions: ProgramSession[], links: ProgramTrackSession[], fallback: ProgramScheduleRow) {
  const linkedTracks = applyLinkedSessionsToTracks(tracks, sessions, links);
  return linkedTracks.map((track) => {
    const trackSchedule = parseProgramSchedule(track.schedule);
    return {
      id: track.id,
      name: track.name,
      sessions: trackSchedule.length ? trackSchedule : [fallback],
      location: track.location ?? "",
      room: track.room ?? "",
      capacity: track.capacity ? String(track.capacity) : "",
      pricingOverrideEnabled: track.pricing_override_enabled,
      priceMonthly: track.price_monthly_cents ? String(track.price_monthly_cents / 100) : "",
      priceAnnual: track.price_annual_cents ? String(track.price_annual_cents / 100) : "",
      eligibilityOverrideEnabled: Boolean(track.age_min || track.age_max || (track.gender_override && track.gender_override !== "all") || track.eligibility_comment),
      ageMin: track.age_min ? String(track.age_min) : "",
      ageMax: track.age_max ? String(track.age_max) : "",
      genderOverride: track.gender_override ?? "all",
      eligibilityComment: track.eligibility_comment ?? "",
    };
  });
}

function parseAgeRangeForEdit(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized || normalized === "all" || normalized === "all ages") {
    return { allAges: true, start: "", end: "" };
  }

  const numbers = normalized.match(/\d+/g) ?? [];
  if (normalized.endsWith("+")) return { allAges: false, start: numbers[0] ?? "", end: "" };
  if (normalized.includes("younger")) return { allAges: false, start: "", end: numbers[0] ?? "" };
  return {
    allAges: false,
    start: numbers[0] ?? "",
    end: numbers[1] ?? numbers[0] ?? "",
  };
}

type DirectorOption = Pick<Profile, "id" | "full_name" | "email" | "phone_number" | "teacher_credentials" | "teacher_whatsapp_number">;

export function TeacherProgramCreateData({ slug }: { slug: string }) {
  const [builderStep, setBuilderStep] = useState<ProgramBuilderStep>("basics");
  const [builderStatus, setBuilderStatus] = useState<ProgramBuilderStatus>(() => defaultBuilderStatus());
  const [creatorAccountType, setCreatorAccountType] = useState<string | null>(null);
  const [directorOptions, setDirectorOptions] = useState<DirectorOption[]>([]);
  const [selectedDirectorId, setSelectedDirectorId] = useState("");
  const [title, setTitle] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagRows, setTagRows] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [allAges, setAllAges] = useState(false);
  const [ageStart, setAgeStart] = useState("");
  const [ageEnd, setAgeEnd] = useState("");
  const [noRegistrationDeadline, setNoRegistrationDeadline] = useState(false);
  const [roomVisible, setRoomVisible] = useState(false);
  const [eventTimeVisible, setEventTimeVisible] = useState(false);
  const [audienceGender, setAudienceGender] = useState("all");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [offersMonthlyPayment, setOffersMonthlyPayment] = useState(true);
  const [offersAnnualPayment, setOffersAnnualPayment] = useState(false);
  const [annualPrice, setAnnualPrice] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [learningVisible, setLearningVisible] = useState(false);
  const [learningTitle, setLearningTitle] = useState("What You Will Learn");
  const [learningIntro, setLearningIntro] = useState("");
  const [learningDescriptionVisible, setLearningDescriptionVisible] = useState(false);
  const [topicsIntro, setTopicsIntro] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [policiesText, setPoliciesText] = useState("");
  const [outcomeRows, setOutcomeRows] = useState<Array<{ id: string; text: string }>>([]);
  const [faqVisible, setFaqVisible] = useState(false);
  const [faqRows, setFaqRows] = useState<ProgramEditorFaqRow[]>([]);
  const [contentSectionsVisible, setContentSectionsVisible] = useState(false);
  const [contentSectionRows, setContentSectionRows] = useState<ProgramEditorContentSectionRow[]>([]);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [mediaRows, setMediaRows] = useState<ProgramEditorMediaRow[]>([]);
  const [trackRows, setTrackRows] = useState<ProgramEditorTrackRow[]>([
    { id: crypto.randomUUID(), name: "Main Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] },
  ]);
  const [transferRules, setTransferRules] = useState<ProgramEditorTransferRule[]>([]);
  const [trackSelectionMode, setTrackSelectionMode] = useState<TrackSelectionMode>("exact");
  const [trackSelectionCount, setTrackSelectionCount] = useState(1);
  const [instructorDisplayName, setInstructorDisplayName] = useState("");
  const [instructorCredentials, setInstructorCredentials] = useState("");
  const [instructorContactPhone, setInstructorContactPhone] = useState("");
  const [coverDirectorVisibility, setCoverDirectorVisibility] = useState("name_and_photo");
  const [contactPhoneOmitted, setContactPhoneOmitted] = useState(false);
  const [contactEmailOmitted, setContactEmailOmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<EditorToastState | null>(null);
  const [missingFieldsModal, setMissingFieldsModal] = useState<{ fields: ProgramBuilderMissingField[]; allowContinue: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [thumbnailCropFile, setThumbnailCropFile] = useState<File | null>(null);
  const wizardExit = useWizardExit(slug, { tagRows, builderStatus, title, description, thumbnailUrl, allAges, ageStart, ageEnd, noRegistrationDeadline, audienceGender, price, offersMonthlyPayment, offersAnnualPayment, annualPrice, eventDate, learningVisible, learningTitle, learningIntro, topicsIntro, requirementsText, policiesText, outcomeRows, faqVisible, faqRows, contentSectionsVisible, contentSectionRows, mediaVisible, mediaRows, trackRows, transferRules, trackSelectionMode, trackSelectionCount, selectedDirectorId, instructorDisplayName, instructorCredentials, instructorContactPhone, coverDirectorVisibility, contactPhoneOmitted, contactEmailOmitted });
  // Annual pricing is compared against one year of monthly payments: 12 months for an
  // ongoing program (which bills annually, not for a known total length), or the program's
  // actual fixed duration for a fixed-length program (its annual price is a one-time lump
  // sum covering that whole length, not a yearly renewal).
  const pricingDurationMonths =
    builderStatus.durationType === "ongoing"
      ? "12"
      : builderStatus.billingDurationMonths || String(builderStatus.durationMonths || monthsBetweenDates(builderStatus.startDate, builderStatus.endDate) || "");

  useEffect(() => {
    // One RPC call instead of profile -> mosque -> [if admin] memberships -> teachers, as
    // four sequential stages. Only the fetch is collapsed here -- every bit of the form-default
    // logic below (guarding against overwriting a field the user already touched, etc.) is
    // unchanged.
    async function loadDefaults() {
      const session = await loadCachedSession();
      if (!session?.user.id) {
        return;
      }
      const supabase = createSupabaseBrowserClient();
      let data: unknown;
      try {
        data = await loadPrivateSnapshot(`wizard-defaults:${slug}:${session.user.id}`, async () => {
          const result = await supabase.rpc("get_program_create_defaults_snapshot", { p_slug: slug });
          if (result.error) throw result.error;
          return result.data;
        });
      } catch {
        return;
      }

      const snapshot = data as unknown as {
        profile: { full_name: string | null; phone_number: string | null; teacher_whatsapp_number: string | null; account_type: string | null } | null;
        mosque: Mosque | null;
        teachers: DirectorOption[];
      } | null;
      if (!snapshot) {
        return;
      }

      const profile = snapshot.profile;
      setCreatorAccountType(profile?.account_type ?? null);
      setInstructorDisplayName(profile?.full_name ?? "");
      setInstructorContactPhone(profile?.phone_number ?? profile?.teacher_whatsapp_number ?? "");
      const mosque = snapshot.mosque;
      if (mosque) {
        const mosqueAddress = typeof mosque.address === "string" && mosque.address.trim() ? mosque.address.trim() : "";
        setBuilderStatus((current) => current.location ? current : { ...current, location: mosque.name ?? titleCase(slug), room: mosqueAddress });
      }
      if (profile?.account_type === "admin") {
        const teachers = snapshot.teachers ?? [];
        setDirectorOptions(teachers);
        setSelectedDirectorId((current) => current || teachers[0]?.id || "");
      }
    }

    void loadDefaults();
  }, [slug]);

  useEffect(() => {
    if (creatorAccountType !== "admin" || !selectedDirectorId) {
      return;
    }
    const director = directorOptions.find((teacher) => teacher.id === selectedDirectorId);
    if (!director) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstructorDisplayName(director.full_name ?? "");
    setInstructorCredentials(director.teacher_credentials ?? "");
    setInstructorContactPhone(director.phone_number ?? director.teacher_whatsapp_number ?? "");
    setBuilderStatus((current) => ({ ...current, contactEmail: director.email ?? "" }));
  }, [creatorAccountType, directorOptions, selectedDirectorId]);

  function handleThumbnailFile(file: File | null) {
    if (!file) {
      return;
    }
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setThumbnailUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function addTrack() {
    setTrackRows((current) => [...current, { id: crypto.randomUUID(), name: "New Track", sessions: [{ day: "Monday", start: "18:00", end: "20:00" }] }]);
  }

  function addMedia() {
    setMediaRows((current) => [...current, { id: crypto.randomUUID(), url: "", title: "", mediaType: "photo", file: null }]);
  }

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag) {
      return;
    }
    setTagRows((current) => Array.from(new Set([...current, tag])).slice(0, 12));
    setTagDraft("");
  }

  function setCreateMediaFile(rowId: string, file: File | null) {
    if (!file) {
      return;
    }
    const validationError = validateProgramMediaFile(file);
    if (validationError) {
      setToast({ tone: "error", message: validationError });
      return;
    }
    const mediaType = programMediaType(file) ?? "photo";
    if (mediaType === "video") {
      setMediaRows((current) =>
        current.map((row) => row.id === rowId ? { ...row, file, mediaType, previewUrl: URL.createObjectURL(file) } : row),
      );
      setToast({ tone: "success", message: `Video ready to upload (${(file.size / (1024 * 1024)).toFixed(1)} MB).` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMediaRows((current) =>
        current.map((row) => row.id === rowId ? { ...row, file, mediaType, previewUrl: typeof reader.result === "string" ? reader.result : row.previewUrl } : row),
      );
    };
    reader.readAsDataURL(file);
  }

  async function uploadFile(programId: string, file: File) {
    return uploadProgramMediaFile(programId, file);
  }

  async function saveNewProgram(statusOverride?: Partial<ProgramBuilderStatus>) {
    const effectiveBuilderStatus = { ...builderStatus, ...statusOverride };
    setMessage(null);
    setToast(null);
    if (!title.trim()) {
      setToast({ tone: "error", message: "Add a public title before saving." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && !title.trim()) {
      setToast({ tone: "error", message: "Public title is required before publishing." });
      setBuilderStep("basics");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "event" && !eventDate) {
      setToast({ tone: "error", message: "Choose an event date before publishing." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.programType === "recurring" && effectiveBuilderStatus.schedulePattern === "custom_dates" && trackRows.some((track) => track.sessions.some((session) => !session.date))) {
      setToast({ tone: "error", message: "Custom session dates need a date for each meeting." });
      setBuilderStep("schedule");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft") {
      const statusValidation = validateProgramStatusCombination({
        publicationStatus: effectiveBuilderStatus.publicationStatus,
        applicationStatus: effectiveBuilderStatus.applicationStatus,
        lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
        applicationOpenAt: effectiveBuilderStatus.applicationOpenAt || null,
        applicationCloseAt: effectiveBuilderStatus.applicationCloseAt || null,
        startDate: effectiveBuilderStatus.startDate || null,
        endDate: effectiveBuilderStatus.endDate || null,
        isOngoing: effectiveBuilderStatus.durationType === "ongoing",
        billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
      });
      if (!statusValidation.valid) {
        setToast({ tone: "error", message: statusValidation.errors[0].message });
        setBuilderStep(statusValidation.errors[0].field === "endDate" ? "schedule" : "pricing");
        return;
      }
    }
    if (creatorAccountType === "admin" && !selectedDirectorId) {
      setToast({ tone: "error", message: "Choose a teacher director for this class." });
      return;
    }
    if (learningVisible && !learningTitle.trim()) {
      setToast({ tone: "error", message: "Learning section title cannot be blank." });
      return;
    }
    if (learningVisible && outcomeRows.some((row) => !row.text.trim())) {
      setToast({ tone: "error", message: "Checklist points cannot be blank." });
      return;
    }
    if (faqRows.some((row) => !row.question.trim() || !row.answer.trim())) {
      setToast({ tone: "error", message: "FAQ questions and answers cannot be blank." });
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && trackRows.some((track) => !track.name.trim() || track.sessions.some((session) => session.end <= session.start))) {
      setToast({ tone: "error", message: "Each track needs a name and an end time after start time." });
      setBuilderStep("schedule");
      return;
    }
    const eventPayment = effectiveBuilderStatus.programType === "event";
    const savedOffersMonthlyPayment = eventPayment ? false : offersMonthlyPayment;
    const savedOffersAnnualPayment = eventPayment ? true : offersAnnualPayment;
    const usesPerTrackPricing =
      effectiveBuilderStatus.paymentKind === "tareeqah" &&
      effectiveBuilderStatus.programType === "recurring" &&
      trackRows.some((track) => track.pricingOverrideEnabled);
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !savedOffersMonthlyPayment && !savedOffersAnnualPayment) {
      setToast({ tone: "error", message: "Choose at least one payment option before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment && Number(price || "0") <= 0) {
      setToast({ tone: "error", message: "Add a valid monthly price before publishing." });
      setBuilderStep("pricing");
      return;
    }
    if (effectiveBuilderStatus.publicationStatus !== "draft" && effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment && Number(annualPrice || "0") <= 0) {
      setToast({
        tone: "error",
        message: effectiveBuilderStatus.programType === "event"
          ? "Add a valid one-time price before publishing."
          : effectiveBuilderStatus.durationType === "ongoing"
            ? "Add a valid annual subscription price before publishing."
            : "Add a valid Pay in Full price before publishing.",
      });
      setBuilderStep("pricing");
      return;
    }
    if (
      effectiveBuilderStatus.publicationStatus !== "draft" &&
      usesPerTrackPricing &&
      trackRows.some((track) =>
        (savedOffersMonthlyPayment && Number(track.priceMonthly || "0") <= 0) ||
        (savedOffersAnnualPayment && Number(track.priceAnnual || "0") <= 0)
      )
    ) {
      setToast({ tone: "error", message: "Add valid prices for every track before publishing." });
      setBuilderStep("pricing");
      return;
    }
    const savedTrackSelectionMode: TrackSelectionMode = "exact";
    const savedTrackSelectionCount = 1;

    setBusy(true);
    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) {
        throw new Error("Log in required.");
      }
      const schedule = trackRows[0]?.sessions as unknown as Json;
      const response = await fetch("/api/programs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          mosqueSlug: slug,
          internalName: null,
          title: title.trim(),
          summary: effectiveBuilderStatus.summary.trim() || null,
          description: description.trim() || null,
          category: tagRows.join(", ") || null,
          tags: tagRows,
          programType: effectiveBuilderStatus.programType,
          publicationStatus: effectiveBuilderStatus.publicationStatus,
          applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
          applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
          applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
          lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
          applicationMode: effectiveBuilderStatus.applicationMode,
          acceptingApplications: effectiveBuilderStatus.acceptingApplications,
          waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
          capacityBehavior: effectiveBuilderStatus.capacityBehavior,
          defaultCapacity: null,
          durationType: effectiveBuilderStatus.durationType,
          startNow: effectiveBuilderStatus.startNow,
          startDate: effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
          endDate: effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
          durationMonths: effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
          schedulePattern: effectiveBuilderStatus.schedulePattern,
          registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
          location: effectiveBuilderStatus.location.trim() || null,
          room: effectiveBuilderStatus.room.trim() || null,
          roomArea: effectiveBuilderStatus.roomArea.trim() || null,
          paymentKind: effectiveBuilderStatus.paymentKind,
          billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
          monthlyBillingAnchor: effectiveBuilderStatus.monthlyBillingAnchor,
          billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
          billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : 10,
          allowCustomPrices: true,
          allowWaivedPayments: true,
          manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
          financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
          receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
          taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
          trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
          trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
          contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
          contactPhone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
          coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
          coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
          thumbnailUrl: thumbnailFile ? null : thumbnailUrl.trim() || null,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: savedOffersMonthlyPayment,
          offersAnnualPayment: savedOffersAnnualPayment,
          usesPerTrackPricing,
          priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule,
          scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          trackSelectionMode: savedTrackSelectionMode,
          trackSelectionCount: savedTrackSelectionCount,
          directorProfileId: creatorAccountType === "admin" ? selectedDirectorId : null,
        }),
      });
      const result = (await response.json()) as { program?: Program; error?: string };
      if (!response.ok || !result.program) {
        throw new Error(result.error ?? "Could not create class.");
      }

      const program = result.program;
      let nextThumbnailUrl = thumbnailUrl;
      if (thumbnailFile) {
        nextThumbnailUrl = (await uploadFile(program.id, thumbnailFile)).url;
        const thumbnailResponse = await fetch(`/api/programs/${program.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            internalName: null,
            title: program.title,
            summary: effectiveBuilderStatus.summary.trim() || null,
            description: program.description,
            category: tagRows.join(", ") || null,
            tags: tagRows,
            programType: effectiveBuilderStatus.programType,
            publicationStatus: effectiveBuilderStatus.publicationStatus,
            applicationStatus: effectiveBuilderStatus.acceptingApplications ? effectiveBuilderStatus.applicationStatus : "not_accepting",
            applicationOpenAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationOpenAt || null : null,
            applicationCloseAt: effectiveBuilderStatus.applicationStatus === "opens_later" ? effectiveBuilderStatus.applicationCloseAt || null : null,
            lifecycleStatus: effectiveBuilderStatus.lifecycleStatus,
            applicationMode: effectiveBuilderStatus.applicationMode,
            acceptingApplications: effectiveBuilderStatus.acceptingApplications,
            waitlistEnabled: effectiveBuilderStatus.waitlistEnabled,
            capacityBehavior: effectiveBuilderStatus.capacityBehavior,
            defaultCapacity: null,
            durationType: effectiveBuilderStatus.durationType,
            startNow: effectiveBuilderStatus.startNow,
            startDate: effectiveBuilderStatus.startNow ? null : effectiveBuilderStatus.startDate || null,
            endDate: effectiveBuilderStatus.durationType === "fixed_months" ? effectiveBuilderStatus.endDate || null : null,
            durationMonths: effectiveBuilderStatus.durationType === "fixed_months" ? monthsBetweenDates(effectiveBuilderStatus.startDate, effectiveBuilderStatus.endDate) : null,
            schedulePattern: effectiveBuilderStatus.schedulePattern,
            registrationDeadlineAt: noRegistrationDeadline ? null : effectiveBuilderStatus.registrationDeadline || null,
            location: effectiveBuilderStatus.location.trim() || null,
            room: effectiveBuilderStatus.room.trim() || null,
            roomArea: effectiveBuilderStatus.roomArea.trim() || null,
            paymentKind: effectiveBuilderStatus.paymentKind,
            billingStartBehavior: effectiveBuilderStatus.billingStartBehavior,
            monthlyBillingAnchor: effectiveBuilderStatus.monthlyBillingAnchor,
            billingEndBehavior: effectiveBuilderStatus.billingEndBehavior,
            billingDurationMonths: effectiveBuilderStatus.billingDurationMonths ? Number(effectiveBuilderStatus.billingDurationMonths) : 10,
            allowCustomPrices: true,
            allowWaivedPayments: true,
            manualPaymentNote: effectiveBuilderStatus.manualPaymentNote.trim() || null,
            financialAssistanceNote: effectiveBuilderStatus.financialAssistanceNote.trim() || null,
            receiptNote: effectiveBuilderStatus.receiptNote.trim() || null,
            taxReceiptPolicy: effectiveBuilderStatus.taxReceiptPolicy,
            trackSwitchPolicy: effectiveBuilderStatus.trackSwitchPolicy,
            trackSwitchAllowAll: effectiveBuilderStatus.trackSwitchAllowAll,
            contactEmail: contactEmailOmitted ? "" : effectiveBuilderStatus.contactEmail.trim() || null,
            contactPhone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
            coverPriceLabelEnabled: effectiveBuilderStatus.coverPriceLabelEnabled,
            coverPriceLabel: effectiveBuilderStatus.coverPriceLabel.trim() || null,
            thumbnailUrl: nextThumbnailUrl,
            audienceGender: program.audience_gender,
            ageRangeText: program.age_range_text,
            isPaid: effectiveBuilderStatus.paymentKind === "tareeqah",
            offersMonthlyPayment: savedOffersMonthlyPayment,
            offersAnnualPayment: savedOffersAnnualPayment,
            usesPerTrackPricing,
            priceMonthlyCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersMonthlyPayment ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
            priceAnnualCents: effectiveBuilderStatus.paymentKind === "tareeqah" && !usesPerTrackPricing && savedOffersAnnualPayment ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
            schedule: program.schedule,
            scheduleTimezone: program.schedule_timezone,
            scheduleNotes: program.schedule_notes,
            trackSelectionMode: savedTrackSelectionMode,
            trackSelectionCount: savedTrackSelectionCount,
          }),
        });
        const thumbnailResult = (await thumbnailResponse.json()) as { error?: string };
        if (!thumbnailResponse.ok) {
          throw new Error(thumbnailResult.error ?? "Could not save thumbnail.");
        }
      }

      const supabase = createSupabaseBrowserClient();
      const { error: detailsError } = await supabase.from("program_details").upsert({
        program_id: program.id,
        learning_title: learningVisible ? learningTitle.trim() : "What You Will Learn",
        learning_intro: learningVisible ? learningIntro.trim() || null : null,
        topics_intro: topicsIntro.trim() || null,
        requirements_text: requirementsText.trim() || null,
        policies_text: policiesText.trim() || null,
        instructor_display_name: instructorDisplayName.trim() || null,
        instructor_credentials: instructorCredentials.trim() || null,
        instructor_contact_phone: contactPhoneOmitted ? "" : instructorContactPhone.trim() || null,
        cover_director_visibility: coverDirectorVisibility,
      }, { onConflict: "program_id" });
      if (detailsError) {
        throw new Error(friendlyErrorMessage(detailsError, "Could not save class details."));
      }

      if (learningVisible && outcomeRows.length) {
        const { error: outcomesError } = await supabase.from("program_outcomes").insert(outcomeRows.map((row, index) => ({ program_id: program.id, sort_order: index + 1, text: row.text.trim() })));
        if (outcomesError) {
          throw new Error(friendlyErrorMessage(outcomesError, "Could not save learning outcomes."));
        }
      }
      if (faqRows.length) {
        const { error: faqsError } = await supabase.from("program_faqs").insert(
          faqRows.map((row, index) => ({
            program_id: program.id,
            sort_order: index + 1,
            question: row.question.trim(),
            answer: row.answer.trim(),
          })),
        );
        if (faqsError) {
          throw new Error(friendlyErrorMessage(faqsError, "Could not save FAQs."));
        }
      }
      if (contentSectionRows.length) {
        const { error: contentSectionsError } = await supabase.from("program_content_sections").insert(
          contentSectionRows.map((row, index) => ({
            program_id: program.id,
            sort_order: index + 1,
            title: row.title.trim(),
            description: row.description.trim() || null,
            duration_text: row.durationText.trim() || null,
          })),
        );
        if (contentSectionsError) {
          throw new Error(friendlyErrorMessage(contentSectionsError, "Could not save class schedule."));
        }
      }
      const { data: insertedTracks, error: tracksError } = await supabase
        .from("program_tracks")
        .insert(trackRows.map((track, index) => ({
          program_id: program.id,
          sort_order: index + 1,
          name: track.name.trim(),
          description: null,
          schedule: track.sessions as unknown as Json,
          location: track.location?.trim() || effectiveBuilderStatus.location.trim() || null,
          room: track.room?.trim() || effectiveBuilderStatus.room.trim() || null,
          capacity: track.capacity ? Number(track.capacity) : null,
          pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
          price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
          price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
          ...trackEligibilityOverrideColumns(track),
          is_active: true,
        })))
        .select("id, sort_order");
      if (tracksError) {
        throw new Error(friendlyErrorMessage(tracksError, "Could not save tracks."));
      }
      await saveCanonicalProgramSessions(supabase, program.id, insertedTracks ?? [], trackRows, {
        programType: effectiveBuilderStatus.programType,
        schedulePattern: effectiveBuilderStatus.schedulePattern,
        eventDate,
        title: program.title,
        location: effectiveBuilderStatus.location.trim() || null,
        room: effectiveBuilderStatus.room.trim() || null,
      });
      await saveTrackTransferRules(supabase, program.id, insertedTracks ?? [], trackRows, transferRules);

      const uploadedMedia = [];
      for (const [index, row] of mediaRows.entries()) {
        if (!row.file) {
          continue;
        }
        const uploaded = await uploadFile(program.id, row.file);
        uploadedMedia.push({ program_id: program.id, sort_order: index + 1, media_type: uploaded.mediaType, url: uploaded.url, thumbnail_url: uploaded.mediaType === "photo" ? uploaded.url : null, title: row.title.trim() || null, short_label: row.title.trim() || null });
      }
      if (uploadedMedia.length) {
        const { error: mediaError } = await supabase.from("program_media").insert(uploadedMedia);
        if (mediaError) {
          throw new Error(friendlyErrorMessage(mediaError, "Could not save class photos."));
        }
      }

      invalidateProgramCaches(slug, program.id);
      window.dispatchEvent(new Event("tareeqah:programs-changed"));
      queueEditorToast({ tone: "success", message: "Class created successfully." });
      window.location.href = creatorAccountType === "admin" ? `/m/${slug}/admin/programs` : `/m/${slug}/teacher/classes`;
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Could not create class." });
      setBusy(false);
    }
  }

  // Billing-cycle count is purely derived from the date range for a fixed-duration program —
  // not directly editable, so it always tracks the current start/end dates.
  useEffect(() => {
    if (builderStatus.durationType !== "fixed_months") {
      return;
    }
    const estimate = estimateBillingMonths(builderStatus.startDate, builderStatus.endDate);
    if (estimate == null) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuilderStatus((current) => (current.billingDurationMonths === String(estimate) ? current : { ...current, billingDurationMonths: String(estimate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderStatus.durationType, builderStatus.startDate, builderStatus.endDate]);

  const billingMonthsFieldVisible =
    builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" && offersMonthlyPayment && builderStatus.durationType === "fixed_months" && builderStatus.billingEndBehavior === "fixed_months";

  if (previewOpen) {
    return (
      <ProgramEditorPreview
        program={buildProgramPreview({
          id: "new",
          title: title || "New Class",
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid,
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
        })}
        learningTitle={learningVisible ? learningTitle : ""}
        learningIntro={learningVisible ? learningIntro : ""}
        outcomes={learningVisible ? outcomeRows.map((row) => row.text).filter((text) => text.trim()) : []}
        faqRows={faqRows}
        mediaRows={mediaRows}
        trackRows={trackRows}
        instructorDisplayName={instructorDisplayName}
        instructorCredentials={instructorCredentials}
        instructorContactPhone={instructorContactPhone}
        onBack={() => setPreviewOpen(false)}
      />
    );
  }

  function goToPreviousStep() {
    if (builderStep === "basics") { wizardExit.requestExit(); return; }
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.max(0, index - 1)]?.id ?? "basics");
    scrollBuilderToTop();
  }

  function getMissingBuilderFields() {
    return computeProgramBuilderMissingFields({
      title,
      programType: builderStatus.programType,
      location: builderStatus.location,
      room: builderStatus.room,
      allAges,
      ageStart,
      ageEnd,
      learningVisible,
      learningTitle,
      outcomeRows,
      faqVisible,
      faqRows,
      contentSectionsVisible,
      contentSectionRows,
      contactPhone: instructorContactPhone,
      contactPhoneOmitted,
      contactEmail: builderStatus.contactEmail,
      contactEmailOmitted,
      durationType: builderStatus.durationType,
      endDate: builderStatus.endDate,
      startNow: builderStatus.startNow,
      startDate: builderStatus.startDate,
      eventDate,
      schedulePattern: builderStatus.schedulePattern,
      noRegistrationDeadline,
      registrationDeadline: builderStatus.registrationDeadline,
      trackRows,
      paymentKind: builderStatus.paymentKind,
      offersMonthlyPayment,
      price,
      offersAnnualPayment,
      annualPrice,
      coverPriceLabelEnabled: builderStatus.coverPriceLabelEnabled,
      coverPriceLabel: builderStatus.coverPriceLabel,
    });
  }

  function advanceStepAnyway() {
    setMissingFieldsModal(null);
    const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
    setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
    scrollBuilderToTop();
  }

  function handleContinueOrPublishClick() {
    const missing = getMissingBuilderFields();
    if (builderStep !== "review") {
      const missingOnThisStep = missing.filter((field) => field.step === builderStep);
      if (missingOnThisStep.length) {
        setMissingFieldsModal({ fields: missingOnThisStep, allowContinue: true });
        return;
      }
      const index = programBuilderSteps.findIndex((step) => step.id === builderStep);
      setBuilderStep(programBuilderSteps[Math.min(programBuilderSteps.length - 1, index + 1)]?.id ?? "review");
      scrollBuilderToTop();
      return;
    }
    if (missing.length) {
      setMissingFieldsModal({ fields: missing, allowContinue: false });
      return;
    }
    const publishOverride = { publicationStatus: builderStatus.publicationStatus === "hidden" ? "hidden" : "published" } as const;
    setBuilderStatus((current) => ({ ...current, ...publishOverride, applicationStatus: current.acceptingApplications ? current.applicationStatus : "not_accepting" }));
    void saveNewProgram(publishOverride);
  }

  return (
    <div className="space-y-5 bg-[var(--workspace)] p-4 pb-40" onPointerDownCapture={wizardExit.capture} onKeyDownCapture={wizardExit.capture} onChangeCapture={wizardExit.capture}>
      {wizardExit.dialog}
      <EditorToast toast={toast} onClose={() => setToast(null)} />
      {missingFieldsModal ? (
        <MissingFieldsModal
          missingFields={missingFieldsModal.fields}
          allowContinue={missingFieldsModal.allowContinue}
          onContinueAnyway={advanceStepAnyway}
          onClose={() => setMissingFieldsModal(null)}
        />
      ) : null}
      <ProgramBuilderStepper activeStep={builderStep} />

      <h1 className="px-1 text-2xl font-semibold text-[#26323A]">{programBuilderSteps.find((step) => step.id === builderStep)?.label}</h1>

      {builderStep === "schedule" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <ProgramTimingFields
            builderStatus={builderStatus}
            setBuilderStatus={setBuilderStatus}
            eventDate={eventDate}
            setEventDate={setEventDate}
            eventTimeVisible={eventTimeVisible}
            setEventTimeVisible={setEventTimeVisible}
            noRegistrationDeadline={noRegistrationDeadline}
            setNoRegistrationDeadline={setNoRegistrationDeadline}
          />
        </section>
      ) : null}
      {builderStep === "pricing" ? (
        <section className="rounded-2xl border border-[#DDE7EA] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("How payments are handled", true)}</span>
              <select value={builderStatus.paymentKind} onChange={(event) => { const value = event.target.value as ProgramBuilderStatus["paymentKind"]; setBuilderStatus((current) => ({ ...current, paymentKind: value })); setIsPaid(value === "tareeqah"); }} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="free">Free</option>
                <option value="tareeqah">Paid through Madrasa</option>
              </select>
            </label>
            {billingMonthsFieldVisible ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Billing months</span>
                <BillingMonthsHint
                  startDate={builderStatus.startDate}
                  endDate={builderStatus.endDate}
                  chosenMonths={builderStatus.billingDurationMonths}
                />
              </label>
            ) : builderStatus.paymentKind === "tareeqah" && builderStatus.durationType === "ongoing" && builderStatus.programType !== "event" && (offersMonthlyPayment || offersAnnualPayment) ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Number of billing months</span>
                <input value="Ongoing — billed until cancelled" disabled className="h-10 w-full rounded-[8px] border border-[#D6DCE0] bg-[#F1F4F5] px-3 text-sm font-medium text-[#8A949B] outline-none" />
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" && offersMonthlyPayment && builderStatus.programType !== "event" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Monthly billing date</span>
                <select value={builderStatus.monthlyBillingAnchor} onChange={(event) => setBuilderStatus((current) => ({ ...current, monthlyBillingAnchor: event.target.value as ProgramBuilderStatus["monthlyBillingAnchor"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A]">
                  <option value="signup_date">Each family’s signup date</option>
                  <option value="first_of_month">First of every month</option>
                </select>
                <p className="mt-1 text-xs text-[#6B747B]">For first-of-month billing, the first payment is prorated. Existing subscriptions keep their current dates.</p>
              </label>
            ) : null}
            {builderStatus.paymentKind === "tareeqah" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">Tax receipt policy</span>
                <select
                  value={builderStatus.taxReceiptPolicy}
                  onChange={(event) => setBuilderStatus((current) => ({ ...current, taxReceiptPolicy: event.target.value as ProgramBuilderStatus["taxReceiptPolicy"] }))}
                  className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]"
                >
                  <option value="not_applicable">Not a tax-deductible donation</option>
                  <option value="admin_review_required">May be eligible - admin reviews each payment</option>
                  <option value="eligible_confirmed">Eligible as a charitable donation (confirmed)</option>
                </select>
              </label>
            ) : null}
            <ProgramApplicationAvailabilityFields builderStatus={builderStatus} setBuilderStatus={setBuilderStatus} />
          </div>
        </section>
      ) : null}

      {builderStep === "basics" ? (
        <section className="overflow-hidden rounded-2xl border border-[#E1E8EC] bg-white">
          <div className="relative">
            <ProgramHero program={{ id: "new", mosque_id: "", teacher_profile_id: null, director_profile_id: null, ...defaultProgramBuilderColumns(), title: title || "New Class", description: description || null, is_active: true, is_paid: builderStatus.paymentKind === "tareeqah", offers_monthly_payment: offersMonthlyPayment, offers_annual_payment: offersAnnualPayment, thumbnail_url: thumbnailUrl || null, price_monthly_cents: null, price_annual_cents: null, stripe_product_id: null, stripe_price_id: null, stripe_annual_price_id: null, audience_gender: audienceGender, age_range_text: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd), schedule: null, schedule_timezone: null, schedule_notes: null, track_selection_mode: trackSelectionMode, track_selection_count: trackSelectionCount, tags: tagRows, created_at: "", updated_at: "" }} />
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (file) {
                  const validationError = validateProgramMediaFile(file);
                  if (validationError || programMediaType(file) !== "photo") { setToast({ tone: "error", message: validationError || "Choose a photo for the class cover." }); return; }
                  setThumbnailCropFile(file);
                }
              }}
            />
            <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#26323A] shadow-lg" aria-label="Replace thumbnail">
              <PhotoIcon />
            </button>
          </div>
          {thumbnailCropFile ? (
            <ImageCropModal
              file={thumbnailCropFile}
              title="Crop thumbnail"
              aspectRatio={4 / 3}
              outputWidth={1200}
              outputHeight={900}
              onCancel={() => setThumbnailCropFile(null)}
              onConfirm={(croppedFile) => {
                handleThumbnailFile(croppedFile);
                setThumbnailCropFile(null);
              }}
            />
          ) : null}
          <div className="space-y-3 p-4">
            <EditBox label="Public name" required value={title} onChange={setTitle} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B747B]">{formatRequiredLabel("Class type", true)}</span>
              <select value={builderStatus.programType} onChange={(event) => setBuilderStatus((current) => ({ ...current, programType: event.target.value as ProgramBuilderStatus["programType"] }))} className="h-10 w-full rounded-[8px] border border-[#B9C3C8] bg-white px-3 text-sm font-medium text-[#26323A] outline-none focus:border-[#2F8FB3]">
                <option value="recurring">Recurring program</option>
                <option value="event">One-time event</option>
              </select>
            </label>
            <p className="-mt-2 text-xs leading-5 text-[#6B747B]">Public title is what parents and students see.</p>
            {summaryVisible || builderStatus.summary.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Short summary / tagline" value={builderStatus.summary} onChange={(value) => setBuilderStatus((current) => ({ ...current, summary: value }))} />
                <button type="button" onClick={() => { setSummaryVisible(false); setBuilderStatus((current) => ({ ...current, summary: "" })); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove summary
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSummaryVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add short summary / tagline
              </button>
            )}
            {descriptionVisible || description.trim() ? (
              <div className="space-y-1.5">
                <EditBox label="Description" value={description} onChange={setDescription} multiline />
                <button type="button" onClick={() => { setDescriptionVisible(false); setDescription(""); }} className="justify-self-start text-sm font-semibold text-[#C0392B]">
                  Remove description
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDescriptionVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                Add description
              </button>
            )}
            <div className="grid gap-3">
              <EditBox label="Location name" required value={builderStatus.location} onChange={(value) => setBuilderStatus((current) => ({ ...current, location: value }))} />
              <EditBox label="Location address" required value={builderStatus.room} onChange={(value) => setBuilderStatus((current) => ({ ...current, room: value }))} />
              {roomVisible || builderStatus.roomArea.trim() ? (
                <div className="space-y-1.5">
                  <EditBox label="Room / Area" value={builderStatus.roomArea} onChange={(value) => setBuilderStatus((current) => ({ ...current, roomArea: value }))} />
                  <button
                    type="button"
                    onClick={() => {
                      setRoomVisible(false);
                      setBuilderStatus((current) => ({ ...current, roomArea: "" }));
                    }}
                    className="justify-self-start text-sm font-semibold text-[#C0392B]"
                  >
                    Remove Room / Area
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setRoomVisible(true)} className="justify-self-start text-sm font-semibold text-[#2F8FB3]">
                  Add Room / Area
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {builderStep === "basics" && creatorAccountType === "admin" ? (
        <section className="space-y-2 bg-white px-4 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B747B]" htmlFor="edit-program-director">Class Director</label>
          <select id="edit-program-director" value={selectedDirectorId} onChange={(event) => setSelectedDirectorId(event.target.value)} className="h-12 w-full rounded-[10px] border border-[#B9C3C8] bg-white px-3 text-sm font-semibold text-[#26323A] outline-none focus:border-[#2F8FB3]">
            <option value="">Choose director</option>
            {directorOptions.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.email || "Unnamed teacher"}</option>)}
          </select>
        </section>
      ) : null}

      <ProgramEditorFields
        masjidLabel={slug.charAt(0).toUpperCase() + slug.slice(1)}
        builderStatus={builderStatus}
        setBuilderStatus={setBuilderStatus}
        activeStep={builderStep}
        programType={builderStatus.programType}
        schedulePattern={builderStatus.schedulePattern}
        previewProgram={buildProgramPreview({
          id: "new",
          title: title || "New Class",
          description,
          thumbnailUrl,
          audienceGender,
          ageRangeText: allAges ? null : formatAgeRangeForSave(ageStart, ageEnd),
          isPaid: builderStatus.paymentKind === "tareeqah",
          offersMonthlyPayment: builderStatus.programType === "event" ? false : offersMonthlyPayment,
          offersAnnualPayment: builderStatus.programType === "event" ? true : offersAnnualPayment,
          priceMonthlyCents: builderStatus.paymentKind === "tareeqah" && builderStatus.programType !== "event" ? Math.max(0, Math.round(Number(price || "0") * 100)) : null,
          priceAnnualCents: builderStatus.paymentKind === "tareeqah" ? Math.max(0, Math.round(Number(annualPrice || "0") * 100)) : null,
          schedule: trackRows[0]?.sessions as unknown as Json,
          trackSelectionMode,
          trackSelectionCount,
        })}
        eventDate={eventDate}
        setEventDate={setEventDate}
        eventTimeVisible={eventTimeVisible}
        setEventTimeVisible={setEventTimeVisible}
        learningVisible={learningVisible}
        setLearningVisible={setLearningVisible}
        learningTitle={learningTitle}
        setLearningTitle={setLearningTitle}
        learningIntro={learningIntro}
        setLearningIntro={setLearningIntro}
        learningDescriptionVisible={learningDescriptionVisible}
        setLearningDescriptionVisible={setLearningDescriptionVisible}
        topicsIntro={topicsIntro}
        setTopicsIntro={setTopicsIntro}
        requirementsText={requirementsText}
        setRequirementsText={setRequirementsText}
        policiesText={policiesText}
        setPoliciesText={setPoliciesText}
        outcomeRows={outcomeRows}
        setOutcomeRows={setOutcomeRows}
        faqVisible={faqVisible}
        setFaqVisible={setFaqVisible}
        faqRows={faqRows}
        setFaqRows={setFaqRows}
        contentSectionsVisible={contentSectionsVisible}
        setContentSectionsVisible={setContentSectionsVisible}
        contentSectionRows={contentSectionRows}
        setContentSectionRows={setContentSectionRows}
        mediaVisible={mediaVisible}
        setMediaVisible={setMediaVisible}
        mediaRows={mediaRows}
        setMediaRows={setMediaRows}
        onMediaFile={setCreateMediaFile}
        addMedia={addMedia}
        trackRows={trackRows}
        setTrackRows={setTrackRows}
        addTrack={addTrack}
        transferRules={transferRules}
        setTransferRules={setTransferRules}
        trackSelectionMode={trackSelectionMode}
        setTrackSelectionMode={setTrackSelectionMode}
        trackSelectionCount={trackSelectionCount}
        setTrackSelectionCount={setTrackSelectionCount}
        allAges={allAges}
        setAllAges={setAllAges}
        ageStart={ageStart}
        setAgeStart={setAgeStart}
        ageEnd={ageEnd}
        setAgeEnd={setAgeEnd}
        audienceGender={audienceGender}
        setAudienceGender={setAudienceGender}
        paymentKind={builderStatus.paymentKind}
        durationMonthsForPricing={pricingDurationMonths}
        isPaid={builderStatus.paymentKind === "tareeqah"}
        setIsPaid={setIsPaid}
        offersMonthlyPayment={offersMonthlyPayment}
        setOffersMonthlyPayment={setOffersMonthlyPayment}
        offersAnnualPayment={offersAnnualPayment}
        setOffersAnnualPayment={setOffersAnnualPayment}
        price={price}
        setPrice={setPrice}
        annualPrice={annualPrice}
        setAnnualPrice={setAnnualPrice}
        instructorDisplayName={instructorDisplayName}
        setInstructorDisplayName={setInstructorDisplayName}
        instructorCredentials={instructorCredentials}
        setInstructorCredentials={setInstructorCredentials}
        instructorContactPhone={instructorContactPhone}
        setInstructorContactPhone={setInstructorContactPhone}
        coverDirectorVisibility={coverDirectorVisibility}
        setCoverDirectorVisibility={setCoverDirectorVisibility}
        contactEmail={builderStatus.contactEmail}
        setContactEmail={(value) => setBuilderStatus((current) => ({ ...current, contactEmail: value }))}
        contactPhoneOmitted={contactPhoneOmitted}
        setContactPhoneOmitted={setContactPhoneOmitted}
        contactEmailOmitted={contactEmailOmitted}
        setContactEmailOmitted={setContactEmailOmitted}
        coverPriceLabelEnabled={builderStatus.coverPriceLabelEnabled}
        setCoverPriceLabelEnabled={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabelEnabled: value }))}
        coverPriceLabel={builderStatus.coverPriceLabel}
        setCoverPriceLabel={(value) => setBuilderStatus((current) => ({ ...current, coverPriceLabel: value }))}
      />

      <ProgramBuilderActionBar busy={busy} builderStep={builderStep} onBack={goToPreviousStep} onContinueOrPublish={handleContinueOrPublishClick} sticky message={message} />
    </div>
  );
}

function ProgramEditorPreview({
  program,
  learningTitle,
  learningIntro,
  outcomes,
  faqRows,
  mediaRows,
  trackRows,
  instructorDisplayName,
  instructorCredentials,
  instructorContactPhone,
  onBack,
}: {
  program: Program;
  learningTitle: string;
  learningIntro: string;
  outcomes: string[];
  faqRows: ProgramEditorFaqRow[];
  mediaRows: Array<{ id: string; url: string; title: string; mediaType: string; previewUrl?: string }>;
  trackRows: ProgramEditorTrackRow[];
  instructorDisplayName: string;
  instructorCredentials: string;
  instructorContactPhone: string;
  onBack: () => void;
}) {
  const age = formatAgeRange(program.age_range_text);
  const gender = formatGender(program.audience_gender);
  const price = formatPrice(program.price_monthly_cents);
  const previewTracks = trackRows.map((track, index): ProgramTrack => ({
    id: track.id,
    program_id: program.id,
    name: track.name.trim() || `Track ${index + 1}`,
    description: null,
    schedule: track.sessions as unknown as Json,
    ...defaultProgramTrackBuilderColumns(),
    pricing_override_enabled: Boolean(track.pricingOverrideEnabled),
    price_monthly_cents: track.pricingOverrideEnabled && track.priceMonthly ? Math.max(0, Math.round(Number(track.priceMonthly) * 100)) : null,
    price_annual_cents: track.pricingOverrideEnabled && track.priceAnnual ? Math.max(0, Math.round(Number(track.priceAnnual) * 100)) : null,
    ...trackEligibilityOverrideColumns(track),
    sort_order: index + 1,
    is_active: true,
    created_at: "",
    updated_at: "",
  }));
  const visibleMediaRows = mediaRows.filter((row) => row.previewUrl || row.url);

  return (
    <div className="fixed inset-0 z-[9000] overflow-y-auto bg-white">
      <button
        type="button"
        onClick={onBack}
        className="fixed left-[max(16px,calc(50%-244px))] top-3 z-[9010] inline-flex min-h-10 items-center rounded-full bg-[#26323A] px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(38,50,58,0.18)] transition active:scale-95 active:bg-[#1B2429]"
      >
        Back to Editor
      </button>

      <div className="mx-auto min-h-full max-w-[520px] space-y-5 bg-white p-4 pb-32 pt-16">
      <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_30px_rgba(38,50,58,0.08)]">
        <ProgramHero program={program} />
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#17624F]">
            <span>{age}</span>
            <span aria-hidden>•</span>
            <span>{gender}</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-8 text-[#26323A]">{program.title}</h1>
            {program.description?.trim() ? <p className="mt-2 text-sm leading-7 text-[#52616A]">{program.description.trim()}</p> : null}
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-[#C8DCE2] bg-white p-4 shadow-[0_14px_34px_rgba(38,50,58,0.10)]">
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold text-[#26323A]">{price}</p>
          {program.is_paid ? <span className="text-xs text-[#6B747B]">monthly</span> : null}
        </div>
        {previewTracks.length ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B747B]">Choose schedule</p>
              <p className="text-right text-[11px] font-medium text-[#7B858C]">{trackSelectionRuleText(program, previewTracks.length)}</p>
            </div>
            {previewTracks.map((track) => {
              const schedule = scheduleSummary(track.schedule, null);
              return (
                <div key={track.id} className="rounded-[14px] border border-[#D6DCE0] bg-[#F8FBFC] p-3 text-left">
                  <span className="block text-sm font-semibold text-[#26323A]">{track.name}</span>
                  <span className="mt-1 block text-xs font-medium text-[#17624F]">{schedule.full}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#248B72] px-4 text-sm font-semibold text-white opacity-70 md:w-auto md:px-10">
          Request Enrollment
        </button>
        <dl className="mt-5 divide-y divide-[#E6ECEF] text-sm">
          <SidebarFact label="Age" value={age} />
          <SidebarFact label="Audience" value={gender} />
          <SidebarFact label="Schedule" value={previewTracks[0] ? scheduleSummary(previewTracks[0].schedule, null).full : scheduleSummary(program.schedule, null).full} />
          <SidebarFact label="Teacher" value={instructorDisplayName.trim() || "Teacher to be announced"} />
          <SidebarFact label="Status" value="Open" />
        </dl>
      </aside>

      {(learningIntro.trim() || outcomes.length) && learningTitle.trim() ? (
        <DetailSection title={learningTitle.trim()}>
          {learningIntro.trim() ? <p className="text-sm leading-7 text-[#52616A]">{learningIntro}</p> : null}
          {outcomes.length ? (
            <div className={cn("grid gap-3 sm:grid-cols-2", learningIntro.trim() ? "mt-5" : "")}>
              {outcomes.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-[#26323A]">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E3F5EE] text-xs font-semibold text-[#228763]">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      {visibleMediaRows.length ? (
        <DetailSection title="Class Media">
          <div className="space-y-3">
            {visibleMediaRows.map((row) => (
              <div key={row.id} className="overflow-hidden rounded-[16px] border border-[#E6ECEF]">
                <div className="relative h-40 bg-[#E7EEF2]">
                  <Image src={row.previewUrl || row.url} alt="" fill className="object-cover" sizes="360px" />
                </div>
                {row.title.trim() ? <p className="p-3 text-sm font-semibold text-[#26323A]">{row.title}</p> : null}
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="Instructor">
        <h2 className="text-base font-semibold text-[#26323A]">{instructorDisplayName.trim() || "Teacher to be announced"}</h2>
        {instructorCredentials.trim() ? <p className="mt-3 text-sm leading-7 text-[#52616A]">{instructorCredentials}</p> : null}
        {instructorContactPhone.trim() ? <p className="mt-3 text-sm font-medium text-[#17624F]">{instructorContactPhone}</p> : null}
      </DetailSection>

      {faqRows.length ? (
        <ProgramFaqSection
          faqs={faqRows.map((row, index) => ({
            id: row.id || `preview-faq-${index}`,
            question: row.question.trim() || `Question ${index + 1}`,
            answer: row.answer.trim() || "Add an answer for this FAQ.",
          }))}
        />
      ) : null}
      </div>
    </div>
  );
}

function SidebarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-[#6B747B]">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-[#26323A]">{value}</dd>
    </div>
  );
}
