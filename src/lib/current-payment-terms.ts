type Terms = { id: string; status: string; created_at: string };
const terminal = new Set(["superseded", "cancelled", "ended"]);
/** Prefer the subscription's explicit decision, then the application's, then newest valid terms. */
export function selectCurrentPaymentTerms<T extends Terms>(rows: T[], request: { payment_terms_id?: string | null } | null, subscription: { payment_terms_id?: string | null } | null): T | null {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const subscriptionTerms = sorted.find((row) => row.id === subscription?.payment_terms_id);
  const requestTerms = sorted.find((row) => row.id === request?.payment_terms_id);
  if (subscriptionTerms && !terminal.has(subscriptionTerms.status)) return subscriptionTerms;
  if (requestTerms && !terminal.has(requestTerms.status)) return requestTerms;
  return sorted.find((row) => !terminal.has(row.status)) ?? subscriptionTerms ?? requestTerms ?? sorted[0] ?? null;
}
