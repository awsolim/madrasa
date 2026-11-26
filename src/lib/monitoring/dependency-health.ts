type Check = { status: "up" | "down"; elapsedMs: number };

/** Public, read-only probes. Never use a service key or return upstream bodies. */
export async function checkDependencies(url: string, publicKey: string, fetcher: typeof fetch = fetch) {
  async function probe(path: string): Promise<Check> {
    const started = Date.now();
    try {
      const response = await fetcher(new URL(path, url), {
        headers: { apikey: publicKey },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      // Read the body inside the deadline too, rather than checking headers only.
      const body: unknown = await response.json();
      const valid = path.startsWith("/rest/") ? Array.isArray(body) : !!body && typeof body === "object";
      return { status: response.ok && valid ? "up" : "down", elapsedMs: Date.now() - started };
    } catch {
      return { status: "down", elapsedMs: Date.now() - started };
    }
  }
  const [auth, database] = await Promise.all([
    probe("/auth/v1/health"),
    probe("/rest/v1/mosques?select=id&limit=1"),
  ]);
  return { status: auth.status === "up" && database.status === "up" ? "ok" : "degraded", checks: { auth, database } };
}
