// Thin client for National Treasury's Municipal Money API (municipaldata.treasury.gov.za).
// The API is a Cubes-style OLAP server: /api/cubes/{cube}/aggregate and /facts.
import { fetchJson, qs } from "./http.js";

export const API_BASE = process.env.SAMUNI_API_BASE ?? "https://municipaldata.treasury.gov.za/api";

export type CutValue = string | number;
export type Cut = Record<string, CutValue[]>;

/** Formats a cut the way the Cubes API expects: key:"a";"b"|key2:2025 */
export function formatCut(cut: Cut): string {
  return Object.entries(cut)
    .filter(([, vals]) => vals.length > 0)
    .map(([key, vals]) => `${key}:${vals.map((v) => (typeof v === "number" ? String(v) : `"${v}"`)).join(";")}`)
    .join("|");
}

export type Cell = Record<string, string | number | null>;

interface AggregateResponse {
  cells?: Cell[];
}
interface FactsResponse {
  data?: Cell[];
  total_fact_count?: number;
}

export async function aggregate(
  cube: string,
  cut: Cut,
  drilldown: string[],
  aggregates = "amount.sum",
  order?: string,
): Promise<Cell[]> {
  const url = `${API_BASE}/cubes/${cube}/aggregate?${qs({
    aggregates,
    cut: formatCut(cut),
    drilldown: drilldown.join("|"),
    order,
    pagesize: 20000,
  })}`;
  const res = await fetchJson<AggregateResponse>(url);
  return res.cells ?? [];
}

export async function facts(cube: string, cut: Cut, opts: { fields?: string[]; order?: string; pagesize?: number } = {}): Promise<Cell[]> {
  const url = `${API_BASE}/cubes/${cube}/facts?${qs({
    cut: Object.keys(cut).length ? formatCut(cut) : undefined,
    fields: opts.fields?.join(","),
    order: opts.order,
    pagesize: opts.pagesize ?? 20000,
  })}`;
  const res = await fetchJson<FactsResponse>(url);
  return res.data ?? [];
}

export function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
