function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function validTimeZone(value: string | null | undefined) {
  const timeZone = value || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function localFirstAtNine(year: number, monthIndex: number, timeZone: string) {
  const desiredWallTime = Date.UTC(year, monthIndex, 1, 9);
  let instant = new Date(desiredWallTime);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = localParts(instant, timeZone);
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    instant = new Date(instant.getTime() + desiredWallTime - actualWallTime);
  }
  return Math.floor(instant.getTime() / 1000);
}

export type MonthlyCheckoutPlan = {
  billingAnchor: number | undefined;
  prorateOpeningPeriod: boolean;
  waiveOpeningPeriod: boolean;
  firstRecurringChargeAt: number | undefined;
  waiverReason?: "november_2026" | "late_month";
};

/**
 * Calendar-month policy for first-of-month programs:
 * - the 1st charges normally through the recurring item;
 * - later signups normally pay for the remaining portion of that month;
 * - Assiddiq's two classes waive that opening period after the 25th;
 * - the full approved monthly price then renews on the next 1st.
 */
export function monthlyCheckoutPlan(
  program: { id?: string; monthly_billing_anchor: string; schedule_timezone?: string | null },
  now = new Date(),
): MonthlyCheckoutPlan {
  if (program.monthly_billing_anchor !== "first_of_month") {
    return { billingAnchor: undefined, prorateOpeningPeriod: false, waiveOpeningPeriod: false, firstRecurringChargeAt: undefined };
  }
  const timeZone = validTimeZone(program.schedule_timezone);
  const current = localParts(now, timeZone);
  const nextFirst = localFirstAtNine(current.year, current.month, timeZone);
  // Approved one-time Al Tarteel exception: registrations completed during
  // November 2026 owe nothing for the opening November period. Existing
  // subscriptions are untouched; December and later signups use normal billing.
  // Scope by permanent class ID rather than a mutable title or public slug.
  const novemberException = program.id === "6cb4630d-5d08-4f36-9b5b-35b59e8e8620"
    && current.year === 2026 && current.month === 11;
  const lateMonth = current.day > 25 && [
    "6cb4630d-5d08-4f36-9b5b-35b59e8e8620", // Al Tarteel
    "c7ab396e-f365-4d73-bdf8-b9da59600240", // Weekend School
  ].includes(program.id ?? "");
  const waiveOpeningPeriod = novemberException || lateMonth;
  if (current.day === 1 && !waiveOpeningPeriod) {
    return { billingAnchor: undefined, prorateOpeningPeriod: false, waiveOpeningPeriod: false, firstRecurringChargeAt: nextFirst };
  }
  return {
    billingAnchor: nextFirst,
    prorateOpeningPeriod: !waiveOpeningPeriod,
    waiveOpeningPeriod,
    firstRecurringChargeAt: nextFirst,
    ...(waiveOpeningPeriod ? { waiverReason: novemberException ? "november_2026" as const : "late_month" as const } : {}),
  };
}

/** Align new monthly subscriptions to 9 am on the next first in the class time zone. */
export function monthlyBillingAnchor(program: { monthly_billing_anchor: string; schedule_timezone?: string | null }, now = new Date()): number | undefined {
  return monthlyCheckoutPlan(program, now).billingAnchor;
}

/** End after the prorated opening month plus the remaining full billing months. */
export function monthlyBillingEndDate(anchorSeconds: number, remainingMonths: number, billingTimeZone: string | null) {
  const timeZone = validTimeZone(billingTimeZone);
  const first = localParts(new Date(anchorSeconds * 1000), timeZone);
  return localFirstAtNine(first.year, first.month - 1 + remainingMonths, timeZone);
}
