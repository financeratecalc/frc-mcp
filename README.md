# frc-mcp — FinanceRateCalc MCP Server

[![AllMCPs Verified](https://allmcps.com/api/badge/financeratecalc-frc-mcp)](https://allmcps.com/mcp/financeratecalc-frc-mcp?verify=f03cf9df-b2a6-4e4a-b914-a60161b7f75d)

Query lender-level FHA denial statistics from the complete 2025 federal HMDA record
(1,217,297 credit decisions) directly from an AI agent.

**Tools:** `get_national_fha_stats` · `get_lender_denial_stats` · `list_lenders` ·
`get_state_denial_stats` · `get_door_effect_summary`

**The red line:** every figure is a historical aggregate. This server will never accept
borrower details or return individual approval predictions.

## Install (Claude Desktop / any MCP host)

```json
{
  "mcpServers": {
    "financeratecalc": {
      "command": "npx",
      "args": ["-y", "github:financeratecalc/frc-mcp"]
    }
  }
}
```

Data: CC BY 4.0, attribution to financeratecalc.com. Source of truth: public CFPB HMDA 2025
(loan_type 2; actions 1,2,3). Methodology: https://financeratecalc.com/about.html and SSRN 7156938.
