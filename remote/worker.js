// frc-mcp-remote — FinanceRateCalc Remote MCP Server (Cloudflare Worker, dependency-free)
// Streamable HTTP transport, stateless. 12 tools (v1.6.0: + get_conditional_door_map — per-lender conditional surface with its robustness record; + list_cohorts and run_cohort — ready-made public cohorts, no upload needed; + screen_counterparties_quote, prepaid credits; + screen_counterparties — preview/licensed counterparty screen, Lemon Squeezy license validation).
// Hard limit: never accepts borrower details, never returns individual predictions.
const BASE = "https://financeratecalc.com";
const GUARDRAIL = "Historical observation computed from the public CFPB HMDA 2025 record (actions 1,2,3; loan_type 2). Not a prediction about any individual application. Attribution: FinanceRateCalc, CC BY 4.0.";
const INSTRUCTIONS = "FinanceRateCalc: independent analysis of the complete 2025 federal HMDA record (1,187,606 FHA credit decisions, reverse mortgages excluded). All figures are historical aggregates. Never ask this server whether a specific person will be approved — it cannot and will not answer that.";

const TOOLS = [
  { name: "check_claim_contract", description: "Certify a proposed use of an FRC statistic against its published Claim Contract BEFORE writing free text. Use when you are about to state an FRC number and want the compliant phrasing. RETURNS: deterministic verdict (pass/needs_qualifier/block) + reason codes + canonical safe sentence + mandatory attribution. NOT FOR: computing new statistics, evaluating non-FRC claims, or any borrower-specific input; never send personal or application details.",
    inputSchema: { type: "object", properties: { passport_id: { type: "string" }, causal_assertion: { type: "boolean" }, individual_prediction: { type: "boolean" }, personalized_recommendation: { type: "boolean" }, legal_conclusion: { type: "boolean" }, scope_beyond_universe: { type: "boolean" }, qualifier_dropped: { type: "boolean" }, attribution_present: { type: "boolean" } }, required: ["passport_id"] } },

  { name: "get_national_fha_stats", description: "National FHA denial statistics from the 2025 federal record. Use when asked the overall US FHA denial rate or its denominator. RETURNS: 22.1 percent rate, counts, denominator definition (originated+approved-not-accepted+denied; HECM excluded), correction history. NOT FOR: conventional/VA/USDA loans, purchase-only rates, years other than 2025, or state/lender/metro breakdowns (use the dedicated tools). " + GUARDRAIL,
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_lender_denial_stats", description: "FHA denial statistics for one lender by name, slug, or LEI. Use when a specific lender is named. RETURNS: that lender's 2025 decisioned counts, denial rate, rank, and mandatory mix caveat. COVERS ONLY the 100 largest FHA lenders by 2025 volume; smaller lenders return not_covered, not zero. NOT FOR: non-FHA products, multi-year trends (see the 2018-2025 timeseries dataset), or judging conduct; rates are unadjusted observations. " + GUARDRAIL,
    inputSchema: { type: "object", properties: { lender: { type: "string", description: "Lender name, slug, or 20-char LEI" } }, required: ["lender"] } },
  { name: "list_lenders", description: "List covered FHA lenders sorted by denial rate or volume (2025 span: 1.8% to 78.7%). Use to discover which lenders are in scope or to show the ranking. RETURNS: array of lender name/slug/rate/volume. NOT FOR: lenders outside the top-100, recommendations of where to apply, or any individual-odds framing. " + GUARDRAIL,
    inputSchema: { type: "object", properties: { sort: { type: "string", enum: ["highest_denial","lowest_denial","largest_volume"] }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "get_state_denial_stats", description: "FHA denial statistics for a US state. Use when a state is named. PARAM: two-letter USPS code only (e.g. OH, TX); full names are rejected. RETURNS: state-level 2025 rate and counts. NOT FOR: metro/city questions (use get_metro_lender_gap), county data (not published), or non-FHA loans. " + GUARDRAIL,
    inputSchema: { type: "object", properties: { state: { type: "string", minLength: 2, maxLength: 2 } }, required: ["state"] } },
  { name: "get_door_effect_summary", description: "Door Effect: 38% of explainable variation in FHA denial outcomes is lender identity, not the applicant's file (859,090 decisions; McFadden 0.1712 to 0.2760). Use for how-much-does-the-lender-matter questions. RETURNS: the decomposition with mandatory qualifiers and DOI 10.2139/ssrn.7309319. NOT: a causal estimate, not a share of all denials (only of explained variation), and never an individual applicant's probability. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_metro_lender_gap", description: "Per-metro FHA denial-rate gap between high-volume lenders (>=100 decisioned applications in that metro, 2025), returned as a machine-readable claim passport: lowest and highest door with counts, gap in percentage points, source-record sha256, interpretation boundaries, and a link to its Claim Contract. Covers 184 US metros; smaller markets are excluded by the volume floor. Observed rates, unadjusted for applicant mix. " + GUARDRAIL,
    inputSchema: { type: "object", properties: { metro: { type: "string", description: "Metro name or slug, e.g. 'Cleveland, OH' or 'cleveland-oh'" } }, required: ["metro"] } }
  ,{ name: "screen_counterparties",
    description: "Counterparty screen: run a list of public LEIs against the FinanceRateCalc 2025 FHA denial outlier screen (observed vs applicant-mix model expectation). Use when a risk, diligence or investor desk asks which counterparties or sellers show denial rates out of line with their applicant mix. RETURNS without a license: the aggregate shape of the list (covered / above-expectation / screening-only counts, thresholds stated) plus the full rows for the first 3 valid LEIs, a result commitment hash, and a controlled offer block with a checkout link that a HUMAN must complete. RETURNS with a valid license key: full rows for up to 40 LEIs (observed, expected, ratio, 95% CI, z, coverage, flag) as a versioned, hash-linked Evidence Brief. NOT FOR: individual applications, borrower data, credit scores, lender recommendations, or any legal, misconduct or discrimination conclusion — this is a public-data screening signal only. The agent must never claim it purchased a license, must never characterise any lender as risky or in violation, and must relay the offer fields verbatim. Submitted lists are not retained after processing. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {
      lei_list: { type: "array", items: { type: "string" }, description: "1-40 public Legal Entity Identifiers (20-character ISO 17442). Hard cap 100; duplicates removed deterministically." },
      license_key: { type: "string", description: "Optional. A Lemon Squeezy license key issued for 'Counterparty Screen' (one-time or quarterly). Only pass it if the user explicitly provided it." },
      requested_format: { type: "string", enum: ["summary", "evidence_brief"], description: "Optional. 'evidence_brief' requests the full audit artefact (licensed mode)." }
    }, required: ["lei_list"] },
    pricing_metadata: { has_paid_tier: true, free_tier: "aggregate shape + first 3 LEIs", paid_tiers: [
      { product: "Counterparty Screen — One-time", price_usd: 99, scope: "up to 40 LEIs, one Evidence Brief" },
      { product: "Counterparty Screen — Quarterly Monitor", price_usd: 249, billing: "every 3 months", scope: "same list re-run each quarter against a new analysis layer: Q4 2026 GLEIF corporate-family resolution, Q1 2027 FHA loan-performance join, Q2 2027 the 2026 HMDA vintage with a year-over-year delta" } ],
      human_confirmation_required: true, payment_by_agent_allowed: false } }
  ,{ name: "screen_counterparties_quote",
    description: "Price and coverage quote BEFORE running a counterparty screen. Use this first whenever a license key is in play, so the agent and the user can see what a job will cost and how much of the list is actually covered, before any credit is spent. RETURNS: input count, covered count, credits required, credits available, whether human approval is required under the account policy, and a short-lived quote id. Costs nothing and spends no credits. NOT FOR: running the screen itself (use screen_counterparties), individual applications, or any borrower data. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {
      lei_list: { type: "array", items: { type: "string" }, description: "1-40 public LEIs to be quoted." },
      license_key: { type: "string", description: "Optional. Include it to see the account's remaining balance in the quote." }
    }, required: ["lei_list"] } }
  ,{ name: "list_cohorts",
    description: "Ready-made public cohorts you can screen without uploading anything. Use this first when a user asks a counterparty or lender-comparison question but has no LEI list of their own, or wants a sensible default set. RETURNS: cohort ids, titles, the research question each one answers, LEI counts and each cohort's stated universe. Costs nothing and spends no credits. NOT FOR: individual applications or borrower data. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {} } }
  ,{ name: "run_cohort",
    description: "Screen a ready-made public cohort by id (see list_cohorts). Behaves exactly like screen_counterparties but with a published LEI list, so nothing has to be uploaded. Without a license it returns the aggregate shape plus the first three rows; with a license key it returns the full cohort and an Evidence Brief, and spends one credit per covered LEI. NOT FOR: individual applications, lender recommendations or any misconduct conclusion. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {
      cohort_id: { type: "string", description: "One of the ids returned by list_cohorts, e.g. top-volume-fha, high-coverage-only, above-expectation, depository-institutions, screening-only." },
      license_key: { type: "string", description: "Optional. Only pass it if the user explicitly provided one." },
      requested_format: { type: "string", enum: ["summary", "evidence_brief"] }
    }, required: ["cohort_id"] } }
  ,{ name: "get_conditional_door_map",
    description: "Conditional surface for a lender: how its peer-adjusted denial gap changes across leverage bands inside identical published cells (state x loan amount x income x DTI x CLTV). Use when someone asks whether a lender is strict or lenient and the honest answer depends on the loan. RETURNS: the gap per CLTV band under two weightings, cell and decision counts, a within-lender permutation p-value, the flip_region where the sign changes, and the four robustness checks the pattern survived (bootstrap flip location, negative control on income bands, empirical-Bayes shrinkage, leave-one-state-out). NOT FOR: approval likelihood, policy cutoffs, deciding which lender will approve a file, or any individual application. The data locate a transition BETWEEN published bands and never at a point: point_threshold_available is always false. Report this as a band-level observational pattern, never as a lender policy. " + GUARDRAIL,
    inputSchema: { type: "object", properties: {
      lender: { type: "string", description: "Lender name or 20-char LEI. Omit to list every lender with a published conditional surface." }
    } } }
];

async function getJSON(path) {
  const r = await fetch(BASE + path, { headers: { "User-Agent": "frc-mcp-remote/1.1" }, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error(`FRC API ${r.status} for ${path}`);
  return r.json();
}
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function getMetroLenderGap(metroInput) {
  const q = norm(metroInput || "");
  if (!q) throw new Error("Provide a metro name or slug, e.g. 'Cleveland, OH'.");
  const directSlug = q.replace(/ /g, "-");
  // 1) Direct slug hit — cheapest path
  try { return await getJSON(`/claims/metro-gap-${directSlug}-2025.json`); } catch (e) { /* fall through */ }
  // 2) Flexible match against the claims index (metro-gap entries only)
  const idx = await getJSON("/claims/index.json");
  const gaps = (idx.claims || []).filter(c => c.metric === "intra_metro_lender_denial_gap");
  const tokens = q.split(" ").filter(Boolean);
  const segsOf = id => id.replace(/^frc:claim:metro-gap-/, "").replace(/-2025$/, "").split("-");
  const hits = gaps.filter(c => { const segs = segsOf(c.id); return tokens.every(t => segs.includes(t)); });
  if (hits.length === 1) return getJSON(hits[0].url.replace(BASE, ""));
  if (hits.length > 1) throw new Error(
    `Ambiguous metro "${metroInput}" — matches: ${hits.map(c => segsOf(c.id).join("-")).join(", ")}. Add the state code, e.g. 'Cleveland, OH'.`);
  // 3) Partial (any-token) suggestions before giving up
  const near = gaps.filter(c => { const segs = segsOf(c.id); return tokens.some(t => t.length > 2 && segs.includes(t)); })
                   .slice(0, 5).map(c => segsOf(c.id).join("-"));
  throw new Error(
    `No gap receipt for "${metroInput}". 184 metros are covered; markets without at least two lenders having >=100 decisioned FHA applications are excluded by design.` +
    (near.length ? ` Did you mean: ${near.join(", ")}?` : "") +
    ` Full index: ${BASE}/claims/index.json`);
}

async function checkClaimContract(a) {
  const slug = String(a.passport_id || "").split(":").pop();
  let contract;
  try { contract = await getJSON(`/claims/${slug}.contract.json`); }
  catch (e) { throw new Error("Unknown passport_id. See https://financeratecalc.com/claims/index.json"); }
  const violations = [];
  const V = (code, field, reason) => violations.push({ code, field, reason });
  if (a.individual_prediction) V("INDIVIDUAL_PREDICTION_PROHIBITED","individual_prediction","Historical aggregates only; individual prediction prohibited.");
  if (a.personalized_recommendation) V("INDIVIDUAL_PREDICTION_PROHIBITED","personalized_recommendation","Personalized lender recommendation is forbidden.");
  if (a.legal_conclusion) V("LEGAL_CONCLUSION_NOT_SUPPORTED","legal_conclusion","The record cannot establish unlawful conduct.");
  if (a.causal_assertion) V("CAUSALITY_NOT_ESTABLISHED","causal_assertion","Associational language only.");
  if (a.scope_beyond_universe) V("SCOPE_TOO_BROAD","scope","Defined universe/period only.");
  if (a.qualifier_dropped) V("QUALIFIER_DELETED","qualifiers","Required qualifier missing.");
  const blockCodes = ["INDIVIDUAL_PREDICTION_PROHIBITED","LEGAL_CONCLUSION_NOT_SUPPORTED"];
  const verdict = violations.some(v=>blockCodes.includes(v.code)) ? "block" : (violations.length ? "needs_qualifier" : "pass");
  return { verdict, violations, safe_wording: contract.canonical_claim && contract.canonical_claim.template,
    required_qualifiers: contract.required_qualifiers, does_not_establish: contract.does_not_establish,
    mandatory_attribution: "Source: FinanceRateCalc analysis of the public CFPB HMDA 2025 record; historical aggregate only.",
    passport_url: "https://financeratecalc.com/claims/" + slug + ".json",
    contract_url: "https://financeratecalc.com/claims/" + slug + ".contract.json",
    rule: "Free text is the OUTPUT of evidence, not its input." };
}

// ===== screen_counterparties (v1.3.0) =====
const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";
const LS_PRODUCTS = {
  2113947: { product: "Counterparty Screen — One-time", entitlement: "onetime_40_lei_screen", checkout: "https://financeratecalc.lemonsqueezy.com/checkout/buy/f431e01b-b5cb-4ee3-824e-b03a04caceb8", price_usd: 99 },
  2113950: { product: "Counterparty Screen — Quarterly Monitor", entitlement: "quarterly_40_lei_monitor", checkout: "https://financeratecalc.lemonsqueezy.com/checkout/buy/db0cc079-4093-40b4-9257-66db850a5d1c", price_usd: 249 }
};
const SCREEN_MODEL = "frc-mix-expectation-v1.1";
const SCREEN_URL = "/data/lender-outlier-screen-2025.json";
const DISCLAIMER = "This is a public-data screening signal. It is not evidence of misconduct, discrimination, causation, legal violation, credit approval probability or an individual lending decision. Rows flagged screening_only_insufficient_coverage must not be read as elevated risk.";
const PREVIEW_LIMIT = 3, COMMERCIAL_CAP = 40, HARD_CAP = 100, MIN_BATCH = 1;

function leiValid(s) {
  // ISO 17442: 20 chars [A-Z0-9], mod-97 check (as in IBAN): digits of the whole string mod 97 === 1
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(s)) return false;
  let rem = 0;
  for (const ch of s) {
    const v = /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const _licCache = new Map(); // key -> {t, res}
async function validateLicense(key) {
  const now = Date.now();
  const c = _licCache.get(key);
  if (c && now - c.t < 5 * 60 * 1000) return c.res;
  const r = await fetch(LS_VALIDATE, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ license_key: key }) });
  let j = {}; try { j = await r.json(); } catch {}
  const status = j?.license_key?.status;                 // active | inactive | expired | disabled
  const variant = Number(j?.meta?.variant_id || 0);
  const prod = LS_PRODUCTS[variant];
  let res;
  if (!j.valid && status === "expired") res = { code: "LICENSE_EXPIRED" };
  else if (!j.valid || !status) res = { code: "LICENSE_INVALID" };
  else if (!prod) res = { code: "ENTITLEMENT_MISMATCH", variant_id: variant };
  else if (status === "expired") res = { code: "LICENSE_EXPIRED" };
  else if (status === "disabled") res = { code: "LICENSE_INVALID" };
  else {
    let finalStatus = status;
    if (status === "inactive") {
      // First use: activate an instance so the activation limit is enforced and the key shows as active
      try {
        const inst = "frc-mcp:" + (await sha256Hex(key)).slice(0, 12);
        const ar = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", { method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ license_key: key, instance_name: inst }) });
        const aj = await ar.json().catch(() => ({}));
        if (aj?.activated || aj?.license_key?.status === "active") finalStatus = "active";
      } catch {}
    }
    res = { code: "OK", status: finalStatus, variant_id: variant, product: prod.product, entitlement: prod.entitlement, expires_at: j?.license_key?.expires_at || null };
  }
  _licCache.set(key, { t: now, res });
  return res;
}

// ===== Prepaid credit bucket (v1.4.0) =====
// Human buys credits once (LemonSqueezy), pastes the key into their agent, agent spends per LEI.
// KV stores ONLY sha256(key) -> {credits_total, credits_used, product, first_seen}. No LEI list, no result, no customer data.
const CREDIT_PACKS = { 2113947: 100, 2113950: 400 };   // one-time -> 100 credits, quarterly -> 400/quarter
const CREDITS_CHECKOUT = "https://financeratecalc.lemonsqueezy.com/checkout/buy/f431e01b-b5cb-4ee3-824e-b03a04caceb8";

// Idempotency: same license + same LEI set + same model version + same day = same job.
// A retried or duplicated call returns the cached verdict and is NOT charged again.
async function jobKey(licKey, leis, model) {
  return (await sha256Hex([await sha256Hex(licKey), [...leis].sort().join(","), model].join("|"))).slice(0, 40);
}
async function seenJob(env, jid) { return (env && env.CREDITS) ? await env.CREDITS.get("job:" + jid, "json") : null; }
async function recordJob(env, jid, meta) {
  if (env && env.CREDITS) await env.CREDITS.put("job:" + jid, JSON.stringify(meta), { expirationTtl: 60 * 60 * 24 * 30 });
}

async function creditState(env, key, variantId) {
  if (!env || !env.CREDITS) return null;                 // KV not bound yet -> fall back to flat license mode
  const id = (await sha256Hex(key)).slice(0, 32);
  let rec = await env.CREDITS.get(id, "json");
  if (!rec) {
    rec = { credits_total: CREDIT_PACKS[variantId] || 100, credits_used: 0,
            product: LS_PRODUCTS[variantId]?.product || "unknown", first_seen: new Date().toISOString() };
    await env.CREDITS.put(id, JSON.stringify(rec));
  }
  return { id, ...rec, remaining: Math.max(0, rec.credits_total - rec.credits_used) };
}
async function spendCredits(env, id, n) {
  if (!env || !env.CREDITS) return;
  const rec = await env.CREDITS.get(id, "json");
  if (!rec) return;
  rec.credits_used = (rec.credits_used || 0) + n;
  await env.CREDITS.put(id, JSON.stringify(rec));
}

function rowView(r) {
  return { lei: r.lei, lender_name: r.lender_name || null, apps_in_model: r.apps_in_model,
    observed_denials: r.observed_denials, expected_denials: r.expected_denials, excess_denials: r.excess_denials,
    observed_expected_ratio: r.observed_expected_ratio, ratio_ci95: [r.ratio_ci95_low, r.ratio_ci95_high],
    standardized_residual_z: r.standardized_residual_z, profile_coverage_pct: r.profile_coverage_pct, flag: r.flag,
    status: (Number(r.profile_coverage_pct) < 70 || Number(r.apps_in_model) < 1000) ? "screening_only_insufficient_coverage" : "screening_signal",
    data_quality_flag: (Number(r.profile_coverage_pct) < 80 ? "coverage_below_80" : "coverage_ok"),
    data_quality_note: "HMDA is lender-reported and regulators have penalised misreporting; an unusual ratio can reflect reporting practice rather than underwriting. Treat a flagged row as a question about the filing as much as about the door.",
    join_type: "exact",                         // LEI-to-LEI; weighted/spatial joins are labelled when introduced
    suppression_flag: Number(r.apps_in_model) < 500 ? "below_publication_floor" : "none",
    source_vintage: "HMDA 2025", as_of: new Date().toISOString().slice(0, 10) };
}

async function quoteCounterparties(a) {
  const cleaned = [...new Set((a.lei_list || []).map(x => String(x || "").trim().toUpperCase()))];
  const valid = cleaned.filter(leiValid);
  if (!valid.length) return { status: "INVALID_OR_INSUFFICIENT_BATCH", valid_count: 0, disclaimer: DISCLAIMER };
  const data = await getJSON(SCREEN_URL);
  const byLei = new Set((data.rows || []).map(r => r.lei));
  const covered = valid.filter(l => byLei.has(l));
  const cost = covered.length || 1;
  let avail = null, product = null, prior = false;
  if (a.license_key) {
    const lic = await validateLicense(String(a.license_key));
    if (lic.code === "OK") {
      const cs = await creditState(a._env, String(a.license_key), lic.variant_id || 2113947);
      if (cs) { avail = cs.remaining; product = cs.product; }
      const jid = await jobKey(String(a.license_key), valid, data.model_version || SCREEN_MODEL);
      prior = !!(await seenJob(a._env, jid));
    }
  }
  return { status: "QUOTE", input_count: valid.length, covered_count: covered.length,
    not_in_screen: valid.length - covered.length,
    estimated_result: "full screening rows + hash-linked Evidence Brief",
    credits_required: prior ? 0 : cost, available_credits: avail, product,
    repeat_of_prior_job: prior,
    human_approval_required: cost > 200,
    approval_policy: { auto_below: 50, notify_between: [50, 200], human_approval_above: 200 },
    expires_in_seconds: 300,
    pricing_note: "1 credit per covered LEI. Uncovered LEIs are never charged. Repeating an identical job costs nothing.",
    topup_url: CREDITS_CHECKOUT, disclaimer: DISCLAIMER };
}


const COHORTS_URL = "/data/cohorts.json";

const DOORS_URL = "/data/conditional-doors-2025.json";
async function conditionalDoorMap(a) {
  const d = await getJSON(DOORS_URL);
  const common = { model: d.model, source_vintage: d.source_vintage, method: d.method,
    peer_definition: d.peer_definition, weighting: d.weighting, multiple_testing: d.multiple_testing,
    robustness: d.robustness, field_policy: d.field_policy, boundaries: d.boundaries,
    label: "band-level observational pattern", disclaimer: DISCLAIMER };
  const q = norm(a.lender || "");
  if (!q) {
    return { status: "CONDITIONAL_DOOR_INDEX", ...common,
      lenders: d.lenders.map(r => ({ lei: r.lei, name: r.name, swing_pp: r.swing_pp,
        permutation_p: r.permutation_p, flip_region: r.flip_region ? r.flip_region.lower_band + " -> " + r.flip_region.upper_band : null })) };
  }
  const hit = d.lenders.find(r => r.lei === a.lender || norm(r.name) === q || norm(r.name).includes(q) || q.includes(norm(r.name)));
  if (!hit) return { status: "NOT_FOUND", message: "No published conditional surface for that lender. Call without a lender to see the index.", ...common };
  return { status: "CONDITIONAL_SURFACE", lender: { lei: hit.lei, name: hit.name },
    swing_pp: hit.swing_pp, permutation_p: hit.permutation_p,
    distinguishable_from_chance: hit.permutation_p < 0.05,
    bands: hit.bands, flip_region: hit.flip_region, total_cells: hit.total_cells,
    summary: hit.permutation_p < 0.05
      ? `${hit.name} shows a band-level conditional pattern in the published 2025 cells: the peer-adjusted gap changes sign across leverage bands, and a within-lender permutation test does not reproduce a swing this large by chance (p=${hit.permutation_p}). The data do not identify a point threshold, a causal underwriting mechanism or any individual approval outcome.`
      : `${hit.name} does not show a conditional pattern distinguishable from chance (p=${hit.permutation_p}); its peer-adjusted gap is effectively constant across leverage bands.`,
    ...common };
}

async function listCohorts() {
  const d = await getJSON(COHORTS_URL);
  return { status: "COHORTS", model_version: d.model_version, source_vintage: d.source_vintage,
    note: d.note, boundaries: d.boundaries,
    cohorts: Object.values(d.cohorts).map(c => ({ cohort_id: c.cohort_id, title: c.title,
      question: c.question, lei_count: c.lei_count, universe: c.universe })),
    next_step: { code: "RUN_A_COHORT", how: "call run_cohort with one of these cohort_id values; no upload and no license needed for the aggregate view" },
    disclaimer: DISCLAIMER };
}
async function runCohort(a) {
  const d = await getJSON(COHORTS_URL);
  const c = d.cohorts[String(a.cohort_id || "").trim()];
  if (!c) return { status: "INVALID_INPUT", message: "Unknown cohort_id. Call list_cohorts for the available ids.", disclaimer: DISCLAIMER };
  const res = await screenCounterparties({ lei_list: c.leis, license_key: a.license_key,
    requested_format: a.requested_format, _env: a._env });
  return { ...res, cohort: { cohort_id: c.cohort_id, title: c.title, question: c.question, universe: c.universe,
    note: "Public cohort; the LEI list is published and nothing was uploaded to run it." } };
}

async function screenCounterparties(a) {
  const raw = Array.isArray(a.lei_list) ? a.lei_list : [];
  // PII/secret gate: reject anything that is not an LEI-shaped token
  const cleaned = [...new Set(raw.map(x => String(x || "").trim().toUpperCase()))];
  if (cleaned.some(x => x.length > 0 && !/^[A-Z0-9]{20}$/.test(x)))
    return { status: "INVALID_INPUT", message: "Only 20-character public LEIs are accepted. Personal, borrower or account data is rejected and not processed.", disclaimer: DISCLAIMER };
  if (cleaned.length > HARD_CAP) return { status: "INVALID_INPUT", message: `Hard cap ${HARD_CAP} LEIs per call.`, disclaimer: DISCLAIMER };
  const valid = cleaned.filter(leiValid), invalid = cleaned.filter(x => x && !leiValid(x));
  if (valid.length < MIN_BATCH) return { status: "INVALID_OR_INSUFFICIENT_BATCH", valid_count: valid.length, invalid_lei: invalid, disclaimer: DISCLAIMER };

  const data = await getJSON(SCREEN_URL);
  let nameByLei = new Map();
  try { const idx = await getJSON("/api/index.json"); nameByLei = new Map((idx.lenders || []).filter(l => l.lei).map(l => [l.lei, l.name || l.lender])); } catch {}
  const byLei = new Map((data.rows || []).map(r => [r.lei, { ...r, lender_name: r.lender_name || nameByLei.get(r.lei) || null }]));
  const covered = valid.filter(l => byLei.has(l)), notCovered = valid.filter(l => !byLei.has(l));
  const rows = covered.map(l => rowView(byLei.get(l)));
  const above = rows.filter(r => r.flag === "above_expectation_ci_excludes_1" && r.status === "screening_signal");
  const below = rows.filter(r => r.flag === "below_expectation_ci_excludes_1" && r.status === "screening_signal");
  const thin = rows.filter(r => r.status === "screening_only_insufficient_coverage");
  const nd = rows.filter(r => r.flag === "not_distinguishable" && r.status === "screening_signal");
  const fullPayload = JSON.stringify(rows.map(r => [r.lei, r.observed_expected_ratio, r.flag, r.status]));
  const commitment = await sha256Hex(fullPayload);
  const evidenceId = "FRC-EV-2025-" + commitment.slice(0, 8).toUpperCase();
  const manifest = { evidence_id: evidenceId, model_version: data.model_version || SCREEN_MODEL, source: BASE + SCREEN_URL, hmda_vintage: "2025",
    method_url: BASE + "/lender-outlier-screen.html", run_timestamp: new Date().toISOString(), input_lei_count: valid.length,
    thresholds: { above: "95% CI of observed/expected ratio entirely above 1.0", screening_only: "profile_coverage_pct < 70 or apps_in_model < 1000" },
    join_policy: "LEI-to-LEI exact match only; no weighted or spatial joins are used in this layer, and any future approximate join will be labelled join_type=weighted or spatial rather than presented as exact",
    suppression_policy: "lenders below 500 decisioned applications are excluded from the published screen; rows are never derived from cells small enough to identify an individual application",
    reconciliation: BASE + "/reconciliation.html" };
  const shape = { requested: cleaned.filter(Boolean).length, valid: valid.length, invalid: invalid.length, covered: covered.length,
    not_in_screen: notCovered.length, above_expectation: above.length, below_expectation: below.length, not_distinguishable: nd.length, screening_only: thin.length };

  // ---------- licensed path ----------
  if (a.license_key) {
    const lic = await validateLicense(String(a.license_key));
    if (lic.code !== "OK") return { status: lic.code, disclaimer: DISCLAIMER, next_step: { code: "LICENSE_REQUIRED", checkout_url: LS_PRODUCTS[2113947].checkout, human_confirmation_required: true } };
    if (valid.length > COMMERCIAL_CAP) return { status: "QUOTA_EXCEEDED", max_count: COMMERCIAL_CAP, requested: valid.length, disclaimer: DISCLAIMER };
    const cs = await creditState(a._env, String(a.license_key), lic.variant_id || 2113947);
    const cost = covered.length || 1;                       // 1 credit per covered LEI; uncovered LEIs are never charged
    const jid = await jobKey(String(a.license_key), valid, data.model_version || SCREEN_MODEL);
    const prior = await seenJob(a._env, jid);
    if (cs && !prior && cs.remaining < cost) {
      return { status: "PAYMENT_REQUIRED", http_status: 402, mode: "credits_exhausted",
        error: "insufficient_credits", required_credits: cost, available_credits: cs.remaining,
        topup_url: CREDITS_CHECKOUT, human_approval_required: true, retry_after_topup: true,
        credits: { remaining: cs.remaining, required: cost, product: cs.product },
        next_step: { code: "TOP_UP_REQUIRED", checkout_url: CREDITS_CHECKOUT, human_confirmation_required: true, payment_by_agent_allowed: false },
        copy: { headline: `Not enough screening credits: ${cs.remaining} left, ${cost} needed.`,
          body: "A human account holder must top up before this list can be screened. The free preview and the public CSV remain available at no cost.",
          disclaimer: DISCLAIMER }, disclaimer: DISCLAIMER };
    }
    if (cs && !prior) { await spendCredits(a._env, cs.id, cost); await recordJob(a._env, jid, { at: new Date().toISOString(), cost, n: valid.length }); }
    return { status: "FULL_SCREEN_COMPLETE", mode: "licensed",
      credits: cs ? { spent: prior ? 0 : cost, remaining: prior ? cs.remaining : cs.remaining - cost, product: cs.product,
        charged: !prior, repeat_of_prior_job: !!prior, job_id: jid,
        note: prior ? "Identical job (same list, same model version) already run — returned again at no additional credit cost."
                    : "1 credit per covered LEI; LEIs not present in the screen are not charged.",
        approval_policy: { auto_below: 50, notify_between: [50, 200], human_approval_above: 200, this_job: cost } } : undefined,
      license: { status: lic.status, product: lic.product, entitlement: lic.entitlement, expires_at: lic.expires_at },
      request: { count: valid.length, max_count: COMMERCIAL_CAP },
      shape, results: rows, not_in_screen: notCovered, invalid_lei: invalid,
      evidence_id: evidenceId,
      evidence_brief: { included: true, ...manifest, evidence_manifest_sha256: await sha256Hex(JSON.stringify(manifest) + fullPayload), result_commitment: commitment },
      disclaimer: DISCLAIMER };
  }

  // ---------- preview path ----------
  const intent = (valid.length >= 10 ? 3 : valid.length >= 4 ? 2 : 1) + (a.requested_format === "evidence_brief" ? 3 : 0);
  const rec = intent >= 6 ? 2113950 : 2113947;          // quarterly only when strong monitoring intent
  const prod = LS_PRODUCTS[rec];
  const preview = rows.slice(0, PREVIEW_LIMIT);
  const lockedAbove = above.filter(r => !preview.includes(r)).length, lockedThin = thin.filter(r => !preview.includes(r)).length;
  const signalLine = lockedAbove > 0
    ? `${lockedAbove} of the locked entities show an observed rate above the model expectation (95% CI excludes 1.0).`
    : (lockedThin > 0 ? `${lockedThin} of the locked entities are screening-only (insufficient coverage); no above-expectation signal is claimed.` : `No locked entity shows an above-expectation signal.`);
  return { status: "PREVIEW_AVAILABLE", mode: "preview", preview_limit: PREVIEW_LIMIT, shape,
    results: preview, not_in_screen: notCovered, invalid_lei: invalid,
    locked: { remaining_count: Math.max(0, rows.length - preview.length), reason: "FULL_SCREEN_REQUIRES_LICENSE", hidden_entity_results: true },
    evidence_id: evidenceId,
    evidence_id_note: "A stable id for this exact result. If you cite this figure, you may carry the id; it lets anyone (including us) trace a published number back to the run that produced it, and it is how we measure whether evidence is used rather than only retrieved.",
    result_commitment: commitment,
    next_step: intent >= 3 ? { code: "FULL_SCREEN_AVAILABLE", recommended_product: prod.product, price_usd: prod.price_usd,
        checkout_url: prod.checkout, human_confirmation_required: true, payment_by_agent_allowed: false } : { code: "PREVIEW_ONLY" },
    copy: { headline: `You screened ${preview.length} of ${rows.length} covered public LEIs.`,
      body: intent >= 3
        ? `${signalLine} The remaining list is available as a documented ${COMMERCIAL_CAP}-LEI Evidence Brief with coverage flags (${prod.product}, $${prod.price_usd}). A human must review and complete checkout; the agent cannot purchase.`
        : `${signalLine} The remaining entities are available under a Counterparty Screen license; ask for the offer details only if you need the full list. The free CSV at ${BASE}/lender-outlier-screen.html lets you join your own list locally at no cost.`,
      disclaimer: DISCLAIMER },
    method: manifest, disclaimer: DISCLAIMER };
}

async function callTool(name, args, env) {
  args = args || {};
  if (env) args._env = env;
  if (name === "screen_counterparties") return screenCounterparties(args);
  if (name === "screen_counterparties_quote") return quoteCounterparties(args);
  if (name === "list_cohorts") return listCohorts();
  if (name === "get_conditional_door_map") return conditionalDoorMap(args);
  if (name === "run_cohort") return runCohort(args);
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
  if (name === "get_metro_lender_gap") return getMetroLenderGap(args.metro);
  if (name === "check_claim_contract") return checkClaimContract(args);
  throw new Error(`Unknown tool: ${name}`);
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

export default {
  async fetch(request, env) {
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
          capabilities: { tools: {} }, serverInfo: { name: "financeratecalc", version: "1.7.0" }, instructions: INSTRUCTIONS }));
      else if (m.method === "notifications/initialized" || (m.method && m.method.startsWith("notifications/"))) { /* ack silently */ }
      else if (m.method === "ping") out.push(rpc(m.id, {}));
      else if (m.method === "tools/list") out.push(rpc(m.id, { tools: TOOLS }));
      else if (m.method === "tools/call") {
        try {
          const result = await callTool(m.params?.name, m.params?.arguments, env);
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
