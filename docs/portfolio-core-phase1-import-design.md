# Portfolio Core Phase 1A: deterministic dry-run import design

## Status and boundary

Phase 1A creates a read-only, in-memory import plan from the frozen Setup and Trade Log fixture records. It does not write MongoDB, create Mongoose models, invoke an API, evaluate workbook formulas, calculate holdings/ACB/gains, resolve quotes or FX, run performance calculations, or provide UI.

The private fixture pack is sufficient source evidence for this phase; the workbook is not reopened. Private values stay in `.local/` and are never emitted to tracked fixtures, tests, logs, or documentation.

## Selected implementation approach

The planner is a pure strict-TypeScript module under `lib/portfolio-core/`, tested with the existing Vitest configuration. It uses no new dependencies:

- Runtime validation is explicit TypeScript rather than a new validation package.
- SHA-256 identities and plan hashes use Node `node:crypto`.
- Decimal values remain source strings. The only decimal operation is exact string-digit multiplication used to detect a supplied quantity-times-unit versus supplied gross inconsistency; it never overwrites either value.
- The Node 24 type-stripping runtime executes a thin TypeScript CLI. The CLI reads JSON only, has no network/database imports, and writes only beneath `.local/portfolio-core-import-plans/`.

This follows the repository's existing strict TypeScript, Vitest, and `node:crypto` conventions while leaving existing MongoDB/Mongoose code untouched.

## Input and provenance contract

Every planned record carries immutable source provenance:

- source workbook hash and extractor version from `manifest.json`;
- source sheet, row, cell coordinate, and original source-row sequence;
- original raw cell value, formula, cached value, cell type, and calculation class where present;
- a SHA-256 provenance hash over a canonical representation of that evidence.

Aggregate records (the batch manifest and count-only summary) carry the same fixture-level provenance with an explicit batch source marker and empty cell list; row-level contracts carry their exact source cells and original raw values.

`setup.json` supplies currency, category, account, and instrument candidates. `trade-log.json` supplies only raw ledger rows. A formula/cached value remains an observation in the raw payload; Phase 1A neither evaluates nor replaces it.

## Typed contracts

The module exports these contracts.

| Contract | Phase 1A responsibility |
| --- | --- |
| `PortfolioMasterProposal` | Deterministic portfolio candidate tied to the fixture manifest. |
| `CurrencyProposal` | Setup currency candidate and provenance. |
| `AccountProposal` | Setup account candidate and provenance. |
| `InvestmentCategoryProposal` | Setup investment-category candidate and provenance. |
| `InstrumentProposal` | Stable internal candidate ID, category/native currency/minor-unit flag, and resolution status. |
| `InstrumentSourceAlias` | Exact entered Setup symbol and its independent alias identity. |
| `RawTransactionInput` | Original Trade Log cells and raw transaction fields without normalisation by calculation. |
| `NormalizedTransactionProposal` | Supported normalized type, deterministic identity, account/instrument references, and retained raw values. |
| `ImportException` | Immutable validation evidence; never a repair instruction. |
| `ImportWarning` | Review-required, non-mutating evidence. |
| `ImportBatchManifest` | Fixture identity, mode, extraction provenance, deterministic plan hash, and lifecycle state. |
| `ImportPlanSummary` | Sanitized count-only result. |

## Validation and deterministic behavior

The planner preserves fixture source order. Within a trade date, the fixture source-row sequence is never sorted away. Transaction, master, alias, exception, and warning IDs derive from a canonical SHA-256 input that includes fixture source hash, sheet, row, sequence when present, and normalized transaction type when applicable. Identical input produces identical ordering and hashes.

Validation is explicit and non-repairing:

- invalid/missing date; unsupported type; missing required type fields;
- unknown account or source alias; duplicate Setup symbol; possible alias review;
- missing currency/category and invalid minor-unit flag;
- prohibited negative quantity, amount, fee, or non-positive split ratio;
- duplicate source row and duplicate import identity;
- supplied quantity × unit amount versus supplied gross mismatch.

The gross check creates an exception and retains all three source fields. It never derives a replacement gross amount. `Cost Base Adj.` may be signed because the approved ACB policy requires both increases and decreases; other monetary types are non-negative in this planning scope.

Strict mode is the default. It retains all warnings and converts each review-required warning into a blocking `STRICT_REVIEW_REQUIRED` exception. `--non-strict` preserves those warnings without blocking the plan; independently invalid source data remains blocking in both modes.

## Planned persistence boundary (not implemented)

Candidate future collections are documented solely to preserve a stable boundary:

| Candidate collection | Candidate immutable key/index | Lifecycle |
| --- | --- | --- |
| `portfolioImportBatches` | unique `(sourceWorkbookHash, planHash)` | planned → reviewed → imported/rejected |
| `portfolioMasterRecords` | unique `(batchId, proposalId)` | proposed → approved/rejected |
| `portfolioInstrumentAliases` | unique `(batchId, aliasId)` | proposed → resolved/review-required |
| `portfolioRawTransactions` | unique `(batchId, sourceSheet, sourceRow, sourceSequence)` | proposed → accepted/rejected |
| `portfolioImportExceptions` | unique `(batchId, exceptionId)` | open → waived/resolved (with immutable original evidence) |

All future records must retain the source hash, cell provenance, raw payload, extractor version, and plan hash. There are no schema/model/database changes in Phase 1A.

## CLI and output contract

The CLI accepts a fixture-pack path beneath `.local/portfolio-core-fixtures/` and an optional output directory. Both are validated as local filesystem paths; an output path must resolve beneath `.local/portfolio-core-import-plans/`. It accepts `--strict` (default) or `--non-strict`.

It writes a count-only `summary.json`, a manifest, and separate proposal/exception/warning JSON files beneath the allowed ignored output root. Console output contains only counts, codes, a plan-hash prefix, and exit classification—never setup, account, instrument, or transaction values.

| Exit | Meaning |
| ---: | --- |
| 0 | Fixture parsed and no blocking exceptions. |
| 4 | Fixture parsed but contains blocking import exceptions. |
| 2 | Malformed arguments, path, or fixture structure. |
| 1 | Unexpected internal failure. |

## Explicit exclusions

No holding, ACB, gain, price, quote, FX, valuation, performance, split posting, spin-off posting, dashboard, API, background job, or UI behavior is present. Phase 1B writes only non-authoritative staging evidence; it does not write canonical masters or an accounting ledger. Proposed types and imported raw records remain unverified until they reconcile with the frozen fixture evidence described by the reconciliation matrix.

## Phase 1B persistence approach

Phase 1B adds a server-only native-Mongo staging repository. It uses the existing `mongodb` dependency and project `db.collection(...)` convention rather than adding a Mongoose model for future accounting entities. Source decimals and dates remain the planner's original strings inside raw/normalized payloads; only staging timestamps use Mongo `Date` values.

The repository owns these collections only: `portfolioImportBatches`, `portfolioImportMasterProposals`, `portfolioImportTransactionProposals`, `portfolioImportIssues`, and `portfolioImportAuditEvents`. They are staging evidence, never `Portfolio`, `Account`, `Instrument`, or ledger records. The repository creates the following indexes: `portfolioImportBatches(batchId)` and unique `(sourceWorkbookHash, planHash)`; unique master `(batchId, proposalId)`; unique transaction `(batchId, proposalId)` and `(batchId, sourceSheet, sourceRow, sourceSequence)`; unique issue `(batchId, issueId)`; and audit `eventId` plus `(batchId, timestamp)`.

The intended unique indexes are batch `(sourceWorkbookHash, planHash)`, proposal `(batchId, proposalId)`, issue `(batchId, issueId)`, and `(batchId, sourceSheet, sourceRow, sourceSequence)` for transaction-source identity. A changed plan for the same workbook produces a distinct batch even where a deterministic source proposal ID recurs; an existing `(sourceWorkbookHash, planHash)` returns idempotently without inserting any record.

When a Mongo client supports multi-document transactions, batch, proposal, issue, audit, and final-status writes run in one transaction. If the deployment rejects transaction capability, the repository uses a documented compensating-write path: it writes a `writing` batch, inserts the complete set, marks completion only at the end, and deletes every staging document for that batch on an error. Consequently no partial batch can be reported complete and no orphan proposal/issue remains.

Issue records retain only stable code, severity, source-column identifiers, provenance, and structured disposition metadata. They never duplicate source values in messages. Allowed lifecycle states are `open`, `acknowledged`, `accepted-as-source`, `corrected-by-amendment`, `rejected`, and `superseded`; a disposition cannot modify the original raw proposal.

The server CLI requires `PORTFOLIO_CORE_MONGODB_URI`, deliberately separate from the application's general Mongo configuration. It accepts `--dry-run` or `--persist`; dry-run does not connect:

```text
node scripts/portfolio-core/persist-import.ts --fixture .local/portfolio-core-fixtures/<fixture-pack> --dry-run --non-strict
node scripts/portfolio-core/persist-import.ts --fixture .local/portfolio-core-fixtures/<fixture-pack> --persist --non-strict
node scripts/portfolio-core/inspect-import-staging.ts --batch <batch-id>
```

Exit codes are: `0` persisted/planned with no blocking issues, `4` persisted/planned with blocking issues, `2` malformed fixture or arguments, `3` persistence/configuration failure, and `1` internal failure. The inspection CLI emits only counts, codes, state, identifiers/hash prefixes, and provenance/idempotency status.

Phase 1C promotion is gated on a reviewed completed staging batch, no unresolved blocking issue unless explicitly accepted as source, complete provenance, approved alias/account dispositions, and a separate authorization to create canonical masters and ledger inputs.
