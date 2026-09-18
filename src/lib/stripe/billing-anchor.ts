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

/** Align new monthly subscriptions to 9 am on the next first in the class time zone. */
export function monthlyBillingAnchor(program: { monthly_billing_anchor: string; schedule_timezone?: string | null }, now = new Date()): number | undefined {
  if (program.monthly_billing_anchor !== "first_of_month") {
    return undefined;
  }
  const timeZone = validTimeZone(program.schedule_timezone);
  const current = localParts(now, timeZone);
  if (current.day === 1) return undefined;
  return localFirstAtNine(current.year, current.month, timeZone);
}

/** End after the prorated opening month plus the remaining full billing months. */
export function monthlyBillingEndDate(anchorSeconds: number, remainingMonths: number, billingTimeZone: string | null) {
  const timeZone = validTimeZone(billingTimeZone);
  const first = localParts(new Date(anchorSeconds * 1000), timeZone);
  return localFirstAtNine(first.year, first.month - 1 + remainingMonths, timeZone);
}
