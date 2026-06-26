import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildSoxlSessionAnalysisSnapshot,
    SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS,
} from '@/lib/soxl-intelligence/analysis/soxl-session-analysis';
import * as sessionWindowModule from '@/lib/soxl-intelligence/analysis/soxl-session-windows';
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

const FRI_2026_07_03_0930_ET = 1_783_085_400;
const FRI_2026_07_03_0935_ET = FRI_2026_07_03_0930_ET + 300;
const FRI_2026_07_03_0940_ET = FRI_2026_07_03_0930_ET + 600;
const MON_2026_07_06_0930_ET = 1_783_344_600;
const MON_2026_07_06_0935_ET = MON_2026_07_06_0930_ET + 300;
const MON_2026_07_06_0940_ET = MON_2026_07_06_0930_ET + 600;
const MON_2026_07_06_0945_ET = MON_2026_07_06_0930_ET + 900;
const MON_2026_07_06_0950_ET = MON_2026_07_06_0930_ET + 1_200;
const MON_2026_07_06_0955_ET = MON_2026_07_06_0930_ET + 1_500;
const MON_2026_07_06_1000_ET = MON_2026_07_06_0930_ET + 1_800;
const MON_2026_07_06_1015_ET = MON_2026_07_06_0930_ET + 2_700;
const MON_2026_07_06_1600_ET = MON_2026_07_06_0930_ET + 23_400;

function createCandle(
    timestamp: number,
    overrides: Partial<MarketCandle> = {},
): MarketCandle {
    const candle: MarketCandle = {
        symbol: 'SOXL',
        interval: '5m',
        timestamp,
        open: 10,
        high: 12,
        low: 8,
        close: 10,
        volume: 100,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };

    return {
        ...candle,
        open: overrides.open ?? candle.close,
    };
}

function createSessionCandles(): MarketCandle[] {
    return [
        createCandle(FRI_2026_07_03_0930_ET, {
            high: 30,
            low: 20,
            close: 24,
            volume: 1_000,
        }),
        createCandle(FRI_2026_07_03_0935_ET, {
            high: 40,
            low: 21,
            close: 25,
            volume: 1_000,
        }),
        createCandle(FRI_2026_07_03_0940_ET, {
            high: 40,
            low: 19,
            close: 26,
            volume: 1_000,
        }),
        createCandle(MON_2026_07_06_0930_ET, {
            high: 12,
            low: 9,
            close: 9,
            volume: 100,
        }),
        createCandle(MON_2026_07_06_0935_ET, {
            high: 16,
            low: 5,
            close: 13,
            volume: 200,
        }),
        createCandle(MON_2026_07_06_0940_ET, {
            high: 20,
            low: 10,
            close: 15,
            volume: 300,
        }),
        createCandle(MON_2026_07_06_0945_ET, {
            high: 22,
            low: 8,
            close: 12,
            volume: 600,
        }),
        createCandle(MON_2026_07_06_0950_ET, {
            high: 22,
            low: 9,
            close: 12,
            volume: 300,
        }),
        createCandle(MON_2026_07_06_1000_ET, {
            high: 100,
            low: 100,
            close: 100,
            volume: 300,
        }),
    ];
}

function createSeries(
    candles: MarketCandle[],
    overrides: Partial<CandleSeries> = {},
): CandleSeries {
    return {
        symbol: 'SOXL',
        interval: '5m',
        candles,
        status: 'available',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        metadata: {
            requestedFrom: FRI_2026_07_03_0930_ET,
            requestedTo: MON_2026_07_06_1015_ET,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
        ...overrides,
    };
}

function createFailureSeries(
    errorCode: CandleSeriesErrorCode,
): CandleSeries & { rawProviderMessage: string } {
    return {
        symbol: 'SOXL',
        interval: '5m',
        candles: [],
        status: 'unavailable',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        errorCode,
        rawProviderMessage: 'provider body must not be exposed',
        metadata: {
            requestedFrom: FRI_2026_07_03_0930_ET,
            requestedTo: MON_2026_07_06_1015_ET,
            providerLatency: 'unknown',
            entitlement: 'unknown',
        },
    };
}

function emptySeries(symbol: CandleSymbol, interval: CandleInterval): CandleSeries {
    return createSeries([], { symbol, interval });
}

function createContext(
    candles: MarketCandle[] = createSessionCandles(),
    asOf = MON_2026_07_06_1015_ET,
    soxlOverrides: Partial<CandleSeries> = {},
): SoxlMarketContextResult {
    return {
        status: 'available',
        asOf,
        providerId: 'fixture-provider',
        series: {
            soxl5m: createSeries(candles, soxlOverrides),
            soxl1d: emptySeries('SOXL', '1d'),
            qqq5m: emptySeries('QQQ', '5m'),
            smh5m: emptySeries('SMH', '5m'),
        },
        availableSeries: ['soxl5m'],
        unavailableSeries: ['soxl1d', 'qqq5m', 'smh5m'],
    };
}

function createContextWithSoxlSource(
    soxl5m: CandleSeries,
    asOf = MON_2026_07_06_1015_ET,
): SoxlMarketContextResult {
    return createContext([], asOf, soxl5m);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('buildSoxlSessionAnalysisSnapshot compatibility and wiring', () => {
    it('uses the session-window planner and calls each compatible calculation once', () => {
        const windowSpy = vi.spyOn(sessionWindowModule, 'buildSoxlSessionWindowPlan');
        const vwapSpy = vi.spyOn(indicatorModule, 'calculateSessionVwapSeries');
        const relativeVolumeSpy = vi.spyOn(indicatorModule, 'calculateRelativeVolumeSeries');
        const previousDaySpy = vi.spyOn(indicatorModule, 'calculatePreviousDayLevels');
        const openingRangeSpy = vi.spyOn(indicatorModule, 'calculateOpeningRangeLevels');
        const context = createContext();

        const snapshot = buildSoxlSessionAnalysisSnapshot(context);

        expect(snapshot.status).toBe('available');
        expect(windowSpy).toHaveBeenCalledTimes(1);
        expect(windowSpy).toHaveBeenCalledWith(context);
        expect(vwapSpy).toHaveBeenCalledTimes(1);
        expect(relativeVolumeSpy).toHaveBeenCalledTimes(1);
        expect(previousDaySpy).toHaveBeenCalledTimes(1);
        expect(openingRangeSpy).toHaveBeenCalledTimes(1);
        expect(vwapSpy.mock.calls[0][0]).toMatchObject({
            candles: context.series.soxl5m.candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: context.asOf,
            session: 'regular',
            sessionStart: MON_2026_07_06_0930_ET,
            sessionEnd: MON_2026_07_06_1600_ET,
        });
        expect(relativeVolumeSpy.mock.calls[0][0]).toMatchObject({
            lookbackBars: SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS,
            asOf: context.asOf,
            sessionStart: MON_2026_07_06_0930_ET,
            sessionEnd: MON_2026_07_06_1600_ET,
        });
        expect(previousDaySpy.mock.calls[0][0].window).toEqual({
            start: FRI_2026_07_03_0930_ET,
            end: FRI_2026_07_03_0930_ET + 23_400,
        });
        expect(openingRangeSpy.mock.calls[0][0]).toMatchObject({
            openingRangeMinutes: 30,
            window: {
                start: MON_2026_07_06_0930_ET,
                end: MON_2026_07_06_1000_ET,
            },
        });
    });

    it('does not read QQQ, SMH, or SOXL daily series for calculations', () => {
        const context = createContext();
        const guardedSeries = {
            soxl5m: context.series.soxl5m,
            get soxl1d(): CandleSeries {
                throw new Error('SOXL daily must not be read');
            },
            get qqq5m(): CandleSeries {
                throw new Error('QQQ must not be read');
            },
            get smh5m(): CandleSeries {
                throw new Error('SMH must not be read');
            },
        };
        const guardedContext = {
            ...context,
            series: guardedSeries,
        } as SoxlMarketContextResult;

        expect(buildSoxlSessionAnalysisSnapshot(guardedContext).status).toBe('available');
    });

    it('passes the original candle array without sorting or mutation and does not use the system clock', () => {
        const context = createContext([
            ...createSessionCandles().slice(3),
            ...createSessionCandles().slice(0, 3),
        ]);
        const before = JSON.stringify(context);
        const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('system clock must not be used');
        });

        try {
            const snapshot = buildSoxlSessionAnalysisSnapshot(context);

            expect(snapshot.latestCompletedTimestamp).toBe(FRI_2026_07_03_0940_ET);
            expect(snapshot.status).toBe('unavailable');
        } finally {
            dateNow.mockRestore();
        }

        expect(JSON.stringify(context)).toBe(before);
    });
});

describe('buildSoxlSessionAnalysisSnapshot VWAP and relative volume', () => {
    it('calculates latest-session VWAP without previous-session candles and preserves the full result object', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(snapshot.vwap).toMatchObject({
            status: 'available',
            requiredBars: 1,
            usedBars: 6,
            latest: {
                value: 28.037037037037038,
                timestamp: MON_2026_07_06_1000_ET,
                status: 'available',
            },
        });
        expect(snapshot.vwap?.values.map((point) => point.timestamp)).toEqual([
            MON_2026_07_06_0930_ET,
            MON_2026_07_06_0935_ET,
            MON_2026_07_06_0940_ET,
            MON_2026_07_06_0945_ET,
            MON_2026_07_06_0950_ET,
            MON_2026_07_06_1000_ET,
        ]);
        expect(snapshot.vwap?.values.some((point) => point.timestamp < MON_2026_07_06_0930_ET)).toBe(false);
    });

    it('preserves incomplete-candle exclusion and no rounding for VWAP', () => {
        const baseCandles = createSessionCandles();
        const candles = [
            ...baseCandles.slice(0, -1),
            createCandle(MON_2026_07_06_0955_ET, {
                high: 1_000,
                low: 1_000,
                close: 1_000,
                volume: 10_000,
                isComplete: false,
            }),
            baseCandles[baseCandles.length - 1],
        ];
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext(candles));

        expect(snapshot.vwap?.latest.value).toBe(28.037037037037038);
        expect(snapshot.vwap?.values.some((point) => point.timestamp === MON_2026_07_06_0955_ET)).toBe(false);
    });

    it('uses rolling three-bar relative volume inside the latest regular session', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS).toBe(3);
        expect(snapshot.relativeVolume).toMatchObject({
            status: 'available',
            requiredBars: 4,
            usedBars: 6,
            latest: {
                value: 0.75,
                timestamp: MON_2026_07_06_1000_ET,
            },
        });
        expect(snapshot.relativeVolume?.values).toEqual([
            { timestamp: MON_2026_07_06_0945_ET, value: 3 },
            { timestamp: MON_2026_07_06_0950_ET, value: 300 / (1_100 / 3) },
            { timestamp: MON_2026_07_06_1000_ET, value: 0.75 },
        ]);
    });

    it('preserves structured relative-volume insufficient-history results', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(FRI_2026_07_03_0930_ET),
            createCandle(MON_2026_07_06_0930_ET, { volume: 100 }),
            createCandle(MON_2026_07_06_0935_ET, { volume: 200 }),
        ]));

        expect(snapshot.status).toBe('partial');
        expect(snapshot.relativeVolume).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_usable_volume',
            requiredBars: 4,
            usedBars: 2,
            values: [],
        });
    });

    it('does not let extended-hours candles contribute to relative volume', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(FRI_2026_07_03_0930_ET),
            createCandle(MON_2026_07_06_0930_ET, { volume: 100, session: 'premarket' }),
            createCandle(MON_2026_07_06_0935_ET, { volume: 200 }),
            createCandle(MON_2026_07_06_0940_ET, { volume: 300 }),
            createCandle(MON_2026_07_06_0945_ET, { volume: 600 }),
        ]));

        expect(snapshot.relativeVolume).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_usable_volume',
            usedBars: 3,
        });
    });
});

describe('buildSoxlSessionAnalysisSnapshot levels', () => {
    it('uses only the explicit previous represented regular session for previous-day levels', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(snapshot.previousDayLevels).toMatchObject({
            status: 'available',
            high: 40,
            highTimestamp: FRI_2026_07_03_0935_ET,
            low: 19,
            lowTimestamp: FRI_2026_07_03_0940_ET,
            usedBars: 3,
        });
    });

    it('does not fabricate previous-day levels when no previous represented session exists', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(MON_2026_07_06_0930_ET, { volume: 100 }),
            createCandle(MON_2026_07_06_0935_ET, { volume: 200 }),
            createCandle(MON_2026_07_06_0940_ET, { volume: 300 }),
            createCandle(MON_2026_07_06_0945_ET, { volume: 600 }),
        ]));

        expect(snapshot.windowPlan.status).toBe('partial');
        expect(snapshot.status).toBe('partial');
        expect(snapshot.previousDayLevels).toBeNull();
        expect(snapshot.calculationStates.previousDayLevels).toEqual({
            status: 'not_run',
            issue: 'previous_session_unavailable',
        });
        expect(snapshot.vwap?.status).toBe('available');
        expect(snapshot.relativeVolume?.status).toBe('available');
    });

    it('uses the explicit 09:30-10:00 opening-range window and excludes the 10:00 candle', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(snapshot.openingRange30mLevels).toMatchObject({
            status: 'available',
            high: 22,
            highTimestamp: MON_2026_07_06_0945_ET,
            low: 5,
            lowTimestamp: MON_2026_07_06_0935_ET,
            usedBars: 5,
            window: {
                start: MON_2026_07_06_0930_ET,
                end: MON_2026_07_06_1000_ET,
            },
        });
    });

    it('allows missing internal opening-range bars when the existing level contract supports the range', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(FRI_2026_07_03_0930_ET),
            createCandle(MON_2026_07_06_0930_ET, { high: 12, low: 9, volume: 100 }),
            createCandle(MON_2026_07_06_0945_ET, { high: 15, low: 7, volume: 200 }),
            createCandle(MON_2026_07_06_1000_ET, {
                high: 100,
                low: 100,
                close: 100,
                volume: 300,
            }),
        ]));

        expect(snapshot.openingRange30mLevels).toMatchObject({
            status: 'available',
            high: 15,
            low: 7,
            usedBars: 2,
        });
    });

    it('preserves the existing window_not_completed opening-range result', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(FRI_2026_07_03_0930_ET),
            createCandle(MON_2026_07_06_0930_ET, { volume: 100 }),
            createCandle(MON_2026_07_06_0935_ET, { volume: 200 }),
        ], MON_2026_07_06_0935_ET));

        expect(snapshot.openingRange30mLevels).toMatchObject({
            status: 'insufficient_history',
            issue: 'window_not_completed',
            high: null,
            low: null,
        });
    });
});

describe('buildSoxlSessionAnalysisSnapshot status and failures', () => {
    it('returns available when the window plan and all four calculations are available', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(snapshot.status).toBe('available');
        expect(snapshot.issue).toBeNull();
        expect(snapshot.calculationStates).toEqual({
            vwap: { status: 'available', issue: null },
            relativeVolume: { status: 'available', issue: null },
            previousDayLevels: { status: 'available', issue: null },
            openingRange30mLevels: { status: 'available', issue: null },
        });
    });

    it('returns unavailable for failed source and skips all calculations', () => {
        const vwapSpy = vi.spyOn(indicatorModule, 'calculateSessionVwapSeries');
        const context = createContextWithSoxlSource(createFailureSeries('provider_error'));
        const snapshot = buildSoxlSessionAnalysisSnapshot(context);

        expect(snapshot).toMatchObject({
            status: 'unavailable',
            issue: 'source_unavailable',
            sourceStatus: 'unavailable',
            sourceErrorCode: 'provider_error',
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
            vwap: null,
            relativeVolume: null,
            previousDayLevels: null,
            openingRange30mLevels: null,
        });
        expect(vwapSpy).not.toHaveBeenCalled();
        expect(JSON.stringify(snapshot)).not.toContain('provider body');
    });

    it('returns unavailable and skips calculations when window planning is unavailable', () => {
        const vwapSpy = vi.spyOn(indicatorModule, 'calculateSessionVwapSeries');
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([]));

        expect(snapshot).toMatchObject({
            status: 'unavailable',
            issue: 'session_windows_unavailable',
            vwap: null,
            relativeVolume: null,
            previousDayLevels: null,
            openingRange30mLevels: null,
        });
        expect(vwapSpy).not.toHaveBeenCalled();
        expect(snapshot.calculationStates.vwap).toEqual({
            status: 'not_run',
            issue: 'session_windows_unavailable',
        });
    });

    it('returns unavailable when no calculation is available', () => {
        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext([
            createCandle(FRI_2026_07_03_0930_ET, { high: 8, low: 12 }),
            createCandle(MON_2026_07_06_0930_ET, { high: 8, low: 12 }),
        ]));

        expect(snapshot.status).toBe('unavailable');
        expect(snapshot.vwap?.status).toBe('invalid_input');
        expect(snapshot.relativeVolume?.status).toBe('invalid_input');
        expect(snapshot.previousDayLevels?.status).toBe('invalid_input');
        expect(snapshot.openingRange30mLevels?.status).toBe('invalid_input');
    });

    it('isolates a thrown calculation and preserves the other calculation results', () => {
        vi.spyOn(indicatorModule, 'calculateSessionVwapSeries').mockImplementationOnce(() => {
            throw new Error('secret stack message');
        });

        const snapshot = buildSoxlSessionAnalysisSnapshot(createContext());

        expect(snapshot.status).toBe('partial');
        expect(snapshot.issue).toBe('calculation_failed');
        expect(snapshot.vwap).toBeNull();
        expect(snapshot.relativeVolume?.status).toBe('available');
        expect(snapshot.previousDayLevels?.status).toBe('available');
        expect(snapshot.openingRange30mLevels?.status).toBe('available');
        expect(snapshot.calculationStates.vwap).toEqual({
            status: 'failed',
            issue: 'calculation_failed',
        });
        expect(JSON.stringify(snapshot)).not.toContain('secret stack message');
        expect(JSON.stringify(snapshot)).not.toContain('stack');
    });
});

describe('buildSoxlSessionAnalysisSnapshot determinism and isolation', () => {
    it('returns equivalent snapshots for equivalent inputs and leaves inputs unchanged', () => {
        const context = createContext();
        const before = JSON.stringify(context);

        expect(buildSoxlSessionAnalysisSnapshot(context)).toEqual(
            buildSoxlSessionAnalysisSnapshot(createContext()),
        );
        expect(JSON.stringify(context)).toBe(before);
    });

    it('does not import providers, server services, React, or GMT+4 presentation modules', () => {
        const source = readFileSync(
            new URL('./soxl-session-analysis.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toMatch(/from ['"].*provider/u);
        expect(source).not.toMatch(/from ['"].*\/server\//u);
        expect(source).not.toMatch(/from ['"].*react/u);
        expect(source).not.toContain('time-format');
        expect(source).not.toContain('Date.now');
        expect(source).not.toMatch(/new Date\(\s*\)/u);
    });
});
