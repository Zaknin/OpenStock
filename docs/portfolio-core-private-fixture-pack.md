# Portfolio Core Private Fixture Pack

## Purpose and privacy boundary

The private fixture pack freezes the workbook's raw inputs and cached calculated outputs for reconciliation. It is never tracked, staged, committed, uploaded, or converted to CSV. It contains private portfolio data and must remain under the ignored repository-local root:

```text
.local/portfolio-core-fixtures/
  <workbook-sha256>/
    manifest.json
    setup.json
    trade-log.json
    workflow-inputs.json
    manual-overrides.json
    benchmark-observations.json
    expected/
      calc-trade-log.json
      holdings.json
      dashboard.json
      realized-gains.json
      dividends.json
      monthly-performance.json
      rebalance.json
      corporate-actions.json
```

The fixture extractor rejects an output directory outside this root. The root is ignored by Git through `/.local/portfolio-core-fixtures/`.

## Manifest contract

`manifest.json` must contain the following non-secret metadata:

| Field | Requirement |
| --- | --- |
| `workbook_filename` | Base filename only; no source directory path. |
| `workbook_sha256` | Full source SHA-256, identical before and after extraction. |
| `extraction_timestamp_utc` | UTC ISO-8601 timestamp. |
| `workbook_sheet_inventory` | Ordered worksheet name and visibility state. |
| `row_counts` | Extracted record/row counts only; never sampled values. |
| `cached_formula_warning` | States that formulas are not recalculated or evaluated and output values are workbook caches. |
| `source_ranges` | Every extracted sheet/range and capture type. |
| `extractor_version` | Version identifier from the script. |
| `privacy` | Explicitly asserts no session credentials or machine-specific secrets are included. |

## Record contract

Every captured cell is a JSON object with source provenance:

```json
{
  "source": { "sheet": "…", "row": 0, "column": "…", "cell": "…", "sequence": 0 },
  "original_value": null,
  "formula": null,
  "cached_value": null,
  "cell_type": "…",
  "calculation_class": "input | formula | cached_array_member | cached_output"
}
```

`original_value` is populated for a non-formula cell. `formula` and `cached_value` preserve a formula and its stored workbook cache without evaluating it. Array/spill members can retain cached cells without repeating a formula expression; `calculation_class` records that distinction. `sequence` is the source-row position for Trade Log records and supports deterministic same-date ordering.

## Capture boundaries

| File | Capture source | Purpose |
| --- | --- | --- |
| `setup.json` | Setup input ranges for currencies, categories, accounts, and instrument master fields | Raw master-data fixture. |
| `trade-log.json` | Trade Log transaction-entry range | Raw source ledger, including row order and any user-entered formulas/caches. |
| `workflow-inputs.json` | Dashboard selections, custom benchmark, realized-gain period, rebalancing inputs, and corporate-action inputs | Raw user inputs outside Setup/Trade Log, kept separate from report outputs. |
| `manual-overrides.json` | Manual current/start/end holdings overrides and dividend estimate overrides | Separates user override evidence from provider-derived values. |
| `benchmark-observations.json` | S&P 500 and custom benchmark cache ranges | Frozen benchmark observations; no provider calls. |
| `expected/*.json` | Cached grids/reports identified in the migration specification | Expected outputs for calculation reconciliation; not imported source-of-truth transactions. |

## Operational rules

1. Invoke the extractor with an explicit `.xlsx` path only.
2. It hashes before parsing and after parsing; a mismatch fails before the fixture pack is written.
3. It uses ZIP/XML reads only. It does not open, save, recalculate, repair, or resave the workbook.
4. It does not invoke LibreOffice and does not evaluate `GOOGLEFINANCE`, `IMPORTXML`, `IMPORTRANGE`, or dummy-function formulas.
5. Console output is a sanitized count/hash summary; it never prints cell values, transaction data, accounts, holdings, or balances.
6. Synthetic fixtures belong under `test/fixtures/portfolio-core/`; they must state that their data is invented and must never be derived from this private pack.
