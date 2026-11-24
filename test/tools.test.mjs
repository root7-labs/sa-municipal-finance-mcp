import { test } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, calls } from "./mockfetch.mjs";

installMockFetch();
process.env.SAMUNI_LICENSE_KEY = "";

const { formatCut } = await import("../dist/api.js");
const { computeIndicators } = await import("../dist/indicators.js");
const { periodLabel, currentFinancialYear, assessPaymentRisk } = await import("../dist/creditors.js");
const { searchMunicipalities, resolveMunicipality, fyLabel, provinceCode } = await import("../dist/municipalities.js");
const tools = await import("../dist/tools.js");
const { CPT_2025 } = await import("./fixtures.mjs");

test("formatCut quotes strings, leaves numbers and joins with | and ;", () => {
  assert.equal(
    formatCut({ "demarcation.code": ["CPT", "JHB"], "financial_year_end.year": [2024, 2025], empty: [] }),
    'demarcation.code:"CPT";"JHB"|financial_year_end.year:2024;2025',
  );
});

test("indicators reproduce Municipal Money's published Cape Town 2024/25 figures", () => {
  const ind = computeIndicators({
    cashAtYearEnd: CPT_2025.cash,
    collectedRevenue: CPT_2025.collected,
    billedRevenue: CPT_2025.billed,
    opexActual: CPT_2025.opex.AUDA,
    opexOriginalBudget: CPT_2025.opex.ORGB,
    capexActual: CPT_2025.capex.AUDA,
    capexOriginalBudget: CPT_2025.capex.ORGB,
    repairsMaintenance: CPT_2025.rm,
    items: CPT_2025.fp,
  });
  const v = (k) => ind.find((i) => i.key === k);
  assert.equal(v("cash_balance").value, 19174907809);
  assert.equal(v("cash_balance").rating, "good");
  assert.equal(v("cash_coverage").value.toFixed(1), "3.6");
  assert.equal(v("cash_coverage").rating, "good");
  assert.equal(v("current_ratio").value.toFixed(2), "1.70");
  assert.equal(v("current_ratio").rating, "good");
  assert.equal(v("liquidity_ratio").value.toFixed(2), "1.10");
  assert.equal(v("collection_rate").value.toFixed(1), "94.4");
  assert.equal(v("collection_rate").rating, "bad");
  assert.equal(v("repairs_maintenance").value.toFixed(1), "1.1");
  assert.equal(v("repairs_maintenance").rating, "bad");
  assert.equal(v("operating_budget_spending").value.toFixed(0), "-1");
  assert.equal(v("operating_budget_spending").rating, "good");
  assert.match(v("operating_budget_spending").note, /original budget/);
  assert.equal(v("uifw_expenditure").value, null);
  assert.equal(v("uifw_expenditure").rating, null);
});

test("indicators return nulls, not zeros or crashes, when data is missing", () => {
  const ind = computeIndicators(undefined);
  assert.equal(ind.length, 9);
  assert.ok(ind.every((i) => i.value === null && i.rating === null));
});

test("financial year helpers", () => {
  assert.equal(periodLabel(2026, 1), "Jul 2025");
  assert.equal(periodLabel(2026, 6), "Dec 2025");
  assert.equal(periodLabel(2026, 9), "Mar 2026");
  assert.equal(periodLabel(2026, 12), "Jun 2026");
  assert.equal(currentFinancialYear(new Date("2026-11-24T00:00:00Z")), 2027);
  assert.equal(currentFinancialYear(new Date("2026-06-30T00:00:00Z")), 2026);
  assert.equal(fyLabel(2025), "2024/25");
  assert.equal(provinceCode("western cape"), "WC");
  assert.equal(provinceCode("GP"), "GT");
});

test("municipality search and resolution", async () => {
  assert.equal((await resolveMunicipality("cpt")).code, "CPT");
  assert.equal((await resolveMunicipality("City of Cape Town")).code, "CPT");
  assert.equal((await resolveMunicipality("Stellenbosch Local Municipality")).code, "WC024");
  const wc = await searchMunicipalities({ province: "Western Cape", category: "B" });
  assert.deepEqual(wc.map((m) => m.code).sort(), ["WC023", "WC024"]);
  await assert.rejects(resolveMunicipality("Atlantis"), /No municipality matches/);
  await assert.rejects(searchMunicipalities({ province: "Narnia" }), /Unknown province/);
});

test("payment risk: Cape Town is low, Emfuleni is high", async () => {
  const { fetchCreditorMonths } = await import("../dist/creditors.js");
  const cpt = await fetchCreditorMonths("CPT", [2026]);
  assert.equal(cpt[0].label, "Mar 2026");
  assert.equal(assessPaymentRisk(cpt[0], 3.6).band, "low");
  const emf = await fetchCreditorMonths("GT421", [2026]);
  const risk = assessPaymentRisk(emf[0], 0.2);
  assert.equal(risk.band, "high");
  assert.ok(risk.reasons.some((r) => /bulk electricity and water/.test(r)));
});

test("financial_health tool output", async () => {
  const out = await tools.toolFinancialHealth({ municipality: "CPT" });
  assert.match(out, /Financial health: Cape Town \(CPT\)/);
  assert.match(out, /2024\/25/);
  assert.match(out, /3\.6 months \| ✅ Good/);
  assert.match(out, /R19\.17 bn/);
  assert.match(out, /Not affiliated with or endorsed by National Treasury/);
});

test("profile tool lists audit opinions with report links", async () => {
  const out = await tools.toolProfile({ municipality: "Cape Town" });
  assert.match(out, /Unqualified - No findings/);
  assert.match(out, /\[PDF\]\(https:\/\/lg\.treasury\.gov\.za/);
  assert.match(out, /Latest audited financial year in the data: 2024\/25/);
});

test("payment risk tool flags stale data and explains the 30-day rule", async () => {
  const out = await tools.toolPaymentRisk({ municipality: "CPT" });
  assert.match(out, /Risk band: LOW/);
  assert.match(out, /Trade creditors \| R88\.2 m/);
  assert.match(out, /section 65\(2\)\(e\)/);
});

test("compare tool ranks and needs at least two", async () => {
  const out = await tools.toolCompare({ municipalities: ["CPT", "WC024"] });
  assert.match(out, /\| 1 \| Cape Town \(CPT\)/);
  assert.match(out, /Stellenbosch \(WC024\) \| no data/);
  await assert.rejects(tools.toolCompare({ municipalities: ["CPT"] }), /at least two/);
  await assert.rejects(tools.toolCompare({}), /Give a list/);
});

test("all requests go to the Treasury API host", () => {
  assert.ok(calls.length > 0);
  for (const u of calls) assert.match(u, /^https:\/\/municipaldata\.treasury\.gov\.za\/api\/cubes\//);
});
