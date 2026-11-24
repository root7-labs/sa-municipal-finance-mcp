// Tool implementations. Each returns Markdown for the AI client to read and cite.
import {
  cashCoverageMonths,
  computeIndicators,
  fetchRaw,
  latestAuditedYears,
  latestIrregularExpenditure,
  scoreSummary,
  type Indicator,
  type Rating,
} from "./indicators.js";
import {
  CATEGORY_LABELS,
  PROVINCES,
  auditOpinions,
  fyLabel,
  provinceCode,
  resolveFormer,
  resolveMunicipality,
  searchMunicipalities,
  type Municipality,
} from "./municipalities.js";
import {
  CREDITOR_ITEMS,
  IRREGULAR_EXPENDITURE_CAVEAT,
  IRREGULAR_EXPENDITURE_MEANING,
  PAYMENT_RISK_LIMITS,
  PAYMENT_RISK_LIMITS_WHERE,
  assessPaymentRisk,
  currentFinancialYear,
  fetchCreditorMonths,
  pct,
  totalOf,
} from "./creditors.js";

export const FIRST_V2_YEAR = 2020; // mSCOA "v2" data starts with the 2019/20 financial year
export const MAX_COMPARE = 20;

// ---------- formatting helpers ----------

export function rand(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}R${(a / 1e9).toFixed(2)} bn`;
  if (a >= 1e6) return `${sign}R${(a / 1e6).toFixed(1)} m`;
  if (a >= 1e3) return `${sign}R${(a / 1e3).toFixed(0)} k`;
  return `${sign}R${a.toFixed(0)}`;
}

export function fmtIndicator(i: Indicator): string {
  if (i.value === null) return "n/a";
  switch (i.unit) {
    case "rand":
      return rand(i.value);
    case "months":
      return `${i.value.toFixed(1)} months`;
    case "ratio":
      return i.value.toFixed(2);
    case "percent":
      return `${i.value.toFixed(1)}%`;
  }
}

const RATING_TEXT: Record<Rating, string> = { good: "✅ Good", average: "🟡 Average", bad: "🔴 Bad" };
const ratingText = (r: Rating | null) => (r ? RATING_TEXT[r] : "— No data");

const retrieved = () => new Date().toISOString().slice(0, 10);

export function sourceNote(extra = ""): string {
  return [
    `_Source: National Treasury, Municipal Money (municipaldata.treasury.gov.za), retrieved ${retrieved()}${extra}. ` +
      "Figures are as submitted by municipalities and may be revised. Not affiliated with or endorsed by National Treasury._",
  ].join("\n");
}

function muniHeading(m: Municipality): string {
  const heading = `${m.name} (${m.code}) — ${CATEGORY_LABELS[m.category] ?? m.category}, ${m.province}`;
  return m.note ? `${heading}\n\n_${m.note}_\n` : heading;
}

/** Puts the "this municipality was merged" note, if there is one, ahead of a one-line answer. */
function withNote(m: Municipality, text: string): string {
  return m.note ? `_${m.note}_\n\n${text}` : text;
}

// ---------- free tools ----------

export async function toolFindMunicipality(a: { query?: string; province?: string; category?: "A" | "B" | "C"; limit?: number }): Promise<string> {
  const list = await searchMunicipalities(a);
  const limit = a.limit ?? 25;
  if (list.length === 0) {
    // A name that matches nothing current may be a municipality that was merged away.
    const successor = a.query ? await resolveFormer(a.query).catch((e: Error) => e.message) : undefined;
    if (typeof successor === "string") return successor;
    if (successor?.note) return successor.note.replace(/, so these figures are for .*$/, ".");
    return `No municipalities match${a.query ? ` "${a.query}"` : ""}.`;
  }
  const rows = list.slice(0, limit).map((m) => `| ${m.name} | ${m.code} | ${CATEGORY_LABELS[m.category] ?? m.category} | ${m.province} |`);
  return [
    `### Municipalities (${Math.min(limit, list.length)} of ${list.length})`,
    "| Name | Code | Type | Province |",
    "|---|---|---|---|",
    ...rows,
    "",
    "Use the code (e.g. CPT, JHB, WC024) with the other tools.",
  ].join("\n");
}

export async function toolProfile(a: { municipality: string }): Promise<string> {
  const m = await resolveMunicipality(a.municipality);
  const [opinions, latest] = await Promise.all([
    auditOpinions(m.code),
    latestAuditedYears([m.code], FIRST_V2_YEAR, currentFinancialYear()),
  ]);
  const lines = [
    `### ${muniHeading(m)}`,
    m.parentCode && m.parentCode !== m.provinceCode ? `- District: ${m.parentCode}` : "",
    m.miifCategory ? `- Treasury capacity category (MIIF): ${m.miifCategory}` : "",
    m.phone ? `- Phone: ${m.phone}` : "",
    m.url ? `- Website: ${m.url}` : "",
    m.address ? `- Address: ${m.address}` : "",
    latest[m.code] ? `- Latest audited financial year in the data: ${fyLabel(latest[m.code])}` : "- No audited mSCOA financial statements in the data yet.",
    "",
  ].filter((l) => l !== "");
  lines.push("", "#### Auditor-General opinions", "");
  if (opinions.length === 0) lines.push("No audit opinions recorded.");
  else {
    lines.push("| Year | Opinion | Report |", "|---|---|---|");
    for (const o of opinions.slice(0, 8)) {
      lines.push(`| ${fyLabel(o.year)} | ${o.opinion} | ${o.reportUrl ? `[PDF](${encodeURI(decodeURI(o.reportUrl))})` : "—"} |`);
    }
  }
  lines.push("", "Run financial_health for the cash, liquidity, collection and spending indicators.", "", sourceNote());
  return lines.join("\n");
}

function indicatorTable(ind: Indicator[]): string[] {
  return [
    "| Indicator | Value | Rating | Benchmark |",
    "|---|---|---|---|",
    ...ind.map((i) => `| ${i.label} | ${fmtIndicator(i)} | ${ratingText(i.rating)} | ${i.rule} |`),
  ];
}

export async function toolFinancialHealth(a: { municipality: string; year?: number }): Promise<string> {
  const m = await resolveMunicipality(a.municipality);
  let fy = a.year;
  if (!fy) {
    const latest = await latestAuditedYears([m.code], FIRST_V2_YEAR, currentFinancialYear());
    fy = latest[m.code];
    if (!fy) return withNote(m, `${m.name} (${m.code}) has no audited mSCOA financial statements in the Municipal Money data yet.`);
  }
  if (fy < FIRST_V2_YEAR) throw new Error(`Indicators are available from the ${fyLabel(FIRST_V2_YEAR)} financial year onwards.`);
  const raw = await fetchRaw([m.code], [fy]);
  const ind = computeIndicators(raw[m.code]?.[fy]);
  const s = scoreSummary(ind);
  const notes = ind.filter((i) => i.note).map((i) => `- ${i.label}: ${i.note}`);
  return [
    `### Financial health: ${muniHeading(m)}`,
    `Audited financial year ${fyLabel(fy)} (July ${fy - 1} – June ${fy}). ${s.good} good, ${s.average} average, ${s.bad} bad${s.missing ? `, ${s.missing} without data` : ""}.`,
    "",
    ...indicatorTable(ind),
    "",
    ...(notes.length ? ["Notes:", ...notes, ""] : []),
    "Benchmarks are National Treasury's (MFMA Circular 71 and the Municipal Money scorecard).",
    "",
    sourceNote(", audited figures"),
  ].join("\n");
}

// ---------- Pro tools ----------

export async function toolHealthTrend(a: { municipality: string; years?: number }): Promise<string> {
  const m = await resolveMunicipality(a.municipality);
  const latest = (await latestAuditedYears([m.code], FIRST_V2_YEAR, currentFinancialYear()))[m.code];
  if (!latest) return withNote(m, `${m.name} (${m.code}) has no audited mSCOA financial statements in the data yet.`);
  const n = Math.min(Math.max(a.years ?? 5, 2), 7);
  const years: number[] = [];
  for (let y = latest; y > latest - n && y >= FIRST_V2_YEAR; y--) years.push(y);
  years.reverse();
  const raw = await fetchRaw([m.code], years);
  const perYear = years.map((y) => computeIndicators(raw[m.code]?.[y]));
  const keys = perYear[0].map((i) => i.key);
  const header = `| Indicator | ${years.map(fyLabel).join(" | ")} | Trend |`;
  const rows = keys.map((k, idx) => {
    const series = perYear.map((ind) => ind[idx]);
    const vals = series.map((i) => (i.value === null ? "n/a" : `${fmtIndicator(i)}${i.rating === "bad" ? " 🔴" : i.rating === "good" ? " ✅" : i.rating === "average" ? " 🟡" : ""}`));
    const first = series.find((i) => i.value !== null);
    const last = [...series].reverse().find((i) => i.value !== null);
    const order: Record<Rating, number> = { bad: 0, average: 1, good: 2 };
    let trend = "—";
    if (first && last && first !== last && first.rating && last.rating) {
      trend = order[last.rating] > order[first.rating] ? "Improving" : order[last.rating] < order[first.rating] ? "Worsening" : "Steady";
    }
    return `| ${series[0].label} | ${vals.join(" | ")} | ${trend} |`;
  });
  return [
    `### Financial health trend: ${muniHeading(m)}`,
    header,
    `|---|${years.map(() => "---").join("|")}|---|`,
    ...rows,
    "",
    "Trend compares the rating in the first and last year with data.",
    "",
    sourceNote(", audited figures"),
  ].join("\n");
}

export async function toolPaymentRisk(a: { municipality: string; months?: number }): Promise<string> {
  const m = await resolveMunicipality(a.municipality);
  const fy = currentFinancialYear();
  const [months, latestAudit, irregularByCode] = await Promise.all([
    fetchCreditorMonths(m.code, [fy, fy - 1]),
    latestAuditedYears([m.code], FIRST_V2_YEAR, fy),
    // Context only: it never changes the band, and a failure here must not cost the user the answer.
    latestIrregularExpenditure([m.code], FIRST_V2_YEAR, fy).catch(() => ({}) as Awaited<ReturnType<typeof latestIrregularExpenditure>>),
  ]);
  if (months.length === 0) {
    return withNote(m, `${m.name} (${m.code}) has not reported monthly creditor ageing for ${fyLabel(fy - 1)} or ${fyLabel(fy)}.\n\n${sourceNote()}`);
  }
  const latest = months[0];
  let coverage: number | null = null;
  if (latestAudit[m.code]) coverage = (await cashCoverageMonths([m.code], latestAudit[m.code]))[m.code] ?? null;
  const risk = assessPaymentRisk(latest, coverage);
  const total = totalOf(latest);
  const lines = [
    `### Supplier payment risk: ${muniHeading(m)}`,
    `**Risk band: ${risk.band.toUpperCase()}** (Root 7 heuristic based on how long creditors wait, not a Treasury rating)`,
    ...risk.reasons.map((r) => `- ${r}`),
    "",
    `#### Creditors at end of ${latest.label}`,
    `Total owed: ${rand(total.total)}; ${total.total ? pct(total.over30 / total.total) : "n/a"} older than 30 days; ${total.total ? pct(total.over90 / total.total) : "n/a"} older than 90 days.`,
    "",
    "| Creditor type | Owed | > 30 days | > 90 days |",
    "|---|---|---|---|",
  ];
  for (const [codeKey, label] of Object.entries(CREDITOR_ITEMS)) {
    const ag = latest.byItem[codeKey];
    if (!ag || ag.total === 0) continue;
    lines.push(`| ${label} | ${rand(ag.total)} | ${pct(ag.over30 / ag.total)} | ${pct(ag.over90 / ag.total)} |`);
  }
  const n = Math.min(Math.max(a.months ?? 6, 1), 12);
  const hist = months.slice(0, n);
  if (hist.length > 1) {
    lines.push("", "#### Trade creditors over recent months", "| Month | Owed | > 30 days | > 90 days |", "|---|---|---|---|");
    for (const mo of hist) {
      const t = mo.byItem["0700"];
      if (!t || t.total === 0) {
        lines.push(`| ${mo.label} | n/a | n/a | n/a |`);
        continue;
      }
      lines.push(`| ${mo.label} | ${rand(t.total)} | ${pct(t.over30 / t.total)} | ${pct(t.over90 / t.total)} |`);
    }
  }
  const ageMonths = monthsSince(latest.fy, latest.period);
  if (ageMonths > 9) lines.push("", `⚠️ The latest monthly return is from ${latest.label}, ${ageMonths} months ago. The picture may have changed.`);
  lines.push(
    "",
    "The MFMA (section 65(2)(e)) requires municipalities to pay creditors within 30 days of receiving an invoice.",
    coverage !== null ? `Latest audited cash coverage: ${coverage.toFixed(1)} months (${fyLabel(latestAudit[m.code])}).` : "",
  );
  // Context beside the band. None of this moves the band, which rests only on figures every municipality reports.
  const irregular = irregularByCode[m.code];
  lines.push(
    "",
    "#### Context (does not change the band)",
    irregular
      ? `- Irregular expenditure: ${rand(irregular.amount)} reported in the ${fyLabel(irregular.year)} audited statements${irregular.shareOfSpending !== null ? `, equal to ${pct(irregular.shareOfSpending, 1)} of that year's operating spending` : ""}. This is ${IRREGULAR_EXPENDITURE_MEANING}. ${IRREGULAR_EXPENDITURE_CAVEAT}`
      : "- Irregular expenditure: no audited figure has been published for this municipality.",
    "",
    "#### What this check cannot see",
    "Treasury's returns show how old the debt is, not why. They do not show:",
    ...PAYMENT_RISK_LIMITS.map((l) => `- ${l}`),
    "",
    PAYMENT_RISK_LIMITS_WHERE,
    "",
    sourceNote(", Section 71 monthly returns (unaudited) and audited annual financial statements"),
  );
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

function monthsSince(fy: number, period: number, now = new Date()): number {
  const monthIndex = (period + 5) % 12;
  const calYear = period <= 6 ? fy - 1 : fy;
  return (now.getUTCFullYear() - calYear) * 12 + (now.getUTCMonth() - monthIndex);
}

const SORTABLE = ["cash_coverage", "current_ratio", "liquidity_ratio", "collection_rate", "uifw_expenditure", "repairs_maintenance"] as const;
export type SortKey = (typeof SORTABLE)[number] | "score";
export const SORT_KEYS = ["score", ...SORTABLE] as const;

export async function toolCompare(a: {
  municipalities?: string[];
  province?: string;
  category?: "A" | "B" | "C";
  sort_by?: SortKey;
}): Promise<string> {
  let munis: Municipality[];
  if (a.municipalities && a.municipalities.length) {
    if (a.municipalities.length > MAX_COMPARE) throw new Error(`Compare up to ${MAX_COMPARE} municipalities at a time.`);
    munis = [];
    for (const name of a.municipalities) munis.push(await resolveMunicipality(name));
  } else if (a.province || a.category) {
    if (a.province && !provinceCode(a.province)) throw new Error(`Unknown province "${a.province}". Use one of: ${Object.values(PROVINCES).join(", ")}.`);
    munis = await searchMunicipalities({ province: a.province, category: a.category });
    if (munis.length > 60) throw new Error(`That selects ${munis.length} municipalities. Narrow it with a province or category (60 max).`);
  } else {
    throw new Error("Give a list of municipalities, or a province and/or category to compare.");
  }
  if (munis.length < 2) throw new Error("Need at least two municipalities to compare.");
  const codes = [...new Set(munis.map((m) => m.code))];
  const latest = await latestAuditedYears(codes, FIRST_V2_YEAR, currentFinancialYear());
  const years = [...new Set(Object.values(latest))];
  const raw = years.length ? await fetchRaw(codes, years) : {};
  const rows = munis
    .filter((m, i, arr) => arr.findIndex((x) => x.code === m.code) === i)
    .map((m) => {
      const fy = latest[m.code];
      const ind = fy ? computeIndicators(raw[m.code]?.[fy]) : [];
      const s = scoreSummary(ind);
      return { m, fy, ind, score: s.good * 2 + s.average - s.bad * 2, s };
    });
  const key = a.sort_by ?? "score";
  const val = (r: (typeof rows)[number]) => {
    if (key === "score") return r.fy ? r.score : -Infinity;
    const v = r.ind.find((i) => i.key === key)?.value;
    if (v === null || v === undefined) return -Infinity;
    return key === "uifw_expenditure" ? -v : v;
  };
  rows.sort((x, y) => val(y) - val(x));
  const get = (r: (typeof rows)[number], k: string) => {
    const i = r.ind.find((x) => x.key === k);
    return i ? `${fmtIndicator(i)}${i.rating === "bad" ? " 🔴" : i.rating === "good" ? " ✅" : i.rating === "average" ? " 🟡" : ""}` : "n/a";
  };
  return [
    `### Municipal comparison (${rows.length} municipalities, sorted by ${key.replace(/_/g, " ")})`,
    "| # | Municipality | Year | Good/Avg/Bad | Cash coverage | Current ratio | Liquidity | Collection rate | UIFW % of opex | R&M % of assets |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r, i) =>
        `| ${i + 1} | ${r.m.name} (${r.m.code}) | ${r.fy ? fyLabel(r.fy) : "no data"} | ${r.fy ? `${r.s.good}/${r.s.average}/${r.s.bad}` : "—"} | ${get(r, "cash_coverage")} | ${get(r, "current_ratio")} | ${get(r, "liquidity_ratio")} | ${get(r, "collection_rate")} | ${get(r, "uifw_expenditure")} | ${get(r, "repairs_maintenance")} |`,
    ),
    "",
    "Each municipality is shown for its latest audited year. Ratings use National Treasury's benchmarks; run financial_health for the full set of nine indicators.",
    "",
    sourceNote(", audited figures"),
  ].join("\n");
}
