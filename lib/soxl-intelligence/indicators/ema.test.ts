import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    calculateEmaSeries,
    calculateLatestEma,
} from '@/lib/soxl-intelligence/indicators/ema';

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

describe('calculateEmaSeries', () => {
    it('calculates a known EMA 3 fixture with SMA seed', () => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 11, 12, 13, 14]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.status).toBe('available');
        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 600, value: 11 },
            { timestamp: baseTimestamp + 900, value: 12 },
            { timestamp: baseTimestamp + 1_200, value: 13 },
        ]);
    });

    it('makes the first EMA equal the initial SMA seed', () => {
        const result = calculateEmaSeries({
            candles: createSeries([3, 6, 9, 12]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0]).toEqual({
            timestamp: baseTimestamp + 600,
            value: 6,
        });
    });

    it('uses the standard multiplier for subsequent EMA points', () => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 20, 30, 40]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].value).toBe(20);
        expect(result.values[1].value).toBe(30);
    });

    it('makes EMA 1 equal each completed close', () => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 12, 14]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.values.map((point) => point.value)).toEqual([10, 12, 14]);
    });

    it('starts output at index period - 1', () => {
        const result = calculateEmaSeries({
            candles: createSeries([1, 2, 3, 4]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values[0].timestamp).toBe(baseTimestamp + 600);
    });

    it('returns latest EMA from the final series point', () => {
        const input = {
            candles: createSeries([10, 20, 30, 40]),
            expectedSymbol: 'SOXL' as const,
            expectedInterval: '5m' as const,
            asOf,
            period: 2,
        };
        const series = calculateEmaSeries(input);
        const latest = calculateLatestEma(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBeCloseTo(35);
    });

    it('returns insufficient_history when completed candles are below the period', () => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 20]),
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

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s period', (_label, period) => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 20, 30]),
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
            ...createSeries([10, 20, 30]),
            createCandle(3, 1_000, { isComplete: false }),
        ];

        const result = calculateEmaSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.status).toBe('available');
        expect(result.usedBars).toBe(3);
        expect(result.values).toEqual([{ timestamp: baseTimestamp + 600, value: 20 }]);
    });

    it('keeps a flat series flat', () => {
        const result = calculateEmaSeries({
            candles: createSeries([25, 25, 25, 25]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.map((point) => point.value)).toEqual([25, 25, 25]);
    });

    it('returns expected values for a rising series', () => {
        const result = calculateEmaSeries({
            candles: createSeries([1, 2, 3, 4, 5]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values.map((point) => point.value)).toEqual([2, 3, 4]);
    });

    it('does not round EMA values', () => {
        const result = calculateEmaSeries({
            candles: createSeries([10, 11, 13]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values[1].value).toBeCloseTo(12.166666666666666);
    });

    it('does not mutate input candles', () => {
        const candles = createSeries([10, 20, 30]);
        const before = candles.map((candle) => ({ ...candle }));

        calculateEmaSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(candles).toEqual(before);
    });

    it('returns generic EMA 200 unavailable at 199 completed candles', () => {
        const result = calculateEmaSeries({
            candles: createSeries(Array.from({ length: 199 }, () => 100)),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 200,
        });

        expect(result.status).toBe('insufficient_history');
        expect(result.requiredBars).toBe(200);
        expect(result.usedBars).toBe(199);
    });

    it('returns generic EMA 200 available at 200 completed candles', () => {
        const result = calculateEmaSeries({
            candles: createSeries(Array.from({ length: 200 }, () => 100)),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 200,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(200);
        expect(result.usedBars).toBe(200);
        expect(result.values).toHaveLength(1);
        expect(result.latest.value).toBe(100);
    });
});
