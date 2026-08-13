/** Supabase/Postgrest errors carry a SQLSTATE-ish `code` and are not written for users
 * (e.g. `duplicate key value violates unique constraint "idx_..."`). Plain `Error`s and
 * hand-written API route error strings don't have `code` and are already human-written. */
function isRawDatabaseError(error: unknown): error is { message: string; code?: string } {
  return Boolean(error) && typeof error === "object" && "message" in error && "code" in error && Boolean((error as { code?: unknown }).code);
}

/** Returns a message safe to show a user for any thrown/returned error: a hand-written
 * message is passed through as-is, a raw database error is swapped for `fallback` (and
 * logged to the console for debugging) so users never see Postgres internals. */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  if (isRawDatabaseError(error)) {
    console.error(error);
    return fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  console.error(error);
  return fallback;
}
