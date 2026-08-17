import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { requireProgramManageAccess } from "@/lib/programs/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type ExportType = "students" | "applications" | "finance_summary" | "payment_history";
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Enrollment = Database["public"]["Tables"]["enrollments"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramPayment = Database["public"]["Tables"]["program_payments"]["Row"];
type ProgramPaymentTerms = Database["public"]["Tables"]["program_payment_terms"]["Row"];
type ProgramSubscription = Database["public"]["Tables"]["program_subscriptions"]["Row"];
type ProgramTrack = Database["public"]["Tables"]["program_tracks"]["Row"];

const exportTypes = new Set<ExportType>(["students", "applications", "finance_summary", "payment_history"]);
const financeExportTypes = new Set<ExportType>(["finance_summary", "payment_history"]);
const exportTypeLabels: Record<ExportType, string> = {
  students: "students",
  applications: "applications",
  finance_summary: "finance summary",
  payment_history: "payment history",
};

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function formatProfile(profile: Profile | null | undefined) {
  return profile?.full_name || profile?.email || "";
}

function money(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function normalizeStatus(value: string | null | undefined) {
  return (value ?? "").replace(/_/g, " ");
}

function filenamePart(value: string | null | undefined) {
  return (value ?? "class").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "class";
}

function latestRequestForStudent(requests: EnrollmentRequest[], studentId: string) {
  return requests
    .filter((request) => request.student_profile_id === studentId)
    .sort((left, right) => Date.parse(right.reviewed_at ?? right.requested_at) - Date.parse(left.reviewed_at ?? left.requested_at))[0] ?? null;
}

function currentPaymentTerms(terms: ProgramPaymentTerms[]) {
  return (
    terms.find((row) => !["superseded", "cancelled", "ended"].includes(row.status)) ??
    terms[0] ??
    null
  );
}

function trackNames(trackIds: string[], tracksById: Map<string, ProgramTrack>) {
  return trackIds.map((trackId) => tracksById.get(trackId)?.name).filter(Boolean).join("; ");
}

function sessionDays(trackIds: string[], trackDaysById: Map<string, string[]>) {
  return Array.from(new Set(trackIds.flatMap((trackId) => trackDaysById.get(trackId) ?? []))).join("; ");
}

async function loadProgramContext(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string) {
  const { data: program, error } = await supabase.from("programs").select("*").eq("id", programId).maybeSingle();
  if (error || !program) {
    return { program: null, error: error?.message ?? "Class not found." };
  }
  return { program: program as Program, error: null };
}

async function loadTracksContext(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string) {
  const [{ data: tracks }, { data: sessions }, { data: trackSessions }] = await Promise.all([
    supabase.from("program_tracks").select("*").eq("program_id", programId).order("sort_order", { ascending: true }),
    supabase.from("program_sessions").select("*").eq("program_id", programId),
    supabase.from("program_track_sessions").select("*"),
  ]);

  const tracksById = new Map((tracks ?? []).map((track) => [track.id, track as ProgramTrack]));
  const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
  const trackDaysById = new Map<string, string[]>();
  for (const track of tracks ?? []) {
    const linkedDays = (trackSessions ?? [])
      .filter((link) => link.program_track_id === track.id)
      .map((link) => sessionById.get(link.program_session_id)?.day_of_week)
      .filter((day): day is string => Boolean(day));
    const fallbackDays = Array.isArray(track.schedule)
      ? track.schedule.map((row) => (typeof row === "object" && row && "day" in row ? String(row.day) : "")).filter(Boolean)
      : [];
    trackDaysById.set(track.id, Array.from(new Set(linkedDays.length ? linkedDays : fallbackDays)));
  }
  return { tracks: (tracks ?? []) as ProgramTrack[], tracksById, trackDaysById };
}

async function loadProfiles(supabase: ReturnType<typeof createSupabaseServiceClient>, profileIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(profileIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) {
    return new Map<string, Profile>();
  }
  const { data } = await supabase.from("profiles").select("*").in("id", ids);
  return new Map((data ?? []).map((profile) => [profile.id, profile as Profile]));
}

async function loadEnrollmentTrackIds(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  programId: string,
  enrollments: Enrollment[],
  requests: EnrollmentRequest[],
) {
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  const requestIds = requests.map((request) => request.id);
  const [{ data: enrollmentTracks }, { data: requestTracks }] = await Promise.all([
    enrollmentIds.length
      ? supabase.from("enrollment_tracks").select("enrollment_id, program_track_id").in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] as Array<{ enrollment_id: string; program_track_id: string }> }),
    requestIds.length
      ? supabase.from("enrollment_request_tracks").select("enrollment_request_id, program_track_id").in("enrollment_request_id", requestIds)
      : Promise.resolve({ data: [] as Array<{ enrollment_request_id: string; program_track_id: string }> }),
  ]);
  const requestTrackIdsByRequestId = new Map<string, string[]>();
  for (const row of requestTracks ?? []) {
    requestTrackIdsByRequestId.set(row.enrollment_request_id, [...(requestTrackIdsByRequestId.get(row.enrollment_request_id) ?? []), row.program_track_id]);
  }
  const latestApprovedByStudentId = new Map<string, EnrollmentRequest>();
  for (const request of requests.filter((row) => row.status === "approved")) {
    const current = latestApprovedByStudentId.get(request.student_profile_id);
    if (!current || Date.parse(request.reviewed_at ?? request.requested_at) > Date.parse(current.reviewed_at ?? current.requested_at)) {
      latestApprovedByStudentId.set(request.student_profile_id, request);
    }
  }
  const trackIdsByEnrollmentId = new Map<string, string[]>();
  for (const enrollment of enrollments) {
    const latestRequest = latestApprovedByStudentId.get(enrollment.student_profile_id);
    const ids = [
      ...(enrollmentTracks ?? []).filter((row) => row.enrollment_id === enrollment.id).map((row) => row.program_track_id),
      ...(enrollment.program_track_id ? [enrollment.program_track_id] : []),
      ...(latestRequest ? requestTrackIdsByRequestId.get(latestRequest.id) ?? [] : []),
      ...(latestRequest?.program_track_id ? [latestRequest.program_track_id] : []),
    ].filter((trackId, index, all) => Boolean(trackId) && all.indexOf(trackId) === index);
    trackIdsByEnrollmentId.set(enrollment.id, ids);
  }
  void programId;
  return { trackIdsByEnrollmentId, requestTrackIdsByRequestId };
}

async function loadProgramRows(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string) {
  const [{ data: enrollments }, { data: requests }, { data: subscriptions }, { data: paymentTerms }, { data: payments }] = await Promise.all([
    supabase.from("enrollments").select("*").eq("program_id", programId).order("created_at", { ascending: true }),
    supabase.from("enrollment_requests").select("*").eq("program_id", programId).order("requested_at", { ascending: false }),
    supabase.from("program_subscriptions").select("*").eq("program_id", programId).order("updated_at", { ascending: false }),
    supabase.from("program_payment_terms").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
    supabase.from("program_payments").select("*").eq("program_id", programId).order("paid_at", { ascending: false }),
  ]);
  return {
    enrollments: (enrollments ?? []) as Enrollment[],
    requests: (requests ?? []) as EnrollmentRequest[],
    subscriptions: (subscriptions ?? []) as ProgramSubscription[],
    paymentTerms: (paymentTerms ?? []) as ProgramPaymentTerms[],
    payments: (payments ?? []) as ProgramPayment[],
  };
}

async function exportStudents(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string) {
  const { enrollments, requests, subscriptions } = await loadProgramRows(supabase, programId);
  const { tracksById, trackDaysById } = await loadTracksContext(supabase, programId);
  const { trackIdsByEnrollmentId } = await loadEnrollmentTrackIds(supabase, programId, enrollments, requests);
  const studentIds = enrollments.map((enrollment) => enrollment.student_profile_id);
  const { data: links } = studentIds.length
    ? await supabase.from("parent_child_links").select("child_profile_id, parent_profile_id").in("child_profile_id", studentIds)
    : { data: [] as Array<{ child_profile_id: string; parent_profile_id: string }> };
  const profiles = await loadProfiles(supabase, [...studentIds, ...(links ?? []).map((link) => link.parent_profile_id)]);

  return buildCsv(
    ["Student name", "Student email", "Student phone", "Student type", "Age", "Gender", "Enrollment status", "Track(s)", "Session day(s)", "Date joined", "Parent name", "Parent email", "Parent phone", "Subscription status"],
    enrollments.map((enrollment) => {
      const student = profiles.get(enrollment.student_profile_id);
      const parentId = (links ?? []).find((link) => link.child_profile_id === enrollment.student_profile_id)?.parent_profile_id;
      const parent = parentId ? profiles.get(parentId) : null;
      const trackIds = trackIdsByEnrollmentId.get(enrollment.id) ?? [];
      const subscription = subscriptions.find((row) => row.student_profile_id === enrollment.student_profile_id);
      return [
        formatProfile(student),
        student?.email,
        student?.phone_number,
        student?.account_type,
        student?.age,
        student?.gender,
        normalizeStatus(enrollment.status),
        trackNames(trackIds, tracksById),
        sessionDays(trackIds, trackDaysById),
        dateOnly(enrollment.created_at),
        formatProfile(parent),
        parent?.email,
        parent?.phone_number,
        normalizeStatus(subscription?.status),
      ];
    }),
  );
}

async function exportApplications(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string, program: Program) {
  const { requests } = await loadProgramRows(supabase, programId);
  const { tracksById } = await loadTracksContext(supabase, programId);
  const { requestTrackIdsByRequestId } = await loadEnrollmentTrackIds(supabase, programId, [], requests);
  const profiles = await loadProfiles(supabase, [
    ...requests.map((row) => row.student_profile_id),
    ...requests.map((row) => row.parent_profile_id),
    ...requests.map((row) => row.reviewed_by),
  ]);
  return buildCsv(
    ["Student name", "Student email", "Parent name", "Parent email", "Status", "Track(s)", "Payment type", "Monthly price", program.is_ongoing ? "Annual subscription price" : "Pay in full price", "Payment waived", "Paid externally", "Requested at", "Reviewed at", "Reviewed by", "Review note"],
    requests.map((request) => {
      const trackIds = [
        ...(requestTrackIdsByRequestId.get(request.id) ?? []),
        ...(request.program_track_id ? [request.program_track_id] : []),
      ].filter((trackId, index, all) => Boolean(trackId) && all.indexOf(trackId) === index);
      const student = profiles.get(request.student_profile_id);
      const parent = request.parent_profile_id ? profiles.get(request.parent_profile_id) : null;
      const reviewer = request.reviewed_by ? profiles.get(request.reviewed_by) : null;
      return [
        formatProfile(student),
        student?.email,
        formatProfile(parent),
        parent?.email,
        normalizeStatus(request.status),
        trackNames(trackIds, tracksById),
        request.payment_type === "annual" ? (program.is_ongoing ? "annual subscription" : "pay in full") : request.payment_type,
        money(request.approved_price_monthly_cents ?? program.price_monthly_cents),
        money(request.approved_price_annual_cents ?? program.price_annual_cents),
        request.payment_bypassed && !request.payment_bypass_external ? "yes" : "no",
        request.payment_bypass_external ? "yes" : "no",
        dateTime(request.requested_at),
        dateTime(request.reviewed_at),
        formatProfile(reviewer),
        request.review_note ?? request.decision_note,
      ];
    }),
  );
}

async function exportFinanceSummary(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string, program: Program) {
  const { enrollments, requests, subscriptions, paymentTerms, payments } = await loadProgramRows(supabase, programId);
  const profiles = await loadProfiles(supabase, [
    ...enrollments.map((row) => row.student_profile_id),
    ...requests.map((row) => row.parent_profile_id),
    ...requests.map((row) => row.reviewed_by),
    ...paymentTerms.map((row) => row.parent_profile_id),
    ...subscriptions.map((row) => row.parent_profile_id),
  ]);
  return buildCsv(
    ["Student name", "Parent name", "Enrollment status", "Payment type", "Amount", "Billing months", "Payment terms status", "Subscription status", "Times paid", "Last payment", "Next billing / current period end", "Date joined", "Approved by"],
    enrollments.map((enrollment) => {
      const request = latestRequestForStudent(requests, enrollment.student_profile_id);
      const terms = currentPaymentTerms(paymentTerms.filter((row) => row.student_profile_id === enrollment.student_profile_id));
      const subscription = subscriptions.find((row) => row.student_profile_id === enrollment.student_profile_id);
      const studentPayments = payments.filter((row) => row.student_profile_id === enrollment.student_profile_id);
      const latestPayment = studentPayments[0];
      const parentId =
        terms?.parent_profile_id ??
        request?.parent_profile_id ??
        subscription?.parent_profile_id ??
        null;
      const amountCents =
        terms?.amount_cents ??
        subscription?.amount_cents ??
        (request?.payment_type === "annual" ? request.approved_price_annual_cents : request?.approved_price_monthly_cents) ??
        (program.offers_annual_payment && !program.offers_monthly_payment ? program.price_annual_cents : program.price_monthly_cents);
      return [
        formatProfile(profiles.get(enrollment.student_profile_id)),
        formatProfile(parentId ? profiles.get(parentId) : null),
        normalizeStatus(enrollment.status),
        normalizeStatus(terms?.payment_type ?? subscription?.payment_type ?? request?.payment_type ?? (program.is_paid ? "monthly" : "free")),
        money(amountCents),
        terms?.billing_months ?? subscription?.billing_months ?? "",
        normalizeStatus(terms?.status),
        normalizeStatus(subscription?.status),
        studentPayments.length,
        dateTime(latestPayment?.paid_at),
        dateTime(terms?.current_period_end ?? subscription?.current_period_end),
        dateOnly(enrollment.created_at),
        formatProfile(request?.reviewed_by ? profiles.get(request.reviewed_by) : null),
      ];
    }),
  );
}

async function exportPaymentHistory(supabase: ReturnType<typeof createSupabaseServiceClient>, programId: string) {
  const { payments } = await loadProgramRows(supabase, programId);
  const profiles = await loadProfiles(supabase, [
    ...payments.map((row) => row.student_profile_id),
    ...payments.map((row) => row.parent_profile_id),
  ]);
  return buildCsv(
    ["Date", "Student", "Parent", "Amount", "Currency", "Stripe invoice", "Stripe payment intent", "Tax receipt status", "Tax receipt eligible amount", "Tax receipt number", "Receipt URL"],
    payments.map((payment) => [
      dateTime(payment.paid_at),
      formatProfile(payment.student_profile_id ? profiles.get(payment.student_profile_id) : null),
      formatProfile(payment.parent_profile_id ? profiles.get(payment.parent_profile_id) : null),
      money(payment.amount_cents),
      payment.currency,
      payment.stripe_invoice_id,
      payment.stripe_payment_intent_id,
      normalizeStatus(payment.tax_receipt_status),
      money(payment.tax_receipt_eligible_amount_cents),
      payment.tax_receipt_number,
      payment.receipt_url,
    ]),
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const url = new URL(request.url);
    const rawType = url.searchParams.get("type") ?? "students";
    const type = exportTypes.has(rawType as ExportType) ? (rawType as ExportType) : null;
    if (!type) {
      return Response.json({ error: "Unknown export type." }, { status: 400 });
    }

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const access = financeExportTypes.has(type)
      ? await requireProgramFinanceAccess(supabase, programId, user.id)
      : await requireProgramManageAccess(supabase, programId, user.id);
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const { program, error } = await loadProgramContext(supabase, programId);
    if (error || !program) {
      return Response.json({ error: error ?? "Class not found." }, { status: 404 });
    }

    const csv =
      type === "students"
        ? await exportStudents(supabase, programId)
        : type === "applications"
            ? await exportApplications(supabase, programId, program)
            : type === "finance_summary"
              ? await exportFinanceSummary(supabase, programId, program)
              : await exportPaymentHistory(supabase, programId);

    await recordFinanceAuditEvent(supabase, {
      programId,
      actorProfileId: user.id,
      eventType: `export_${type}`,
      summary: `Exported the ${exportTypeLabels[type]} CSV.`,
      metadata: { exportType: type },
    });

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filenamePart(program.title)}-${type}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export class data.";
    return Response.json({ error: message }, { status: 500 });
  }
}
