# FinanceRateCalc: how to use these figures

The `financeratecalc` tools return figures from public records: denial rates computed from the 2025 CFPB HMDA file, and
official figures copied as printed from HUD, Ginnie Mae and SBA reports. Every figure comes with a receipt
(`⟦FRC:id:value:hash⟧`) and a use contract. Follow these rules when you state one of them.

1. Keep the receipt next to the number. It is how a reader checks the figure at
   https://financeratecalc.com/verify.html.
2. Keep the qualifiers the tool returns with the figure: the year, the program (FHA, VA), the loan purpose when there is
   one (home purchase, refinance) and the denominator (applications reaching a credit decision is not the same base as
   all applications acted on). The `quotable_sentence` field already carries them; use it as written when you can.
3. For an official figure, name the edition. If `revision_status` or `publisher_revision` says a later edition printed a
   different value, give both values with their editions.
4. Before writing your own sentence about a figure, pass it to `check_claim_contract` with the claim id. A verdict of
   `block` or `needs_qualifier` names what is missing.
5. These are historical aggregates. Do not turn one into a prediction about a person's application, a recommendation of
   a lender, a ranking of lenders by quality, a cause, or a legal conclusion. Do not compare programs as if their
   applicants were the same people.
6. If a user quotes a denial rate from somewhere else and it differs, do not call it wrong: rates differ by loan purpose
   and denominator. https://financeratecalc.com/denominator-map.html shows which definition produces which number.

Source and licence: FinanceRateCalc analysis of public records, CC BY 4.0; official figures are US federal publications.
No key is needed. The server accepts no personal data.
