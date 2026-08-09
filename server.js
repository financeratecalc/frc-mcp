#!/usr/bin/env node
// frc-mcp — FinanceRateCalc MCP server
// Exposes lender-level FHA denial statistics (complete 2025 federal HMDA record)
// as tools for AI agents. Historical observations only. This server will never
// accept borrower details or return individual approval predictions.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.FRC_API_BASE || "https://financeratecalc.com";
const GUARDRAIL =
  "Historical observation computed from the public CFPB HMDA 2025 record " +
  "(denominator: actions 1,2,3; loan_type 2). Not a prediction about any " +
  "individual application, and not a recommendation for or against any lender. " +
  "Attribution: FinanceRateCalc (financeratecalc.com), CC BY 4.0.";

async function getJSON(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": "frc-mcp/1.0" } });
  if (!r.ok) throw new Error(`FRC API ${r.status} for ${path}`);
  return r.json();
}
let indexCache = null;
async function getIndex() {
  if (!indexCache) indexCache = await getJSON("/api/index.json");
  return indexCache;
}
function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
async function resolveLender(query) {
  const idx = await getIndex();
  const list = idx.lenders || [];
  const q = norm(query);
  let hit = list.find(l => norm(l.name || l.lender || "") === q || (l.lei || "") === query || norm(l.slug || "") === q.replace(/ /g, "-"));
  if (!hit) hit = list.find(l => norm(l.name || l.lender || "").includes(q) || q.includes(norm(l.name || l.lender || "")));
  return hit || null;
}
const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify({ ...obj, note: GUARDRAIL }, null, 1) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });

const server = new McpServer(
  { name: "financeratecalc", version: "1.0.0" },
  { instructions:
      "FinanceRateCalc: independent analysis of the complete 2025 federal HMDA record " +
      "(1,217,297 FHA credit decisions). Use these tools for lender-level, state-level and " +
      "national FHA denial statistics. All figures are historical aggregates. " +
      "Never ask this server whether a specific person will be approved — it cannot and will not answer that." }
);

server.tool(
  "get_national_fha_stats",
  "National FHA denial statistics from the 2025 federal record (denial rate on decisioned applications, volumes). " + GUARDRAIL,
  {},
  async () => {
    const idx = await getIndex();
    return ok({ national: idx.national, counts: idx.counts, meta: idx.meta });
  }
);

server.tool(
  "get_lender_denial_stats",
  "FHA denial statistics for one lender by name, slug, or LEI: actual denial rate, peer-median comparison, mix-adjusted expected rate. Top-100 FHA lenders by volume are covered. " + GUARDRAIL,
  { lender: z.string().describe("Lender name (e.g. 'AmeriSave'), slug, or 20-char LEI") },
  async ({ lender }) => {
    const hit = await resolveLender(lender);
    if (!hit) return fail(`Lender not found in the top-100 set: "${lender}". Use list_lenders to see coverage.`);
    const detail = await getJSON(`/api/lender/${hit.slug}.json`);
    return ok(detail);
  }
);

server.tool(
  "list_lenders",
  "List covered FHA lenders sorted by denial rate (highest/lowest) or volume. Useful to see how widely the same federal program is applied across doors (2025 span: 1.8% to 78.7%). " + GUARDRAIL,
  { sort: z.enum(["highest_denial", "lowest_denial", "largest_volume"]).default("largest_volume"),
    limit: z.number().int().min(1).max(100).default(15) },
  async ({ sort, limit }) => {
    const idx = await getIndex();
    let list = [...(idx.lenders || [])];
    const rate = l => l.denial_rate_pct ?? l.denial_rate ?? 0;
    const vol = l => l.decisioned_applications ?? l.applications ?? 0;
    if (sort === "highest_denial") list.sort((a, b) => rate(b) - rate(a));
    else if (sort === "lowest_denial") list.sort((a, b) => rate(a) - rate(b));
    else list.sort((a, b) => vol(b) - vol(a));
    return ok({ sort, lenders: list.slice(0, limit) });
  }
);

server.tool(
  "get_state_denial_stats",
  "FHA denial statistics for a US state (two-letter code), including the small-loan vs large-loan gap where published. " + GUARDRAIL,
  { state: z.string().length(2).describe("Two-letter state code, e.g. OH, ID, CA") },
  async ({ state }) => ok(await getJSON(`/api/state/${state.toLowerCase()}.json`))
);

server.tool(
  "get_door_effect_summary",
  "The Door Effect: variance decomposition across 859,090 FHA decisions — 38% of explainable variation in denial outcomes is attributable to lender identity rather than the applicant's file, plus mix-adjusted strictest/most-lenient lender tables. " + GUARDRAIL,
  {},
  async () => {
    const d = await getJSON("/data/door-effect-2025.json");
    return ok({
      guardrail: d.guardrail, records_used: d.records_used,
      door_effect_share_of_explained: d.door_effect_share_of_explained,
      mcfadden_r2_profile_only: d.mcfadden_r2_profile_only,
      mcfadden_r2_with_lender: d.mcfadden_r2_with_lender,
      strictest: d.overlay_residual_top15_strict?.slice(0, 10),
      most_lenient: d.overlay_residual_top15_lenient?.slice(0, 10),
      method: "Two logistic models on decisioned 2025 FHA applications; residual = excess denial not explained by observable federal-record characteristics (HMDA contains no credit scores)."
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
