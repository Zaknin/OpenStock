import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    calculateAtrSeries,
    calculateLatestAtr,
} from '@/lib/soxl-intelligence/indicators/atr';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 100_000;

function createCandle(index: number, values: {
    high: number;
    low: number;
    close: number;
    open?: number;
}, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * 300,
        open: values.open ?? values.close,
        high: values.high,
        low: values.low,
        close: values.close,
        volume: 1_000,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createAtrFixture(): MarketCandle[] {
    return [
        createCandle(0, { high: 12, low: 10, close: 11 }),
        createCandle(1, { high: 13, low: 10, close: 12 }),
        createCandle(2, { high: 15, low: 11, close: 14 }),
        createCandle(3, { high: 18, low: 13, close: 17 }),
    ];
}

describe('calculateAtrSeries', () => {
    it('calculates a known true-range fixture', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.values.map((point) => point.value)).toEqual([2, 3, 4, 5]);
    });

    it('uses the mean of the first period true ranges for initial ATR', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0]).toEqual({
            timestamp: baseTimestamp + 600,
            value: 3,
        });
    });

    it('uses Wilder smoothing for subsequent ATR values', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[1].value).toBeCloseTo(11 / 3);
    });

    it('starts output at index period - 1 with correct timestamps', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].timestamp).toBe(baseTimestamp + 600);
        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp + 600,
            baseTimestamp + 900,
        ]);
    });

    it('returns latest ATR from the final series point', () => {
        const input = {
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL' as const,
            expectedInterval: '5m' as const,
            asOf,
            period: 3,
        };
        const series = calculateAtrSeries(input);
        const latest = calculateLatestAtr(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBeCloseTo(11 / 3);
    });

    it('uses high minus previous close for a gap-up candle when largest', () => {
        const result = calculateAtrSeries({
            candles: [
                createCandle(0, { high: 11, low: 9, close: 10 }),
                createCandle(1, { high: 20, low: 18, close: 19 }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.values[1].value).toBe(10);
    });

    it('uses low minus previous close for a gap-down candle when largest', () => {
        const result = calculateAtrSeries({
            candles: [
                createCandle(0, { high: 21, low: 19, close: 20 }),
                createCandle(1, { high: 12, low: 8, close: 10 }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.values[1].value).toBe(12);
    });

    it('returns zero ATR for a flat valid candle series', () => {
        const result = calculateAtrSeries({
            candles: [
                createCandle(0, { high: 10, low: 10, close: 10 }),
                createCandle(1, { high: 10, low: 10, close: 10 }),
                createCandle(2, { high: 10, low: 10, close: 10 }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.latest.value).toBe(0);
    });

    it('supports period 1', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(1);
        expect(result.values).toHaveLength(4);
    });

    it('returns insufficient_history at period minus one candles', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture().slice(0, 2),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result).toMatchObject({
            status: 'insufficient_history',
            values: [],
            requiredBars: 3,
            usedBars: 2,
            latest: {
                value: null,
                timestamp: null,
                status: 'insufficient_history',
                requiredBars: 3,
                usedBars: 2,
            },
        });
    });

    it('is available at exactly period candles', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture().slice(0, 3),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.status).toBe('available');
        expect(result.values).toHaveLength(1);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s period', (_label, period) => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period,
        });

        expect(result).toMatchObject({
            status: 'invalid_input',
            values: [],
            requiredBars: 0,
            usedBars: 0,
            latest: {
                value: null,
                timestamp: null,
                status: 'invalid_input',
                requiredBars: 0,
                usedBars: 0,
            },
        });
    });

    it('excludes an incomplete final candle', () => {
        const result = calculateAtrSeries({
            candles: [
                ...createAtrFixture().slice(0, 3),
                createCandle(3, { high: 100, low: 90, close: 95 }, { isComplete: false }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.status).toBe('available');
        expect(result.usedBars).toBe(3);
        expect(result.values).toEqual([{ timestamp: baseTimestamp + 600, value: 3 }]);
    });

    it('returns invalid_input for a future candle', () => {
        const result = calculateAtrSeries({
            candles: [createCandle(0, { high: 12, low: 10, close: 11 }, { timestamp: asOf + 1 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('propagates invalid OHLC validation issues', () => {
        const result = calculateAtrSeries({
            candles: [createCandle(0, { high: 10, low: 11, close: 10 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_ohlc_relationship' }));
    });

    it('does not mutate input candles', () => {
        const candles = createAtrFixture();
        const before = candles.map((candle) => ({ ...candle }));

        calculateAtrSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(candles).toEqual(before);
    });

    it('returns output timestamps in strictly ascending order', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp + 300,
            baseTimestamp + 600,
            baseTimestamp + 900,
        ]);
    });

    it('does not round ATR values', () => {
        const result = calculateAtrSeries({
            candles: createAtrFixture(),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[1].value).toBeCloseTo(3.6666666666666665);
    });
});
