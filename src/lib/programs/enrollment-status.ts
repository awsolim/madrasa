export function isCurrentEnrollmentStatus(status: string | null | undefined) {
  return !["kicked", "withdrawn", "inactive", "cancelled", "canceled"].includes((status ?? "active").toLowerCase());
}
