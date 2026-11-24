// Replaces global fetch with a router that answers Municipal Money API calls from fixtures.
import { MUNICIPALITIES, DEMARCATION_CHANGES, CPT_2025, CREDITORS, BUCKETS, IRREGULAR, CPT_2024_OPEX } from "./fixtures.mjs";

export const calls = [];
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

function parseCut(s) {
  const out = {};
  for (const part of (s ?? "").split("|").filter(Boolean)) {
    const i = part.indexOf(":");
    out[part.slice(0, i)] = part.slice(i + 1).split(";").map((v) => v.replace(/^"|"$/g, ""));
  }
  return out;
}

export function installMockFetch() {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.host === "api.polar.sh") return new Response("{}", { status: 404 });
    const [, , , cube, kind] = url.pathname.split("/"); // /api/cubes/{cube}/{kind}
    const cut = parseCut(url.searchParams.get("cut"));
    const codes = cut["demarcation.code"] ?? [];
    if (cube === "municipalities") return json({ data: MUNICIPALITIES });
    if (cube === "demarcation_changes") return json({ data: DEMARCATION_CHANGES });
    if (cube === "audit_opinions") {
      return json({ data: codes.includes("CPT") ? [
        { "financial_year_end.year": 2024, "opinion.code": "unqualified", "opinion.label": "Unqualified - No findings", "opinion.report_url": "https://lg.treasury.gov.za/supportingdocs/CPT/CPT_Audit%20Report_2024.pdf" },
        { "financial_year_end.year": 2023, "opinion.code": "unqualified", "opinion.label": "Unqualified - No findings" },
      ] : [] });
    }
    const cpt = codes.includes("CPT") && (cut["financial_year_end.year"] ?? []).includes("2025");
    const cell = (extra) => ({ "demarcation.code": "CPT", "financial_year_end.year": 2025, ...extra });
    if (kind === "aggregate") {
      if (cube === "aged_creditor_v2") {
        const rows = CREDITORS[codes[0]] ?? [];
        return json({ cells: rows.map(([item, ...vals]) => ({
          "financial_year_end.year": 2026, "financial_period.period": 9, "item.code": item,
          ...Object.fromEntries(BUCKETS.map((b, i) => [`${b}_amount.sum`, vals[i]])),
        })) });
      }
      // Latest irregular expenditure, and the operating spending of the year it relates to (2023/24)
      if (cube === "uifwexp" && (cut["item.code"] ?? []).join() === "irregular") return json({ cells: IRREGULAR.filter((c) => codes.includes(c["demarcation.code"])) });
      if (cube === "incexp_v2" && (cut["financial_year_end.year"] ?? []).join() === "2024") return json({ cells: codes.includes("CPT") ? [{ "demarcation.code": "CPT", "amount.sum": CPT_2024_OPEX }] : [] });
      if (!cpt) return json({ cells: [] });
      const items = cut["item.code"] ?? [];
      if (cube === "cflow_v2") return json({ cells: [cell({ "amount.sum": items.includes("0430") ? CPT_2025.cash : CPT_2025.collected })] });
      if (cube === "incexp_v2") {
        if (items.includes("3100")) return json({ cells: Object.entries(CPT_2025.opex).map(([t, v]) => cell({ "amount_type.code": t, "amount.sum": v })) });
        return json({ cells: [cell({ "amount.sum": CPT_2025.billed })] });
      }
      if (cube === "financial_position_v2") return json({ cells: Object.entries(CPT_2025.fp).map(([k, v]) => cell({ "item.code": k, "amount.sum": v })) });
      if (cube === "capital_v2") {
        if ((cut["capital_type.code"] ?? []).includes("REPAIR_MNT")) return json({ cells: [cell({ "amount.sum": CPT_2025.rm })] });
        return json({ cells: Object.entries(CPT_2025.capex).map(([t, v]) => cell({ "amount_type.code": t, "amount.sum": v })) });
      }
      if (cube === "uifwexp") return json({ cells: [] });
    }
    return json({ cells: [], data: [] });
  };
}
