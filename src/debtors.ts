// Monthly aged-debtor analysis: who owes the municipality, for what, and for how long.
// Source: aged_debtor_v2 cube (Section 71 monthly returns), amount type ACT (actual).
// A municipality that is not paid by its own customers runs short of cash to pay its suppliers.
import { aggregate, type Cell } from "./api.js";
import { BUCKETS, ageing, periodLabel, type Ageing } from "./creditors.js";

/** What the money is owed for. */
export const DEBTOR_SOURCES: Record<string, string> = {
  "1200": "Water",
  "1300": "Electricity",
  "1400": "Property rates",
  "1500": "Waste water",
  "1600": "Refuse removal",
  "1700": "Property rentals",
  "1810": "Interest on arrears",
  "1900": "Other",
};
/** Who owes it. Treasury's term for the first is "organs of state". */
export const DEBTOR_CUSTOMERS: Record<string, string> = {
  "2200": "Government (organs of state)",
  "2300": "Businesses",
  "2400": "Households",
  "2500": "Other",
};
const TOTAL_BY_SOURCE = "2000";

export interface DebtorMonth {
  fy: number;
  period: number;
  label: string;
  bySource: Record<string, Ageing>;
  byCustomer: Record<string, Ageing>;
  /** Total owed to the municipality: Treasury's "total by income source", or the sum of the sources if that line is empty. */
  total: Ageing;
}

function add(list: Ageing[]): Ageing {
  return {
    total: list.reduce((s, a) => s + a.total, 0),
    buckets: BUCKETS.map(([, label], i) => ({ label, amount: list.reduce((s, a) => s + a.buckets[i].amount, 0) })),
    over30: list.reduce((s, a) => s + a.over30, 0),
    over90: list.reduce((s, a) => s + a.over90, 0),
  };
}

/** Monthly debtor ageing for one municipality over the given financial years, newest month first. */
export async function fetchDebtorMonths(demarcationCode: string, fys: number[]): Promise<DebtorMonth[]> {
  const aggregates = [...BUCKETS.map(([k]) => `${k}.sum`), "total_amount.sum"].join("|");
  const cells = await aggregate(
    "aged_debtor_v2",
    {
      "demarcation.code": [demarcationCode],
      "amount_type.code": ["ACT"],
      "period_length.length": ["month"],
      "financial_year_end.year": fys,
      "item.code": [...Object.keys(DEBTOR_SOURCES), ...Object.keys(DEBTOR_CUSTOMERS), TOTAL_BY_SOURCE],
    },
    ["financial_year_end.year", "financial_period.period", "item.code"],
    aggregates,
  );
  const months = new Map<string, { fy: number; period: number; rows: Record<string, Ageing> }>();
  for (const c of cells as Cell[]) {
    const fy = Number(c["financial_year_end.year"]);
    const period = Number(c["financial_period.period"]);
    const key = `${fy}-${period}`;
    const m = months.get(key) ?? { fy, period, rows: {} };
    m.rows[String(c["item.code"])] = ageing(c);
    months.set(key, m);
  }
  const pick = (rows: Record<string, Ageing>, codes: Record<string, string>) =>
    Object.fromEntries(Object.keys(codes).filter((k) => rows[k] && rows[k].total > 0).map((k) => [k, rows[k]]));
  return [...months.values()]
    .map((m) => {
      const bySource = pick(m.rows, DEBTOR_SOURCES);
      const reported = m.rows[TOTAL_BY_SOURCE];
      return {
        fy: m.fy,
        period: m.period,
        label: periodLabel(m.fy, m.period),
        bySource,
        byCustomer: pick(m.rows, DEBTOR_CUSTOMERS),
        total: reported && reported.total > 0 ? reported : add(Object.values(bySource)),
      };
    })
    .filter((m) => m.total.total > 0)
    .sort((a, b) => b.fy - a.fy || b.period - a.period);
}
