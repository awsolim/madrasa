export type ClassLifecycleAction = "pause" | "resume" | "end" | "archive";

export type ClassLifecyclePlan = {
  programId: string;
  title: string;
  action: ClassLifecycleAction;
  accessEndsAt: string | null;
  reason: string;
  blockers: string[];
  warnings: string[];
  students: Array<{ id: string; name: string; parent: string | null; active: boolean }>;
  subscriptions: Array<{
    id: string;
    studentId: string;
    stripeId: string;
    accountId: string | null;
    status: string;
    paymentType: string;
    amountCents: number;
    currency: string;
    periodEnd: string | null;
    paused: boolean;
    changeCollection: boolean;
    cancelAt: number | null;
    cancelAtPeriodEnd: boolean;
  }>;
  checkouts: Array<{ id: string; accountId: string | null }>;
  pendingApplications: number;
  pendingWithdrawals: number;
  recipients: string[];
};

export function isClosedClass(program: { lifecycle_status?: string; publication_status?: string }) {
  return program.publication_status === "archived" || ["cancelled", "completed", "archived"].includes(program.lifecycle_status ?? "");
}

export function classBillingMutation(action: ClassLifecycleAction, changeCollection: boolean, subscription: { status: string; paused: boolean }) {
  if (["canceled", "incomplete_expired"].includes(subscription.status)) return { kind: "none" as const };
  if (action === "end") return { kind: "cancel" as const, params: { prorate: false, invoice_now: false } };
  if (action === "pause" && changeCollection) return { kind: "pause" as const, params: { pause_collection: { behavior: "void" as const } } };
  if (action === "resume" && changeCollection && subscription.paused) return { kind: "resume" as const, params: { pause_collection: "" as const, proration_behavior: "none" as const } };
  return { kind: "none" as const };
}

// Date-only input means the last day of access in the class timezone, not the
// browser timezone. Compute the following midnight across DST changes.
export function classAccessEndsAt(date: string, timeZone: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose the last day of student access.");
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime()) || target.toISOString().slice(0, 10) !== date) throw new Error("Invalid access date.");
  target.setUTCDate(target.getUTCDate() + 1);
  const wall = target.getTime();
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const local = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    instant += wall - local;
  }
  if (instant <= now.getTime()) throw new Error("The last access day must be today or later.");
  if (instant - now.getTime() > 366 * 86400000) throw new Error("Choose a date within the next year.");
  return new Date(instant).toISOString();
}
