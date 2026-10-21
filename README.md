# frc-mcp — FinanceRateCalc MCP Server

[![financeratecalc/frc-mcp MCP server](https://glama.ai/mcp/servers/financeratecalc/frc-mcp/badges/score.svg)](https://glama.ai/mcp/servers/financeratecalc/frc-mcp)
[![AllMCPs Verified](https://allmcps.com/api/badge/financeratecalc-frc-mcp)](https://allmcps.com/mcp/financeratecalc-frc-mcp?verify=f03cf9df-b2a6-4e4a-b914-a60161b7f75d)

Read-only statistics over the complete 2025 US HMDA mortgage record (1,187,606 FHA credit
decisions, reverse mortgages excluded) plus dated, machine-readable US mortgage rule tables,
served to AI agents over MCP. Every figure returns with its period, population and program
scope, a use contract, and a receipt that can be verified later.

**The red line:** every figure is a historical aggregate. This server never accepts borrower
details and never returns an individual approval prediction.

## Remote endpoint (no install, no key)

```
https://frc-mcp.ziyetis.workers.dev
```

Streamable HTTP, stateless. MCP protocol revisions `2026-07-28`, `2025-11-25`, `2025-06-18`,
`2025-03-26`. Server version **1.35.0**. Listed in the official MCP registry as
`io.github.financeratecalc/frc-mcp`.

Client configs (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Codex, Gemini CLI), an
instruction block for `CLAUDE.md` / `AGENTS.md`, and a first task to try:
https://financeratecalc.com/use-frc.html

## Tools (remote endpoint, 16)

| Tool | What it answers |
|---|---|
| `check_claim_contract` | Checks a sentence you intend to write against the figure's use contract; fixed patterns, no model. Returns `pass` / `needs_qualifier` / `block`, a safe wording, and a receipt on pass. Also checks sentences against the five rule tables, binding each figure to the role named in its clause. |
| `get_national_fha_stats` | 2025 national FHA denial rate with its universe. |
| `get_lender_denial_stats` | One of the 100 largest FHA lenders: volume, denial rate, rank, applicant-mix caveat. |
| `list_lenders` | The 100 largest FHA lenders ranked by denial rate or volume. |
| `get_state_denial_stats` | State FHA denial rate and small-loan split. |
| `get_metro_lender_gap` | Within one metro, the spread between the highest- and lowest-denying high-volume lenders. |
| `get_small_loan_penalty` | Denial rate under $150K vs over $250K, by state. |
| `get_denial_reason_shares` | Median and maximum share of each HMDA denial reason across the top-100 lenders. |
| `get_door_effect_summary` | Lender identity's share of explained variation in 2025 FHA denials. |
| `get_conditional_door_map` | Per-lender conditional surface with its robustness record. |
| `list_cohorts` / `run_cohort` | Ready-made public cohorts; no upload needed. |
| `get_rule` | One of five dated rule tables: FHA annual MIP (ML 2023-05), FHA forward loan limits 2026, FHFA conforming limits 2026, CFPB HOEPA/QM thresholds 2026, VA funding fee. |
| `resolve_fha_annual_mip` | The MIP cell for a stated term, base loan amount and LTV; asks for a missing condition instead of guessing it. |
| `screen_counterparties` / `screen_counterparties_quote` | Counterparty screen; free preview, full brief needs a licence bought by a human. The agent only relays the offer. |

Plain HTTP beside MCP: `GET /server-card`, `GET /cite/<claim-id>` (receipted sentence in text,
Markdown, HTML and BibTeX), `GET /verify?r=<receipt>` (is this figure still current; if not,
which correction superseded it).

## Receipts

A figure travels with a receipt such as
`⟦FRC:national-fha-denial-rate-2025:22.1%:ebf6b00b:m2610⟧`: claim id, value, the first eight
hex characters of a hash of the claim object, and the channel and month it was issued through.
`/verify` answers `current`, `stale` (corrected since; the correction is returned),
`hash-current-value-mismatch` (the quoted value was edited) or `unrecognized` (this publisher
never issued it). Conformance runs on every deploy and is published:
https://financeratecalc.com/conformance.html

## Local stdio package (npm)

The `frc-mcp` npm package is the original five read-only tools from a bundled data snapshot; it
does not carry the rule tables, the sentence gate or receipts. Prefer the remote endpoint.

```json
{
  "mcpServers": {
    "financeratecalc": {
      "command": "npx",
      "args": ["-y", "frc-mcp"]
    }
  }
}
```

## Source

The remote server's source of record is `worker/index.js` in
https://github.com/financeratecalc/financeratecalc.github.io, deployed to Cloudflare Workers
on every change to that file. `remote/worker.js` in this repository is an early (five-tool)
copy kept for reference.

Data: CC BY 4.0, attribution to financeratecalc.com. Source of truth: public CFPB HMDA 2025
(loan_type 2; actions 1, 2, 3; denial = action 3). Method: https://financeratecalc.com/methodology.html
· corrections log: https://financeratecalc.com/corrections.html · SSRN 7156938.
No lender recommendations, no individual predictions, no lender pays for placement.
