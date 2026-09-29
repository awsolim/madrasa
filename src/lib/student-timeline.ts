type AuditEvent = {
  id: string;
  program_id: string;
  student_profile_id: string | null;
  actor_profile_id: string | null;
  event_type: string;
  summary: string;
  metadata: unknown;
  created_at: string;
};

type ApplicationAttempt = {
  id: string;
  program_id: string;
  student_profile_id: string;
  parent_profile_id: string | null;
  status: string;
  payment_type: string | null;
  requested_at: string;
};

type Person = { id: string; full_name: string | null; email: string | null };

export type StudentTimelineEvent = AuditEvent & {
  actor_name: string;
  context: string | null;
  application_number: number | null;
  synthetic?: boolean;
};

const applicationEventTypes = new Set([
  "application_approved", "application_rejected", "application_waitlisted", "application_reopened",
  "application_approval_cancelled", "application_payment_waived", "approved_price_changed",
  "application_deleted", "registration_cancelled_by_family", "registration_confirmed_no_payment",
  "payment_completed", "subscription_started",
]);

export function isApplicationTimelineEvent(eventType: string) {
  return applicationEventTypes.has(eventType) || eventType.startsWith("application_") || eventType.startsWith("registration_");
}

function eventMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

export function buildStudentTimeline(input: {
  events: AuditEvent[];
  applications: ApplicationAttempt[];
  people: Person[];
  scope: "application" | "finance";
}) {
  const applications = [...input.applications].sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const people = new Map(input.people.map((person) => [person.id, person]));
  const personName = (id: string | null | undefined, fallback: string) => {
    const person = id ? people.get(id) : null;
    return person?.full_name?.trim() || person?.email?.trim() || fallback;
  };
  const appNumber = new Map(applications.map((application, index) => [application.id, index + 1]));

  const submitted: StudentTimelineEvent[] = applications.map((application, index) => {
    const number = index + 1;
    const studentName = personName(application.student_profile_id, "the student");
    const submitterName = personName(application.parent_profile_id ?? application.student_profile_id, application.parent_profile_id ? "Parent or guardian" : studentName);
    const plan = application.payment_type === "annual" ? "Annual option" : application.payment_type === "monthly" ? "Monthly option" : "Payment option not recorded";
    return {
      id: `application-submitted:${application.id}`,
      program_id: application.program_id,
      student_profile_id: application.student_profile_id,
      actor_profile_id: application.parent_profile_id ?? application.student_profile_id,
      event_type: "application_submitted",
      summary: `${submitterName} submitted application #${number} for ${studentName}.`,
      metadata: { enrollmentRequestId: application.id },
      created_at: application.requested_at,
      actor_name: submitterName,
      context: `Application #${number} of ${applications.length} · ${plan} · Current outcome: ${application.status.replaceAll("_", " ")}`,
      application_number: number,
      synthetic: true,
    };
  });

  const recorded = input.events
    .filter((event) => {
      if (input.scope === "finance" || isApplicationTimelineEvent(event.event_type)) return true;
      return event.event_type === "manual_note" && typeof eventMetadata(event.metadata).enrollmentRequestId === "string";
    })
    .map((event): StudentTimelineEvent => {
      const metadata = eventMetadata(event.metadata);
      const exactRequestId = typeof metadata.enrollmentRequestId === "string" ? metadata.enrollmentRequestId : null;
      const application = applications.find((item) => item.id === exactRequestId)
        ?? (isApplicationTimelineEvent(event.event_type)
          ? [...applications].reverse().find((item) => item.requested_at <= event.created_at)
          : null);
      const number = application ? appNumber.get(application.id) ?? null : null;
      return {
        ...event,
        actor_name: event.actor_profile_id ? personName(event.actor_profile_id, "Staff member") : "System",
        context: number ? `Application #${number} of ${applications.length}` : null,
        application_number: number,
      };
    });

  return [...submitted, ...recorded].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
