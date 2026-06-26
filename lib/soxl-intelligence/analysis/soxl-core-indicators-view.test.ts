import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlCoreIndicatorView,
} from '@/lib/soxl-intelligence/analysis/soxl-core-indicators-view';
import type {
    IndicatorSeriesResult,
    IndicatorStatus,
    MacdPoint,
    MacdSeriesResult,
    SwingDetectionIssue,
    SwingDetectionResult,
    SwingPoint,
    SwingType,
} from '@/lib/soxl-intelligence/indicators';
import type {
    SoxlCoreIndicatorSnapshot,
    SoxlDailyIndicatorSnapshot,
    SoxlFiveMinuteIndicatorSnapshot,
    MarketFiveMinuteIndicatorSnapshot,
} from '@/lib/soxl-intelligence/analysis/soxl-core-indicators';

const asOf = 1_782_432_000;
const fiveMinuteTimestamp = 1_782_352_500;
const dailyTradingDateTimestamp = 1_782_302_400;

function indicatorResult(
    values: readonly { timestamp: number; value: number }[],
    status: IndicatorStatus = 'available',
): IndicatorSeriesResult {
    const latestPoint = values.at(-1);

    return {
        values: values.map((point) => ({ ...point })),
        latest: {
            value: latestPoint?.value ?? null,
            timestamp: latestPoint?.timestamp ?? null,
            status,
            requiredBars: 20,
            usedBars: values.length,
        },
        status,
        requiredBars: 20,
        usedBars: values.length,
        validationIssues: [],
    };
}

function macdResult(
    values: readonly MacdPoint[],
    status: IndicatorStatus = 'available',
): MacdSeriesResult {
    const latestPoint = values.at(-1);

    return {
        values: values.map((point) => ({ ...point })),
        latest: {
            macd: latestPoint?.macd ?? null,
            signal: latestPoint?.signal ?? null,
            histogram: latestPoint?.histogram ?? null,
            timestamp: latestPoint?.timestamp ?? null,
            status,
            requiredBars: 34,
            usedBars: values.length,
        },
        status,
        requiredBars: 34,
        usedBars: values.length,
        validationIssues: [],
    };
}

function swing(
    type: SwingType,
    price: number,
    pivotTimestamp: number,
    confirmedAtTimestamp: number,
): SwingPoint {
    return {
        type,
        price,
        pivotTimestamp,
        confirmedAtTimestamp,
        pivotIndex: 1,
        confirmedAtIndex: 4,
    };
}

function swingResult(
    latestHigh: SwingPoint | null,
    latestLow: SwingPoint | null,
    status: IndicatorStatus = 'available',
    issue?: SwingDetectionIssue,
): SwingDetectionResult {
    return {
        status,
        swings: [latestHigh, latestLow].filter((point): point is SwingPoint => point !== null),
        latestHigh,
        latestLow,
        requiredBars: 7,
        usedBars: 200,
        issue,
        validationIssues: [],
    };
}

function createSoxlFiveMinute(
    overrides: Partial<SoxlFiveMinuteIndicatorSnapshot> = {},
): SoxlFiveMinuteIndicatorSnapshot {
    return {
        key: 'soxl5m',
        symbol: 'SOXL',
        interval: '5m',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 300,
        completedCandleCount: 299,
        latestCompletedTimestamp: fiveMinuteTimestamp,
        latestCompletedClose: 28.123456,
        ema9: indicatorResult([
            { timestamp: 90, value: 25.1 },
            { timestamp: 60, value: 25.2 },
        ]),
        ema20: indicatorResult([{ timestamp: 100, value: 25.8 }]),
        ema50: indicatorResult([{ timestamp: 100, value: 26.2 }]),
        rsi14: indicatorResult([{ timestamp: 100, value: 52.3456 }]),
        atr14: indicatorResult([{ timestamp: 100, value: 0.654321 }]),
        macd12269: macdResult([
            { timestamp: 100, macd: 0.1201, signal: 0.11, histogram: 0.0101 },
            { timestamp: 95, macd: 0.2201, signal: 0.21, histogram: 0.0101 },
        ]),
        swings333: swingResult(
            swing('high', 31.25, 1_782_351_000, 1_782_351_900),
            swing('low', 27.5, 1_782_350_100, 1_782_351_000),
        ),
        ...overrides,
    };
}

function createSoxlDaily(
    overrides: Partial<SoxlDailyIndicatorSnapshot> = {},
): SoxlDailyIndicatorSnapshot {
    return {
        key: 'soxl1d',
        symbol: 'SOXL',
        interval: '1d',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 300,
        completedCandleCount: 300,
        latestCompletedTimestamp: dailyTradingDateTimestamp,
        latestCompletedClose: 29.75,
        ema20: indicatorResult([{ timestamp: dailyTradingDateTimestamp, value: 24.5 }]),
        ema50: indicatorResult([{ timestamp: dailyTradingDateTimestamp, value: 22.75 }]),
        ema200: indicatorResult([{ timestamp: dailyTradingDateTimestamp, value: 18.25 }]),
        rsi14: indicatorResult([{ timestamp: dailyTradingDateTimestamp, value: 61.25 }]),
        atr14: indicatorResult([{ timestamp: dailyTradingDateTimestamp, value: 1.75 }]),
        macd12269: macdResult([
            {
                timestamp: dailyTradingDateTimestamp,
                macd: 1.2345,
                signal: 1.1111,
                histogram: 0.1234,
            },
        ]),
        swings333: swingResult(
            swing('high', 34.25, dailyTradingDateTimestamp, dailyTradingDateTimestamp),
            swing('low', 17.5, dailyTradingDateTimestamp - 86_400, dailyTradingDateTimestamp),
        ),
        ...overrides,
    };
}

function createMarketFiveMinute(
    key: 'qqq5m' | 'smh5m',
    overrides: Partial<MarketFiveMinuteIndicatorSnapshot> = {},
): MarketFiveMinuteIndicatorSnapshot {
    const symbol = key === 'qqq5m' ? 'QQQ' : 'SMH';

    return {
        key,
        symbol,
        interval: '5m',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 300,
        completedCandleCount: 299,
        latestCompletedTimestamp: fiveMinuteTimestamp,
        latestCompletedClose: symbol === 'QQQ' ? 510.25 : 260.75,
        ema20: indicatorResult([{ timestamp: 100, value: 500.1 }]),
        ema50: indicatorResult([{ timestamp: 100, value: 498.2 }]),
        rsi14: indicatorResult([{ timestamp: 100, value: 55.5 }]),
        macd12269: macdResult([
            { timestamp: 100, macd: 0.5001, signal: 0.4501, histogram: 0.05 },
        ]),
        ...overrides,
    };
}

function createSnapshot(
    overrides: Partial<Omit<SoxlCoreIndicatorSnapshot, 'series'>> = {},
    seriesOverrides: Partial<SoxlCoreIndicatorSnapshot['series']> = {},
): SoxlCoreIndicatorSnapshot {
    return {
        status: 'available',
        asOf,
        providerId: 'twelve-data',
        series: {
            soxl5m: createSoxlFiveMinute(),
            soxl1d: createSoxlDaily(),
            qqq5m: createMarketFiveMinute('qqq5m'),
            smh5m: createMarketFiveMinute('smh5m'),
            ...seriesOverrides,
        },
        availableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        partialSeries: [],
        unavailableSeries: [],
        ...overrides,
    };
}

describe('buildSoxlCoreIndicatorView ordering and metadata', () => {
    it('returns four rows in the fixed display order with aggregate counts', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot({
            status: 'partial',
            availableSeries: ['soxl5m', 'soxl1d'],
            partialSeries: ['qqq5m'],
            unavailableSeries: ['smh5m'],
        }));

        expect(view).toMatchObject({
            status: 'partial',
            providerId: 'twelve-data',
            asOf,
            availableCount: 2,
            partialCount: 1,
            unavailableCount: 1,
        });
        expect(view.series.map((series) => ({
            key: series.key,
            label: series.label,
            symbol: series.symbol,
            interval: series.interval,
        }))).toEqual([
            { key: 'soxl5m', label: 'SOXL \u00b7 5 minute', symbol: 'SOXL', interval: '5m' },
            { key: 'soxl1d', label: 'SOXL \u00b7 Daily', symbol: 'SOXL', interval: '1d' },
            { key: 'qqq5m', label: 'QQQ \u00b7 5 minute', symbol: 'QQQ', interval: '5m' },
            { key: 'smh5m', label: 'SMH \u00b7 5 minute', symbol: 'SMH', interval: '5m' },
        ]);
    });

    it('preserves source metadata without provider messages or exceptions', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot(
            {
                status: 'partial',
                availableSeries: ['soxl5m', 'soxl1d', 'smh5m'],
                unavailableSeries: ['qqq5m'],
            },
            {
                qqq5m: createMarketFiveMinute('qqq5m', {
                    status: 'unavailable',
                    sourceStatus: 'unavailable',
                    sourceErrorCode: 'provider_error',
                    issue: 'indicator_calculation_failed',
                    sourceCandleCount: 0,
                    completedCandleCount: 0,
                    latestCompletedTimestamp: null,
                    latestCompletedClose: null,
                    ema20: null,
                    ema50: null,
                    rsi14: null,
                    macd12269: null,
                }),
            },
        ));
        const qqq = view.series[2];

        expect(qqq).toMatchObject({
            key: 'qqq5m',
            status: 'unavailable',
            sourceStatus: 'unavailable',
            sourceErrorCode: 'provider_error',
            issue: 'indicator_calculation_failed',
            sourceCandleCount: 0,
            completedCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
        });
        expect(JSON.stringify(qqq)).not.toContain('message');
        expect(JSON.stringify(qqq)).not.toContain('stack');
    });
});

describe('buildSoxlCoreIndicatorView indicator values', () => {
    it('selects the final returned point without sorting or rounding', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot());
        const soxl5m = view.series[0];

        expect(soxl5m.values.map((value) => [value.key, value.value])).toEqual([
            ['ema9', 25.2],
            ['ema20', 25.8],
            ['ema50', 26.2],
            ['rsi14', 52.3456],
            ['atr14', 0.654321],
        ]);
        expect(soxl5m.macd?.macd.value).toBe(0.2201);
        expect(soxl5m.macd?.signal.value).toBe(0.21);
        expect(soxl5m.macd?.histogram.value).toBe(0.0101);
    });

    it('uses null display values for unavailable or empty indicator results', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot({}, {
            soxl5m: createSoxlFiveMinute({
                ema9: indicatorResult([{ timestamp: 100, value: 25 }], 'insufficient_history'),
                ema20: indicatorResult([], 'available'),
                macd12269: macdResult([
                    { timestamp: 100, macd: 1, signal: 2, histogram: 3 },
                ], 'invalid_input'),
                swings333: swingResult(
                    swing('high', 31, 100, 200),
                    swing('low', 29, 100, 200),
                    'insufficient_history',
                    'insufficient_confirmation_history',
                ),
            }),
        }));
        const soxl5m = view.series[0];

        expect(soxl5m.values[0]).toMatchObject({
            key: 'ema9',
            status: 'insufficient_history',
            value: null,
        });
        expect(soxl5m.values[1]).toMatchObject({
            key: 'ema20',
            status: 'available',
            value: null,
        });
        expect(soxl5m.macd?.macd).toMatchObject({
            status: 'invalid_input',
            value: null,
        });
        expect(soxl5m.swings).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_confirmation_history',
            latestHigh: null,
            latestLow: null,
        });
    });

    it('maps the configured indicators for SOXL daily, QQQ, and SMH only', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot());

        expect(view.series[1].values.map((value) => value.key)).toEqual([
            'ema20',
            'ema50',
            'ema200',
            'rsi14',
            'atr14',
        ]);
        expect(view.series[2].values.map((value) => value.key)).toEqual([
            'ema20',
            'ema50',
            'rsi14',
        ]);
        expect(view.series[3].values.map((value) => value.key)).toEqual([
            'ema20',
            'ema50',
            'rsi14',
        ]);
    });
});

describe('buildSoxlCoreIndicatorView swings and determinism', () => {
    it('preserves confirmed swing prices and timestamps, including daily trading-date timestamps', () => {
        const view = buildSoxlCoreIndicatorView(createSnapshot());
        const daily = view.series[1];

        expect(view.series[0].swings?.latestHigh).toEqual({
            price: 31.25,
            pivotTimestamp: 1_782_351_000,
            confirmedAtTimestamp: 1_782_351_900,
        });
        expect(daily.interval).toBe('1d');
        expect(daily.latestCompletedTimestamp).toBe(dailyTradingDateTimestamp);
        expect(daily.swings?.latestHigh).toEqual({
            price: 34.25,
            pivotTimestamp: dailyTradingDateTimestamp,
            confirmedAtTimestamp: dailyTradingDateTimestamp,
        });
    });

    it('does not mutate, sort, or use the system clock', () => {
        const snapshot = createSnapshot();
        const before = JSON.stringify(snapshot);
        const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('system clock must not be used');
        });

        try {
            expect(buildSoxlCoreIndicatorView(snapshot)).toEqual(buildSoxlCoreIndicatorView(snapshot));
        } finally {
            dateNow.mockRestore();
        }

        expect(JSON.stringify(snapshot)).toBe(before);
    });

    it('does not import market-data providers, server services, or time formatters', () => {
        const source = readFileSync(
            new URL('./soxl-core-indicators-view.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toMatch(/from ['"].*\/server\//u);
        expect(source).not.toMatch(/from ['"].*provider/u);
        expect(source).not.toContain('time-format');
        expect(source).not.toContain('Date.');
    });
});
