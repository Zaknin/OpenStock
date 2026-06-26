import { describe, expect, it, vi } from 'vitest';
import {
    createSoxlMarketContextService,
} from '@/lib/soxl-intelligence/market-data/server/soxl-market-context-service';

const apiKey = 'runtime-secret-token';
const asOf = 1_782_432_000;
const clockMs = asOf * 1000 + 789;
const baseUrl = 'https://example.test';

interface ProviderValue {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
        + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function createIntradayValues(count = 250, endExclusive = asOf): ProviderValue[] {
    const firstTimestamp = endExclusive - (count + 1) * 300;

    return Array.from({ length: count }, (_value, index) => ({
        datetime: formatDateTime(firstTimestamp + index * 300),
        open: '30',
        high: '31',
        low: '29',
        close: '30.5',
        volume: '1000',
    }));
}

function createDailyValues(count = 250, endExclusive = asOf): ProviderValue[] {
    const firstTimestamp = endExclusive - (count + 1) * 86_400;

    return Array.from({ length: count }, (_value, index) => ({
        datetime: formatDate(firstTimestamp + index * 86_400),
        open: '30',
        high: '31',
        low: '29',
        close: '30.5',
        volume: '1000',
    }));
}

function createResponseForUrl(url: URL, status: 'ok' | 'error' = 'ok'): Response {
    if (status === 'error') {
        return new Response(JSON.stringify({
            status: 'error',
            code: 429,
            message: 'rate limited',
        }), { status: 200 });
    }

    const symbol = url.searchParams.get('symbol') ?? 'SOXL';
    const interval = url.searchParams.get('interval') ?? '5min';

    return new Response(JSON.stringify({
        status: 'ok',
        meta: {
            symbol,
            interval,
            exchange_timezone: 'America/New_York',
            exchange: symbol === 'SOXL' ? 'NYSE' : 'NASDAQ',
            type: 'ETF',
        },
        values: interval === '1day'
            ? createDailyValues()
            : createIntradayValues(),
    }), { status: 200 });
}

function createFetch(statusByCall: readonly ('ok' | 'error')[] = []): ReturnType<typeof vi.fn<typeof fetch>> {
    return vi.fn<typeof fetch>(async (input) => {
        if (!(input instanceof URL)) {
            throw new Error('Expected URL input');
        }

        const status = statusByCall.at(0) ?? 'ok';

        if (statusByCall.length > 0) {
            (statusByCall as ('ok' | 'error')[]).shift();
        }

        return createResponseForUrl(input, status);
    });
}

function getFetchUrls(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>): URL[] {
    return fetchImpl.mock.calls.map((call) => {
        const input = call[0];

        if (!(input instanceof URL)) {
            throw new Error('Expected URL input');
        }

        return input;
    });
}

describe('createSoxlMarketContextService environment and provider assembly', () => {
    it('constructs a working configured service and preserves provider ID', async () => {
        const fetchImpl = createFetch();
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockMs,
        });

        const result = await service.load();

        expect(result.status).toBe('available');
        expect(result.providerId).toBe('twelve-data');
    });

    it('passes configured base URL and uses default base URL when absent', async () => {
        const configuredFetch = createFetch();
        const defaultFetch = createFetch();

        await createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl: configuredFetch,
            clock: () => clockMs,
        }).load();
        await createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey },
            fetchImpl: defaultFetch,
            clock: () => clockMs,
        }).load();

        expect(getFetchUrls(configuredFetch)[0].origin).toBe(baseUrl);
        expect(getFetchUrls(defaultFetch)[0].origin).toBe('https://api.twelvedata.com');
    });

    it('sends the API key only through Authorization and not URLs', async () => {
        const fetchImpl = createFetch();
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockMs,
        });

        await service.load();

        fetchImpl.mock.calls.forEach((call) => {
            expect(call[1]?.headers).toEqual({ Authorization: `apikey ${apiKey}` });
        });
        expect(getFetchUrls(fetchImpl).every((url) => !url.toString().includes(apiKey))).toBe(true);
    });

    it('makes exactly four requests and no extra probe for one uncached load', async () => {
        const fetchImpl = createFetch();
        const environment = { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl };

        await createSoxlMarketContextService({
            environment,
            fetchImpl,
            clock: () => clockMs,
        }).load();

        expect(fetchImpl).toHaveBeenCalledTimes(4);
        expect(getFetchUrls(fetchImpl).map((url) => [
            url.searchParams.get('symbol'),
            url.searchParams.get('interval'),
        ])).toEqual([
            ['SOXL', '5min'],
            ['SOXL', '1day'],
            ['QQQ', '5min'],
            ['SMH', '5min'],
        ]);
        expect(environment).toEqual({ TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl });
    });
});

describe('createSoxlMarketContextService missing configuration', () => {
    it.each([
        ['missing', {}],
        ['blank', { TWELVE_DATA_API_KEY: '   ' }],
    ])('returns unavailable for %s key without fetch', async (_label, environment) => {
        const fetchImpl = createFetch();
        const result = await createSoxlMarketContextService({
            environment,
            fetchImpl,
            clock: () => clockMs,
        }).load();

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.status).toBe('unavailable');
        expect(result.availableSeries).toEqual([]);
        expect(result.unavailableSeries).toEqual(['soxl5m', 'soxl1d', 'qqq5m', 'smh5m']);
        expect(Object.values(result.series).every((series) => (
            series.errorCode === 'provider_not_configured'
        ))).toBe(true);
        expect(JSON.stringify(result)).not.toContain(apiKey);
    });
});

describe('createSoxlMarketContextService clock behavior', () => {
    it('uses one floored clock-derived asOf for all underlying requests', async () => {
        const fetchImpl = createFetch();
        const clock = vi.fn(() => clockMs);

        const result = await createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock,
        }).load();

        expect(clock).toHaveBeenCalledTimes(1);
        expect(result.asOf).toBe(asOf);
        expect(getFetchUrls(fetchImpl).every((url) => (
            url.searchParams.get('end_date') !== null
        ))).toBe(true);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', clockMs + 0.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
        ['too large asOf', 10_000_000_001_000],
    ])('fails safely for invalid clock %s', async (_label, clockValue) => {
        const fetchImpl = createFetch();
        const result = await createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockValue,
        }).load();

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.status).toBe('unavailable');
        expect(Object.values(result.series).every((series) => (
            series.errorCode === 'invalid_response'
        ))).toBe(true);
    });
});

describe('createSoxlMarketContextService cache hit and expiration', () => {
    it('caches before expiry and refreshes at expiry', async () => {
        const fetchImpl = createFetch();
        let now = clockMs;
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => now,
        });

        const first = await service.load();
        now = clockMs + 59_999;
        const beforeExpiry = await service.load();
        now = clockMs + 60_000;
        const atExpiry = await service.load();

        expect(fetchImpl).toHaveBeenCalledTimes(8);
        expect(beforeExpiry).toBe(first);
        expect(beforeExpiry.asOf).toBe(asOf);
        expect(atExpiry.asOf).toBe(Math.floor((clockMs + 60_000) / 1000));
    });

    it('uses a custom TTL', async () => {
        const fetchImpl = createFetch();
        let now = clockMs;
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => now,
            cacheTtlMs: 5_000,
        });

        await service.load();
        now += 4_999;
        await service.load();
        now += 1;
        await service.load();

        expect(fetchImpl).toHaveBeenCalledTimes(8);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('rejects invalid TTL %s without provider requests', async (_label, cacheTtlMs) => {
        const fetchImpl = createFetch();
        const result = await createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockMs,
            cacheTtlMs,
        }).load();

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.status).toBe('unavailable');
    });

    it('caches partial and unavailable aggregate results', async () => {
        const partialFetch = createFetch(['error']);
        const unavailableFetch = createFetch(['error', 'error', 'error', 'error']);
        const partialService = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl: partialFetch,
            clock: () => clockMs,
        });
        const unavailableService = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl: unavailableFetch,
            clock: () => clockMs,
        });

        const partial = await partialService.load();
        await partialService.load();
        const unavailable = await unavailableService.load();
        await unavailableService.load();

        expect(partial.status).toBe('partial');
        expect(unavailable.status).toBe('unavailable');
        expect(partialFetch).toHaveBeenCalledTimes(4);
        expect(unavailableFetch).toHaveBeenCalledTimes(4);
    });
});

describe('createSoxlMarketContextService single flight', () => {
    it('collapses concurrent cache misses into one in-flight load', async () => {
        const fetchImpl = createFetch();
        let resolveGate = (): void => {
            throw new Error('Gate resolver was not initialized.');
        };
        const gate = new Promise<void>((resolve) => {
            resolveGate = resolve;
        });
        fetchImpl.mockImplementation(async (input) => {
            await gate;

            if (!(input instanceof URL)) {
                throw new Error('Expected URL input');
            }

            return createResponseForUrl(input);
        });
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockMs,
        });

        const first = service.load();
        const second = service.load();
        const third = service.load();
        await Promise.resolve();

        expect(fetchImpl).toHaveBeenCalledTimes(4);
        resolveGate?.();
        const results = await Promise.all([first, second, third]);
        const cached = await service.load();

        expect(results[0]).toBe(results[1]);
        expect(results[1]).toBe(results[2]);
        expect(cached).toBe(results[0]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it('clears in-flight state after unexpected rejection so a later call can retry', async () => {
        const fetchImpl = createFetch();
        fetchImpl.mockRejectedValueOnce(new Error('hidden failure'));
        let now = clockMs;
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => now,
            cacheTtlMs: 1,
        });

        const first = await service.load();
        now += 1;
        const second = await service.load();

        expect(first.status).toBe('partial');
        expect(second.status).toBe('available');
        expect(JSON.stringify(first)).not.toContain('hidden failure');
        expect(fetchImpl).toHaveBeenCalledTimes(8);
    });
});

describe('createSoxlMarketContextService sanitization and mutation', () => {
    it('does not expose API keys and does not mutate provider responses', async () => {
        const fetchImpl = createFetch();
        const service = createSoxlMarketContextService({
            environment: { TWELVE_DATA_API_KEY: apiKey, TWELVE_DATA_BASE_URL: baseUrl },
            fetchImpl,
            clock: () => clockMs,
        });

        const result = await service.load();
        const before = JSON.stringify(result);
        result.series.soxl5m.candles.push({
            symbol: 'SOXL',
            interval: '5m',
            timestamp: asOf - 1,
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            volume: 0,
            isComplete: true,
            session: 'regular',
        });

        expect(before).not.toContain(apiKey);
        expect(JSON.stringify(await service.load())).not.toContain(apiKey);
    });
});
