# Portfolio Core Reconciliation Matrix

## Rules

Use only a frozen private fixture pack whose manifest source hash matches the reference workbook. Compare decimal values, never binary floating-point values. Any source/provenance, sign, transaction-type, account, date, currency, or expected-error mismatch fails even when a rounded display amount appears equal.

| Domain | Workbook source | Proposed Portfolio Core output | Precision / tolerance | Expected-error handling | Required scenarios | Pass condition |
| --- | --- | --- | --- | --- | --- | --- |
| Source integrity | Workbook SHA and all fixture manifest source ranges | Import audit batch and fixture manifest | Exact string equality | Hash mismatch is a hard failure | Every run | Pre/post hashes match and no source range is omitted. |
| Master data | Setup input ranges | Currency, account, category, instrument, alias, cents-flag records | Exact text/order/boolean equality | Blank capacity is not an entity | All populated masters | Each populated input is represented once with source-cell provenance. |
| Raw transactions | Trade Log entry range | Canonical raw transaction payload and source sequence | Exact fields; quantities/money stored as source decimal strings | Inconsistent gross/unit/fee fields are import exceptions, not repaired | Every transaction type; same-date groups | All raw fields and row order are retained. |
| Quantity roll-forward | Calc Trade Log quantity columns; Holdings quantity | Derived transaction balance and position quantity | Eight decimal places; residual policy below `1e-8` per workbook evidence | Negative/missing quote does not erase quantity | All accounts, one account, split, fractional, tiny residual | Row and final position quantities reconcile. |
| ACB | Calc Trade Log pre/post ACB and ACB/share columns | Per-account average-cost state | Currency decimal comparison; tolerance no larger than display rounding | Divide-by-zero/empty position is expected only when workbook state is expected | Buy, sell, ROC, reinvested distribution, adjustment, split | Pre/post ACB and released cost reconcile per source sequence. |
| Realized gain | Calc Trade Log proceeds/gain; Realized Gains report | Derived local/base proceeds, realized gain, report aggregates | Currency decimal comparison; tolerance no larger than display rounding | Empty report bucket is zero/empty only when source matches | Account/date/filter matrix; sell with fee | Transaction and aggregate gains reconcile. |
| FX | Calc Trade Log FX code/rate/base amounts; Holdings FX | Frozen FxRate observation and converted monetary output | Rate precision as stored; money at display rounding | Missing/placeholder rate state is preserved and never replaced by live lookup | Every populated native/reporting currency pair | Source date, rate, status, and converted outputs reconcile. |
| Price/manual override | Setup cents flag; Holdings price/value/manual cells | PriceQuote/override provenance and valuation | Price precision as stored; money at display rounding | Missing provider quote/manual override/error flag is explicit | Provider quote, cents instrument, manual current/start/end override | Precedence and result match approved fixture policy. |
| Holdings/dashboard | Holdings totals/detail; Dashboard cards/charts | PositionSnapshot, portfolio totals, chart/view read model | Detail and total at display rounding; allocations/returns at stored precision | Expected quote error remains visible | All accounts, single account, each reporting currency, today/custom as-of | Detail sums to totals and all selected views reconcile. |
| Dividends | Trade Log dividend rows; Dividends annual/monthly tables | Received-dividend ledger/report outputs | Currency decimal comparison | Missing dividend estimate is an expected deferred state, not zero | Year/month/account/category/currency matrix | Actual dividend reports reconcile without requiring estimate-provider data. |
| Performance | Dashboard selected-period cells; Monthly Performance grid | Fixed-period and monthly performance snapshots | Return/index precision as stored; exact dates and cash-flow signs | Script-materialized/blank month is preserved as fixture state | Under/over one-year period; all/single account; all currencies | Starting/ending values, flows, dividends, return, and benchmark index reconcile. |
| Rebalancing | Re-Balancing inputs/output grid | RebalancePlan/targets/recommendations | Monetary/quantity display rounding; target weights at stored precision | No selected ticker or no-sell constraint is explicit | Contribution/withdrawal; sells allowed/no; incomplete target | Proposed actions match only after policy and holdings reconciliation pass. |
| Corporate actions | Corporate Actions input/generated rows; Calc Trade Log | CorporateAction and derived postings | Exact type/order; quantity/cost at display rounding | Unsupported corporate action remains out of scope | Split and spin-off pattern | Generated postings reconcile and only become ledger events after explicit posting. |

## Required scenario matrix

Every reconciliation run must execute the Cartesian set that applies to the frozen fixture:

- Account scope: all accounts and each populated account.
- Date scope: workbook selected as-of, one custom as-of, selected-period start/end, and every populated monthly row.
- Currency scope: each populated reporting currency; native-currency outputs where surfaced.
- Transaction coverage: buy, sell, dividend, split, return of capital, reinvested capital gain distribution, cost-base adjustment, fee, fractional quantity, same-date sequence, and residual below `1e-8`.
- Valuation coverage: normal quote, quote-in-cents, manual current/start/end override, missing quote, missing FX, and missing dividend-estimate state.

## Overall pass/fail

`PASS` requires every applicable field row to pass, every expected-error state to be classified, zero unapproved import exceptions, source hash stability, and complete source provenance. `FAIL` is required for any unclassified variance; no tolerance may hide a sign, source, type, date, account, currency, or sequence difference.

