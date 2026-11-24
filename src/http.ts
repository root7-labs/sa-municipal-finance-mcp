// Shared HTTP layer: timeouts, retries, per-host politeness delay and a small in-memory cache.

const USER_AGENT = "sa-municipal-finance-mcp/0.1 (+https://github.com/kramdayal-create/sa-municipal-finance-mcp)";
const DEFAULT_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // data changes quarterly
const CACHE_MAX = 500;

// Minimum gap between requests to the same host.
const hostGapMs: Record<string, number> = {
  "municipaldata.treasury.gov.za": 150,
};

const lastCall = new Map<string, number>();
const cache = new Map<string, { at: number; body: string }>();

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function politeDelay(host: string): Promise<void> {
  const gap = hostGapMs[host] ?? 50;
  const now = Date.now();
  const next = (lastCall.get(host) ?? 0) + gap;
  lastCall.set(host, Math.max(now, next));
  if (next > now) await new Promise((r) => setTimeout(r, next - now));
}

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: string): void {
  cache.set(key, { at: Date.now(), body });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearCache(): void {
  cache.clear();
  lastCall.clear();
}

export async function fetchText(
  url: string,
  accept = "application/json",
): Promise<string> {
  const cached = cacheGet(url);
  if (cached !== undefined) return cached;

  const host = new URL(url).host;
  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    await politeDelay(host);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(
          `${host} returned HTTP ${res.status}`,
          res.status,
        );
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
        continue;
      }
      if (res.status === 404) {
        throw new UpstreamError(`Not found at ${host}`, 404);
      }
      if (!res.ok) {
        throw new UpstreamError(
          `${host} returned HTTP ${res.status}`,
          res.status,
        );
      }
      const body = await res.text();
      cacheSet(url, body);
      return body;
    } catch (err) {
      if (err instanceof UpstreamError && err.status && err.status < 500 && err.status !== 429) {
        throw err;
      }
      lastErr = err;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new UpstreamError(`Could not reach ${host}: ${msg}`);
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const text = await fetchText(url, "application/json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`Unexpected non-JSON response from ${new URL(url).host}`);
  }
}

export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}
