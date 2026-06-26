import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    calculateLatestRsi,
    calculateRsiSeries,
} from '@/lib/soxl-intelligence/indicators/rsi';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 100_000;

function createCandle(index: number, close: number, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * 300,
        open: close,
        high: close + 1,
        low: close > 1 ? close - 1 : 0.5,
        close,
        volume: 1_000,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createSeries(closes: readonly number[]): MarketCandle[] {
    return closes.map((close, index) => createCandle(index, close));
}

describe('calculateRsiSeries', () => {
    it('calculates a known Wilder RSI fixture with a manual first value', () => {
        const result = calculateRsiSeries({
            candles: createSeries([44, 44.15, 43.9, 44.35, 44.7]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(4);
        expect(result.usedBars).toBe(5);
        expect(result.values[0].value).toBeCloseTo(70.58823529411765);
    });

    it('calculates a known subsequent Wilder-smoothed value', () => {
        const result = calculateRsiSeries({
            candles: createSeries([44, 44.15, 43.9, 44.35, 44.7]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[1].value).toBeCloseTo(81.81818181818181);
    });

    it('starts output at candle index period with correct timestamps', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 10.5, 11.25, 11]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values[0].timestamp).toBe(baseTimestamp + 600);
        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp + 600,
            baseTimestamp + 900,
            baseTimestamp + 1_200,
        ]);
    });

    it('returns latest RSI from the final series point', () => {
        const input = {
            candles: createSeries([10, 11, 10.5, 11.25]),
            expectedSymbol: 'SOXL' as const,
            expectedInterval: '5m' as const,
            asOf,
            period: 2,
        };
        const series = calculateRsiSeries(input);
        const latest = calculateLatestRsi(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBeCloseTo(series.values[series.values.length - 1].value);
    });

    it('returns RSI 50 for a flat close series', () => {
        const result = calculateRsiSeries({
            candles: createSeries([25, 25, 25, 25]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].value).toBe(50);
    });

    it('returns RSI 100 for a strictly rising close series', () => {
        const result = calculateRsiSeries({
            candles: createSeries([1, 2, 3, 4]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].value).toBe(100);
    });

    it('returns RSI 0 for a strictly falling close series', () => {
        const result = calculateRsiSeries({
            candles: createSeries([4, 3, 2, 1]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].value).toBe(0);
    });

    it('keeps RSI values within 0 and 100', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 12, 11, 15, 9, 14, 13]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.every((point) => point.value >= 0 && point.value <= 100)).toBe(true);
    });

    it('supports period 1', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 10]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(2);
        expect(result.values.map((point) => point.value)).toEqual([100, 0]);
    });

    it('returns insufficient_history at exactly period candles', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 12]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result).toMatchObject({
            status: 'insufficient_history',
            values: [],
            requiredBars: 4,
            usedBars: 3,
            latest: {
                value: null,
                timestamp: null,
                status: 'insufficient_history',
                requiredBars: 4,
                usedBars: 3,
            },
        });
    });

    it('is available at period plus one candles', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 12, 13]),
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
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 12, 13]),
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
        const candles = [
            ...createSeries([10, 11, 12]),
            createCandle(3, 1, { isComplete: false }),
        ];

        const result = calculateRsiSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.status).toBe('available');
        expect(result.usedBars).toBe(3);
        expect(result.values).toHaveLength(1);
    });

    it('returns invalid_input for a future candle', () => {
        const result = calculateRsiSeries({
            candles: [createCandle(0, 10, { timestamp: asOf + 1 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('propagates invalid OHLC validation issues', () => {
        const result = calculateRsiSeries({
            candles: [createCandle(0, 0)],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_open' }));
    });

    it('does not mutate input candles', () => {
        const candles = createSeries([10, 11, 10.5, 11.25]);
        const before = candles.map((candle) => ({ ...candle }));

        calculateRsiSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(candles).toEqual(before);
    });

    it('returns output timestamps in strictly ascending order', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 10, 12, 11]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp + 600,
            baseTimestamp + 900,
            baseTimestamp + 1_200,
        ]);
    });

    it('does not round RSI values', () => {
        const result = calculateRsiSeries({
            candles: createSeries([10, 11, 10.5, 11.25]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values[0].value).toBeCloseTo(66.66666666666666);
        expect(result.values[1].value).toBeCloseTo(83.33333333333333);
    });
});
