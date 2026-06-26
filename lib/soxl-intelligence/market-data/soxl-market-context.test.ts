import { describe, expect, it } from 'vitest';
import {
    loadSoxlMarketContext,
    type SoxlMarketSeriesKey,
} from '@/lib/soxl-intelligence/market-data/soxl-market-context';
import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSymbol,
    MarketCandle,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    GetCandlesInput,
    HistoricalMarketDataProvider,
} from '@/lib/soxl-intelligence/market-data/provider';

const asOf = 1_782_432_000;
const daySeconds = 86_400;
const intradayFrom = asOf - 14 * daySeconds;
const dailyFrom = asOf - 550 * daySeconds;
const orderedKeys: readonly SoxlMarketSeriesKey[] = ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'];

function createCandle(
    symbol: CandleSymbol,
    interval: CandleInterval,
    timestamp: number,
): MarketCandle {
    return {
        symbol,
        interval,
        timestamp,
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
        isComplete: true,
        session: 'regular',
    };
}

function createSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    status: CandleSeries['status'] = 'available',
    errorCode?: CandleSeriesErrorCode,
): CandleSeries {
    return {
        symbol,
        interval,
        candles: status === 'available'
            ? [createCandle(symbol, interval, asOf - daySeconds)]
            : [],
        status,
        provider: 'fake-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        ...(errorCode === undefined ? {} : { errorCode }),
        metadata: {
            requestedFrom: interval === '1d' ? dailyFrom : intradayFrom,
            requestedTo: asOf,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
    };
}

function createUnavailableSeries(
    symbol: CandleSymbol,
    interval: CandleInterval,
    errorCode: CandleSeriesErrorCode = 'provider_error',
): CandleSeries {
    return createSeries(symbol, interval, 'unavailable', errorCode);
}

function createSuccessResults(): readonly CandleSeries[] {
    return [
        createSeries('SOXL', '5m'),
        createSeries('SOXL', '1d'),
        createSeries('QQQ', '5m'),
        createSeries('SMH', '5m'),
    ];
}

interface ControlledCall {
    input: GetCandlesInput;
    resolve: (value: CandleSeries) => void;
    reject: (reason: unknown) => void;
}

class ControlledProvider implements HistoricalMarketDataProvider {
    readonly id = 'controlled-provider';
    readonly calls: ControlledCall[] = [];

    getCandles(input: GetCandlesInput): Promise<CandleSeries> {
        return new Promise<CandleSeries>((resolve, reject) => {
            this.calls.push({ input, resolve, reject });
        });
    }
}

function createResolvedProvider(results: readonly CandleSeries[]): HistoricalMarketDataProvider & { calls: GetCandlesInput[] } {
    const calls: GetCandlesInput[] = [];

    return {
        id: 'fake-provider',
        calls,
        async getCandles(input: GetCandlesInput): Promise<CandleSeries> {
            calls.push(input);
            return results[calls.length - 1];
        },
    };
}

function expectStandardRequests(calls: readonly GetCandlesInput[]): void {
    expect(calls).toEqual([
        {
            symbol: 'SOXL',
            interval: '5m',
            from: intradayFrom,
            to: asOf,
            includeExtendedHours: false,
            minimumCompletedBars: 250,
        },
        {
            symbol: 'SOXL',
            interval: '1d',
            from: dailyFrom,
            to: asOf,
            includeExtendedHours: false,
            minimumCompletedBars: 250,
        },
        {
            symbol: 'QQQ',
            interval: '5m',
            from: intradayFrom,
            to: asOf,
            includeExtendedHours: false,
            minimumCompletedBars: 250,
        },
        {
            symbol: 'SMH',
            interval: '5m',
            from: intradayFrom,
            to: asOf,
            includeExtendedHours: false,
            minimumCompletedBars: 250,
        },
    ]);
}

describe('loadSoxlMarketContext request construction', () => {
    it('makes exactly four provider calls with fixed request definitions', async () => {
        const provider = createResolvedProvider(createSuccessResults());

        await loadSoxlMarketContext({ provider, asOf });

        expect(provider.calls).toHaveLength(4);
        expectStandardRequests(provider.calls);
    });

    it('starts all calls concurrently before controlled promises resolve', async () => {
        const provider = new ControlledProvider();
        const loadPromise = loadSoxlMarketContext({ provider, asOf });

        await Promise.resolve();

        expect(provider.calls).toHaveLength(4);
        provider.calls.forEach((call, index) => {
            call.resolve(createSuccessResults()[index]);
        });

        await loadPromise;
    });

    it('preserves provider ID and does not mutate input', async () => {
        const provider = createResolvedProvider(createSuccessResults());
        const input = { provider, asOf };
        const before = { ...input };

        const result = await loadSoxlMarketContext(input);

        expect(result.providerId).toBe('fake-provider');
        expect(input).toEqual(before);
    });
});

describe('loadSoxlMarketContext aggregate success', () => {
    it('returns available when all four series are available', async () => {
        const provider = createResolvedProvider(createSuccessResults());
        const result = await loadSoxlMarketContext({ provider, asOf });

        expect(result.status).toBe('available');
        expect(Object.keys(result.series)).toEqual(orderedKeys);
        expect(result.availableSeries).toEqual(orderedKeys);
        expect(result.unavailableSeries).toEqual([]);
    });

    it('preserves provider results without mutating candle arrays', async () => {
        const results = createSuccessResults();
        const originalCandleLengths = results.map((series) => series.candles.length);
        const provider = createResolvedProvider(results);
        const result = await loadSoxlMarketContext({ provider, asOf });

        expect(result.series.soxl5m).toBe(results[0]);
        expect(result.series.soxl1d).toBe(results[1]);
        expect(result.series.qqq5m).toBe(results[2]);
        expect(result.series.smh5m).toBe(results[3]);
        expect(results.map((series) => series.candles.length)).toEqual(originalCandleLengths);
    });
});

describe('loadSoxlMarketContext partial availability', () => {
    it('returns partial when one structured series fails', async () => {
        const provider = createResolvedProvider([
            createSeries('SOXL', '5m'),
            createUnavailableSeries('SOXL', '1d', 'insufficient_history'),
            createSeries('QQQ', '5m'),
            createSeries('SMH', '5m'),
        ]);
        const result = await loadSoxlMarketContext({ provider, asOf });

        expect(result.status).toBe('partial');
        expect(result.availableSeries).toEqual(['soxl5m', 'qqq5m', 'smh5m']);
        expect(result.unavailableSeries).toEqual(['soxl1d']);
        expect(result.series.soxl1d).toMatchObject({
            status: 'unavailable',
            errorCode: 'insufficient_history',
        });
    });

    it('returns partial for multiple failures as long as one succeeds', async () => {
        const provider = createResolvedProvider([
            createUnavailableSeries('SOXL', '5m'),
            createUnavailableSeries('SOXL', '1d'),
            createSeries('QQQ', '5m'),
            createUnavailableSeries('SMH', '5m'),
        ]);
        const result = await loadSoxlMarketContext({ provider, asOf });

        expect(result.status).toBe('partial');
        expect(result.availableSeries).toEqual(['qqq5m']);
        expect(result.unavailableSeries).toEqual(['soxl5m', 'soxl1d', 'smh5m']);
    });
});

describe('loadSoxlMarketContext total failure', () => {
    it('returns unavailable when all four structured provider results fail', async () => {
        const provider = createResolvedProvider([
            createUnavailableSeries('SOXL', '5m'),
            createUnavailableSeries('SOXL', '1d'),
            createUnavailableSeries('QQQ', '5m'),
            createUnavailableSeries('SMH', '5m'),
        ]);
        const result = await loadSoxlMarketContext({ provider, asOf });

        expect(result.status).toBe('unavailable');
        expect(result.availableSeries).toEqual([]);
        expect(result.unavailableSeries).toEqual(orderedKeys);
    });
});

describe('loadSoxlMarketContext unexpected promise rejection', () => {
    it('converts one rejected provider call to a structured provider error', async () => {
        const provider = new ControlledProvider();
        const loadPromise = loadSoxlMarketContext({ provider, asOf });

        await Promise.resolve();

        provider.calls[0].resolve(createSeries('SOXL', '5m'));
        provider.calls[1].reject(new Error('secret stack message'));
        provider.calls[2].resolve(createSeries('QQQ', '5m'));
        provider.calls[3].resolve(createSeries('SMH', '5m'));

        const result = await loadPromise;

        expect(result.status).toBe('partial');
        expect(result.availableSeries).toEqual(['soxl5m', 'qqq5m', 'smh5m']);
        expect(result.series.soxl1d).toMatchObject({
            status: 'unavailable',
            errorCode: 'provider_error',
            provider: 'controlled-provider',
        });
        expect(JSON.stringify(result.series.soxl1d)).not.toContain('secret stack message');
    });

    it('returns unavailable when all provider calls reject and does not throw', async () => {
        const provider = new ControlledProvider();
        const loadPromise = loadSoxlMarketContext({ provider, asOf });

        await Promise.resolve();

        provider.calls.forEach((call) => call.reject(new Error('boom')));
        const result = await loadPromise;

        expect(result.status).toBe('unavailable');
        expect(result.availableSeries).toEqual([]);
        expect(result.unavailableSeries).toEqual(orderedKeys);
    });
});

describe('loadSoxlMarketContext input validation', () => {
    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', asOf + 0.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
        ['too large', 10_000_000_001],
    ])('does not call provider for invalid asOf %s', async (_label, invalidAsOf) => {
        const provider = createResolvedProvider(createSuccessResults());
        const result = await loadSoxlMarketContext({ provider, asOf: invalidAsOf });

        expect(provider.calls).toHaveLength(0);
        expect(result.status).toBe('unavailable');
        expect(result.availableSeries).toEqual([]);
        expect(result.unavailableSeries).toEqual(orderedKeys);
        expect(Object.values(result.series).every((series) => (
            series.status === 'unavailable'
            && series.errorCode === 'invalid_response'
        ))).toBe(true);
    });
});

describe('loadSoxlMarketContext determinism', () => {
    it('does not change logical ordering when promises resolve out of order', async () => {
        const provider = new ControlledProvider();
        const loadPromise = loadSoxlMarketContext({ provider, asOf });

        await Promise.resolve();

        provider.calls[3].resolve(createSeries('SMH', '5m'));
        provider.calls[1].resolve(createSeries('SOXL', '1d'));
        provider.calls[2].resolve(createSeries('QQQ', '5m'));
        provider.calls[0].resolve(createSeries('SOXL', '5m'));

        const result = await loadPromise;

        expect(Object.keys(result.series)).toEqual(orderedKeys);
        expect(result.availableSeries).toEqual(orderedKeys);
    });

    it('produces equivalent results for repeated calls with the same provider responses and asOf', async () => {
        const first = await loadSoxlMarketContext({
            provider: createResolvedProvider(createSuccessResults()),
            asOf,
        });
        const second = await loadSoxlMarketContext({
            provider: createResolvedProvider(createSuccessResults()),
            asOf,
        });

        expect(first.status).toBe(second.status);
        expect(first.availableSeries).toEqual(second.availableSeries);
        expect(first.unavailableSeries).toEqual(second.unavailableSeries);
        expect(Object.keys(first.series)).toEqual(Object.keys(second.series));
    });

    it('does not require a system clock or mutate series objects', async () => {
        const results = createSuccessResults();
        const before = JSON.stringify(results);
        const provider = createResolvedProvider(results);

        await loadSoxlMarketContext({ provider, asOf });

        expect(JSON.stringify(results)).toBe(before);
    });
});
