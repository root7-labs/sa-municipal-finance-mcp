// Capital spending and infrastructure grants: is there money for the work, and what is it spent on?
// Source: capital_v2 and grants_v2 cubes (audited actuals and approved budgets).
//
// Queries always name the municipality, the years and the amount types. Treasury's server answers those
// quickly; broad queries across many municipalities are slow and can time out.
import { aggregate, num, type Cell } from "./api.js";
import { CAPEX_TYPES } from "./indicators.js";

/** mSCOA capital asset items, grouped the way a contractor thinks about the work. Ranges are item codes. */
export const ASSET_GROUPS = [
  { key: "roads", label: "Roads and stormwater", from: 120, to: 190 },
  { key: "electricity", label: "Electricity", from: 210, to: 290 },
  { key: "water", label: "Water supply", from: 310, to: 400 },
  { key: "sanitation", label: "Sanitation", from: 420, to: 470 },
  { key: "waste", label: "Solid waste", from: 490, to: 550 },
  { key: "network", label: "Rail, coastal and data networks", from: 570, to: 760 },
  { key: "community", label: "Community, sport and heritage facilities", from: 790, to: 1100 },
  { key: "buildings", label: "Buildings, property and housing", from: 1130, to: 1340 },
  { key: "equipment", label: "Vehicles, equipment, software and land", from: 1360, to: 9999 },
] as const;
export type AssetGroupKey = (typeof ASSET_GROUPS)[number]["key"];

export function assetGroupOf(itemCode: string): AssetGroupKey | null {
  const n = Number(itemCode);
  if (!Number.isFinite(n)) return null;
  return ASSET_GROUPS.find((g) => n >= g.from && n <= g.to)?.key ?? null;
}

export interface CapitalFigures {
  total: number;
  byGroup: Partial<Record<AssetGroupKey, number>>;
}

export interface CapitalPicture {
  /** Latest audited year, and what was actually spent on new, renewed and upgraded assets. */
  auditedYear: number | null;
  spent: CapitalFigures | null;
  /** The capital budget for that same year (adjusted if there was one, else original), and how much of it was spent. */
  budgetForAuditedYear: number | null;
  budgetKind: "adjusted" | "original" | null;
  shareSpent: number | null;
  /** The latest year with an approved budget on file, which is the nearest thing to "what is planned". */
  budgetYear: number | null;
  budget: CapitalFigures | null;
}

const year = (c: Cell) => Number(c["financial_year_end.year"]);

/** Treasury's scorecard rule for budget spending: within 5% of budget is good, 5 to 15% average, further out is bad. */
export function capitalSpendingRating(shareSpent: number): { rating: "good" | "average" | "bad"; text: string } {
  const off = Math.abs(shareSpent - 1) * 100;
  const side = shareSpent < 1 ? "under" : "over";
  if (off <= 5) return { rating: "good", text: "within 5% of budget, which Treasury's scorecard counts as good" };
  if (off <= 15) return { rating: "average", text: `${off.toFixed(0)}% ${side} budget, which Treasury's scorecard counts as average` };
  return { rating: "bad", text: `${off.toFixed(0)}% ${side} budget, which Treasury's scorecard counts as bad (more than 15% over or under)` };
}

/**
 * One query: audited spending for the audited year, that year's budget, and the latest approved budget.
 * `auditedYear` comes from latestAuditedYears; `toYear` is the current financial year.
 */
export async function capitalPicture(code: string, auditedYear: number | undefined, toYear: number): Promise<CapitalPicture> {
  const from = auditedYear ?? toYear - 2;
  const years: number[] = [];
  for (let y = toYear; y >= from; y--) years.push(y);
  const cells = await aggregate(
    "capital_v2",
    {
      "demarcation.code": [code],
      "period_length.length": ["year"],
      "financial_year_end.year": years,
      "amount_type.code": ["AUDA", "ADJB", "ORGB"],
      "capital_type.code": CAPEX_TYPES,
    },
    ["financial_year_end.year", "amount_type.code", "item.code"],
  );
  const figures = new Map<string, CapitalFigures>(); // "2025|AUDA" -> figures
  for (const c of cells) {
    const amount = num(c["amount.sum"]);
    if (amount === 0) continue;
    const k = `${year(c)}|${c["amount_type.code"]}`;
    const f = figures.get(k) ?? { total: 0, byGroup: {} };
    f.total += amount;
    const g = assetGroupOf(String(c["item.code"]));
    if (g) f.byGroup[g] = (f.byGroup[g] ?? 0) + amount;
    figures.set(k, f);
  }
  const get = (y: number, t: string) => figures.get(`${y}|${t}`) ?? null;

  const out: CapitalPicture = { auditedYear: null, spent: null, budgetForAuditedYear: null, budgetKind: null, shareSpent: null, budgetYear: null, budget: null };
  if (auditedYear && get(auditedYear, "AUDA")) {
    out.auditedYear = auditedYear;
    out.spent = get(auditedYear, "AUDA");
    const adjusted = get(auditedYear, "ADJB"), original = get(auditedYear, "ORGB");
    const budget = adjusted && adjusted.total > 0 ? adjusted : original;
    if (budget && budget.total > 0) {
      out.budgetForAuditedYear = budget.total;
      out.budgetKind = budget === adjusted ? "adjusted" : "original";
      out.shareSpent = out.spent!.total / budget.total;
    }
  }
  for (const y of years) {
    const b = get(y, "ORGB");
    if (b && b.total > 0) { out.budgetYear = y; out.budget = b; break; }
  }
  return out;
}

/**
 * Grants that pay for infrastructure. The equitable share, capacity-building, disaster, public-employment
 * and host-city grants are left out: they are not money for building or renewing assets.
 */
export const INFRASTRUCTURE_GRANTS = new Set([
  "MIG", "MIG6", "IUDG", "USDG", "UDFG", "ICDG",          // general municipal infrastructure and urban development
  "WSIG", "WS6G", "RBIG", "RB7G", "MWIG", "MW7G", "BE7G", "BWSG", "RHIG", "RH7G", // water and sanitation
  "INEG", "IN7G", "BESG", "EEDG", "ED7G", "SM6G",          // electricity
  "PTNG", "PTIG", "PTCG", "RTSG",                          // transport and roads
  "NDPG", "ND7G",                                          // neighbourhood development
]);

export interface GrantLine {
  code: string;
  label: string;
  /** Adjusted budget if there is one, else the original budget. */
  budget: number;
  /** What national government had transferred, as reported. Zero can mean "not reported". */
  transferred: number;
}

/** Infrastructure grants budgeted for one financial year, largest first. */
export async function infrastructureGrants(code: string, fy: number): Promise<GrantLine[]> {
  const cells = await aggregate(
    "grants_v2",
    { "demarcation.code": [code], "period_length.length": ["year"], "financial_year_end.year": [fy], "amount_type.code": ["ORGB", "ADJB", "TRFR"] },
    ["amount_type.code", "grant.code", "grant.label"],
  );
  const by = new Map<string, { label: string; ORGB: number; ADJB: number; TRFR: number }>();
  for (const c of cells) {
    const g = String(c["grant.code"]);
    if (!INFRASTRUCTURE_GRANTS.has(g)) continue;
    const row = by.get(g) ?? { label: String(c["grant.label"] ?? g).trim(), ORGB: 0, ADJB: 0, TRFR: 0 };
    const t = String(c["amount_type.code"]) as "ORGB" | "ADJB" | "TRFR";
    row[t] = num(c["amount.sum"]);
    by.set(g, row);
  }
  return [...by.entries()]
    .map(([g, r]) => ({ code: g, label: r.label, budget: r.ADJB > 0 ? r.ADJB : r.ORGB, transferred: r.TRFR }))
    .filter((r) => r.budget > 0 || r.transferred > 0)
    .sort((a, b) => b.budget - a.budget);
}
