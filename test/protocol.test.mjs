// End-to-end MCP protocol test: spawns the built server over stdio like Claude Desktop would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

test("server lists tools, gates Pro tools and validates input", async () => {
  const env = { ...process.env };
  delete env.SAMUNI_LICENSE_KEY;
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env, stderr: "ignore" });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "compare_municipalities",
      "financial_health",
      "find_municipality",
      "health_trend",
      "municipality_profile",
      "samuni_status",
      "supplier_payment_risk",
    ]);
    for (const t of tools) assert.ok(t.description && t.description.length > 20, `${t.name} needs a description`);

    const status = await client.callTool({ name: "samuni_status", arguments: {} });
    assert.match(status.content[0].text, /Tier: Free/);

    for (const name of ["health_trend", "supplier_payment_risk"]) {
      const gated = await client.callTool({ name, arguments: { municipality: "CPT" } });
      assert.match(gated.content[0].text, /is a Pro tool/);
    }

    const invalid = await client.callTool({ name: "financial_health", arguments: { municipality: "CPT", year: 1999 } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
});
