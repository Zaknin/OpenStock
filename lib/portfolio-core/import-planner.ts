import { createHash } from 'node:crypto';

export const IMPORT_PLANNER_VERSION = 'portfolio-core-import-planner-v1';

export type SourceCell = Readonly<{
  source: Readonly<{ sheet: string; row: number; column: string; cell: string; sequence: number | null }>;
  original_value: string | number | boolean | null;
  formula: string | null;
  cached_value: string | number | boolean | null;
  cell_type: string;
  calculation_class: string;
}>;

export type Provenance = Readonly<{
  sourceWorkbookHash: string;
  extractorVersion: string;
  sourceSheet: string;
  sourceRow: number;
  sourceSequence: number | null;
  cells: readonly SourceCell[];
  provenanceHash: string;
}>;

export type PortfolioMasterProposal = Readonly<{ id: string; baseCurrencyCode: string | null; provenance: Provenance }>;
export type CurrencyProposal = Readonly<{ id: string; code: string; provenance: Provenance }>;
export type AccountProposal = Readonly<{ id: string; name: string; provenance: Provenance }>;
export type InvestmentCategoryProposal = Readonly<{ id: string; name: string; provenance: Provenance }>;
export type InstrumentProposal = Readonly<{
  id: string; enteredSymbol: string; categoryName: string | null; nativeCurrencyCode: string | null;
  quoteInMinorUnits: boolean | null; resolutionStatus: 'proposed' | 'review_required'; provenance: Provenance;
}>;
export type InstrumentSourceAlias = Readonly<{ id: string; instrumentId: string; enteredSymbol: string; provenance: Provenance }>;
export type RawTransactionInput = Readonly<{
  sourceSheet: string; sourceRow: number; sourceSequence: number | null; cells: readonly SourceCell[];
  rawTradeDate: string | null; rawType: string | null; rawSymbol: string | null; rawAccount: string | null;
  rawQuantity: string | null; rawUnitAmount: string | null; rawGrossAmount: string | null; rawFee: string | null;
  rawSplitRatio: string | null; rawPayload: Readonly<Record<string, SourceCell | undefined>>; provenance: Provenance;
}>;
export type NormalizedTransactionType = 'buy' | 'sell' | 'dividend' | 'return_of_capital' | 'reinvested_capital_gain_distribution' | 'cost_base_adjustment' | 'split';
export type NormalizedTransactionProposal = Readonly<{
  id: string; rawInputId: string; normalizedType: NormalizedTransactionType; normalizedTradeDate: string | null;
  accountId: string | null; instrumentId: string | null; raw: RawTransactionInput; provenance: Provenance;
}>;
export type ImportIssueCode =
  | 'INVALID_TRADE_DATE' | 'UNSUPPORTED_TRANSACTION_TYPE' | 'UNKNOWN_ACCOUNT' | 'UNKNOWN_INSTRUMENT_ALIAS'
  | 'MISSING_REQUIRED_FIELD' | 'NEGATIVE_QUANTITY' | 'NEGATIVE_AMOUNT' | 'NEGATIVE_FEE' | 'INVALID_SPLIT_RATIO'
  | 'DUPLICATE_SETUP_SYMBOL' | 'POSSIBLE_INSTRUMENT_ALIAS_REVIEW' | 'GROSS_AMOUNT_INCONSISTENCY'
  | 'MISSING_NATIVE_CURRENCY' | 'MISSING_CATEGORY' | 'INVALID_QUOTE_IN_MINOR_UNITS_FLAG'
  | 'DUPLICATE_SOURCE_ROW' | 'DUPLICATE_IMPORT_IDENTITY' | 'STRICT_REVIEW_REQUIRED';
export type ImportException = Readonly<{ id: string; code: ImportIssueCode; blocking: true; provenance: Provenance; subjectId: string | null }>;
export type ImportWarning = Readonly<{ id: string; code: ImportIssueCode; provenance: Provenance; subjectId: string | null }>;
export type ImportBatchManifest = Readonly<{
  id: string; plannerVersion: string; extractorVersion: string; sourceWorkbookHash: string; mode: 'strict' | 'non-strict';
  lifecycle: 'planned'; planHash: string; provenance: Readonly<{ manifestHash: string; batch: Provenance }>;
}>;
export type ImportPlanSummary = Readonly<{
  masterCount: number; transactionCount: number; validTransactionCount: number; exceptionCount: number; warningCount: number;
  exceptionCodeCounts: Readonly<Record<string, number>>; warningCodeCounts: Readonly<Record<string, number>>; planHash: string; provenance: Provenance;
}>;
export type ImportPlan = Readonly<{
  manifest: ImportBatchManifest; summary: ImportPlanSummary; portfolio: PortfolioMasterProposal; currencies: readonly CurrencyProposal[];
  accounts: readonly AccountProposal[]; categories: readonly InvestmentCategoryProposal[]; instruments: readonly InstrumentProposal[];
  aliases: readonly InstrumentSourceAlias[]; rawTransactions: readonly RawTransactionInput[];
  transactions: readonly NormalizedTransactionProposal[]; exceptions: readonly ImportException[]; warnings: readonly ImportWarning[];
}>;
export type FixturePack = Readonly<{ manifest: Record<string, unknown>; setup: Record<string, unknown>; tradeLog: Record<string, unknown> }>;

type IssueDraft = Readonly<{ code: ImportIssueCode; provenance: Provenance; subjectId: string | null }>;
type Decimal = Readonly<{ negative: boolean; coefficient: string; scale: number }>;

const transactionTypes: Readonly<Record<string, NormalizedTransactionType>> = {
  buy: 'buy', sell: 'sell', dividend: 'dividend', 'return of capital': 'return_of_capital',
  'reinvested capital gain distribution': 'reinvested_capital_gain_distribution', 'cost base adj.': 'cost_base_adjustment', split: 'split',
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function hash(value: unknown): string { return createHash('sha256').update(canonicalize(value)).digest('hex'); }
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim(); return result === '' ? null : result;
}
function cellValue(cell: SourceCell | undefined): string | null { return text(cell?.formula === null ? cell.original_value : cell?.cached_value); }
function asObject(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asCells(value: unknown): readonly SourceCell[] { return Array.isArray(value) ? value.filter((item): item is SourceCell => asObject(item).source !== undefined) : []; }
function sourceOf(cell: SourceCell): Provenance {
  const source = cell.source;
  return { sourceWorkbookHash: '', extractorVersion: '', sourceSheet: source.sheet, sourceRow: source.row, sourceSequence: source.sequence, cells: [cell], provenanceHash: '' };
}
function withFixtureProvenance(provenance: Provenance, fixture: FixtureIdentity): Provenance {
  const core = { ...provenance, sourceWorkbookHash: fixture.workbookHash, extractorVersion: fixture.extractorVersion, provenanceHash: '' };
  return { ...core, provenanceHash: hash(core) };
}
function provenance(fixture: FixtureIdentity, cells: readonly SourceCell[], fallback: { sheet: string; row: number; sequence: number | null }): Provenance {
  const first = cells[0];
  return withFixtureProvenance(first === undefined ? { sourceWorkbookHash: '', extractorVersion: '', sourceSheet: fallback.sheet, sourceRow: fallback.row, sourceSequence: fallback.sequence, cells, provenanceHash: '' } : { ...sourceOf(first), cells }, fixture);
}
function id(kind: string, fixture: FixtureIdentity, provenance: Provenance, normalizedType?: string): string {
  return `${kind}_${hash({ sourceWorkbookHash: fixture.workbookHash, sheet: provenance.sourceSheet, row: provenance.sourceRow, sequence: provenance.sourceSequence, normalizedType: normalizedType ?? null }).slice(0, 24)}`;
}
function isValidDate(value: string | null): boolean { return value !== null && (/^\d{4}-\d{2}-\d{2}$/.test(value) ? !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) : /^\d+(\.\d+)?$/.test(value)); }
function normalizedDate(value: string | null): string | null {
  if (value === null || !isValidDate(value)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const serial = Number(value); const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + Math.trunc(serial) * 86_400_000).toISOString().slice(0, 10);
}
function decimal(value: string | null): Decimal | null {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const negative = value.startsWith('-'); const plain = value.replace(/^[+-]/, ''); const [whole, fraction = ''] = plain.split('.');
  const coefficient = `${whole || '0'}${fraction}`.replace(/^0+(?=\d)/, '');
  return { negative: negative && coefficient !== '0', coefficient, scale: fraction.length };
}
function nonNegative(value: string | null): boolean { const parsed = decimal(value); return parsed !== null && !parsed.negative; }
function multiplyIntegers(left: string, right: string): string {
  const digits = Array(left.length + right.length).fill(0);
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
    const position = leftIndex + rightIndex + 1; const product = Number(left[leftIndex]) * Number(right[rightIndex]) + digits[position];
    digits[position] = product % 10; digits[position - 1] += Math.floor(product / 10);
  }
  return digits.join('').replace(/^0+(?=\d)/, '');
}
function multipliedEquals(left: string | null, right: string | null, expected: string | null): boolean | null {
  const a = decimal(left); const b = decimal(right); const c = decimal(expected); if (a === null || b === null || c === null) return null;
  const productNegative = a.negative !== b.negative && a.coefficient !== '0' && b.coefficient !== '0';
  if (productNegative !== c.negative) return false;
  const product = multiplyIntegers(a.coefficient, b.coefficient); const productScale = a.scale + b.scale; const scale = Math.max(productScale, c.scale);
  return `${product}${'0'.repeat(scale - productScale)}`.replace(/^0+(?=\d)/, '') === `${c.coefficient}${'0'.repeat(scale - c.scale)}`.replace(/^0+(?=\d)/, '');
}
function normalizedType(value: string | null): NormalizedTransactionType | null { return value === null ? null : transactionTypes[value.toLowerCase()] ?? null; }
function issueId(kind: 'exception' | 'warning', draft: IssueDraft): string { return `${kind}_${hash({ code: draft.code, subjectId: draft.subjectId, provenanceHash: draft.provenance.provenanceHash }).slice(0, 24)}`; }
function codeCounts(issues: readonly { code: string }[]): Readonly<Record<string, number>> { return Object.fromEntries([...new Set(issues.map((item) => item.code))].sort().map((code) => [code, issues.filter((item) => item.code === code).length])); }
function fieldCells(cells: readonly SourceCell[]): Readonly<Record<string, SourceCell | undefined>> { return Object.fromEntries(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((column) => [column, cells.find((cell) => cell.source.column === column)])); }

type FixtureIdentity = Readonly<{ workbookHash: string; extractorVersion: string; manifestHash: string }>;
function fixtureIdentity(manifest: Record<string, unknown>): FixtureIdentity {
  const workbookHash = text(manifest.workbook_sha256); const extractorVersion = text(manifest.extractor_version);
  if (workbookHash === null || extractorVersion === null) throw new TypeError('Fixture manifest is missing required identity metadata.');
  return { workbookHash, extractorVersion, manifestHash: hash(manifest) };
}
function flag(value: string | null): boolean | null { if (value === null) return null; if (['true', 'yes', 'y', '1'].includes(value.toLowerCase())) return true; if (['false', 'no', 'n', '0'].includes(value.toLowerCase())) return false; return null; }

export function buildImportPlan(input: FixturePack, options: Readonly<{ strict?: boolean }> = {}): ImportPlan {
  const fixture = fixtureIdentity(input.manifest); const strict = options.strict ?? true;
  const exceptions: ImportException[] = []; const warnings: ImportWarning[] = [];
  const exception = (draft: IssueDraft): void => { exceptions.push({ id: issueId('exception', draft), ...draft, blocking: true }); };
  const warning = (draft: IssueDraft): void => { warnings.push({ id: issueId('warning', draft), ...draft }); if (strict) exception({ ...draft, code: 'STRICT_REVIEW_REQUIRED' }); };
  const setupCells = asCells(input.setup.cells);
  const masterCell = (cell: SourceCell): Provenance => provenance(fixture, [cell], { sheet: cell.source.sheet, row: cell.source.row, sequence: cell.source.sequence });
  const currencies = setupCells.filter((cell) => cell.source.column === 'B' && cell.source.row >= 5 && cell.source.row <= 9 && cellValue(cell) !== null).map((cell) => {
    const p = masterCell(cell); return { id: id('currency', fixture, p), code: cellValue(cell)!, provenance: p };
  });
  const categories = setupCells.filter((cell) => cell.source.column === 'B' && cell.source.row >= 12 && cell.source.row <= 36 && cellValue(cell) !== null).map((cell) => {
    const p = masterCell(cell); return { id: id('category', fixture, p), name: cellValue(cell)!, provenance: p };
  });
  const accounts = setupCells.filter((cell) => cell.source.column === 'B' && cell.source.row >= 39 && cell.source.row <= 48 && cellValue(cell) !== null).map((cell) => {
    const p = masterCell(cell); return { id: id('account', fixture, p), name: cellValue(cell)!, provenance: p };
  });
  const instruments: InstrumentProposal[] = []; const aliases: InstrumentSourceAlias[] = [];
  for (let row = 52; row <= 301; row += 1) {
    const rowCells = setupCells.filter((cell) => cell.source.row === row && ['B', 'C', 'D', 'H'].includes(cell.source.column)); const fields = fieldCells(rowCells);
    const symbol = cellValue(fields.B); if (symbol === null) continue;
    const p = provenance(fixture, rowCells, { sheet: 'Setup', row, sequence: null }); const categoryName = cellValue(fields.C); const nativeCurrencyCode = cellValue(fields.D); const quoteValue = cellValue(fields.H); const quoteInMinorUnits = flag(quoteValue);
    const instrumentId = id('instrument', fixture, p); instruments.push({ id: instrumentId, enteredSymbol: symbol, categoryName, nativeCurrencyCode, quoteInMinorUnits, resolutionStatus: 'proposed', provenance: p });
    aliases.push({ id: id('alias', fixture, p), instrumentId, enteredSymbol: symbol, provenance: p });
    if (categoryName === null) exception({ code: 'MISSING_CATEGORY', provenance: p, subjectId: instrumentId });
    if (nativeCurrencyCode === null) exception({ code: 'MISSING_NATIVE_CURRENCY', provenance: p, subjectId: instrumentId });
    if (quoteValue !== null && quoteInMinorUnits === null) exception({ code: 'INVALID_QUOTE_IN_MINOR_UNITS_FLAG', provenance: p, subjectId: instrumentId });
  }
  const bySymbol = new Map<string, InstrumentProposal[]>(); const byNormalizedSymbol = new Map<string, InstrumentProposal[]>();
  for (const instrument of instruments) { const exact = bySymbol.get(instrument.enteredSymbol) ?? []; exact.push(instrument); bySymbol.set(instrument.enteredSymbol, exact); const normalized = instrument.enteredSymbol.toLowerCase().replace(/\s+/g, ''); const similar = byNormalizedSymbol.get(normalized) ?? []; similar.push(instrument); byNormalizedSymbol.set(normalized, similar); }
  for (const group of bySymbol.values()) if (group.length > 1) group.forEach((instrument) => exception({ code: 'DUPLICATE_SETUP_SYMBOL', provenance: instrument.provenance, subjectId: instrument.id }));
  for (const group of byNormalizedSymbol.values()) if (group.length > 1 && new Set(group.map((instrument) => instrument.enteredSymbol)).size > 1) group.forEach((instrument) => warning({ code: 'POSSIBLE_INSTRUMENT_ALIAS_REVIEW', provenance: instrument.provenance, subjectId: instrument.id }));
  const portfolioProvenance = withFixtureProvenance({ sourceWorkbookHash: '', extractorVersion: '', sourceSheet: 'Setup', sourceRow: 0, sourceSequence: null, cells: [], provenanceHash: '' }, fixture);
  const portfolio: PortfolioMasterProposal = { id: `portfolio_${hash({ workbookHash: fixture.workbookHash }).slice(0, 24)}`, baseCurrencyCode: currencies[0]?.code ?? null, provenance: portfolioProvenance };
  const rawTransactions: RawTransactionInput[] = []; const transactions: NormalizedTransactionProposal[] = []; const sourceRows = new Set<string>(); const identities = new Set<string>();
  const tradeRows = Array.isArray(input.tradeLog.transactions) ? input.tradeLog.transactions : [];
  for (const row of tradeRows) {
    const rowObject = asObject(row); const source = asObject(rowObject.source); const cells = asCells(rowObject.cells); const rowNumber = Number(source.row); const sequence = source.sequence === null || source.sequence === undefined ? null : Number(source.sequence); const sheet = text(source.sheet) ?? 'Trade Log';
    const p = provenance(fixture, cells, { sheet, row: rowNumber, sequence }); const fields = fieldCells(cells); const raw: RawTransactionInput = {
      sourceSheet: sheet, sourceRow: rowNumber, sourceSequence: sequence, cells, rawTradeDate: cellValue(fields.B), rawType: cellValue(fields.C), rawSymbol: cellValue(fields.D), rawQuantity: cellValue(fields.E), rawUnitAmount: cellValue(fields.F), rawGrossAmount: cellValue(fields.G), rawFee: cellValue(fields.H), rawAccount: cellValue(fields.I), rawSplitRatio: cellValue(fields.J), rawPayload: fields, provenance: p,
    }; rawTransactions.push(raw); const rawId = id('raw_transaction', fixture, p); const type = normalizedType(raw.rawType); const txId = id('transaction', fixture, p, type ?? raw.rawType ?? 'unknown');
    const sourceKey = `${sheet}:${rowNumber}:${sequence ?? ''}`; if (sourceRows.has(sourceKey)) exception({ code: 'DUPLICATE_SOURCE_ROW', provenance: p, subjectId: rawId }); sourceRows.add(sourceKey);
    const identityKey = `${fixture.workbookHash}:${sheet}:${rowNumber}:${sequence ?? ''}:${type ?? raw.rawType ?? ''}`; if (identities.has(identityKey)) exception({ code: 'DUPLICATE_IMPORT_IDENTITY', provenance: p, subjectId: txId }); identities.add(identityKey);
    if (!isValidDate(raw.rawTradeDate)) exception({ code: 'INVALID_TRADE_DATE', provenance: p, subjectId: rawId });
    if (type === null) { exception({ code: 'UNSUPPORTED_TRANSACTION_TYPE', provenance: p, subjectId: rawId }); continue; }
    const account = accounts.find((item) => item.name === raw.rawAccount) ?? null; const alias = aliases.find((item) => item.enteredSymbol === raw.rawSymbol) ?? null;
    if (account === null) exception({ code: 'UNKNOWN_ACCOUNT', provenance: p, subjectId: rawId }); if (alias === null) exception({ code: 'UNKNOWN_INSTRUMENT_ALIAS', provenance: p, subjectId: rawId });
    const required = type === 'split' ? ['rawTradeDate', 'rawSymbol', 'rawSplitRatio'] : ['rawTradeDate', 'rawSymbol', 'rawAccount', 'rawGrossAmount'];
    if (type === 'buy' || type === 'sell') required.push('rawQuantity', 'rawUnitAmount', 'rawFee');
    for (const field of required) if (raw[field as keyof RawTransactionInput] === null) exception({ code: 'MISSING_REQUIRED_FIELD', provenance: p, subjectId: rawId });
    if (raw.rawQuantity !== null && !nonNegative(raw.rawQuantity)) exception({ code: 'NEGATIVE_QUANTITY', provenance: p, subjectId: rawId });
    if (raw.rawFee !== null && !nonNegative(raw.rawFee)) exception({ code: 'NEGATIVE_FEE', provenance: p, subjectId: rawId });
    if (type !== 'cost_base_adjustment') for (const amount of [raw.rawUnitAmount, raw.rawGrossAmount]) if (amount !== null && !nonNegative(amount)) exception({ code: 'NEGATIVE_AMOUNT', provenance: p, subjectId: rawId });
    if (type === 'split' && (raw.rawSplitRatio === null || !nonNegative(raw.rawSplitRatio) || decimal(raw.rawSplitRatio)?.coefficient === '0')) exception({ code: 'INVALID_SPLIT_RATIO', provenance: p, subjectId: rawId });
    if ((type === 'buy' || type === 'sell') && multipliedEquals(raw.rawQuantity, raw.rawUnitAmount, raw.rawGrossAmount) === false) exception({ code: 'GROSS_AMOUNT_INCONSISTENCY', provenance: p, subjectId: rawId });
    transactions.push({ id: txId, rawInputId: rawId, normalizedType: type, normalizedTradeDate: normalizedDate(raw.rawTradeDate), accountId: account?.id ?? null, instrumentId: alias?.instrumentId ?? null, raw, provenance: p });
  }
  const planSeed = { plannerVersion: IMPORT_PLANNER_VERSION, sourceWorkbookHash: fixture.workbookHash, mode: strict ? 'strict' : 'non-strict', portfolio, currencies, accounts, categories, instruments, aliases, rawTransactions, transactions, exceptions, warnings };
  const planHash = hash(planSeed); const manifest: ImportBatchManifest = { id: `batch_${planHash.slice(0, 24)}`, plannerVersion: IMPORT_PLANNER_VERSION, extractorVersion: fixture.extractorVersion, sourceWorkbookHash: fixture.workbookHash, mode: strict ? 'strict' : 'non-strict', lifecycle: 'planned', planHash, provenance: { manifestHash: fixture.manifestHash, batch: portfolioProvenance } };
  const blockingTransactionIds = new Set(exceptions.map((item) => item.subjectId)); const summary: ImportPlanSummary = { masterCount: currencies.length + accounts.length + categories.length + instruments.length, transactionCount: rawTransactions.length, validTransactionCount: transactions.filter((item) => !blockingTransactionIds.has(item.id) && !blockingTransactionIds.has(item.rawInputId)).length, exceptionCount: exceptions.length, warningCount: warnings.length, exceptionCodeCounts: codeCounts(exceptions), warningCodeCounts: codeCounts(warnings), planHash, provenance: portfolioProvenance };
  return { manifest, summary, portfolio, currencies, accounts, categories, instruments, aliases, rawTransactions, transactions, exceptions, warnings };
}
