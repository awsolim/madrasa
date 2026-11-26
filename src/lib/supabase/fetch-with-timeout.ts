const DEFAULT_TIMEOUT_MS = 15000;

/** Bound stalled Supabase requests. The SDK retains its normal network retry policy. */
export function fetchWithTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const externalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const timeoutError = new TypeError("The connection to Supabase timed out. Please try again.");
    let timedOut = false;
    const onAbort = () => controller.abort(externalSignal?.reason);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
    }, timeoutMs);

    if (externalSignal?.aborted) onAbort();
    else externalSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      // Keep this a network error: Auth must retain a recoverable session
      // rather than treating a timeout as an invalid refresh token.
      if (timedOut && !externalSignal?.aborted) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  };
}
