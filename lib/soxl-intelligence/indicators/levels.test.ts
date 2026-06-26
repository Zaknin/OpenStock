import { describe, expect, it } from 'vitest';
import {
    calculateOpeningRangeLevels,
    calculatePremarketLevels,
    calculatePreviousDayLevels,
} from '@/lib/soxl-intelligence/indicators/levels';
import type {
    OpeningRangeLevelsInput,
    PremarketLevelsInput,
    PreviousDayLevelsInput,
    PriceLevelInput,
} from '@/lib/soxl-intelligence/indicators/types';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';

const baseTimestamp = 1_782_415_800;
const fiveMinutes = 300;
const previousDayStart = baseTimestamp;
const previousDayEnd = baseTimestamp + 6 * fiveMinutes;
const openingRangeEnd = baseTimestamp + 30 * 60;
const asOf = previousDayEnd + 100_000;

function createCandle(index: number, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * fiveMinutes,
        open: 10,
        high: 12,
        low: 8,
        close: 10,
        volume: 100,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createPreviousDayInput(overrides: Partial<PreviousDayLevelsInput> = {}): PreviousDayLevelsInput {
    return {
        candles: [
            createCandle(0, { high: 12, low: 9, close: 10 }),
            createCandle(1, { high: 15, low: 10, close: 12 }),
            createCandle(2, { high: 14, low: 7, close: 10 }),
        ],
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        window: {
            start: previousDayStart,
            end: previousDayEnd,
        },
        ...overrides,
    };
}

function createPremarketInput(overrides: Partial<PremarketLevelsInput> = {}): PremarketLevelsInput {
    return {
        candles: [
            createCandle(0, { high: 10, low: 7, close: 9, session: 'premarket' }),
            createCandle(1, { high: 13, low: 8, close: 11, session: 'premarket' }),
            createCandle(2, { high: 12, low: 6, close: 10, session: 'premarket' }),
        ],
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        window: {
            start: previousDayStart,
            end: previousDayEnd,
        },
        ...overrides,
    };
}

function createOpeningRangeInput(overrides: Partial<OpeningRangeLevelsInput> = {}): OpeningRangeLevelsInput {
    return {
        candles: [
            createCandle(0, { high: 12, low: 8, close: 10 }),
            createCandle(1, { high: 14, low: 6, close: 10 }),
            createCandle(2, { high: 13, low: 7, close: 10 }),
            createCandle(3, { high: 18, low: 9, close: 12 }),
            createCandle(4, { high: 16, low: 8, close: 11 }),
            createCandle(5, { high: 15, low: 7, close: 10 }),
        ],
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        window: {
            start: baseTimestamp,
            end: openingRangeEnd,
        },
        openingRangeMinutes: 30,
        ...overrides,
    };
}

describe('calculatePreviousDayLevels', () => {
    it('calculates known previous-day high and low', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput());

        expect(result).toMatchObject({
            status: 'available',
            high: 15,
            low: 7,
            usedBars: 3,
        });
    });

    it('records correct high and low timestamps', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput());

        expect(result.highTimestamp).toBe(baseTimestamp + fiveMinutes);
        expect(result.lowTimestamp).toBe(baseTimestamp + 2 * fiveMinutes);
    });

    it('retains the earliest timestamp for repeated equal highs', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { high: 15, low: 9, close: 10 }),
                createCandle(1, { high: 15, low: 10, close: 12 }),
                createCandle(2, { high: 14, low: 7, close: 10 }),
            ],
        }));

        expect(result.high).toBe(15);
        expect(result.highTimestamp).toBe(baseTimestamp);
    });

    it('retains the earliest timestamp for repeated equal lows', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { high: 12, low: 7, close: 10 }),
                createCandle(1, { high: 15, low: 10, close: 12 }),
                createCandle(2, { high: 14, low: 7, close: 10 }),
            ],
        }));

        expect(result.low).toBe(7);
        expect(result.lowTimestamp).toBe(baseTimestamp);
    });

    it('excludes current-day candles outside the supplied window', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { high: 12, low: 9, close: 10 }),
                createCandle(1, { high: 15, low: 10, close: 12 }),
                createCandle(2, { high: 14, low: 7, close: 10 }),
                createCandle(300, { open: 100, high: 100, low: 100, close: 100 }),
            ],
        }));

        expect(result.high).toBe(15);
        expect(result.low).toBe(7);
        expect(result.usedBars).toBe(3);
    });

    it('excludes premarket and after-hours candles', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { open: 100, high: 100, low: 100, close: 100, session: 'premarket' }),
                createCandle(1, { high: 15, low: 10, close: 12 }),
                createCandle(2, { open: 1, high: 2, low: 1, close: 1, session: 'after_hours' }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'available',
            high: 15,
            low: 10,
            usedBars: 1,
        });
    });

    it('returns window_not_completed when the window ends after asOf', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            asOf: previousDayEnd - 1,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'window_not_completed',
            high: null,
            low: null,
            usedBars: 0,
        });
    });

    it('returns no_matching_candles when no regular candles match', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { session: 'premarket' }),
                createCandle(1, { session: 'after_hours' }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'no_matching_candles',
            high: null,
            low: null,
            usedBars: 0,
        });
    });
});

describe('calculatePremarketLevels', () => {
    it('calculates known premarket high and low', () => {
        const result = calculatePremarketLevels(createPremarketInput());

        expect(result).toMatchObject({
            status: 'available',
            high: 13,
            low: 6,
            highTimestamp: baseTimestamp + fiveMinutes,
            lowTimestamp: baseTimestamp + 2 * fiveMinutes,
            usedBars: 3,
        });
    });

    it('excludes regular-session candles', () => {
        const result = calculatePremarketLevels(createPremarketInput({
            candles: [
                createCandle(0, { high: 10, low: 7, close: 9, session: 'premarket' }),
                createCandle(1, { open: 100, high: 100, low: 100, close: 100, session: 'regular' }),
            ],
        }));

        expect(result).toMatchObject({
            high: 10,
            low: 7,
            usedBars: 1,
        });
    });

    it('excludes after-hours candles', () => {
        const result = calculatePremarketLevels(createPremarketInput({
            candles: [
                createCandle(0, { high: 10, low: 7, close: 9, session: 'premarket' }),
                createCandle(1, { open: 1, high: 2, low: 1, close: 1, session: 'after_hours' }),
            ],
        }));

        expect(result).toMatchObject({
            high: 10,
            low: 7,
            usedBars: 1,
        });
    });

    it('excludes candles outside the explicit window', () => {
        const result = calculatePremarketLevels(createPremarketInput({
            window: {
                start: baseTimestamp + fiveMinutes,
                end: baseTimestamp + 3 * fiveMinutes,
            },
            candles: [
                createCandle(0, { open: 100, high: 100, low: 100, close: 100, session: 'premarket' }),
                createCandle(1, { high: 13, low: 8, close: 11, session: 'premarket' }),
                createCandle(2, { high: 12, low: 6, close: 10, session: 'premarket' }),
                createCandle(3, { open: 1, high: 2, low: 1, close: 1, session: 'premarket' }),
            ],
        }));

        expect(result).toMatchObject({
            high: 13,
            low: 6,
            usedBars: 2,
        });
    });

    it('returns window_not_completed when the premarket window is not complete', () => {
        const result = calculatePremarketLevels(createPremarketInput({
            asOf: previousDayEnd - 1,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'window_not_completed',
            usedBars: 0,
        });
    });

    it('returns no_matching_candles when no premarket candles match', () => {
        const result = calculatePremarketLevels(createPremarketInput({
            candles: [
                createCandle(0, { session: 'regular' }),
                createCandle(1, { session: 'after_hours' }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'no_matching_candles',
            high: null,
            low: null,
            usedBars: 0,
        });
    });
});

describe('calculateOpeningRangeLevels', () => {
    it('calculates known 30-minute opening-range levels from 5m candles', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput());

        expect(result).toMatchObject({
            status: 'available',
            high: 18,
            low: 6,
            highTimestamp: baseTimestamp + 3 * fiveMinutes,
            lowTimestamp: baseTimestamp + fiveMinutes,
            usedBars: 6,
        });
    });

    it('includes candles at the first and last valid window boundaries', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            candles: [
                createCandle(0, { high: 20, low: 8, close: 10 }),
                createCandle(1, { high: 14, low: 7, close: 10 }),
                createCandle(5, { high: 15, low: 5, close: 10 }),
            ],
        }));

        expect(result).toMatchObject({
            high: 20,
            highTimestamp: baseTimestamp,
            low: 5,
            lowTimestamp: baseTimestamp + 5 * fiveMinutes,
            usedBars: 3,
        });
    });

    it('excludes a candle at window.end', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            candles: [
                createCandle(0, { high: 12, low: 8, close: 10 }),
                createCandle(5, { high: 15, low: 7, close: 10 }),
                createCandle(6, { open: 100, high: 100, low: 100, close: 100 }),
            ],
        }));

        expect(result).toMatchObject({
            high: 15,
            low: 7,
            usedBars: 2,
        });
    });

    it('returns window_not_completed when the opening range is incomplete', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            asOf: openingRangeEnd - 1,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'window_not_completed',
            high: null,
            low: null,
            usedBars: 0,
        });
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_window for %s openingRangeMinutes', (_label, openingRangeMinutes) => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            openingRangeMinutes,
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_window',
            usedBars: 0,
        });
    });

    it('returns invalid_window when window duration does not match openingRangeMinutes', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            window: {
                start: baseTimestamp,
                end: baseTimestamp + 25 * 60,
            },
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_window',
            usedBars: 0,
        });
    });

    it('rejects a 1h interval for a 30-minute opening range', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            expectedInterval: '1h',
            candles: [
                createCandle(0, { interval: '1h' }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'interval_exceeds_window',
            usedBars: 0,
        });
    });

    it('excludes premarket candles', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            candles: [
                createCandle(0, { open: 100, high: 100, low: 100, close: 100, session: 'premarket' }),
                createCandle(1, { high: 14, low: 7, close: 10 }),
            ],
        }));

        expect(result).toMatchObject({
            high: 14,
            low: 7,
            usedBars: 1,
        });
    });

    it('excludes after-hours candles', () => {
        const result = calculateOpeningRangeLevels(createOpeningRangeInput({
            candles: [
                createCandle(0, { high: 14, low: 7, close: 10 }),
                createCandle(1, { open: 1, high: 2, low: 1, close: 1, session: 'after_hours' }),
            ],
        }));

        expect(result).toMatchObject({
            high: 14,
            low: 7,
            usedBars: 1,
        });
    });
});

describe('price-level shared validation', () => {
    it('rejects daily intervals', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            expectedInterval: '1d',
            candles: [createCandle(0, { interval: '1d' })],
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'unsupported_daily_interval',
            high: null,
            low: null,
            usedBars: 0,
        });
    });

    it.each([
        ['start equals end', previousDayStart, previousDayStart],
        ['start greater than end', previousDayStart + 1, previousDayStart],
        ['zero start', 0, previousDayEnd],
        ['negative start', -1, previousDayEnd],
        ['decimal start', previousDayStart + 0.5, previousDayEnd],
        ['NaN start', Number.NaN, previousDayEnd],
        ['Infinity start', Infinity, previousDayEnd],
        ['millisecond-looking boundary', 10_000_000_001, 10_000_000_002],
    ])('returns invalid_window for %s', (_label, start, end) => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            window: { start, end },
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_window',
            high: null,
            low: null,
            usedBars: 0,
        });
    });

    it('returns invalid_input for a future candle and propagates validation issues', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0),
                createCandle(400, { timestamp: asOf + 1 }),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.high).toBeNull();
        expect(result.low).toBeNull();
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('propagates validation issues for invalid OHLC input', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [createCandle(0, { high: 9, low: 11, close: 10 })],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.high).toBeNull();
        expect(result.low).toBeNull();
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_ohlc_relationship' }));
    });

    it('excludes incomplete candles', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, { high: 12, low: 8, close: 10 }),
                createCandle(1, { high: 20, low: 1, close: 10, isComplete: false }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'available',
            high: 12,
            low: 8,
            usedBars: 1,
        });
    });

    it('does not mutate input candles', () => {
        const candles = [
            createCandle(0, { high: 12, low: 8, close: 10 }),
            createCandle(1, { high: 15, low: 7, close: 10 }),
        ];
        const before = candles.map((candle) => ({ ...candle }));

        calculatePreviousDayLevels(createPreviousDayInput({ candles }));

        expect(candles).toEqual(before);
    });

    it('keeps zero volume valid', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [createCandle(0, { volume: 0 })],
        }));

        expect(result).toMatchObject({
            status: 'available',
            high: 12,
            low: 8,
            usedBars: 1,
        });
    });

    it('keeps null volume valid', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [createCandle(0, { volume: null })],
        }));

        expect(result).toMatchObject({
            status: 'available',
            high: 12,
            low: 8,
            usedBars: 1,
        });
    });

    it('returns finite available values', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput());

        expect(result.status).toBe('available');
        expect(Number.isFinite(result.high)).toBe(true);
        expect(Number.isFinite(result.low)).toBe(true);
    });

    it('does not round available values', () => {
        const result = calculatePreviousDayLevels(createPreviousDayInput({
            candles: [
                createCandle(0, {
                    open: 10,
                    high: 12.123456789,
                    low: 7.987654321,
                    close: 10,
                }),
            ],
        }));

        expect(result.high).toBe(12.123456789);
        expect(result.low).toBe(7.987654321);
    });

    it('preserves the supplied window object values in the result', () => {
        const input: PriceLevelInput = createPreviousDayInput();
        const result = calculatePreviousDayLevels(input);

        expect(result.window).toEqual({
            start: previousDayStart,
            end: previousDayEnd,
        });
    });
});
