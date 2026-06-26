import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlMarketContextView,
    formatMarketDataTimestamp,
} from '@/lib/soxl-intelligence/market-data/soxl-market-context-view';
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

function createCandle(
    symbol: CandleSymbol,
    interval: CandleInterval,
    timestamp: number,
    close: number,
    isComplete = true,
): MarketCandle {
    return {
        symbol,
        interval,
        timestamp,
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 100,
        isComplete,
        session: 'regular',
    };
}

function createSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    candles: MarketCandle[],
): CandleSeries {
    return {
        symbol,
        interval,
        candles,
        status: 'available',
        provider: 'fake-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        metadata: {
            requestedFrom: asOf - 1_000,
            requestedTo: asOf,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
    };
}

function createFailureSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    errorCode: CandleSeriesErrorCode,
): CandleSeries {
    return {
        symbol,
        interval,
        candles: [],
        status: 'unavailable',
        provider: 'fake-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        errorCode,
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
        providerId: 'fake-provider',
        series: {
            soxl5m: createSeries('SOXL', '5m', [
                createCandle('SOXL', '5m', 100, 30.123456789),
                createCandle('SOXL', '5m', 200, 31.5),
                createCandle('SOXL', '5m', 300, 32.75, false),
            ]),
            soxl1d: createSeries('SOXL', '1d', [
                createCandle('SOXL', '1d', 10, 28),
            ]),
            qqq5m: createSeries('QQQ', '5m', [
                createCandle('QQQ', '5m', 110, 480),
            ]),
            smh5m: createSeries('SMH', '5m', [
                createCandle('SMH', '5m', 120, 250),
            ]),
        },
        availableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        unavailableSeries: [],
        ...overrides,
    };
}

describe('buildSoxlMarketContextView ordering and labels', () => {
    it('always returns four rows in fixed logical order with labels, symbols, and intervals', () => {
        const view = buildSoxlMarketContextView(createContext());

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
});

describe('buildSoxlMarketContextView available series', () => {
    it('counts total and completed candles and selects the latest completed candle', () => {
        const view = buildSoxlMarketContextView(createContext());
        const soxl5m = view.series[0];

        expect(soxl5m).toMatchObject({
            status: 'available',
            candleCount: 3,
            completedCandleCount: 2,
            latestCompletedTimestamp: 200,
            latestCompletedClose: 31.5,
            errorCode: null,
        });
    });

    it('preserves latest close precision without rounding and does not mutate candle arrays', () => {
        const context = createContext({
            series: {
                ...createContext().series,
                soxl5m: createSeries('SOXL', '5m', [
                    createCandle('SOXL', '5m', 100, 30.123456789),
                ]),
            },
        });
        const before = JSON.stringify(context.series.soxl5m.candles);
        const view = buildSoxlMarketContextView(context);

        expect(view.series[0].latestCompletedClose).toBe(30.123456789);
        expect(JSON.stringify(context.series.soxl5m.candles)).toBe(before);
    });
});

describe('buildSoxlMarketContextView no completed candles', () => {
    it('keeps counts and null latest fields for available series with only incomplete candles', () => {
        const view = buildSoxlMarketContextView(createContext({
            series: {
                ...createContext().series,
                soxl5m: createSeries('SOXL', '5m', [
                    createCandle('SOXL', '5m', 100, 30, false),
                    createCandle('SOXL', '5m', 200, 31, false),
                ]),
            },
        }));

        expect(view.series[0]).toMatchObject({
            candleCount: 2,
            completedCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
        });
    });
});

describe('buildSoxlMarketContextView failed series', () => {
    it('uses zero counts, null latest fields, and preserves structured error code only', () => {
        const view = buildSoxlMarketContextView(createContext({
            status: 'partial',
            series: {
                ...createContext().series,
                qqq5m: createFailureSeries('QQQ', '5m', 'provider_error'),
            },
            availableSeries: ['soxl5m', 'soxl1d', 'smh5m'],
            unavailableSeries: ['qqq5m'],
        }));
        const qqq = view.series[2];

        expect(qqq).toEqual({
            key: 'qqq5m',
            label: 'QQQ \u00b7 5 minute',
            symbol: 'QQQ',
            interval: '5m',
            status: 'unavailable',
            candleCount: 0,
            completedCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
            errorCode: 'provider_error',
        });
        expect(JSON.stringify(qqq)).not.toContain('message');
    });
});

describe('buildSoxlMarketContextView aggregate states', () => {
    it('preserves context status, provider ID, asOf, and four-success counts', () => {
        const view = buildSoxlMarketContextView(createContext());

        expect(view).toMatchObject({
            status: 'available',
            providerId: 'fake-provider',
            asOf,
            availableCount: 4,
            unavailableCount: 0,
        });
    });

    it('derives partial and unavailable counts from fixed rows', () => {
        const partial = buildSoxlMarketContextView(createContext({
            status: 'partial',
            series: {
                ...createContext().series,
                qqq5m: createFailureSeries('QQQ', '5m', 'invalid_response'),
            },
        }));
        const unavailable = buildSoxlMarketContextView(createContext({
            status: 'unavailable',
            series: {
                soxl5m: createFailureSeries('SOXL', '5m', 'provider_error'),
                soxl1d: createFailureSeries('SOXL', '1d', 'provider_error'),
                qqq5m: createFailureSeries('QQQ', '5m', 'provider_error'),
                smh5m: createFailureSeries('SMH', '5m', 'provider_error'),
            },
        }));

        expect(partial.availableCount).toBe(3);
        expect(partial.unavailableCount).toBe(1);
        expect(unavailable.availableCount).toBe(0);
        expect(unavailable.unavailableCount).toBe(4);
    });
});

describe('buildSoxlMarketContextView determinism and mutation', () => {
    it('produces equivalent values repeatedly without sorting or mutating input', () => {
        const context = createContext({
            series: {
                ...createContext().series,
                soxl5m: createSeries('SOXL', '5m', [
                    createCandle('SOXL', '5m', 300, 32),
                    createCandle('SOXL', '5m', 100, 30),
                ]),
            },
        });
        const before = JSON.stringify(context);
        const first = buildSoxlMarketContextView(context);
        const second = buildSoxlMarketContextView(context);

        expect(first).toEqual(second);
        expect(first.series[0].latestCompletedTimestamp).toBe(100);
        expect(JSON.stringify(context)).toBe(before);
    });
});

describe('formatMarketDataTimestamp', () => {
    const dailyUtcMidnight = Date.UTC(2026, 5, 25, 0, 0, 0) / 1000;
    const intradayTimestamp = Date.UTC(2026, 5, 25, 14, 30, 0) / 1000;

    it('formats a daily UTC-midnight timestamp as the provider trading date', () => {
        expect(formatMarketDataTimestamp(dailyUtcMidnight, 'daily')).toBe(
            'Jun 25, 2026 \u00b7 trading date',
        );
    });

    it('does not shift the displayed daily trading date to the prior ET calendar date', () => {
        const formatted = formatMarketDataTimestamp(dailyUtcMidnight, 'daily');

        expect(formatted).toContain('Jun 25, 2026');
        expect(formatted).not.toContain('Jun 24, 2026');
        expect(formatted).not.toContain('ET');
    });

    it('formats intraday timestamps as America/New_York date-times', () => {
        expect(formatMarketDataTimestamp(intradayTimestamp, 'intraday')).toBe(
            'Jun 25, 2026, 10:30 AM ET',
        );
    });

    it('renders null timestamps as an em dash', () => {
        expect(formatMarketDataTimestamp(null, 'daily')).toBe('\u2014');
        expect(formatMarketDataTimestamp(null, 'intraday')).toBe('\u2014');
        expect(formatMarketDataTimestamp(null, 'aggregate')).toBe('\u2014');
    });

    it('does not use the system clock', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Date.now should not be used');
        });

        try {
            expect(formatMarketDataTimestamp(dailyUtcMidnight, 'daily')).toBe(
                'Jun 25, 2026 \u00b7 trading date',
            );
            expect(formatMarketDataTimestamp(intradayTimestamp, 'aggregate')).toBe(
                'Jun 25, 2026, 10:30 AM ET',
            );
        } finally {
            nowSpy.mockRestore();
        }
    });
});
