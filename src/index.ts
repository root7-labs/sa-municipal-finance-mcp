#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { UPGRADE_URL, getLicence, upgradeMessage } from "./license.js";
import {
  MAX_COMPARE,
  SORT_KEYS,
  toolCompare,
  toolFinancialHealth,
  toolFindMunicipality,
  toolHealthTrend,
  toolPaymentRisk,
  toolProfile,
} from "./tools.js";

export const VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });

async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

async function pro(tool: string, fn: () => Promise<string>): Promise<ToolResult> {
  const lic = await getLicence();
  if (!lic.valid) return ok(upgradeMessage(tool, lic.reason));
  return run(fn);
}

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;
const muni = z
  .string()
  .min(2)
  .describe("Municipality demarcation code (e.g. CPT, JHB, WC024) or name (e.g. 'Stellenbosch'). Codes are unambiguous.");
const category = z.enum(["A", "B", "C"]).describe("A = metropolitan, B = local, C = district municipality.");

export function createServer(): McpServer {
  const server = new McpServer({ name: "sa-municipal-finance-mcp", version: VERSION });

  // ----- Free tools -----
  server.registerTool(
    "find_municipality",
    {
      title: "Find a South African municipality",
      description:
        "Look up South African municipalities by name, province or type and get their demarcation codes (needed by the other tools). Covers all metros, local and district municipalities.",
      inputSchema: {
        query: z.string().optional().describe("Name or code, e.g. 'Drakenstein', 'eThekwini', 'NMA'. Leave empty to list."),
        province: z.string().optional().describe("Province name or code, e.g. 'Western Cape' or 'WC'."),
        category: category.optional(),
        limit: z.number().int().min(1).max(300).optional().describe("Default 25."),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolFindMunicipality(a)),
  );

  server.registerTool(
    "municipality_profile",
    {
      title: "Municipality profile and audit outcomes",
      description:
        "Basic details for a South African municipality plus its Auditor-General audit opinions by year, with links to the audit reports.",
      inputSchema: { municipality: muni },
      annotations: readOnly,
    },
    (a) => run(() => toolProfile(a)),
  );

  server.registerTool(
    "financial_health",
    {
      title: "Municipal financial health scorecard",
      description:
        "National Treasury's nine financial health indicators for one municipality and one audited year: cash balance, cash coverage, current ratio, liquidity ratio, debtor collection rate, unauthorised/irregular/wasteful expenditure, repairs and maintenance, and operating and capital budget spending. Each is rated good, average or bad against Treasury benchmarks.",
      inputSchema: {
        municipality: muni,
        year: z
          .number()
          .int()
          .min(2020)
          .max(2100)
          .optional()
          .describe("Financial year END, e.g. 2025 for 2024/25. Defaults to the latest audited year."),
      },
      annotations: readOnly,
    },
    (a) => run(() => toolFinancialHealth(a)),
  );

  // ----- Pro tools -----
  server.registerTool(
    "health_trend",
    {
      title: "Financial health trend (Pro)",
      description:
        "Pro: the nine Treasury financial health indicators side by side for up to seven audited years, with an improving/worsening flag for each.",
      inputSchema: {
        municipality: muni,
        years: z.number().int().min(2).max(7).optional().describe("Number of audited years. Default 5."),
      },
      annotations: readOnly,
    },
    (a) => pro("health_trend", () => toolHealthTrend(a)),
  );

  server.registerTool(
    "supplier_payment_risk",
    {
      title: "Supplier payment risk (Pro)",
      description:
        "Pro: how long a municipality takes to pay its suppliers, from its latest monthly creditor returns. Shows money owed by creditor type (trade creditors, bulk electricity, bulk water, statutory deductions), the share older than 30 and 90 days, the recent monthly trend, and a low/moderate/high risk band. Useful before bidding for, or delivering on, a municipal contract.",
      inputSchema: {
        municipality: muni,
        months: z.number().int().min(1).max(12).optional().describe("Months of trade-creditor history to show. Default 6."),
      },
      annotations: readOnly,
    },
    (a) => pro("supplier_payment_risk", () => toolPaymentRisk(a)),
  );

  server.registerTool(
    "compare_municipalities",
    {
      title: "Compare municipalities (Pro)",
      description: `Pro: rank municipalities on Treasury's financial health indicators for their latest audited year. Give a list of up to ${MAX_COMPARE} municipalities, or a province and/or category (e.g. all metros, or all local municipalities in the Western Cape).`,
      inputSchema: {
        municipalities: z.array(z.string()).max(MAX_COMPARE).optional().describe("Codes or names, e.g. ['CPT', 'JHB', 'ETH']."),
        province: z.string().optional().describe("Province name or code."),
        category: category.optional(),
        sort_by: z.enum(SORT_KEYS).optional().describe("Default 'score' (overall good/average/bad balance)."),
      },
      annotations: readOnly,
    },
    (a) => pro("compare_municipalities", () => toolCompare(a)),
  );

  server.registerTool(
    "samuni_status",
    {
      title: "Status",
      description: "Show the server version, licence tier and which tools are available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const lic = await getLicence();
      return ok(
        [
          `SA Municipal Finance MCP v${VERSION}`,
          `Tier: ${lic.valid ? "Pro" : "Free"}`,
          lic.valid
            ? [lic.holder ? `Licensed to: ${lic.holder}` : "", lic.expires ? `Renews/expires: ${lic.expires.slice(0, 10)}` : "", lic.note ?? ""]
                .filter(Boolean)
                .join("\n")
            : `Upgrade: ${UPGRADE_URL}${lic.reason ? ` (${lic.reason})` : ""}`,
          "Free: find_municipality, municipality_profile, financial_health",
          "Pro: health_trend, supplier_payment_risk, compare_municipalities",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`sa-municipal-finance-mcp v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
