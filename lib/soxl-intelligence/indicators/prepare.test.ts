import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import { prepareIndicatorCandles } from '@/lib/soxl-intelligence/indicators/prepare';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 2_000;

function createCandle(overrides: Partial<MarketCandle> = {}): MarketCandle {
    const timestamp = overrides.timestamp ?? baseTimestamp;
    const close = overrides.close ?? 31;

    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp,
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 1_000,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createSeries(count: number): MarketCandle[] {
    return Array.from({ length: count }, (_value, index) => (
        createCandle({
            timestamp: baseTimestamp + index * 300,
            close: 30 + index,
        })
    ));
}

describe('prepareIndicatorCandles', () => {
    it('returns available for a valid completed candle series', () => {
        const candles = createSeries(3);

        const result = prepareIndicatorCandles({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 3,
        });

        expect(result).toMatchObject({
            status: 'available',
            requiredBars: 3,
            usedBars: 3,
            validationIssues: [],
        });
        expect(result.candles).toEqual(candles);
    });

    it('does not mutate the input array', () => {
        const candles = createSeries(3);
        const before = candles.map((candle) => ({ ...candle }));

        prepareIndicatorCandles({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 2,
        });

        expect(candles).toEqual(before);
    });

    it('returns a new candle array', () => {
        const candles = createSeries(3);

        const result = prepareIndicatorCandles({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 2,
        });

        expect(result.candles).not.toBe(candles);
    });

    it('excludes incomplete candles', () => {
        const candles = [
            ...createSeries(3),
            createCandle({
                timestamp: baseTimestamp + 900,
                close: 100,
                isComplete: false,
            }),
        ];

        const result = prepareIndicatorCandles({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 3,
        });

        expect(result.status).toBe('available');
        expect(result.candles).toHaveLength(3);
        expect(result.candles.map((candle) => candle.close)).toEqual([30, 31, 32]);
    });

    it('returns insufficient_history when completed candles are below the minimum', () => {
        const candles = createSeries(2);

        const result = prepareIndicatorCandles({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 3,
        });

        expect(result).toMatchObject({
            status: 'insufficient_history',
            requiredBars: 3,
            usedBars: 2,
        });
        expect(result.candles).toEqual(candles);
    });

    it('returns invalid_input for invalid OHLC', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ close: 0 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.candles).toEqual([]);
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_close' }));
    });

    it('returns invalid_input for unsorted candles', () => {
        const result = prepareIndicatorCandles({
            candles: [
                createCandle({ timestamp: baseTimestamp + 300 }),
                createCandle({ timestamp: baseTimestamp }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'unsorted_timestamp' }));
    });

    it('returns invalid_input for future timestamps', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ timestamp: asOf + 1 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('returns invalid_input for symbol mismatch', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ symbol: 'QQQ' })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'symbol_mismatch' }));
    });

    it('returns invalid_input for interval mismatch', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ interval: '15m' })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'interval_mismatch' }));
    });

    it('returns invalid_input for invalid asOf', () => {
        const result = prepareIndicatorCandles({
            candles: createSeries(1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: Number.NaN,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_as_of' }));
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s minimum bars', (_label, minimumCompletedBars) => {
        const result = prepareIndicatorCandles({
            candles: createSeries(3),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars,
        });

        expect(result).toMatchObject({
            status: 'invalid_input',
            requiredBars: 0,
            usedBars: 0,
            candles: [],
            preparationError: 'invalid_minimum_completed_bars',
        });
    });

    it('returns invalid_input for empty input', () => {
        const result = prepareIndicatorCandles({
            candles: [],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'empty_series' }));
    });

    it('preserves legitimate zero volume', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ volume: 0 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('available');
        expect(result.candles[0].volume).toBe(0);
    });

    it('preserves null volume', () => {
        const result = prepareIndicatorCandles({
            candles: [createCandle({ volume: null })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            minimumCompletedBars: 1,
        });

        expect(result.status).toBe('available');
        expect(result.candles[0].volume).toBeNull();
    });
});
