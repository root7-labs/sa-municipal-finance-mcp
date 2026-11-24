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
  /** Set when a name or code for a municipality that no longer exists was resolved to its successor. */
  note?: string;
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

/** A municipality that was merged away, and the code(s) of what replaced it. */
interface Former {
  municipality: Municipality;
  successors: string[];
  year: string;
}

let directory: Promise<{ current: Municipality[]; former: Former[] }> | undefined;

// Treasury's directory still lists municipalities that were disestablished (most in the August 2016
// boundary changes). They have no current data, so they are kept apart and resolved to their successors.
function loadDirectory(): Promise<{ current: Municipality[]; former: Former[] }> {
  directory ??= Promise.all([
    facts("municipalities", {}),
    facts("demarcation_changes", {}).catch(() => [] as Cell[]), // without it, fall back to the full list
  ]).then(([rows, changes]) => {
    const all = rows.map(toMunicipality).filter((m) => m.code && m.name);
    const gone = new Map<string, { successors: string[]; year: string }>();
    for (const c of changes) {
      if (s(c["old_code_transition.code"]) !== "disestablished") continue;
      const old = s(c["old_demarcation.code"]);
      const g = gone.get(old) ?? { successors: [], year: s(c["date.date"]).slice(0, 4) };
      const next = s(c["new_demarcation.code"]);
      if (next && !g.successors.includes(next)) g.successors.push(next);
      gone.set(old, g);
    }
    return {
      current: all.filter((m) => !gone.has(m.code)),
      former: all.filter((m) => gone.has(m.code)).map((m) => ({ municipality: m, ...gone.get(m.code)! })),
    };
  });
  directory.catch(() => {
    directory = undefined;
  });
  return directory;
}

/** Municipalities that exist today. Ones that were merged away are left out. */
export async function allMunicipalities(): Promise<Municipality[]> {
  return (await loadDirectory()).current;
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

/**
 * If the input is the code or exact name of a municipality that no longer exists, returns its successor
 * with a note saying so. Throws when it was split between several. Returns undefined when it is not a former one.
 */
export async function resolveFormer(input: string): Promise<Municipality | undefined> {
  const f = await findFormer(input);
  if (!f) return undefined;
  const old = `${f.old.name} (${f.old.code})`;
  if (f.next.length === 1) {
    return { ...f.next[0], note: `${old} no longer exists. It became part of ${f.next[0].name} (${f.next[0].code}) in ${f.year}, so these figures are for ${f.next[0].name}.` };
  }
  if (f.next.length > 1) throw new Error(`${old} no longer exists. In ${f.year} it was split between ${listOf(f.next)}. Ask about one of those.`);
  throw new Error(`${old} no longer exists, and the municipality that replaced it is not in Treasury's directory.`);
}

const listOf = (ms: Municipality[]) => ms.map((m) => `${m.name} (${m.code})`).join(", ");

/** The former municipality whose code or exact name matches the input, with the current municipalities that replaced it. */
async function findFormer(input: string): Promise<{ old: Municipality; year: string; next: Municipality[] } | undefined> {
  const { current, former } = await loadDirectory();
  const q = input.trim().toUpperCase();
  const nq = norm(input);
  const hit = former.find((f) => f.municipality.code.toUpperCase() === q) ?? former.find((f) => nq !== "" && norm(f.municipality.name) === nq);
  if (!hit) return undefined;
  const next = hit.successors.map((c) => current.find((m) => m.code === c)).filter((m): m is Municipality => !!m);
  return { old: hit.municipality, year: hit.year, next };
}

/** Resolves a demarcation code or a name to exactly one municipality, or throws a helpful error. */
export async function resolveMunicipality(input: string): Promise<Municipality> {
  const hits = await searchMunicipalities({ query: input });
  // An exact old name or code wins over a partial match on a current one: "Nxuba" (merged into
  // Raymond Mhlaba) must not land on "Inxuba Yethemba", which is a different municipality.
  const nq = norm(input);
  const exactCurrent = hits.some((m) => m.code.toUpperCase() === input.trim().toUpperCase() || norm(m.name) === nq);
  const former = exactCurrent ? undefined : await findFormer(input);
  if (former) {
    // Two places shared the name and one still exists: "Naledi" in the Free State is gone, "Naledi (NW)" is not.
    // Answer for the one that exists, and say what happened to the other.
    const sameName = hits.filter((m) => norm(m.name).startsWith(nq) && !former.next.some((n) => n.code === m.code));
    if (sameName.length === 1) {
      const m = sameName[0];
      const fate = former.next.length === 1 ? `it became part of ${listOf(former.next)}` : former.next.length > 1 ? `it was split between ${listOf(former.next)}` : "it was disestablished";
      const where = (x: Municipality) => PROVINCES[x.provinceCode] ?? x.province;
      return { ...m, note: `These figures are for ${m.name} (${m.code}) in ${where(m)}. The ${former.old.name} (${former.old.code}) in ${where(former.old)} no longer exists: ${fate} in ${former.year}.` };
    }
    const successor = await resolveFormer(input);
    if (successor) return successor;
  }
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
