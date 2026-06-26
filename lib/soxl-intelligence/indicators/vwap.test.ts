import { describe, expect, it } from 'vitest';
import {
    calculateLatestSessionVwap,
    calculateSessionVwapSeries,
} from '@/lib/soxl-intelligence/indicators/vwap';
import type { SessionVolumeIndicatorInput } from '@/lib/soxl-intelligence/indicators/types';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';

const baseTimestamp = 1_782_415_800;
const sessionStart = baseTimestamp;
const sessionEnd = baseTimestamp + 10 * 300;
const asOf = baseTimestamp + 100_000;

function createCandle(index: number, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * 300,
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

function createInput(overrides: Partial<SessionVolumeIndicatorInput> = {}): SessionVolumeIndicatorInput {
    return {
        candles: [
            createCandle(0, { high: 12, low: 9, close: 9, volume: 100 }),
            createCandle(1, { high: 16, low: 10, close: 13, volume: 200 }),
            createCandle(2, { high: 20, low: 10, close: 15, volume: 300 }),
        ],
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        session: 'regular',
        sessionStart,
        sessionEnd,
        ...overrides,
    };
}

describe('calculateSessionVwapSeries', () => {
    it('calculates a known session VWAP fixture using HLC3', () => {
        const result = calculateSessionVwapSeries(createInput());

        expect(result.status).toBe('available');
        expect(result.values).toEqual([
            { timestamp: baseTimestamp, value: 10 },
            { timestamp: baseTimestamp + 300, value: 12 },
            { timestamp: baseTimestamp + 600, value: 13.5 },
        ]);
        expect(result.latest).toMatchObject({
            value: 13.5,
            timestamp: baseTimestamp + 600,
            status: 'available',
            requiredBars: 1,
            usedBars: 3,
        });
    });

    it('creates the first output at the first positive-volume candle', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { volume: 0 }),
                createCandle(1, { high: 16, low: 10, close: 13, volume: 200 }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 300, value: 13 },
        ]);
    });

    it('keeps cumulative VWAP correct across several candles', () => {
        const result = calculateSessionVwapSeries(createInput());

        expect(result.values.map((point) => point.value)).toEqual([10, 12, 13.5]);
    });

    it('uses the matching candle timestamps for output points', () => {
        const result = calculateSessionVwapSeries(createInput());

        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp,
            baseTimestamp + 300,
            baseTimestamp + 600,
        ]);
    });

    it('returns latest VWAP from the final series point', () => {
        const input = createInput();
        const series = calculateSessionVwapSeries(input);
        const latest = calculateLatestSessionVwap(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBe(series.values[series.values.length - 1].value);
    });

    it('skips a null-volume candle without converting it to zero', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { high: 12, low: 9, close: 9, volume: 100 }),
                createCandle(1, { open: 100, high: 100, low: 100, close: 100, volume: null }),
                createCandle(2, { open: 20, high: 22, low: 18, close: 20, volume: 100 }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp, value: 10 },
            { timestamp: baseTimestamp + 600, value: 15 },
        ]);
    });

    it('does not emit a point for an initial zero-volume candle', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { volume: 0 }),
                createCandle(1, { high: 16, low: 10, close: 13, volume: 100 }),
            ],
        }));

        expect(result.values[0]).toEqual({
            timestamp: baseTimestamp + 300,
            value: 13,
        });
    });

    it('emits unchanged VWAP for a zero-volume candle after positive volume', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { high: 12, low: 9, close: 9, volume: 100 }),
                createCandle(1, { open: 100, high: 100, low: 100, close: 100, volume: 0 }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp, value: 10 },
            { timestamp: baseTimestamp + 300, value: 10 },
        ]);
    });

    it('returns zero_total_volume for all-null volume', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { volume: null }),
                createCandle(1, { volume: null }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'zero_total_volume',
            values: [],
            usedBars: 2,
            latest: {
                value: null,
                timestamp: null,
                status: 'insufficient_history',
            },
        });
    });

    it('returns zero_total_volume for all-zero volume', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { volume: 0 }),
                createCandle(1, { volume: 0 }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'zero_total_volume',
            values: [],
            usedBars: 2,
        });
    });

    it('returns no_matching_session_candles when no completed candle matches', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [createCandle(0, { session: 'premarket' })],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'no_matching_session_candles',
            values: [],
            usedBars: 0,
        });
    });

    it('excludes premarket candles from regular-session calculation', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { open: 100, high: 100, low: 100, close: 100, volume: 1_000, session: 'premarket' }),
                createCandle(1, { high: 16, low: 10, close: 13, volume: 100 }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 300, value: 13 },
        ]);
        expect(result.usedBars).toBe(1);
    });

    it('excludes after-hours candles from regular-session calculation', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { high: 14, low: 8, close: 8, volume: 100 }),
                createCandle(1, { open: 100, high: 100, low: 100, close: 100, volume: 1_000, session: 'after_hours' }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp, value: 10 },
        ]);
        expect(result.usedBars).toBe(1);
    });

    it('excludes candles outside the explicit session window', () => {
        const result = calculateSessionVwapSeries(createInput({
            sessionStart: baseTimestamp + 300,
            sessionEnd: baseTimestamp + 900,
            candles: [
                createCandle(0, { open: 100, high: 100, low: 100, close: 100, volume: 1_000 }),
                createCandle(1, { high: 16, low: 10, close: 13, volume: 100 }),
                createCandle(2, { high: 20, low: 10, close: 15, volume: 100 }),
                createCandle(3, { open: 100, high: 100, low: 100, close: 100, volume: 1_000 }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 300, value: 13 },
            { timestamp: baseTimestamp + 600, value: 14 },
        ]);
    });

    it('excludes incomplete candles', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [
                createCandle(0, { high: 12, low: 9, close: 9, volume: 100 }),
                createCandle(1, { open: 100, high: 100, low: 100, close: 100, volume: 1_000, isComplete: false }),
            ],
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp, value: 10 },
        ]);
        expect(result.usedBars).toBe(1);
    });

    it('returns invalid_input for a future candle', () => {
        const result = calculateSessionVwapSeries(createInput({
            asOf: baseTimestamp,
            candles: [createCandle(1)],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('returns unsupported_daily_interval for daily interval', () => {
        const result = calculateSessionVwapSeries(createInput({
            expectedInterval: '1d',
            candles: [createCandle(0, { interval: '1d' })],
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'unsupported_daily_interval',
            values: [],
            latest: {
                value: null,
                timestamp: null,
                status: 'invalid_input',
            },
        });
    });

    it.each([
        ['start equal to end', sessionStart, sessionStart],
        ['start greater than end', sessionStart + 1, sessionStart],
        ['zero start', 0, sessionEnd],
        ['negative start', -1, sessionEnd],
        ['decimal start', sessionStart + 0.5, sessionEnd],
        ['NaN start', Number.NaN, sessionEnd],
        ['Infinity start', Infinity, sessionEnd],
        ['millisecond-looking boundary', 10_000_000_001, 10_000_000_002],
    ])('returns invalid_session_window for %s', (_label, start, end) => {
        const result = calculateSessionVwapSeries(createInput({
            sessionStart: start,
            sessionEnd: end,
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_session_window',
            usedBars: 0,
            values: [],
        });
    });

    it('propagates validation issues for invalid OHLC input', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [createCandle(0, { high: 9, low: 11, close: 10 })],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_ohlc_relationship' }));
    });

    it('does not mutate input candles', () => {
        const candles = [
            createCandle(0, { high: 12, low: 9, close: 9, volume: 100 }),
            createCandle(1, { high: 16, low: 10, close: 13, volume: null }),
        ];
        const before = candles.map((candle) => ({ ...candle }));

        calculateSessionVwapSeries(createInput({ candles }));

        expect(candles).toEqual(before);
    });

    it('emits output timestamps in ascending order', () => {
        const result = calculateSessionVwapSeries(createInput());
        const timestamps = result.values.map((point) => point.timestamp);

        expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
    });

    it('does not round VWAP values', () => {
        const result = calculateSessionVwapSeries(createInput({
            candles: [createCandle(0, {
                high: 4,
                low: 3,
                open: 3.5,
                close: 3,
                volume: 1,
            })],
        }));

        expect(result.latest.value).toBe(10 / 3);
    });
});
