import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportPlan, type FixturePack, type SourceCell } from './import-planner';

const fixturePath = path.resolve(process.cwd(), 'test/fixtures/portfolio-core/synthetic-import-fixture.json');

async function fixture(): Promise<FixturePack> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as FixturePack;
}

function cell(row: number, column: string, sequence: number, value: string | null): SourceCell {
  return { source: { sheet: 'Trade Log', row, column, cell: `${column}${row}`, sequence }, original_value: value, formula: null, cached_value: null, cell_type: 's', calculation_class: 'input' };
}
function transaction(row: number, sequence: number, type: string, extras: Readonly<Record<string, string | null>> = {}): Record<string, unknown> {
  const values: Record<string, string | null> = { B: '48901', C: type, D: 'ORBIT', E: '0', F: '0', G: '1', H: '0', I: 'Account Alpha', J: null, ...extras };
  return { source: { sheet: 'Trade Log', row, sequence }, cells: Object.entries(values).filter(([, value]) => value !== null).map(([column, value]) => cell(row, column, sequence, value)) };
}

describe('Portfolio Core deterministic import planner', () => {
  it('preserves raw formula/cache evidence, source order, and deterministic identities', async () => {
    const input = await fixture(); const first = buildImportPlan(input, { strict: false }); const second = buildImportPlan(input, { strict: false });
    expect(first.summary.planHash).toBe(second.summary.planHash);
    expect(first.transactions.map((item) => item.id)).toEqual(second.transactions.map((item) => item.id));
    expect(first.transactions.map((item) => item.raw.sourceSequence)).toEqual([1, 2]);
    expect(first.rawTransactions[0].rawGrossAmount).toBe('125.00');
    expect(first.rawTransactions[0].rawPayload.G?.formula).toBe('E6*F6');
    expect(first.rawTransactions[0].rawPayload.G?.cached_value).toBe('125.00');
    expect(first.transactions[0].accountId).not.toBe(first.transactions[1].accountId);
  });

  it('supports each approved source type without doing accounting calculations', async () => {
    const input = await fixture(); const types = ['Buy', 'Sell', 'Dividend', 'Return of capital', 'Reinvested capital gain distribution', 'Cost Base Adj.', 'Split'];
    input.tradeLog.transactions = types.map((type, index) => transaction(20 + index, index + 1, type, type === 'Split' ? { G: '0', J: '2' } : type === 'Cost Base Adj.' ? { G: '-1' } : type === 'Buy' || type === 'Sell' ? { E: '2.5', F: '4', G: '10', H: '0' } : { G: '1' }));
    const plan = buildImportPlan(input, { strict: false });
    expect(plan.transactions.map((item) => item.normalizedType)).toEqual(['buy', 'sell', 'dividend', 'return_of_capital', 'reinvested_capital_gain_distribution', 'cost_base_adjustment', 'split']);
    expect(plan.exceptions.some((item) => item.code === 'GROSS_AMOUNT_INCONSISTENCY')).toBe(false);
  });

  it('reports validation evidence without mutating raw source values', async () => {
    const input = await fixture(); input.tradeLog.transactions = [
      transaction(30, 1, 'Buy', { I: 'Unknown account' }),
      transaction(31, 2, 'Buy', { D: 'UNKNOWN', E: '2', F: '4', G: '9' }),
      transaction(32, 3, 'Split', { G: '0', J: '0' }),
      transaction(32, 3, 'Buy', { E: '-2', F: '4', G: '-8', H: '-1' }),
    ];
    const plan = buildImportPlan(input, { strict: false }); const codes = new Set(plan.exceptions.map((item) => item.code));
    expect(codes).toEqual(expect.objectContaining(new Set(['UNKNOWN_ACCOUNT', 'UNKNOWN_INSTRUMENT_ALIAS', 'GROSS_AMOUNT_INCONSISTENCY', 'INVALID_SPLIT_RATIO', 'NEGATIVE_QUANTITY', 'NEGATIVE_AMOUNT', 'NEGATIVE_FEE', 'DUPLICATE_SOURCE_ROW'])));
    expect(plan.rawTransactions[1].rawGrossAmount).toBe('9');
    expect(plan.rawTransactions[3].rawQuantity).toBe('-2');
  });

  it('keeps possible aliases as warnings in non-strict mode and escalates review in strict mode', async () => {
    const input = await fixture(); const nonStrict = buildImportPlan(input, { strict: false }); const strict = buildImportPlan(input, { strict: true });
    expect(nonStrict.warnings.some((item) => item.code === 'POSSIBLE_INSTRUMENT_ALIAS_REVIEW')).toBe(true);
    expect(nonStrict.exceptions.some((item) => item.code === 'STRICT_REVIEW_REQUIRED')).toBe(false);
    expect(strict.exceptions.some((item) => item.code === 'STRICT_REVIEW_REQUIRED')).toBe(true);
  });

  it('produces a no-blocking-exception plan for a valid strict source subset', async () => {
    const input = await fixture();
    input.setup.cells = (input.setup.cells as SourceCell[]).filter((item) => item.source.row < 53);
    const plan = buildImportPlan(input, { strict: true });
    expect(plan.summary.exceptionCount).toBe(0);
    expect(plan.summary.validTransactionCount).toBe(2);
  });
});
