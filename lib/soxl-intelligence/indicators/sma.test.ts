import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    calculateLatestSma,
    calculateSmaSeries,
} from '@/lib/soxl-intelligence/indicators/sma';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 10_000;

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

describe('calculateSmaSeries', () => {
    it('calculates a known SMA 3 fixture', () => {
        const result = calculateSmaSeries({
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
        expect(result.latest).toMatchObject({
            value: 13,
            timestamp: baseTimestamp + 1_200,
            status: 'available',
            requiredBars: 3,
            usedBars: 5,
        });
    });

    it('makes SMA 1 equal each completed close', () => {
        const result = calculateSmaSeries({
            candles: createSeries([10, 12, 14]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.values.map((point) => point.value)).toEqual([10, 12, 14]);
    });

    it('starts output at index period - 1 with correct timestamps', () => {
        const result = calculateSmaSeries({
            candles: createSeries([1, 2, 3, 4]),
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

    it('returns latest SMA from the final series point', () => {
        const input = {
            candles: createSeries([10, 20, 30, 40]),
            expectedSymbol: 'SOXL' as const,
            expectedInterval: '5m' as const,
            asOf,
            period: 2,
        };
        const series = calculateSmaSeries(input);
        const latest = calculateLatestSma(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBe(35);
    });

    it('returns insufficient_history when completed candles are below the period', () => {
        const result = calculateSmaSeries({
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
        const result = calculateSmaSeries({
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

        const result = calculateSmaSeries({
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

    it('rejects a future candle as invalid input', () => {
        const result = calculateSmaSeries({
            candles: [createCandle(0, 10, { timestamp: asOf + 1 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 1,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('returns the same value for a flat series', () => {
        const result = calculateSmaSeries({
            candles: createSeries([25, 25, 25, 25]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.map((point) => point.value)).toEqual([25, 25, 25]);
    });

    it('returns expected values for a rising series', () => {
        const result = calculateSmaSeries({
            candles: createSeries([1, 2, 3, 4, 5]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 3,
        });

        expect(result.values.map((point) => point.value)).toEqual([2, 3, 4]);
    });

    it('does not mutate input candles', () => {
        const candles = createSeries([10, 20, 30]);
        const before = candles.map((candle) => ({ ...candle }));

        calculateSmaSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(candles).toEqual(before);
    });

    it('returns series values ordered ascending by timestamp', () => {
        const result = calculateSmaSeries({
            candles: createSeries([10, 11, 12, 13, 14]),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            period: 2,
        });

        expect(result.values.map((point) => point.timestamp)).toEqual([
            baseTimestamp + 300,
            baseTimestamp + 600,
            baseTimestamp + 900,
            baseTimestamp + 1_200,
        ]);
    });
});
