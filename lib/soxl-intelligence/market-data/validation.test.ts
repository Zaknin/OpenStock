import { describe, expect, it } from 'vitest';
import type {
    CandleInterval,
    CandleSymbol,
    MarketCandle,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type { CandleValidationIssueCode } from '@/lib/soxl-intelligence/market-data/validation';
import {
    getCompletedCandles,
    validateCandleSeries,
} from '@/lib/soxl-intelligence/market-data/validation';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 1_000;

function createCandle(overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp,
        open: 30,
        high: 32,
        low: 29,
        close: 31,
        volume: 1_000,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function validate(candles: readonly MarketCandle[], options: {
    expectedSymbol?: CandleSymbol;
    expectedInterval?: CandleInterval;
    validationAsOf?: number;
    allowEmpty?: boolean;
} = {}) {
    return validateCandleSeries({
        candles,
        expectedSymbol: options.expectedSymbol ?? 'SOXL',
        expectedInterval: options.expectedInterval ?? '5m',
        asOf: options.validationAsOf ?? asOf,
        allowEmpty: options.allowEmpty,
    });
}

function expectIssue(candles: readonly MarketCandle[], code: CandleValidationIssueCode): void {
    const result = validate(candles);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === code)).toBe(true);
}

describe('validateCandleSeries', () => {
    it('accepts a valid ascending SOXL 5m candle series', () => {
        const candles = [
            createCandle({ timestamp: baseTimestamp }),
            createCandle({ timestamp: baseTimestamp + 300 }),
            createCandle({ timestamp: baseTimestamp + 600 }),
        ];

        const result = validate(candles);

        expect(result.valid).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.completedCandles).toEqual(candles);
        expect(result.incompleteCandles).toEqual([]);
    });

    it('rejects an empty series by default', () => {
        const result = validate([]);

        expect(result.valid).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'empty_series' }));
    });

    it('allows an empty series when allowEmpty is true', () => {
        const result = validate([], { allowEmpty: true });

        expect(result.valid).toBe(true);
        expect(result.issues).toEqual([]);
    });

    it('rejects duplicate timestamps', () => {
        expectIssue([
            createCandle({ timestamp: baseTimestamp }),
            createCandle({ timestamp: baseTimestamp }),
        ], 'duplicate_timestamp');
    });

    it('rejects descending or unsorted timestamps', () => {
        expectIssue([
            createCandle({ timestamp: baseTimestamp + 300 }),
            createCandle({ timestamp: baseTimestamp }),
        ], 'unsorted_timestamp');
    });

    it('rejects timestamps that appear to be milliseconds', () => {
        expectIssue([createCandle({ timestamp: baseTimestamp * 1_000 })], 'timestamp_unit_suspected');
    });

    it('rejects decimal timestamps', () => {
        expectIssue([createCandle({ timestamp: baseTimestamp + 0.5 })], 'timestamp_not_integer');
    });

    it('rejects future timestamps', () => {
        expectIssue([createCandle({ timestamp: asOf + 1 })], 'future_timestamp');
    });

    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
        ['zero', 0],
        ['negative', -1],
        ['fractional', asOf + 0.5],
        ['millisecond-looking', asOf * 1_000],
    ])('rejects %s asOf boundaries', (_label, validationAsOf) => {
        const result = validate([createCandle()], { validationAsOf });

        expect(result.valid).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'invalid_as_of',
            index: null,
        }));
    });

    it('does not perform future timestamp comparison against an invalid asOf boundary', () => {
        const result = validate([createCandle({ timestamp: baseTimestamp })], { validationAsOf: Number.NaN });

        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_as_of' }));
        expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('continues reporting candle issues when the asOf boundary is invalid', () => {
        const result = validate([createCandle({ open: 0 })], { validationAsOf: Infinity });

        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_as_of' }));
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_open' }));
    });

    it('rejects symbol mismatches', () => {
        const result = validate([createCandle({ symbol: 'QQQ' })]);

        expect(result.valid).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'symbol_mismatch' }));
    });

    it('rejects interval mismatches', () => {
        const result = validate([createCandle({ interval: '15m' })]);

        expect(result.valid).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'interval_mismatch' }));
    });

    it('rejects zero prices', () => {
        expectIssue([createCandle({ open: 0 })], 'invalid_open');
    });

    it('rejects negative prices', () => {
        expectIssue([createCandle({ close: -1 })], 'invalid_close');
    });

    it('rejects NaN and infinite OHLC values', () => {
        const result = validate([
            createCandle({
                open: Number.NaN,
                high: Infinity,
                low: Number.NEGATIVE_INFINITY,
                close: Number.NaN,
            }),
        ]);

        expect(result.valid).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_open' }));
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_high' }));
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_low' }));
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_close' }));
    });

    it('rejects high below open or close', () => {
        expectIssue([createCandle({ open: 31, high: 30, close: 31 })], 'invalid_ohlc_relationship');
    });

    it('rejects low above open or close', () => {
        expectIssue([createCandle({ open: 30, low: 31, close: 30 })], 'invalid_ohlc_relationship');
    });

    it('rejects high below low', () => {
        expectIssue([createCandle({ high: 29, low: 30 })], 'invalid_ohlc_relationship');
    });

    it('accepts null volume', () => {
        const result = validate([createCandle({ volume: null })]);

        expect(result.valid).toBe(true);
        expect(result.completedCandles[0].volume).toBeNull();
    });

    it('accepts and preserves zero volume', () => {
        const result = validate([createCandle({ volume: 0 })]);

        expect(result.valid).toBe(true);
        expect(result.completedCandles[0].volume).toBe(0);
    });

    it('rejects negative volume', () => {
        expectIssue([createCandle({ volume: -1 })], 'invalid_volume');
    });

    it('rejects infinite or NaN volume', () => {
        const infiniteResult = validate([createCandle({ volume: Infinity })]);
        const nanResult = validate([createCandle({ volume: Number.NaN })]);

        expect(infiniteResult.valid).toBe(false);
        expect(infiniteResult.issues).toContainEqual(expect.objectContaining({ code: 'invalid_volume' }));
        expect(nanResult.valid).toBe(false);
        expect(nanResult.issues).toContainEqual(expect.objectContaining({ code: 'invalid_volume' }));
    });

    it('rejects string volume', () => {
        const candle = createCandle({
            volume: '1000' as unknown as MarketCandle['volume'],
        });

        expectIssue([candle], 'invalid_volume');
    });

    it('rejects non-boolean completion flags', () => {
        const candle = createCandle({
            isComplete: 'true' as unknown as MarketCandle['isComplete'],
        });

        expectIssue([candle], 'invalid_completion_flag');
    });

    it('rejects invalid sessions', () => {
        const candle = createCandle({
            session: 'holiday' as unknown as MarketCandle['session'],
        });

        expectIssue([candle], 'invalid_session');
    });

    it('separates completed and incomplete candles', () => {
        const completed = createCandle({ timestamp: baseTimestamp, isComplete: true });
        const incomplete = createCandle({ timestamp: baseTimestamp + 300, isComplete: false });

        const result = validate([completed, incomplete]);

        expect(result.valid).toBe(true);
        expect(result.completedCandles).toEqual([completed]);
        expect(result.incompleteCandles).toEqual([incomplete]);
    });

    it('does not mutate input candles', () => {
        const candles = [
            createCandle({ timestamp: baseTimestamp }),
            createCandle({ timestamp: baseTimestamp + 300, isComplete: false }),
        ];
        const before = candles.map((candle) => ({ ...candle }));

        validate(candles);

        expect(candles).toEqual(before);
    });
});

describe('getCompletedCandles', () => {
    it('returns a new array of completed candles at or before asOf while preserving order', () => {
        const first = createCandle({ timestamp: baseTimestamp, isComplete: true });
        const second = createCandle({ timestamp: baseTimestamp + 300, isComplete: false });
        const third = createCandle({ timestamp: baseTimestamp + 600, isComplete: true });
        const future = createCandle({ timestamp: baseTimestamp + 900, isComplete: true });
        const candles = [first, second, third, future];

        const completed = getCompletedCandles(candles, baseTimestamp + 600);

        expect(completed).toEqual([first, third]);
        expect(completed).not.toBe(candles);
    });
});
