// Monthly aged-creditor analysis: how quickly a municipality pays what it owes.
// Source: aged_creditor_v2 cube (Section 71 monthly returns), amount type ACT (actual).
import { aggregate, num, type Cell } from "./api.js";

export const CREDITOR_ITEMS: Record<string, string> = {
  "0100": "Bulk electricity",
  "0200": "Bulk water",
  "0300": "PAYE deductions",
  "0400": "VAT",
  "0500": "Pension / retirement deductions",
  "0600": "Loan repayments",
  "0700": "Trade creditors",
  "0800": "Auditor-General",
  "0900": "Other",
  "0950": "Medical aid deductions",
};

export const BUCKETS = [
  ["l30_amount", "0–30 days"],
  ["l60_amount", "31–60 days"],
  ["l90_amount", "61–90 days"],
  ["l120_amount", "91–120 days"],
  ["l150_amount", "121–150 days"],
  ["l180_amount", "151–180 days"],
  ["l1_amount", "181 days – 1 year"],
  ["g1_amount", "Over 1 year"],
] as const;
const OVER_30 = ["l60_amount", "l90_amount", "l120_amount", "l150_amount", "l180_amount", "l1_amount", "g1_amount"];
const OVER_90 = ["l120_amount", "l150_amount", "l180_amount", "l1_amount", "g1_amount"];

export interface Ageing {
  total: number;
  buckets: { label: string; amount: number }[];
  over30: number;
  over90: number;
}

export interface CreditorMonth {
  fy: number; // financial year end (e.g. 2026 = July 2025 – June 2026)
  period: number; // 1 = July … 12 = June
  label: string; // e.g. "Mar 2026"
  byItem: Record<string, Ageing>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Municipal financial years run July–June; period 1 is July. */
export function periodLabel(fy: number, period: number): string {
  const monthIndex = (period + 5) % 12; // period 1 -> 6 (Jul)
  const calYear = period <= 6 ? fy - 1 : fy;
  return `${MONTHS[monthIndex]} ${calYear}`;
}

export function currentFinancialYear(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

/** Turns one row of an ageing return (creditors or debtors) into totals and the shares past 30 and 90 days. */
export function ageing(c: Cell): Ageing {
  const amt = (k: string) => Math.abs(num(c[`${k}.sum`]));
  const buckets = BUCKETS.map(([k, label]) => ({ label, amount: amt(k) }));
  const bucketTotal = buckets.reduce((s, b) => s + b.amount, 0);
  const total = Math.max(Math.abs(num(c["total_amount.sum"])), bucketTotal);
  return {
    total,
    buckets,
    over30: OVER_30.reduce((s, k) => s + amt(k), 0),
    over90: OVER_90.reduce((s, k) => s + amt(k), 0),
  };
}

/** Monthly creditor ageing for one municipality over the given financial years, newest month first. */
export async function fetchCreditorMonths(demarcationCode: string, fys: number[]): Promise<CreditorMonth[]> {
  const aggregates = [...BUCKETS.map(([k]) => `${k}.sum`), "total_amount.sum"].join("|");
  const cells = await aggregate(
    "aged_creditor_v2",
    {
      "demarcation.code": [demarcationCode],
      "amount_type.code": ["ACT"],
      "period_length.length": ["month"],
      "financial_year_end.year": fys,
      "item.code": Object.keys(CREDITOR_ITEMS),
    },
    ["financial_year_end.year", "financial_period.period", "item.code"],
    aggregates,
  );
  const months = new Map<string, CreditorMonth>();
  for (const c of cells) {
    const fy = Number(c["financial_year_end.year"]);
    const period = Number(c["financial_period.period"]);
    const key = `${fy}-${period}`;
    let m = months.get(key);
    if (!m) {
      m = { fy, period, label: periodLabel(fy, period), byItem: {} };
      months.set(key, m);
    }
    m.byItem[String(c["item.code"])] = ageing(c);
  }
  return [...months.values()]
    .filter((m) => Object.values(m.byItem).some((a) => a.total > 0))
    .sort((a, b) => b.fy - a.fy || b.period - a.period);
}

export function totalOf(m: CreditorMonth): Ageing {
  const all = Object.values(m.byItem);
  const total = all.reduce((s, a) => s + a.total, 0);
  return {
    total,
    buckets: BUCKETS.map(([, label], i) => ({ label, amount: all.reduce((s, a) => s + a.buckets[i].amount, 0) })),
    over30: all.reduce((s, a) => s + a.over30, 0),
    over90: all.reduce((s, a) => s + a.over90, 0),
  };
}

export type RiskBand = "low" | "moderate" | "high";

export interface PaymentRisk {
  band: RiskBand;
  reasons: string[];
}

/**
 * What the payment-risk check cannot see. Treasury's returns give the age of what is owed and nothing
 * about why, so these are stated with every answer rather than guessed at. One source for the tool
 * output and for anything built on it.
 */
export const PAYMENT_RISK_LIMITS: string[] = [
  "Whether any of the debt is in dispute or arbitration. A disputed bill shows as old debt, the same as an unpaid one.",
  "Court orders, payment plans and National Treasury's Eskom debt relief, under which Eskom debt from before April 2023 can be written off in stages if the municipality keeps to the conditions.",
  "Claims and lawsuits against the municipality that could take cash away from paying suppliers.",
  "Unsolicited bids. Irregular expenditure is the nearest published figure, and it is wider.",
];
export const PAYMENT_RISK_LIMITS_WHERE = "Where these are disclosed, it is in the municipality's own annual financial statements.";
/** Plain meaning of irregular expenditure, for wherever the figure is shown. */
export const IRREGULAR_EXPENDITURE_MEANING = "spending that did not follow the law or the municipality's own supply chain rules";
/** The figure can exceed a whole year's spending for some municipalities, so it cannot be assumed to be one year's alone. */
export const IRREGULAR_EXPENDITURE_CAVEAT = "Treasury's data does not say whether the figure is for that year alone or includes earlier years not yet resolved.";

/**
 * Root 7's payment-risk heuristic (not a Treasury rating). The MFMA (s65(2)(e)) requires
 * municipalities to pay creditors within 30 days, so the share owed for longer is the signal.
 */
export function assessPaymentRisk(latest: CreditorMonth, cashCoverageMonths?: number | null): PaymentRisk {
  const trade = latest.byItem["0700"];
  const bulk = [latest.byItem["0100"], latest.byItem["0200"]].filter(Boolean) as Ageing[];
  const reasons: string[] = [];
  let score = 0;

  const share = (a: Ageing | undefined, k: "over30" | "over90") => (a && a.total > 0 ? a[k] / a.total : 0);
  const trade90 = share(trade, "over90");
  const trade30 = share(trade, "over30");
  const bulkOwed = bulk.reduce((s, a) => s + a.total, 0);
  const bulk90 = bulkOwed > 0 ? bulk.reduce((s, a) => s + a.over90, 0) / bulkOwed : 0;

  if (trade90 >= 0.25) {
    score += 2;
    reasons.push(`${pct(trade90)} of trade-creditor debt is more than 90 days old.`);
  } else if (trade90 >= 0.05) {
    score += 1;
    reasons.push(`${pct(trade90)} of trade-creditor debt is more than 90 days old.`);
  }
  if (trade30 >= 0.5) {
    score += 1;
    reasons.push(`${pct(trade30)} of trade-creditor debt is past the MFMA's 30-day payment requirement.`);
  }
  if (bulk90 >= 0.1) {
    score += 2;
    reasons.push(`${pct(bulk90)} of bulk electricity and water accounts are more than 90 days in arrears.`);
  }
  if (cashCoverageMonths !== undefined && cashCoverageMonths !== null && cashCoverageMonths <= 1) {
    score += 1;
    reasons.push(`Audited cash coverage was only ${cashCoverageMonths.toFixed(1)} months.`);
  }
  if (!trade || trade.total === 0) reasons.push("No trade-creditor figures were reported for this month.");
  if (reasons.length === 0) reasons.push("Most creditors are reported as paid within 30 days.");

  const band: RiskBand = score >= 3 ? "high" : score >= 1 ? "moderate" : "low";
  return { band, reasons };
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}
