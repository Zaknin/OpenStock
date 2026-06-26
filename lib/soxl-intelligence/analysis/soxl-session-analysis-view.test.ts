import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlSessionAnalysisView,
} from '@/lib/soxl-intelligence/analysis/soxl-session-analysis-view';
import type {
    SoxlSessionAnalysisSnapshot,
} from '@/lib/soxl-intelligence/analysis/soxl-session-analysis';
import type {
    IndicatorStatus,
    PriceLevelIssue,
    PriceLevelStatus,
    PriceRangeLevel,
    VolumeIndicatorIssue,
    VolumeIndicatorSeriesResult,
} from '@/lib/soxl-intelligence/indicators';

const asOf = 1_782_432_000;

function volumeResult(
    values: readonly { timestamp: number; value: number }[],
    status: IndicatorStatus = 'available',
    issue?: VolumeIndicatorIssue,
): VolumeIndicatorSeriesResult {
    const latestPoint = values.at(-1);

    return {
        values: values.map((point) => ({ ...point })),
        latest: {
            value: latestPoint?.value ?? null,
            timestamp: latestPoint?.timestamp ?? null,
            status,
            requiredBars: 4,
            usedBars: values.length,
        },
        status,
        requiredBars: 4,
        usedBars: values.length,
        issue,
        validationIssues: [],
    };
}

function priceLevel(
    status: PriceLevelStatus = 'available',
    issue?: PriceLevelIssue,
): PriceRangeLevel {
    return {
        high: 32.123456,
        low: 27.7654321,
        highTimestamp: 1_782_360_600,
        lowTimestamp: 1_782_351_000,
        status,
        usedBars: status === 'available' ? 78 : 0,
        window: {
            start: 1_782_342_600,
            end: 1_782_365_999,
        },
        issue,
        validationIssues: [],
    };
}

function createSnapshot(
    overrides: Partial<SoxlSessionAnalysisSnapshot> = {},
): SoxlSessionAnalysisSnapshot {
    return {
        status: 'available',
        asOf,
        providerId: 'twelve-data',
        windowPlan: {
            status: 'available',
            asOf,
            issue: null,
            sourceCandleCount: 300,
            sourceErrorCode: null,
            exchangeTimeZone: 'America/New_York',
            latestTradingDate: '2026-06-26',
            previousTradingDate: '2026-06-25',
            latestDateRelation: 'same_exchange_date',
            latestRegularSession: {
                start: 1_782_342_600,
                end: 1_782_365_999,
            },
            previousRegularSession: {
                start: 1_782_256_200,
                end: 1_782_279_599,
            },
            latestOpeningRange30m: {
                start: 1_782_342_600,
                end: 1_782_344_399,
            },
            latestRegularSessionCompleted: false,
            latestOpeningRange30mCompleted: true,
            completedRegularCandleCount: 64,
        },
        sourceStatus: 'available',
        sourceErrorCode: null,
        sourceCandleCount: 300,
        completedRegularCandleCount: 64,
        latestCompletedTimestamp: 1_782_361_500,
        latestCompletedClose: 29.987654,
        vwap: volumeResult([
            { timestamp: 1_782_352_500, value: 28.111111 },
            { timestamp: 1_782_351_000, value: 28.222222 },
        ]),
        relativeVolume: volumeResult([
            { timestamp: 1_782_352_500, value: 1.234567 },
            { timestamp: 1_782_351_000, value: 1.345678 },
        ]),
        previousDayLevels: priceLevel(),
        openingRange30mLevels: priceLevel(),
        calculationStates: {
            vwap: { status: 'available', issue: null },
            relativeVolume: { status: 'available', issue: null },
            previousDayLevels: { status: 'available', issue: null },
            openingRange30mLevels: { status: 'available', issue: null },
        },
        issue: null,
        ...overrides,
    };
}

describe('buildSoxlSessionAnalysisView metadata and windows', () => {
    it('preserves aggregate source metadata and deterministic window-plan fields', () => {
        const view = buildSoxlSessionAnalysisView(createSnapshot());

        expect(view).toMatchObject({
            status: 'available',
            providerId: 'twelve-data',
            asOf,
            sourceStatus: 'available',
            sourceErrorCode: null,
            sourceCandleCount: 300,
            completedRegularCandleCount: 64,
            latestCompletedTimestamp: 1_782_361_500,
            latestCompletedClose: 29.987654,
            windowPlan: {
                status: 'available',
                issue: null,
                exchangeTimeZone: 'America/New_York',
                latestTradingDate: '2026-06-26',
                previousTradingDate: '2026-06-25',
                latestDateRelation: 'same_exchange_date',
                latestRegularSessionCompleted: false,
                latestOpeningRange30mCompleted: true,
            },
        });
        expect(view.windowPlan.latestRegularSession).toEqual({
            start: 1_782_342_600,
            end: 1_782_365_999,
        });
    });

    it('copies nested window and calculation state objects instead of reusing snapshot references', () => {
        const snapshot = createSnapshot();
        const view = buildSoxlSessionAnalysisView(snapshot);

        expect(view.windowPlan.latestRegularSession).toEqual(snapshot.windowPlan.latestRegularSession);
        expect(view.windowPlan.latestRegularSession).not.toBe(snapshot.windowPlan.latestRegularSession);
        expect(view.calculationStates.vwap).toEqual(snapshot.calculationStates.vwap);
        expect(view.calculationStates.vwap).not.toBe(snapshot.calculationStates.vwap);
    });
});

describe('buildSoxlSessionAnalysisView calculations', () => {
    it('selects the final VWAP point in returned order without sorting or rounding', () => {
        const view = buildSoxlSessionAnalysisView(createSnapshot());

        expect(view.vwap).toMatchObject({
            status: 'available',
            issue: null,
            value: 28.222222,
            timestamp: 1_782_351_000,
            requiredBars: 4,
            usedBars: 2,
            lookbackBars: null,
        });
    });

    it('selects the final rolling relative-volume point and exposes configured lookback metadata', () => {
        const view = buildSoxlSessionAnalysisView(createSnapshot());

        expect(view.relativeVolume).toMatchObject({
            status: 'available',
            issue: null,
            value: 1.345678,
            timestamp: 1_782_351_000,
            requiredBars: 4,
            usedBars: 2,
            lookbackBars: 3,
        });
    });

    it('uses null display values for unavailable or empty series while preserving status and issues', () => {
        const view = buildSoxlSessionAnalysisView(createSnapshot({
            vwap: volumeResult([], 'available', 'no_matching_session_candles'),
            relativeVolume: volumeResult([
                { timestamp: 1_782_351_000, value: 1.1 },
            ], 'insufficient_history', 'missing_baseline_volume'),
        }));

        expect(view.vwap).toMatchObject({
            status: 'available',
            issue: 'no_matching_session_candles',
            value: null,
            timestamp: null,
        });
        expect(view.relativeVolume).toMatchObject({
            status: 'insufficient_history',
            issue: 'missing_baseline_volume',
            value: null,
            timestamp: null,
            lookbackBars: 3,
        });
    });

    it('preserves available level values and nulls unavailable numerical level fields', () => {
        const view = buildSoxlSessionAnalysisView(createSnapshot({
            previousDayLevels: priceLevel(),
            openingRange30mLevels: priceLevel('insufficient_history', 'window_not_completed'),
        }));

        expect(view.previousDayLevels).toEqual({
            status: 'available',
            issue: null,
            high: 32.123456,
            highTimestamp: 1_782_360_600,
            low: 27.7654321,
            lowTimestamp: 1_782_351_000,
            usedBars: 78,
        });
        expect(view.openingRange30mLevels).toEqual({
            status: 'insufficient_history',
            issue: 'window_not_completed',
            high: null,
            highTimestamp: null,
            low: null,
            lowTimestamp: null,
            usedBars: 0,
        });
    });
});

describe('buildSoxlSessionAnalysisView failure and determinism behavior', () => {
    it('preserves structured failure codes without copying raw provider or exception text', () => {
        const snapshot = {
            ...createSnapshot({
                status: 'partial',
                sourceStatus: 'unavailable',
                sourceErrorCode: 'provider_error',
                issue: 'calculation_failed',
                windowPlan: {
                    ...createSnapshot().windowPlan,
                    status: 'partial',
                    issue: 'previous_session_unavailable',
                },
                calculationStates: {
                    vwap: { status: 'failed', issue: 'calculation_failed' },
                    relativeVolume: { status: 'unavailable', issue: null },
                    previousDayLevels: { status: 'not_run', issue: 'previous_session_unavailable' },
                    openingRange30mLevels: { status: 'available', issue: null },
                },
            }),
            providerMessage: 'raw provider message',
            stack: 'stack trace',
        } as unknown as SoxlSessionAnalysisSnapshot;
        const view = buildSoxlSessionAnalysisView(snapshot);

        expect(view).toMatchObject({
            status: 'partial',
            sourceStatus: 'unavailable',
            sourceErrorCode: 'provider_error',
            issue: 'calculation_failed',
            windowPlan: {
                status: 'partial',
                issue: 'previous_session_unavailable',
            },
        });
        expect(JSON.stringify(view)).not.toContain('raw provider message');
        expect(JSON.stringify(view)).not.toContain('stack trace');
    });

    it('does not mutate input or use the system clock', () => {
        const snapshot = createSnapshot();
        const before = JSON.stringify(snapshot);
        const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('system clock must not be used');
        });

        try {
            expect(buildSoxlSessionAnalysisView(snapshot)).toEqual(
                buildSoxlSessionAnalysisView(snapshot),
            );
        } finally {
            dateNow.mockRestore();
        }

        expect(JSON.stringify(snapshot)).toBe(before);
    });

    it('does not import providers, server loaders, React, time formatters, or environment state', () => {
        const source = readFileSync(
            new URL('./soxl-session-analysis-view.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toMatch(/from ['"].*\/server\//u);
        expect(source).not.toMatch(/from ['"].*provider/u);
        expect(source).not.toContain('react');
        expect(source).not.toContain('time-format');
        expect(source).not.toContain('process.env');
        expect(source).not.toContain('Date.');
    });
});
