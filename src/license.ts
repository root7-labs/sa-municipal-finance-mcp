// Licence checks for the Pro tools. Keys are issued by Polar (polar.sh) when someone buys Pro,
// and checked against Polar's public validate endpoint (no secret needed), cached for 6 hours.
// Only the key and the product's benefit ID are sent to Polar, never the user's questions.

export const POLAR_ORGANIZATION_ID = "e39dfc88-1017-408a-b038-8c3fcd847e65"; // Root 7 on Polar
/** Polar benefit that grants this product's licence keys. Keys for other Root 7 products are rejected. */
export const POLAR_BENEFIT_ID = process.env.SAMUNI_POLAR_BENEFIT_ID ?? "bb5f49ff-4fee-42cb-9995-6361aa26084b";
export const POLAR_API_BASE = process.env.SAMUNI_POLAR_API ?? "https://api.polar.sh";
export const UPGRADE_URL = process.env.SAMUNI_UPGRADE_URL ?? "https://buy.polar.sh/polar_cl_y6cxOeQf1C2z1VXCG2gpMJULzDkgH7Tmb4iqO3WXQW6";
export const LICENSE_ENV = "SAMUNI_LICENSE_KEY";

export interface LicenceInfo {
  valid: boolean;
  holder?: string;
  expires?: string | null;
  reason?: string;
  note?: string;
}

const CACHE_MS = 6 * 60 * 60 * 1000;

export async function checkPolarKey(key: string, benefitId = POLAR_BENEFIT_ID): Promise<LicenceInfo> {
  let res: Response;
  try {
    res = await fetch(`${POLAR_API_BASE}/v1/customer-portal/license-keys/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ key, organization_id: POLAR_ORGANIZATION_ID, ...(benefitId ? { benefit_id: benefitId } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The data tools need the internet anyway, so a short Polar outage should not lock out a paying user.
    return { valid: true, note: "Could not reach Polar to confirm the key; Pro is enabled for now." };
  }
  if (res.status === 404) return { valid: false, reason: "Licence key not found, revoked or expired." };
  if (res.status === 422 || res.status === 400) return { valid: false, reason: "Licence key was rejected by Polar." };
  if (!res.ok) return { valid: true, note: `Polar returned HTTP ${res.status}; Pro is enabled for now.` };
  let body: { status?: string; expires_at?: string | null; benefit_id?: string; customer?: { email?: string | null; name?: string | null } };
  try {
    body = await res.json();
  } catch {
    return { valid: true, note: "Unexpected reply from Polar; Pro is enabled for now." };
  }
  if (benefitId && body.benefit_id && body.benefit_id !== benefitId) {
    return { valid: false, reason: "This key belongs to a different Root 7 product." };
  }
  if (body.status !== "granted") return { valid: false, reason: `Licence status is "${body.status ?? "unknown"}".` };
  if (body.expires_at && Date.parse(body.expires_at) < Date.now()) {
    return { valid: false, reason: `Licence expired on ${body.expires_at.slice(0, 10)}.` };
  }
  return { valid: true, holder: body.customer?.email ?? body.customer?.name ?? undefined, expires: body.expires_at ?? null };
}

let cached: { key: string; at: number; info: Promise<LicenceInfo> } | undefined;

export function getLicence(key = process.env[LICENSE_ENV]): Promise<LicenceInfo> {
  const k = key?.trim();
  if (!k) return Promise.resolve({ valid: false, reason: `No licence key set (${LICENSE_ENV}).` });
  if (cached && cached.key === k && Date.now() - cached.at < CACHE_MS) return cached.info;
  const info = checkPolarKey(k);
  cached = { key: k, at: Date.now(), info };
  return info;
}

export function resetLicenceCache(): void {
  cached = undefined;
}

export function upgradeMessage(tool: string, reason?: string): string {
  return [
    `"${tool}" is a Pro tool.`,
    reason ? `Licence check: ${reason}` : "",
    `Get a Pro key at ${UPGRADE_URL}, then set ${LICENSE_ENV} in your MCP client config and restart it.`,
    "Free tools (find_municipality, municipality_profile, financial_health) keep working without a key.",
  ]
    .filter(Boolean)
    .join("\n");
}
