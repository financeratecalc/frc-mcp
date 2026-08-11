// frc-mcp-remote — FinanceRateCalc Remote MCP Server (Cloudflare Worker, dependency-free)
// Streamable HTTP transport, stateless. Same 5 tools as npm frc-mcp.
// Hard limit: never accepts borrower details, never returns individual predictions.
const BASE = "https://financeratecalc.com";
const GUARDRAIL = "Historical observation computed from the public CFPB HMDA 2025 record (actions 1,2,3; loan_type 2). Not a prediction about any individual application. Attribution: FinanceRateCalc, CC BY 4.0.";
const INSTRUCTIONS = "FinanceRateCalc: independent analysis of the complete 2025 federal HMDA record (1,217,297 FHA credit decisions). All figures are historical aggregates. Never ask this server whether a specific person will be approved — it cannot and will not answer that.";

const TOOLS = [
  { name: "get_national_fha_stats", description: "National FHA denial statistics from the 2025 federal record. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_lender_denial_stats", description: "FHA denial statistics for one lender by name, slug, or LEI (top-100 by volume). " + GUARDRAIL,
    inputSchema: { type: "object", properties: { lender: { type: "string", description: "Lender name, slug, or 20-char LEI" } }, required: ["lender"] } },
  { name: "list_lenders", description: "List covered FHA lenders sorted by denial rate or volume (2025 span: 1.8% to 78.7%). " + GUARDRAIL,
    inputSchema: { type: "object", properties: { sort: { type: "string", enum: ["highest_denial","lowest_denial","largest_volume"] }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "get_state_denial_stats", description: "FHA denial statistics for a US state (two-letter code). " + GUARDRAIL,
    inputSchema: { type: "object", properties: { state: { type: "string", minLength: 2, maxLength: 2 } }, required: ["state"] } },
  { name: "get_door_effect_summary", description: "Door Effect: 38% of explainable variation in FHA denial outcomes is lender identity, not the applicant's file (859,090 decisions). " + GUARDRAIL,
    inputSchema: { type: "object", properties: {}, additionalProperties: false } }
];

async function getJSON(path) {
  const r = await fetch(BASE + path, { headers: { "User-Agent": "frc-mcp-remote/1.0" }, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error(`FRC API ${r.status} for ${path}`);
  return r.json();
}
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function callTool(name, args) {
  args = args || {};
  if (name === "get_national_fha_stats") {
    const idx = await getJSON("/api/index.json");
    return { national: idx.national, counts: idx.counts, meta: idx.meta };
  }
  if (name === "get_lender_denial_stats") {
    const idx = await getJSON("/api/index.json");
    const q = norm(args.lender || "");
    const list = idx.lenders || [];
    const nm = l => norm(l.name || l.lender || "");
    let hit = list.find(l => nm(l) === q || (l.lei || "") === args.lender || norm(l.slug || "") === q.replace(/ /g, "-"));
    if (!hit && q) hit = list.find(l => nm(l) && (nm(l).includes(q) || q.includes(nm(l))));
    if (!hit) throw new Error(`Lender not found in the top-100 set: "${args.lender}". Use list_lenders.`);
    return getJSON(`/api/lender/${hit.slug}.json`);
  }
  if (name === "list_lenders") {
    const idx = await getJSON("/api/index.json");
    let list = [...(idx.lenders || [])];
    const rate = l => l.denial_rate_pct ?? 0, vol = l => l.decisioned_applications ?? 0;
    const sort = args.sort || "largest_volume";
    if (sort === "highest_denial") list.sort((a, b) => rate(b) - rate(a));
    else if (sort === "lowest_denial") list.sort((a, b) => rate(a) - rate(b));
    else list.sort((a, b) => vol(b) - vol(a));
    return { sort, lenders: list.slice(0, Math.min(args.limit || 15, 100)) };
  }
  if (name === "get_state_denial_stats") return getJSON(`/api/state/${String(args.state).toLowerCase()}.json`);
  if (name === "get_door_effect_summary") {
    const d = await getJSON("/data/door-effect-2025.json");
    return { guardrail: d.guardrail, records_used: d.records_used,
      door_effect_share_of_explained: d.door_effect_share_of_explained,
      mcfadden_r2_profile_only: d.mcfadden_r2_profile_only, mcfadden_r2_with_lender: d.mcfadden_r2_with_lender,
      strictest: (d.overlay_residual_top15_strict || []).slice(0, 10),
      most_lenient: (d.overlay_residual_top15_lenient || []).slice(0, 10) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    // Authless by design: no OAuth metadata — 404 on well-known and any non-root path
    if (path !== "/" && path !== "") return json({ error: "not found" }, 404);
    if (request.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET" && (request.headers.get("Accept") || "").includes("text/event-stream"))
      return new Response("SSE stream not offered; POST JSON-RPC to /", { status: 405, headers: CORS });
    if (request.method === "GET")
      return json({ name: "financeratecalc", transport: "streamable-http", endpoint: "POST /", tools: TOOLS.map(t => t.name),
        note: "Remote MCP server. " + INSTRUCTIONS, docs: "https://financeratecalc.com/mcp-server.html" });
    if (request.method !== "POST") return json({ error: "POST JSON-RPC 2.0 messages to /" }, 405);
    let body;
    try { body = await request.json(); } catch { return json(rpcErr(null, -32700, "Parse error"), 400); }
    const msgs = Array.isArray(body) ? body : [body];
    const out = [];
    for (const m of msgs) {
      if (!m || m.jsonrpc !== "2.0") { out.push(rpcErr(m && m.id, -32600, "Invalid request")); continue; }
      if (m.method === "initialize")
        out.push(rpc(m.id, { protocolVersion: m.params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} }, serverInfo: { name: "financeratecalc", version: "1.0.1" }, instructions: INSTRUCTIONS }));
      else if (m.method === "notifications/initialized" || (m.method && m.method.startsWith("notifications/"))) { /* ack silently */ }
      else if (m.method === "ping") out.push(rpc(m.id, {}));
      else if (m.method === "tools/list") out.push(rpc(m.id, { tools: TOOLS }));
      else if (m.method === "tools/call") {
        try {
          const result = await callTool(m.params?.name, m.params?.arguments);
          out.push(rpc(m.id, { content: [{ type: "text", text: JSON.stringify({ ...result, note: GUARDRAIL }, null, 1) }] }));
        } catch (e) {
          out.push(rpc(m.id, { content: [{ type: "text", text: String(e.message || e) }], isError: true }));
        }
      }
      else if (m.id !== undefined) out.push(rpcErr(m.id, -32601, `Method not found: ${m.method}`));
    }
    if (out.length === 0) return new Response(null, { status: 202, headers: CORS });
    return json(Array.isArray(body) ? out : out[0]);
  }
};
