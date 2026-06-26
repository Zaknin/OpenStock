import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlCoreIndicatorSnapshot,
} from '@/lib/soxl-intelligence/analysis/soxl-core-indicators';
import * as indicatorModule from '@/lib/soxl-intelligence/indicators';
import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSymbol,
    MarketCandle,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    SoxlMarketContextResult,
} from '@/lib/soxl-intelligence/market-data/soxl-market-context';

const asOf = 1_782_432_000;
const intradayBaseTimestamp = asOf - 400 * 300;
const dailyBaseTimestamp = asOf - 400 * 86_400;

function createCandle(
    symbol: CandleSymbol,
    interval: CandleInterval,
    index: number,
    overrides: Partial<MarketCandle> = {},
): MarketCandle {
    const wave = index % 12;
    const close = 100 + index * 0.5 + wave;
    const intervalSeconds = interval === '1d' ? 86_400 : 300;
    const timestampBase = interval === '1d' ? dailyBaseTimestamp : intradayBaseTimestamp;

    return {
        symbol,
        interval,
        timestamp: timestampBase + index * intervalSeconds,
        open: close - 0.5,
        high: close + 1 + (wave === 6 ? 8 : 0),
        low: close - 1 - (wave === 0 ? 8 : 0),
        close,
        volume: 1_000 + index,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    count: number,
    overrides: Partial<CandleSeries> = {},
): CandleSeries {
    return {
        symbol,
        interval,
        candles: Array.from({ length: count }, (_value, index) => (
            createCandle(symbol, interval, index)
        )),
        status: 'available',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        metadata: {
            requestedFrom: asOf - count * 300,
            requestedTo: asOf,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
        ...overrides,
    };
}

function createFailureSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    errorCode: CandleSeriesErrorCode,
): CandleSeries & { rawProviderMessage: string } {
    return {
        symbol,
        interval,
        candles: [],
        status: 'unavailable',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        errorCode,
        rawProviderMessage: 'raw provider message must not be preserved',
        metadata: {
            requestedFrom: asOf - 1_000,
            requestedTo: asOf,
            providerLatency: 'unknown',
            entitlement: 'unknown',
        },
    };
}

function createContext(overrides: Partial<SoxlMarketContextResult> = {}): SoxlMarketContextResult {
    return {
        status: 'available',
        asOf,
        providerId: 'fixture-provider',
        series: {
            soxl5m: createSeries('SOXL', '5m', 260),
            soxl1d: createSeries('SOXL', '1d', 260),
            qqq5m: createSeries('QQQ', '5m', 260),
            smh5m: createSeries('SMH', '5m', 260),
        },
        availableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        unavailableSeries: [],
        ...overrides,
    };
}

function getIndicatorStatuses(snapshot: ReturnType<typeof buildSoxlCoreIndicatorSnapshot>) {
    return [
        snapshot.series.soxl5m.ema9?.status,
        snapshot.series.soxl5m.ema20?.status,
        snapshot.series.soxl5m.ema50?.status,
        snapshot.series.soxl5m.rsi14?.status,
        snapshot.series.soxl5m.atr14?.status,
        snapshot.series.soxl5m.macd12269?.status,
        snapshot.series.soxl5m.swings333?.status,
        snapshot.series.soxl1d.ema20?.status,
        snapshot.series.soxl1d.ema50?.status,
        snapshot.series.soxl1d.ema200?.status,
        snapshot.series.soxl1d.rsi14?.status,
        snapshot.series.soxl1d.atr14?.status,
        snapshot.series.soxl1d.macd12269?.status,
        snapshot.series.soxl1d.swings333?.status,
        snapshot.series.qqq5m.ema20?.status,
        snapshot.series.qqq5m.ema50?.status,
        snapshot.series.qqq5m.rsi14?.status,
        snapshot.series.qqq5m.macd12269?.status,
        snapshot.series.smh5m.ema20?.status,
        snapshot.series.smh5m.ema50?.status,
        snapshot.series.smh5m.rsi14?.status,
        snapshot.series.smh5m.macd12269?.status,
    ];
}

describe('buildSoxlCoreIndicatorSnapshot wiring', () => {
    it('returns four fixed series with expected symbols, intervals, and configured indicator fields', () => {
        const snapshot = buildSoxlCoreIndicatorSnapshot(createContext());

        expect(Object.keys(snapshot.series)).toEqual(['soxl5m', 'soxl1d', 'qqq5m', 'smh5m']);
        expect(snapshot.series.soxl5m).toMatchObject({ key: 'soxl5m', symbol: 'SOXL', interval: '5m' });
        expect(snapshot.series.soxl1d).toMatchObject({ key: 'soxl1d', symbol: 'SOXL', interval: '1d' });
        expect(snapshot.series.qqq5m).toMatchObject({ key: 'qqq5m', symbol: 'QQQ', interval: '5m' });
        expect(snapshot.series.smh5m).toMatchObject({ key: 'smh5m', symbol: 'SMH', interval: '5m' });
        expect([
            snapshot.series.soxl5m.ema9,
            snapshot.series.soxl5m.ema20,
            snapshot.series.soxl5m.ema50,
            snapshot.series.soxl5m.rsi14,
            snapshot.series.soxl5m.atr14,
            snapshot.series.soxl5m.macd12269,
            snapshot.series.soxl5m.swings333,
        ].filter(Boolean)).toHaveLength(7);
        expect([
            snapshot.series.soxl1d.ema20,
            snapshot.series.soxl1d.ema50,
            snapshot.series.soxl1d.ema200,
            snapshot.series.soxl1d.rsi14,
            snapshot.series.soxl1d.atr14,
            snapshot.series.soxl1d.macd12269,
            snapshot.series.soxl1d.swings333,
        ].filter(Boolean)).toHaveLength(7);
        expect([
            snapshot.series.qqq5m.ema20,
            snapshot.series.qqq5m.ema50,
            snapshot.series.qqq5m.rsi14,
            snapshot.series.qqq5m.macd12269,
        ].filter(Boolean)).toHaveLength(4);
        expect([
            snapshot.series.smh5m.ema20,
            snapshot.series.smh5m.ema50,
            snapshot.series.smh5m.rsi14,
            snapshot.series.smh5m.macd12269,
        ].filter(Boolean)).toHaveLength(4);
    });

    it('uses exact indicator configurations and context asOf', () => {
        const snapshot = buildSoxlCoreIndicatorSnapshot(createContext());

        expect(snapshot.series.soxl5m.ema9?.requiredBars).toBe(9);
        expect(snapshot.series.soxl5m.ema20?.requiredBars).toBe(20);
        expect(snapshot.series.soxl5m.ema50?.requiredBars).toBe(50);
        expect(snapshot.series.soxl1d.ema200?.requiredBars).toBe(200);
        expect(snapshot.series.soxl5m.rsi14?.requiredBars).toBe(15);
        expect(snapshot.series.soxl5m.atr14?.requiredBars).toBe(14);
        expect(snapshot.series.soxl5m.macd12269?.requiredBars).toBe(34);
        expect(snapshot.series.soxl5m.swings333?.requiredBars).toBe(7);
        expect(snapshot.series.soxl5m.latestCompletedTimestamp).toBeLessThanOrEqual(asOf);
        expect(getIndicatorStatuses(snapshot).every((status) => status === 'available')).toBe(true);
    });
});

describe('buildSoxlCoreIndicatorSnapshot source metadata', () => {
    it('preserves counts and latest completed candle metadata without rounding or sorting', () => {
        const candles = [
            createCandle('SOXL', '5m', 3, { timestamp: 300, close: 30.123456789 }),
            createCandle('SOXL', '5m', 1, { timestamp: 100, close: 31.5 }),
            createCandle('SOXL', '5m', 2, { timestamp: 200, close: 32.75, isComplete: false }),
        ];
        const context = createContext({
            series: {
                ...createContext().series,
                soxl5m: createSeries('SOXL', '5m', 0, { candles }),
            },
        });
        const before = JSON.stringify(context);
        const snapshot = buildSoxlCoreIndicatorSnapshot(context);

        expect(snapshot.series.soxl5m.sourceCandleCount).toBe(3);
        expect(snapshot.series.soxl5m.completedCandleCount).toBe(2);
        expect(snapshot.series.soxl5m.latestCompletedTimestamp).toBe(100);
        expect(snapshot.series.soxl5m.latestCompletedClose).toBe(31.5);
        expect(JSON.stringify(context)).toBe(before);
    });

    it('uses null latest fields when no completed candles exist', () => {
        const context = createContext({
            series: {
                ...createContext().series,
                qqq5m: createSeries('QQQ', '5m', 2, {
                    candles: [
                        createCandle('QQQ', '5m', 1, { isComplete: false }),
                        createCandle('QQQ', '5m', 2, { isComplete: false }),
                    ],
                }),
            },
        });
        const snapshot = buildSoxlCoreIndicatorSnapshot(context);

        expect(snapshot.series.qqq5m.sourceCandleCount).toBe(2);
        expect(snapshot.series.qqq5m.completedCandleCount).toBe(0);
        expect(snapshot.series.qqq5m.latestCompletedTimestamp).toBeNull();
        expect(snapshot.series.qqq5m.latestCompletedClose).toBeNull();
    });
});

describe('buildSoxlCoreIndicatorSnapshot successful and partial states', () => {
    it('returns an available aggregate snapshot when all configured indicators are available', () => {
        const snapshot = buildSoxlCoreIndicatorSnapshot(createContext());

        expect(snapshot).toMatchObject({
            status: 'available',
            asOf,
            providerId: 'fixture-provider',
            availableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
            partialSeries: [],
            unavailableSeries: [],
        });
    });

    it('marks daily partial when EMA 200 lacks history but shorter indicators are available', () => {
        const context = createContext({
            series: {
                ...createContext().series,
                soxl1d: createSeries('SOXL', '1d', 120),
            },
        });
        const snapshot = buildSoxlCoreIndicatorSnapshot(context);

        expect(snapshot.status).toBe('partial');
        expect(snapshot.series.soxl1d.status).toBe('partial');
        expect(snapshot.series.soxl1d.ema200?.status).toBe('insufficient_history');
        expect(snapshot.series.soxl1d.ema20?.status).toBe('available');
        expect(snapshot.series.soxl1d.macd12269?.status).toBe('available');
        expect(snapshot.series.soxl5m.status).toBe('available');
        expect(snapshot.partialSeries).toEqual(['soxl1d']);
        expect(snapshot.availableSeries).toEqual(['soxl5m', 'qqq5m', 'smh5m']);
    });
});

describe('buildSoxlCoreIndicatorSnapshot source failures', () => {
    it('skips indicators, preserves structured source error, and keeps aggregate partial for one failed source', () => {
        const context = createContext({
            series: {
                ...createContext().series,
                qqq5m: createFailureSeries('QQQ', '5m', 'provider_error'),
            },
            availableSeries: ['soxl5m', 'soxl1d', 'smh5m'],
            unavailableSeries: ['qqq5m'],
        });
        const snapshot = buildSoxlCoreIndicatorSnapshot(context);

        expect(snapshot.status).toBe('partial');
        expect(snapshot.series.qqq5m).toMatchObject({
            status: 'unavailable',
            sourceStatus: 'unavailable',
            sourceErrorCode: 'provider_error',
            sourceCandleCount: 0,
            completedCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
            ema20: null,
            ema50: null,
            rsi14: null,
            macd12269: null,
        });
        expect(JSON.stringify(snapshot.series.qqq5m)).not.toContain('raw provider message');
        expect(snapshot.availableSeries).toEqual(['soxl5m', 'soxl1d', 'smh5m']);
        expect(snapshot.unavailableSeries).toEqual(['qqq5m']);
    });

    it('returns aggregate unavailable and fixed order arrays when all sources fail', () => {
        const context = createContext({
            status: 'unavailable',
            series: {
                soxl5m: createFailureSeries('SOXL', '5m', 'provider_error'),
                soxl1d: createFailureSeries('SOXL', '1d', 'provider_error'),
                qqq5m: createFailureSeries('QQQ', '5m', 'provider_error'),
                smh5m: createFailureSeries('SMH', '5m', 'provider_error'),
            },
            availableSeries: [],
            unavailableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        });
        const snapshot = buildSoxlCoreIndicatorSnapshot(context);

        expect(snapshot.status).toBe('unavailable');
        expect(snapshot.availableSeries).toEqual([]);
        expect(snapshot.partialSeries).toEqual([]);
        expect(snapshot.unavailableSeries).toEqual(['soxl5m', 'soxl1d', 'qqq5m', 'smh5m']);
    });
});

describe('buildSoxlCoreIndicatorSnapshot exception isolation', () => {
    it('marks only the throwing series unavailable and does not expose exception details', () => {
        const spy = vi.spyOn(indicatorModule, 'calculateEmaSeries')
            .mockImplementationOnce(() => {
                throw new Error('secret exception text');
            });

        try {
            const snapshot = buildSoxlCoreIndicatorSnapshot(createContext());

            expect(snapshot.status).toBe('partial');
            expect(snapshot.series.soxl5m.status).toBe('unavailable');
            expect(snapshot.series.soxl5m.issue).toBe('indicator_calculation_failed');
            expect(snapshot.series.soxl5m.ema9).toBeNull();
            expect(snapshot.series.soxl5m.sourceCandleCount).toBe(260);
            expect(snapshot.series.soxl1d.status).toBe('available');
            expect(snapshot.series.qqq5m.status).toBe('available');
            expect(snapshot.series.smh5m.status).toBe('available');
            expect(JSON.stringify(snapshot)).not.toContain('secret exception text');
            expect(JSON.stringify(snapshot)).not.toContain('stack');
        } finally {
            spy.mockRestore();
        }
    });
});

describe('buildSoxlCoreIndicatorSnapshot determinism', () => {
    it('produces equivalent snapshots repeatedly without mutating inputs or rounding values', () => {
        const context = createContext();
        const before = JSON.stringify(context);
        const first = buildSoxlCoreIndicatorSnapshot(context);
        const second = buildSoxlCoreIndicatorSnapshot(context);

        expect(first).toEqual(second);
        expect(JSON.stringify(context)).toBe(before);
        expect(first.series.soxl5m.latestCompletedClose).toBe(context.series.soxl5m.candles.at(-1)?.close);
    });
});
