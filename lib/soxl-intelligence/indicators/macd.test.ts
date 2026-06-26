import { describe, expect, it } from 'vitest';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    calculateLatestMacd,
    calculateMacdSeries,
} from '@/lib/soxl-intelligence/indicators/macd';
import type { MacdPoint } from '@/lib/soxl-intelligence/indicators/types';

const baseTimestamp = 1_782_415_800;
const asOf = baseTimestamp + 100_000;

interface ExpectedPoint {
    timestamp: number;
    value: number;
}

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

function createCloseSeries(closes: readonly number[]): MarketCandle[] {
    return closes.map((close, index) => createCandle(index, close));
}

function createLinearSeries(count: number, start: number, step: number): MarketCandle[] {
    return Array.from({ length: count }, (_value, index) => (
        createCandle(index, start + index * step)
    ));
}

function calculateExpectedEma(points: readonly ExpectedPoint[], period: number): ExpectedPoint[] {
    let seed = 0;

    for (let index = 0; index < period; index += 1) {
        seed += points[index].value;
    }

    const multiplier = 2 / (period + 1);
    let previous = seed / period;
    const values: ExpectedPoint[] = [{
        timestamp: points[period - 1].timestamp,
        value: previous,
    }];

    for (let index = period; index < points.length; index += 1) {
        previous = (points[index].value - previous) * multiplier + previous;

        values.push({
            timestamp: points[index].timestamp,
            value: previous,
        });
    }

    return values;
}

function calculateExpectedMacd(
    candles: readonly MarketCandle[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
): MacdPoint[] {
    const closes = candles.map((candle) => ({
        timestamp: candle.timestamp,
        value: candle.close,
    }));
    const fastEma = calculateExpectedEma(closes, fastPeriod);
    const slowEma = calculateExpectedEma(closes, slowPeriod);
    const fastByTimestamp = new Map(fastEma.map((point) => [point.timestamp, point.value]));
    const macdLine = slowEma.map((slowPoint) => ({
        timestamp: slowPoint.timestamp,
        value: (fastByTimestamp.get(slowPoint.timestamp) as number) - slowPoint.value,
    }));
    const signalLine = calculateExpectedEma(macdLine, signalPeriod);
    const macdByTimestamp = new Map(macdLine.map((point) => [point.timestamp, point.value]));

    return signalLine.map((signalPoint) => {
        const macd = macdByTimestamp.get(signalPoint.timestamp) as number;

        return {
            timestamp: signalPoint.timestamp,
            macd,
            signal: signalPoint.value,
            histogram: macd - signalPoint.value,
        };
    });
}

function expectMacdPointClose(actual: MacdPoint, expected: MacdPoint): void {
    expect(actual.timestamp).toBe(expected.timestamp);
    expect(actual.macd).toBeCloseTo(expected.macd);
    expect(actual.signal).toBeCloseTo(expected.signal);
    expect(actual.histogram).toBeCloseTo(expected.histogram);
}

describe('calculateMacdSeries', () => {
    it('uses default periods 12/26/9', () => {
        const candles = createLinearSeries(34, 10, 1);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(34);
        expect(result.values).toHaveLength(1);
    });

    it('requires 34 completed candles for standard MACD', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(33, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result).toMatchObject({
            status: 'insufficient_history',
            values: [],
            requiredBars: 34,
            usedBars: 33,
            latest: {
                macd: null,
                signal: null,
                histogram: null,
                timestamp: null,
                status: 'insufficient_history',
                requiredBars: 34,
                usedBars: 33,
            },
        });
    });

    it('is available at 34 completed candles', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(34, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.status).toBe('available');
        expect(result.usedBars).toBe(34);
        expect(result.values).toHaveLength(1);
    });

    it('emits the first standard output at candle index 33', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(34, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values[0].timestamp).toBe(baseTimestamp + 33 * 300);
    });

    it('seeds the first signal value with the SMA of the first nine MACD-line values', () => {
        const candles = createLinearSeries(34, 10, 1);
        const expected = calculateExpectedMacd(candles, 12, 26, 9);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values[0].signal).toBeCloseTo(expected[0].signal);
    });

    it('sets histogram to MACD minus signal', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values.every((point) => (
            Math.abs(point.histogram - (point.macd - point.signal)) < 1e-12
        ))).toBe(true);
    });

    it('uses EMA smoothing for subsequent signal values', () => {
        const candles = createLinearSeries(35, 10, 1);
        const expected = calculateExpectedMacd(candles, 12, 26, 9);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expectMacdPointClose(result.values[1], expected[1]);
    });

    it('returns latest MACD from the final series point', () => {
        const input = {
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL' as const,
            expectedInterval: '5m' as const,
            asOf,
        };
        const series = calculateMacdSeries(input);
        const latest = calculateLatestMacd(input);
        const finalPoint = series.values[series.values.length - 1];

        expect(latest).toEqual(series.latest);
        expect(latest).toMatchObject({
            macd: finalPoint.macd,
            signal: finalPoint.signal,
            histogram: finalPoint.histogram,
            timestamp: finalPoint.timestamp,
        });
    });

    it('returns zero MACD, signal, and histogram for a flat close series', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 25, 0),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values.every((point) => (
            point.macd === 0 && point.signal === 0 && point.histogram === 0
        ))).toBe(true);
    });

    it('returns expected values for a rising deterministic series', () => {
        const candles = createLinearSeries(40, 10, 1);
        const expected = calculateExpectedMacd(candles, 12, 26, 9);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expectMacdPointClose(result.values[0], expected[0]);
        expectMacdPointClose(result.values[result.values.length - 1], expected[expected.length - 1]);
    });

    it('returns expected values for a falling deterministic series', () => {
        const candles = createLinearSeries(40, 100, -1);
        const expected = calculateExpectedMacd(candles, 12, 26, 9);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expectMacdPointClose(result.values[0], expected[0]);
        expectMacdPointClose(result.values[result.values.length - 1], expected[expected.length - 1]);
    });

    it('supports custom valid periods', () => {
        const candles = createCloseSeries([10, 11, 12, 14, 13, 15, 16]);
        const expected = calculateExpectedMacd(candles, 3, 5, 2);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            fastPeriod: 3,
            slowPeriod: 5,
            signalPeriod: 2,
        });

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(6);
        expect(result.values).toHaveLength(2);
        expectMacdPointClose(result.values[0], expected[0]);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s fast period', (_label, fastPeriod) => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            fastPeriod,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.requiredBars).toBe(0);
        expect(result.latest.requiredBars).toBe(0);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s slow period', (_label, slowPeriod) => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            slowPeriod,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.values).toEqual([]);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_input for %s signal period', (_label, signalPeriod) => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            signalPeriod,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.latest.status).toBe('invalid_input');
    });

    it('returns invalid_input when fastPeriod is greater than or equal to slowPeriod', () => {
        const equalResult = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            fastPeriod: 12,
            slowPeriod: 12,
        });
        const greaterResult = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            fastPeriod: 13,
            slowPeriod: 12,
        });

        expect(equalResult.status).toBe('invalid_input');
        expect(greaterResult.status).toBe('invalid_input');
    });

    it('excludes an incomplete final candle', () => {
        const result = calculateMacdSeries({
            candles: [
                ...createLinearSeries(34, 10, 1),
                createCandle(34, 1_000, { isComplete: false }),
            ],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.status).toBe('available');
        expect(result.usedBars).toBe(34);
        expect(result.values).toHaveLength(1);
    });

    it('returns invalid_input for a future candle', () => {
        const result = calculateMacdSeries({
            candles: [createCandle(0, 10, { timestamp: asOf + 1 })],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('propagates invalid OHLC validation issues', () => {
        const result = calculateMacdSeries({
            candles: [createCandle(0, 0)],
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_open' }));
    });

    it('does not mutate input candles', () => {
        const candles = createLinearSeries(40, 10, 1);
        const before = candles.map((candle) => ({ ...candle }));

        calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(candles).toEqual(before);
    });

    it('returns output timestamps in strictly ascending order', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values.map((point) => point.timestamp)).toEqual(
            result.values.map((point) => point.timestamp).sort((left, right) => left - right),
        );
    });

    it('does not round values', () => {
        const candles = createCloseSeries([10, 11, 13, 12, 15, 14, 16]);
        const expected = calculateExpectedMacd(candles, 3, 5, 2);
        const result = calculateMacdSeries({
            candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
            fastPeriod: 3,
            slowPeriod: 5,
            signalPeriod: 2,
        });

        expect(result.values[1].macd).toBeCloseTo(expected[1].macd);
        expect(result.values[1].signal).toBeCloseTo(expected[1].signal);
        expect(result.values[1].histogram).toBeCloseTo(expected[1].histogram);
    });

    it('emits only finite MACD points', () => {
        const result = calculateMacdSeries({
            candles: createLinearSeries(40, 10, 1),
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf,
        });

        expect(result.values.every((point) => (
            Number.isFinite(point.macd)
            && Number.isFinite(point.signal)
            && Number.isFinite(point.histogram)
        ))).toBe(true);
    });
});
