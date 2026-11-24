# SA Municipal Finance MCP

**Ask your AI assistant how any South African municipality is really doing: cash, debts, audit outcomes, and whether it pays its suppliers on time.**

SA Municipal Finance MCP is a [Model Context Protocol](https://modelcontextprotocol.io) server for Claude Desktop, Cursor and other MCP clients. It reads National Treasury's Municipal Money data for all 257 municipalities and turns it into Treasury's own financial health scorecard, with audit reports and monthly creditor ageing.

Built for suppliers and contractors bidding for municipal work, consultants, lenders and investors, journalists, researchers and civic organisations.

- **Treasury's scorecard, calculated for you.** Nine indicators (cash coverage, liquidity, debtor collection, wasteful expenditure, repairs and maintenance, budget spending and more), each rated against Treasury's benchmarks.
- **Will they pay me?** Monthly creditor returns show how long suppliers, Eskom and water boards wait to be paid.
- **Audit outcomes with sources.** Every Auditor-General opinion by year, linked to the audit report.
- **No account needed for the free tools.** Data is read live from National Treasury.

## Tools

| Tool | Tier | What it does |
|---|---|---|
| `find_municipality` | Free | Find municipalities by name, province or type and get their codes |
| `municipality_profile` | Free | Contact details and Auditor-General opinions by year, with report links |
| `financial_health` | Free | Treasury's nine indicators for one audited year, rated good / average / bad |
| `health_trend` | **Pro** | The nine indicators over up to seven years, with improving/worsening flags |
| `supplier_payment_risk` | **Pro** | Money owed to suppliers, Eskom and water boards by age, recent trend and a low/moderate/high risk band |
| `compare_municipalities` | **Pro** | Rank up to 20 municipalities, or a whole province or category (e.g. all metros) |
| `samuni_status` | Free | Shows your tier |

## Install

Requires [Node.js](https://nodejs.org) 18.17 or newer.

### Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "sa-municipal-finance": {
      "command": "npx",
      "args": ["-y", "sa-municipal-finance-mcp"],
      "env": {
        "SAMUNI_LICENSE_KEY": ""
      }
    }
  }
}
```

Restart Claude Desktop.

### Cursor and other MCP clients

Use the same `command`, `args` and `env` in your client's MCP configuration (for Cursor: `.cursor/mcp.json`).

## Example questions

- "How healthy are Stellenbosch's finances? Use the Treasury scorecard."
- "I've been invited to tender for Emfuleni. How long does it take to pay its suppliers?"
- "Compare the cash coverage and collection rates of all eight metros."
- "Show Drakenstein's audit outcomes for the last five years with links to the reports."
- "Rank the local municipalities in the Western Cape by financial health."

## Pro

Pro unlocks `health_trend`, `supplier_payment_risk` and `compare_municipalities`.

**$149 a year or $15 a month** (R2,499 / R249). Founding offer: code **MUNIFOUNDING** takes 50% off your first year, for the first 20 customers.

1. Buy Pro at **[buy.polar.sh](https://buy.polar.sh/polar_cl_y6cxOeQf1C2z1VXCG2gpMJULzDkgH7Tmb4iqO3WXQW6)**. Your licence key appears on the confirmation page and in your Polar customer portal.
2. Paste it as the value of `SAMUNI_LICENSE_KEY` in your MCP client config.
3. Restart the client and ask it to run `samuni_status` to confirm.

The key is checked with Polar, our payment provider, about once every six hours. Only the key is sent, never your questions.

## How the indicators are calculated

Formulas, line items and rating bands follow National Treasury's Municipal Money scorecard (MFMA Circular 71), using audited figures from the mSCOA data (2019/20 onwards). Where a municipality reported no adjusted budget, the original budget is used and the output says so. Missing figures are shown as "no data", never as zero.

The supplier payment risk band is Root 7's own heuristic, not a Treasury rating. It looks at the share of trade-creditor and bulk electricity and water debt older than 30 and 90 days in the latest monthly return. The MFMA (section 65(2)(e)) requires municipalities to pay within 30 days.

## Good to know

- **Data quality.** Figures are as submitted by municipalities and may be incomplete or revised. Monthly creditor returns are unaudited and usually a few months behind.
- **Not advice.** Outputs are informational and are not financial, credit, legal or investment advice.
- **Source and attribution.** Data: National Treasury, Municipal Money (municipaldata.treasury.gov.za), used under its terms of use. Indicator methodology: OpenUp / Code for South Africa (MIT). This product is not affiliated with or endorsed by National Treasury.
- **Privacy.** The server runs on your machine and queries National Treasury directly. It does not use the personal details of municipal officials.

## Support

Questions or bugs: [open an issue](https://github.com/kramdayal-create/sa-municipal-finance-mcp/issues) or email hello@root7.co.za.

SA Municipal Finance MCP is built by Root 7 (Pty) Ltd, South Africa.
