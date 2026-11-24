// Financial health indicators for South African municipalities.
//
// Formulas, line-item codes and rating bands follow National Treasury's Municipal Money
// scorecard (open-source code by OpenUp / Code for South Africa, MIT licence), which in turn
// cites MFMA Circular 71 and the State of Local Government Finances report. All amounts are
// audited actuals (AUDA) from the mSCOA "v2" cubes (financial years 2019/20 onwards).
import { aggregate, num, type Cell } from "./api.js";

export const SPENDING_CODES = [
  "3000", "3100", "3200", "3300", "3400", "3500", "3600", "3700", "3800",
  "3900", "4000", "4100", "4200", "4300",
];
export const BILLED_REVENUE_CODES = ["1800", "0300", "0400", "0500", "0600", "1400", "1100", "1000"];
export const COLLECTED_REVENUE_CODES = ["0120", "0130", "0280"];
export const CURRENT_ASSETS_CODES = ["0120", "0125", "0130", "0140", "0150", "0160", "0170", "0180"];
export const CURRENT_LIABILITIES_CODES = ["0330", "0340", "0350", "0360", "0370", "0380", "0390", "0400", "0410", "0420"];
export const CASH_CODE = "0120";
export const SHORT_TERM_INVESTMENTS_CODE = "0125";
export const PPE_CODE = "0230";
export const INVESTMENT_PROPERTY_CODE = "0220";
export const CASH_AT_YEAR_END_CODE = "0430";
export const CAPEX_TYPES = ["NEW", "RENEWAL", "UPGRADING"];
export const UIFW_ITEMS = ["unauthorised", "irregular", "fruitless"];

/** Raw audited figures for one municipality and one financial year (rands). */
export interface RawYear {
  cashAtYearEnd?: number;
  collectedRevenue?: number;
  billedRevenue?: number;
  opexActual?: number;
  opexAdjustedBudget?: number;
  opexOriginalBudget?: number;
  capexActual?: number;
  capexAdjustedBudget?: number;
  capexOriginalBudget?: number;
  repairsMaintenance?: number;
  uifw?: number;
  items: Record<string, number>; // financial_position_v2 audited items by code
}

export type RawData = Record<string, Record<number, RawYear>>; // code -> year -> figures

export type Rating = "good" | "average" | "bad";

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  unit: "rand" | "months" | "ratio" | "percent";
  rating: Rating | null;
  rule: string;
  formula: string;
  note?: string;
}

const year = (c: Cell) => Number(c["financial_year_end.year"]);
const code = (c: Cell) => String(c["demarcation.code"]);

function slot(raw: RawData, c: Cell): RawYear {
  const m = (raw[code(c)] ??= {});
  return (m[year(c)] ??= { items: {} });
}

/**
 * Pulls everything the indicators need for many municipalities and years in eight API calls.
 */
export async function fetchRaw(codes: string[], years: number[]): Promise<RawData> {
  const raw: RawData = {};
  const base = {
    "demarcation.code": codes,
    "period_length.length": ["year"],
    "financial_year_end.year": years,
  };
  const dd = ["demarcation.code", "financial_year_end.year"];

  const [cash, collected, opex, billed, fp, capex, rm, uifw] = await Promise.all([
    aggregate("cflow_v2", { ...base, "item.code": [CASH_AT_YEAR_END_CODE], "amount_type.code": ["AUDA"] }, dd),
    aggregate("cflow_v2", { ...base, "item.code": COLLECTED_REVENUE_CODES, "amount_type.code": ["AUDA"] }, dd),
    aggregate("incexp_v2", { ...base, "item.code": SPENDING_CODES, "amount_type.code": ["AUDA", "ADJB", "ORGB"] }, [...dd, "amount_type.code"]),
    aggregate("incexp_v2", { ...base, "item.code": BILLED_REVENUE_CODES, "amount_type.code": ["AUDA"] }, dd),
    aggregate(
      "financial_position_v2",
      {
        ...base,
        "item.code": [...CURRENT_ASSETS_CODES, ...CURRENT_LIABILITIES_CODES, PPE_CODE, INVESTMENT_PROPERTY_CODE],
        "amount_type.code": ["AUDA"],
      },
      [...dd, "item.code"],
    ),
    aggregate("capital_v2", { ...base, "capital_type.code": CAPEX_TYPES, "amount_type.code": ["AUDA", "ADJB", "ORGB"] }, [...dd, "amount_type.code"]),
    aggregate("capital_v2", { ...base, "capital_type.code": ["REPAIR_MNT"], "amount_type.code": ["AUDA"] }, dd),
    aggregate("uifwexp", { "demarcation.code": codes, "financial_year_end.year": years, "item.code": UIFW_ITEMS }, dd),
  ]);

  for (const c of cash) slot(raw, c).cashAtYearEnd = num(c["amount.sum"]);
  for (const c of collected) slot(raw, c).collectedRevenue = num(c["amount.sum"]);
  for (const c of billed) slot(raw, c).billedRevenue = num(c["amount.sum"]);
  for (const c of rm) slot(raw, c).repairsMaintenance = num(c["amount.sum"]);
  for (const c of uifw) slot(raw, c).uifw = num(c["amount.sum"]);
  for (const c of opex) {
    const s = slot(raw, c);
    const t = c["amount_type.code"];
    if (t === "AUDA") s.opexActual = num(c["amount.sum"]);
    if (t === "ADJB") s.opexAdjustedBudget = num(c["amount.sum"]);
    if (t === "ORGB") s.opexOriginalBudget = num(c["amount.sum"]);
  }
  for (const c of capex) {
    const s = slot(raw, c);
    const t = c["amount_type.code"];
    if (t === "AUDA") s.capexActual = num(c["amount.sum"]);
    if (t === "ADJB") s.capexAdjustedBudget = num(c["amount.sum"]);
    if (t === "ORGB") s.capexOriginalBudget = num(c["amount.sum"]);
  }
  for (const c of fp) slot(raw, c).items[String(c["item.code"])] = num(c["amount.sum"]);
  return raw;
}

const sum = (items: Record<string, number>, codes: string[]) => codes.reduce((s, k) => s + (items[k] ?? 0), 0);
const has = (items: Record<string, number>, codes: string[]) => codes.some((k) => k in items);
const nz = (v: number | undefined) => v !== undefined && v !== 0;

/** Computes the Treasury scorecard indicators for one municipality-year. Missing inputs give null values. */
export function computeIndicators(r: RawYear | undefined): Indicator[] {
  const x = r ?? { items: {} };
  const out: Indicator[] = [];

  // 1. Cash balance
  {
    const v = x.cashAtYearEnd ?? null;
    out.push({
      key: "cash_balance",
      label: "Cash balance at year end",
      value: v,
      unit: "rand",
      rating: v === null ? null : v > 0 ? "good" : "bad",
      rule: "Good: positive. Bad: zero or negative.",
      formula: "Cash and cash equivalents at year end (cash flow statement)",
    });
  }

  // 2. Cash coverage
  {
    const ok = x.cashAtYearEnd !== undefined && nz(x.opexActual);
    const v = ok ? Math.max(x.cashAtYearEnd! / (x.opexActual! / 12), 0) : null;
    out.push({
      key: "cash_coverage",
      label: "Cash coverage",
      value: v,
      unit: "months",
      rating: v === null ? null : v > 3 ? "good" : v <= 1 ? "bad" : "average",
      rule: "Good: more than 3 months. Average: 1–3 months. Bad: 1 month or less.",
      formula: "Cash at year end ÷ (operating expenditure ÷ 12)",
    });
  }

  // 3. Current ratio
  {
    const ok = has(x.items, CURRENT_ASSETS_CODES) && sum(x.items, CURRENT_LIABILITIES_CODES) !== 0;
    const v = ok ? sum(x.items, CURRENT_ASSETS_CODES) / sum(x.items, CURRENT_LIABILITIES_CODES) : null;
    out.push({
      key: "current_ratio",
      label: "Current ratio",
      value: v,
      unit: "ratio",
      rating: v === null ? null : v >= 1.5 ? "good" : v >= 1 ? "average" : "bad",
      rule: "Good: 1.5 or more. Average: 1 to 1.5. Bad: below 1.",
      formula: "Current assets ÷ current liabilities",
    });
  }

  // 4. Liquidity ratio
  {
    const liab = sum(x.items, CURRENT_LIABILITIES_CODES);
    const ok = has(x.items, [CASH_CODE, SHORT_TERM_INVESTMENTS_CODE]) && liab !== 0;
    const v = ok ? sum(x.items, [CASH_CODE, SHORT_TERM_INVESTMENTS_CODE]) / liab : null;
    out.push({
      key: "liquidity_ratio",
      label: "Liquidity ratio",
      value: v,
      unit: "ratio",
      rating: v === null ? null : v >= 1 ? "good" : "bad",
      rule: "Good: 1 or more. Bad: below 1.",
      formula: "(Cash + short-term investments) ÷ current liabilities",
    });
  }

  // 5. Current debtors collection rate
  {
    const ok = x.collectedRevenue !== undefined && nz(x.billedRevenue);
    const v = ok ? (x.collectedRevenue! / x.billedRevenue!) * 100 : null;
    out.push({
      key: "collection_rate",
      label: "Current debtors collection rate",
      value: v,
      unit: "percent",
      rating: v === null ? null : Math.round(v) >= 95 ? "good" : "bad",
      rule: "Good: 95% or more. Bad: below 95%.",
      formula: "Revenue collected (rates, service charges) ÷ revenue billed × 100",
    });
  }

  // 6. Unauthorised, irregular, fruitless and wasteful expenditure
  {
    const ok = x.uifw !== undefined && nz(x.opexActual);
    const v = ok ? (x.uifw! / x.opexActual!) * 100 : null;
    out.push({
      key: "uifw_expenditure",
      label: "Unauthorised, irregular, fruitless and wasteful expenditure",
      value: v,
      unit: "percent",
      rating: v === null ? null : v === 0 ? "good" : "bad",
      rule: "Good: 0%. Bad: anything above 0%.",
      formula: "UIFW expenditure ÷ operating expenditure × 100",
      note: x.uifw === undefined ? "No UIFW figure was reported for this year." : undefined,
    });
  }

  // 7. Repairs and maintenance
  {
    const assets = sum(x.items, [PPE_CODE, INVESTMENT_PROPERTY_CODE]);
    const ok = x.repairsMaintenance !== undefined && assets !== 0;
    const v = ok ? (x.repairsMaintenance! / assets) * 100 : null;
    out.push({
      key: "repairs_maintenance",
      label: "Repairs and maintenance spending",
      value: v,
      unit: "percent",
      rating: v === null ? null : Math.abs(v) >= 8 ? "good" : "bad",
      rule: "Good: 8% or more of asset value. Bad: below 8%.",
      formula: "Repairs and maintenance ÷ (property, plant and equipment + investment property) × 100",
    });
  }

  // 8 & 9. Budget spending (adjusted budget, falling back to the original budget)
  const budgetIndicator = (
    key: string,
    label: string,
    actual: number | undefined,
    adjusted: number | undefined,
    original: number | undefined,
  ): Indicator => {
    const budget = nz(adjusted) ? adjusted : nz(original) ? original : undefined;
    const basis = nz(adjusted) ? "adjusted budget" : nz(original) ? "original budget" : undefined;
    const v = actual !== undefined && budget ? ((actual - budget) / budget) * 100 : null;
    const a = v === null ? null : Math.abs(v);
    return {
      key,
      label,
      value: v,
      unit: "percent",
      rating: a === null ? null : a <= 5 ? "good" : a <= 15 ? "average" : "bad",
      rule: "Good: within 5% of budget. Average: 5–15%. Bad: more than 15% over or under.",
      formula: "(Actual − budget) ÷ budget × 100. Negative means underspent.",
      note: basis === "original budget" ? "No adjusted budget was reported, so the original budget is used." : undefined,
    };
  };
  out.push(budgetIndicator("operating_budget_spending", "Operating budget spending", x.opexActual, x.opexAdjustedBudget, x.opexOriginalBudget));
  out.push(budgetIndicator("capital_budget_spending", "Capital budget spending", x.capexActual, x.capexAdjustedBudget, x.capexOriginalBudget));

  return out;
}

/** Summary counts of good / average / bad across available indicators. */
export function scoreSummary(ind: Indicator[]): { good: number; average: number; bad: number; missing: number } {
  const s = { good: 0, average: 0, bad: 0, missing: 0 };
  for (const i of ind) {
    if (i.rating === null) s.missing++;
    else s[i.rating]++;
  }
  return s;
}

/**
 * Audited cash coverage in months for one financial year, asking Treasury only for the two datasets it needs
 * (cash at year end and operating spending). The formula is the scorecard's own, so the answer matches
 * financial_health. Used where nothing else from the scorecard is wanted, so that an outage in an unrelated
 * dataset (capital spending, say) cannot take the answer down with it.
 */
export async function cashCoverageMonths(codes: string[], fy: number): Promise<Record<string, number | null>> {
  const base = { "demarcation.code": codes, "period_length.length": ["year"], "financial_year_end.year": [fy], "amount_type.code": ["AUDA"] };
  const [cash, opex] = await Promise.all([
    aggregate("cflow_v2", { ...base, "item.code": [CASH_AT_YEAR_END_CODE] }, ["demarcation.code"]),
    aggregate("incexp_v2", { ...base, "item.code": SPENDING_CODES }, ["demarcation.code", "amount_type.code"]),
  ]);
  const raw: Record<string, RawYear> = {};
  const slotFor = (c: Cell) => (raw[code(c)] ??= { items: {} });
  for (const c of cash) slotFor(c).cashAtYearEnd = num(c["amount.sum"]);
  for (const c of opex) if (c["amount_type.code"] === "AUDA") slotFor(c).opexActual = num(c["amount.sum"]);
  const out: Record<string, number | null> = {};
  for (const k of codes) out[k] = computeIndicators(raw[k]).find((i) => i.key === "cash_coverage")?.value ?? null;
  return out;
}

/**
 * Audited collection rate (percent) for one financial year: what was collected from customers against what
 * was billed. Same formula as the scorecard, asking only for the two datasets it needs.
 */
export async function collectionRates(codes: string[], fy: number): Promise<Record<string, number | null>> {
  const base = { "demarcation.code": codes, "period_length.length": ["year"], "financial_year_end.year": [fy], "amount_type.code": ["AUDA"] };
  const [collected, billed] = await Promise.all([
    aggregate("cflow_v2", { ...base, "item.code": COLLECTED_REVENUE_CODES }, ["demarcation.code"]),
    aggregate("incexp_v2", { ...base, "item.code": BILLED_REVENUE_CODES }, ["demarcation.code"]),
  ]);
  const raw: Record<string, RawYear> = {};
  const slotFor = (c: Cell) => (raw[code(c)] ??= { items: {} });
  for (const c of collected) slotFor(c).collectedRevenue = num(c["amount.sum"]);
  for (const c of billed) slotFor(c).billedRevenue = num(c["amount.sum"]);
  const out: Record<string, number | null> = {};
  for (const k of codes) out[k] = computeIndicators(raw[k]).find((i) => i.key === "collection_rate")?.value ?? null;
  return out;
}

export interface IrregularExpenditure {
  /** Financial year end of the latest audited figure, e.g. 2024 for 2023/24. */
  year: number;
  /** Rands. Zero is a real answer: the statements reported none. */
  amount: number;
  /** As a share of that year's audited operating spending (0.012 = 1.2%), or null when spending was not reported. */
  shareOfSpending: number | null;
}

/**
 * Latest audited irregular expenditure for each municipality: spending that did not follow the law or the
 * municipality's own supply chain rules, from the notes to its annual financial statements (uifwexp cube).
 * It is the nearest figure Treasury publishes to how contracts were awarded. Municipalities with no figure are left out.
 */
export async function latestIrregularExpenditure(codes: string[], fromYear: number, toYear: number): Promise<Record<string, IrregularExpenditure>> {
  const years: number[] = [];
  for (let y = toYear; y >= fromYear; y--) years.push(y);
  const cells = await aggregate(
    "uifwexp",
    { "demarcation.code": codes, "financial_year_end.year": years, "item.code": ["irregular"] },
    ["demarcation.code", "financial_year_end.year"],
  );
  const out: Record<string, IrregularExpenditure> = {};
  for (const c of cells) {
    if (typeof c["amount.sum"] !== "number") continue; // null means not reported, which is not the same as zero
    const k = code(c);
    if (!out[k] || year(c) > out[k].year) out[k] = { year: year(c), amount: Math.abs(c["amount.sum"]), shareOfSpending: null };
  }
  // That year's audited operating spending, to show the figure in proportion.
  const byYear = new Map<number, string[]>();
  for (const [k, v] of Object.entries(out)) byYear.set(v.year, [...(byYear.get(v.year) ?? []), k]);
  await Promise.all(
    [...byYear].map(async ([y, list]) => {
      const spending = await aggregate(
        "incexp_v2",
        { "demarcation.code": list, "period_length.length": ["year"], "financial_year_end.year": [y], "item.code": SPENDING_CODES, "amount_type.code": ["AUDA"] },
        ["demarcation.code"],
      );
      for (const c of spending) {
        const total = num(c["amount.sum"]);
        if (total > 0 && out[code(c)]) out[code(c)].shareOfSpending = out[code(c)].amount / total;
      }
    }),
  );
  return out;
}

/** Latest financial year with audited cash-flow figures for each municipality. */
export async function latestAuditedYears(codes: string[], fromYear: number, toYear: number): Promise<Record<string, number>> {
  const years: number[] = [];
  for (let y = toYear; y >= fromYear; y--) years.push(y);
  const cells = await aggregate(
    "cflow_v2",
    {
      "demarcation.code": codes,
      "period_length.length": ["year"],
      "financial_year_end.year": years,
      "item.code": [CASH_AT_YEAR_END_CODE],
      "amount_type.code": ["AUDA"],
    },
    ["demarcation.code", "financial_year_end.year"],
  );
  const out: Record<string, number> = {};
  for (const c of cells) {
    const k = code(c);
    out[k] = Math.max(out[k] ?? 0, year(c));
  }
  return out;
}
