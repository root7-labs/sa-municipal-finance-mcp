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

test("municipalities that were merged away resolve to their successor", async () => {
  // Not listed any more, by name, by province or by code
  const gt = await searchMunicipalities({ province: "Gauteng" });
  assert.deepEqual(gt.map((m) => m.code).sort(), ["GT421", "GT485"]);
  assert.deepEqual(await searchMunicipalities({ query: "GT482" }), []);

  // The old name and the old code both give the successor, with a note
  for (const q of ["Randfontein", "gt482", "Randfontein Local Municipality"]) {
    const m = await resolveMunicipality(q);
    assert.equal(m.code, "GT485");
    assert.match(m.note, /Randfontein \(GT482\) no longer exists\. It became part of Rand West City \(GT485\) in 2016/);
  }
  assert.equal((await resolveMunicipality("Rand West City")).note, undefined);

  // An exact old name beats a partial match on a different, current municipality
  assert.equal((await resolveMunicipality("Nxuba")).code, "EC129");
  assert.equal((await resolveMunicipality("Inxuba Yethemba")).code, "EC131");
  assert.equal((await resolveMunicipality("Inxuba")).code, "EC131");

  // Two places shared a name and one still exists: answer for that one, and say what happened to the other
  const naledi = await resolveMunicipality("Naledi");
  assert.equal(naledi.code, "NW392");
  assert.match(naledi.note, /These figures are for Naledi \(NW\) \(NW392\) in North West\. The Naledi \(FS164\) in Free State no longer exists: it became part of Mangaung \(MAN\) in 2016\./);
  assert.equal((await resolveMunicipality("FS164")).code, "MAN");
  assert.equal((await resolveMunicipality("Naledi (NW)")).note, undefined);

  // One that was split cannot be answered for a single successor
  await assert.rejects(resolveMunicipality("Mutale"), /Mutale \(LIM342\) no longer exists\. In 2016 it was split between Musina \(LIM341\), Thulamela \(LIM343\)/);
  // "continue" rows are not disestablishments: Thulamela still exists
  assert.equal((await resolveMunicipality("Thulamela")).code, "LIM343");

  // The tools carry the note, so the reader knows which municipality the figures are for
  const risk = await tools.toolPaymentRisk({ municipality: "Randfontein" });
  assert.match(risk, /^_Randfontein \(GT482\) no longer exists\./);
  assert.match(risk, /Rand West City \(GT485\) has not reported/);
  const found = await tools.toolFindMunicipality({ query: "Randfontein" });
  assert.match(found, /Randfontein \(GT482\) no longer exists\. It became part of Rand West City \(GT485\) in 2016\.$/);
  assert.match(await tools.toolFindMunicipality({ query: "Mutale" }), /split between/);
  assert.match(await tools.toolFindMunicipality({ query: "Atlantis" }), /No municipalities match "Atlantis"/);
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

test("payment risk tool adds context and says what it cannot see, without moving the band", async () => {
  const { latestIrregularExpenditure } = await import("../dist/indicators.js");
  const irr = await latestIrregularExpenditure(["CPT", "GT421", "WC024"], 2020, 2027);
  assert.equal(irr.CPT.year, 2024); // the latest year, not the first one returned
  assert.equal(irr.CPT.amount, 634262000);
  assert.equal((irr.CPT.shareOfSpending * 100).toFixed(1), "1.1");
  assert.equal(irr.GT421, undefined); // null is "not reported", not zero
  assert.equal(irr.WC024, undefined);

  const cpt = await tools.toolPaymentRisk({ municipality: "CPT" });
  assert.match(cpt, /Risk band: LOW/);
  assert.match(cpt, /#### Context \(does not change the band\)/);
  assert.match(cpt, /Irregular expenditure: R634\.3 m reported in the 2023\/24 audited statements, equal to 1\.1% of that year's operating spending\./);
  assert.match(cpt, /does not say whether the figure is for that year alone/);
  assert.match(cpt, /#### What this check cannot see/);
  assert.match(cpt, /dispute or arbitration/);
  assert.match(cpt, /Eskom debt relief/);
  assert.match(cpt, /Claims and lawsuits/);
  assert.match(cpt, /Unsolicited bids/);

  const emf = await tools.toolPaymentRisk({ municipality: "GT421" });
  assert.match(emf, /Risk band: HIGH/);
  assert.match(emf, /Irregular expenditure: no audited figure has been published/);
  assert.match(emf, /What this check cannot see/);
});

test("infrastructure tool: headline for everyone, breakdown and grants with Pro", async () => {
  const { assetGroupOf, capitalSpendingRating } = await import("../dist/capital.js");
  assert.equal(assetGroupOf("0120"), "roads");
  assert.equal(assetGroupOf("0270"), "electricity");
  assert.equal(assetGroupOf("0370"), "water");
  assert.equal(assetGroupOf("0430"), "sanitation");
  assert.equal(assetGroupOf("1530"), "equipment");
  assert.equal(assetGroupOf("0100"), null);
  assert.equal(capitalSpendingRating(0.97).rating, "good");
  assert.equal(capitalSpendingRating(1.1).rating, "average");
  assert.equal(capitalSpendingRating(0.77).rating, "bad");

  const free = await tools.toolInfrastructure({ municipality: "CPT" });
  assert.match(free, /Capital budget, 2025\/26: R12\.94 bn/);
  assert.match(free, /Spent in 2024\/25: R9\.32 bn\*\*, which is 77% of that year's original capital budget of R12\.07 bn/);
  assert.match(free, /23% under budget, which Treasury's scorecard counts as bad/);
  assert.match(free, /Pro adds the split by asset type/);
  assert.doesNotMatch(free, /What the 2025\/26 budget is for/);
  assert.doesNotMatch(free, /Urban Settlement/);

  const pro = await tools.toolInfrastructure({ municipality: "CPT" }, true);
  assert.match(pro, /#### What the 2025\/26 budget is for/);
  assert.match(pro, /\| Water supply \| R7\.94 bn \| 61% \|/);
  assert.match(pro, /\| Electricity \| R5\.00 bn \| 39% \|/);
  assert.match(pro, /#### What was spent in 2024\/25/);
  assert.match(pro, /\| Sanitation \| R4\.32 bn \| 46% \|/);
  assert.match(pro, /Urban Settlement Development Grant \(USDG\) \| R1\.20 bn \| R600\.0 m/);
  assert.match(pro, /Public Transport Network Operations Grant \(PTNG\) \| R900\.0 m \| not reported/);
  assert.doesNotMatch(pro, /Equitable Share/);
  assert.doesNotMatch(pro, /Pro adds/);

  assert.match(await tools.toolInfrastructure({ municipality: "WC024" }), /has no capital spending or capital budget/);
});

test("customer debt tool: headline for everyone, who owes it and what for with Pro", async () => {
  const free = await tools.toolCustomerDebt({ municipality: "CPT" });
  assert.match(free, /Owed to the municipality at the end of Mar 2026: R17\.51 bn/);
  assert.match(free, /62% of it is more than 90 days old\*\*, and 67% is more than 30 days old/);
  assert.match(free, /Collection rate: 94\.4% of what it billed in 2024\/25 was collected/);
  assert.match(free, /Pro adds who owes it/);
  assert.doesNotMatch(free, /#### Who owes it/);

  const pro = await tools.toolCustomerDebt({ municipality: "CPT" }, true);
  assert.match(pro, /#### Who owes it/);
  assert.match(pro, /\| Households \| R10\.00 bn \| 57% \| 80% \|/);
  assert.match(pro, /\| Government \(organs of state\) \| R1\.51 bn \| 9% \| 0% \|/);
  assert.match(pro, /#### What it is owed for/);
  assert.match(pro, /\| Property rates \| R4\.00 bn \| 23% \| 100% \|/);
  assert.doesNotMatch(pro, /do not add up/); // the two tables agree in this fixture

  assert.match(await tools.toolCustomerDebt({ municipality: "WC024" }), /has not reported monthly debtor ageing/);
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
