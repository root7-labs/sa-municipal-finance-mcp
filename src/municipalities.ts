// Municipality directory and audit outcomes.
import { facts, type Cell } from "./api.js";

export interface Municipality {
  code: string;
  name: string;
  longName: string;
  province: string;
  provinceCode: string;
  category: string; // A metro, B local, C district
  miifCategory: string;
  parentCode: string;
  phone?: string;
  url?: string;
  address?: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  A: "Metropolitan municipality",
  B: "Local municipality",
  C: "District municipality",
};

export const PROVINCES: Record<string, string> = {
  EC: "Eastern Cape",
  FS: "Free State",
  GT: "Gauteng",
  KZN: "KwaZulu-Natal",
  LIM: "Limpopo",
  MP: "Mpumalanga",
  NC: "Northern Cape",
  NW: "North West",
  WC: "Western Cape",
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

function toMunicipality(c: Cell): Municipality {
  const address = [c["municipality.street_address_1"], c["municipality.street_address_2"], c["municipality.street_address_3"]]
    .map(s)
    .filter(Boolean)
    .join(", ");
  return {
    code: s(c["municipality.demarcation_code"]),
    name: s(c["municipality.name"]),
    longName: s(c["municipality.long_name"]),
    province: s(c["municipality.province_name"]),
    provinceCode: s(c["municipality.province_code"]),
    category: s(c["municipality.category"]),
    miifCategory: s(c["municipality.miif_category"]),
    parentCode: s(c["municipality.parent_code"]),
    phone: s(c["municipality.phone_number"]) || undefined,
    url: s(c["municipality.url"]) || undefined,
    address: address || undefined,
  };
}

let directory: Promise<Municipality[]> | undefined;

export function allMunicipalities(): Promise<Municipality[]> {
  directory ??= facts("municipalities", {}).then((rows) => rows.map(toMunicipality).filter((m) => m.code && m.name));
  directory.catch(() => {
    directory = undefined;
  });
  return directory;
}

export function resetDirectory(): void {
  directory = undefined;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(local|metropolitan|metro|district|municipality|city of|city)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function provinceCode(input?: string): string | undefined {
  if (!input) return undefined;
  const up = input.trim().toUpperCase();
  if (PROVINCES[up]) return up;
  if (up === "GP") return "GT";
  const hit = Object.entries(PROVINCES).find(([, name]) => name.toLowerCase() === input.trim().toLowerCase());
  return hit?.[0];
}

export async function searchMunicipalities(opts: { query?: string; province?: string; category?: string }): Promise<Municipality[]> {
  const all = await allMunicipalities();
  const prov = provinceCode(opts.province);
  if (opts.province && !prov) throw new Error(`Unknown province "${opts.province}". Use a name like "Western Cape" or a code like WC.`);
  let list = all.filter((m) => (!prov || m.provinceCode === prov) && (!opts.category || m.category === opts.category.toUpperCase()));
  const q = opts.query?.trim();
  if (q) {
    const qUpper = q.toUpperCase();
    const exact = list.filter((m) => m.code.toUpperCase() === qUpper);
    if (exact.length) return exact;
    const nq = norm(q);
    const scored = list
      .map((m) => {
        const n = norm(m.name);
        const ln = norm(m.longName);
        let score = 0;
        if (n === nq) score = 100;
        else if (n.startsWith(nq)) score = 80;
        else if (n.includes(nq)) score = 60;
        else if (ln.includes(nq)) score = 40;
        else if (nq.split(" ").every((w) => w && (n.includes(w) || ln.includes(w)))) score = 30;
        return { m, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name));
    list = scored.map((x) => x.m);
  } else {
    list = [...list].sort((a, b) => a.provinceCode.localeCompare(b.provinceCode) || a.name.localeCompare(b.name));
  }
  return list;
}

/** Resolves a demarcation code or a name to exactly one municipality, or throws a helpful error. */
export async function resolveMunicipality(input: string): Promise<Municipality> {
  const hits = await searchMunicipalities({ query: input });
  if (hits.length === 0) throw new Error(`No municipality matches "${input}". Try find_municipality first.`);
  const top = hits[0];
  if (hits.length > 1 && top.code.toUpperCase() !== input.trim().toUpperCase() && norm(top.name) !== norm(input)) {
    const options = hits.slice(0, 6).map((m) => `${m.name} (${m.code}, ${m.province})`).join("; ");
    throw new Error(`"${input}" matches several municipalities: ${options}. Use the demarcation code.`);
  }
  return top;
}

export interface AuditOpinion {
  year: number;
  opinion: string;
  code: string;
  reportUrl?: string;
}

export async function auditOpinions(demarcationCode: string): Promise<AuditOpinion[]> {
  const rows = await facts("audit_opinions", { "demarcation.code": [demarcationCode] }, { order: "financial_year_end.year:desc" });
  return rows
    .map((c) => ({
      year: Number(c["financial_year_end.year"]),
      opinion: s(c["opinion.label"]),
      code: s(c["opinion.code"]),
      reportUrl: s(c["opinion.report_url"]) || undefined,
    }))
    .sort((a, b) => b.year - a.year);
}

/** "2025" -> "2024/25" */
export function fyLabel(fy: number): string {
  return `${fy - 1}/${String(fy).slice(2)}`;
}
