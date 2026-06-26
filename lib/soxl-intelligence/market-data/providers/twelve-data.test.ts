import { describe, expect, it, vi } from 'vitest';
import { createTwelveDataHistoricalProvider } from '@/lib/soxl-intelligence/market-data/providers/twelve-data';
import type { CandleInterval } from '@/lib/soxl-intelligence/market-data/candle-types';
import type { GetCandlesInput } from '@/lib/soxl-intelligence/market-data/provider';

const apiKey = 'test-token-123';
const baseUrl = 'https://example.test/';
const from = 1_782_138_600;
const to = 1_782_140_000;

interface ProviderValue {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
}

interface ProviderBody {
    status: 'ok';
    meta: {
        symbol: string;
        interval: string;
        exchange_timezone?: string;
        exchange?: string;
        type?: string;
    };
    values: ProviderValue[];
}

function createInput(overrides: Partial<GetCandlesInput> = {}): GetCandlesInput {
    return {
        symbol: 'SOXL',
        interval: '5m',
        from,
        to,
        includeExtendedHours: false,
        minimumCompletedBars: 2,
        ...overrides,
    };
}

function createIntradayBody(overrides: Partial<ProviderBody> = {}): ProviderBody {
    return {
        status: 'ok',
        meta: {
            symbol: 'SOXL',
            interval: '5min',
            exchange_timezone: 'America/New_York',
            exchange: 'NYSE',
            type: 'ETF',
        },
        values: [
            {
                datetime: '2026-06-22 14:30:00',
                open: '30.123456789',
                high: '31.5',
                low: '29.75',
                close: '30.5',
                volume: '1000',
            },
            {
                datetime: '2026-06-22 14:35:00',
                open: '30.5',
                high: '32.25',
                low: '30.25',
                close: '31.75',
                volume: '0',
            },
            {
                datetime: '2026-06-22 14:50:00',
                open: '31.75',
                high: '33.1',
                low: '31.5',
                close: '32.8',
                volume: '500',
            },
        ],
        ...overrides,
    };
}

function createDailyBody(overrides: Partial<ProviderBody> = {}): ProviderBody {
    return {
        status: 'ok',
        meta: {
            symbol: 'SOXL',
            interval: '1day',
            exchange_timezone: 'America/New_York',
            exchange: 'NYSE',
            type: 'ETF',
        },
        values: [
            {
                datetime: '2026-06-23',
                open: '25',
                high: '27',
                low: '24',
                close: '26',
                volume: '1000000',
            },
            {
                datetime: '2026-06-24',
                open: '26',
                high: '28',
                low: '25.5',
                close: '27.25',
                volume: '1100000',
            },
        ],
        ...overrides,
    };
}

function createFetch(body: unknown, status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
    return vi.fn<typeof fetch>(async () => (
        new Response(JSON.stringify(body), { status })
    ));
}

function createInvalidJsonFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
    return vi.fn<typeof fetch>(async () => {
        const response = new Response('', { status: 200 });

        vi.spyOn(response, 'json').mockImplementation(async () => {
            throw new Error('invalid json');
        });

        return response;
    });
}

function getFetchUrl(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>): URL {
    const firstCall = fetchImpl.mock.calls[0];
    const requestInfo = firstCall[0];

    if (requestInfo instanceof URL) {
        return requestInfo;
    }

    throw new Error('Expected URL request input.');
}

function getFetchInit(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>): RequestInit {
    return fetchImpl.mock.calls[0][1] ?? {};
}

describe('createTwelveDataHistoricalProvider request construction', () => {
    it('calls the /time_series endpoint with base URL slash normalized', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput());

        const url = getFetchUrl(fetchImpl);
        expect(url.origin).toBe('https://example.test');
        expect(url.pathname).toBe('/time_series');
    });

    it('sets symbol, format, order, UTC timezone, range, and Authorization header', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput());

        const url = getFetchUrl(fetchImpl);
        const init = getFetchInit(fetchImpl);

        expect(url.searchParams.get('symbol')).toBe('SOXL');
        expect(url.searchParams.get('interval')).toBe('5min');
        expect(url.searchParams.get('format')).toBe('JSON');
        expect(url.searchParams.get('order')).toBe('asc');
        expect(url.searchParams.get('timezone')).toBe('UTC');
        expect(url.searchParams.get('start_date')).toBe('2026-06-22 14:30:00');
        expect(url.searchParams.get('end_date')).toBe('2026-06-22 14:53:19');
        expect(url.searchParams.get('outputsize')).toBeNull();
        expect(init.headers).toEqual({
            Authorization: `apikey ${apiKey}`,
        });
    });

    it.each([
        ['1m', '1min'],
        ['5m', '5min'],
        ['15m', '15min'],
        ['1h', '1h'],
        ['1d', '1day'],
    ] satisfies Array<[CandleInterval, string]>)('maps %s to %s', async (interval, providerInterval) => {
        const fetchImpl = createFetch(interval === '1d'
            ? createDailyBody()
            : createIntradayBody({
                meta: {
                    ...createIntradayBody().meta,
                    interval: providerInterval,
                },
            }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput({
            interval,
            from: interval === '1d' ? 1_782_172_800 : from,
            to: interval === '1d' ? 1_782_345_600 : to,
            minimumCompletedBars: 1,
        }));

        expect(getFetchUrl(fetchImpl).searchParams.get('interval')).toBe(providerInterval);
    });

    it('omits UTC timezone for daily requests and uses deterministic dates', async () => {
        const fetchImpl = createFetch(createDailyBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_345_600,
            minimumCompletedBars: 1,
        }));

        const url = getFetchUrl(fetchImpl);
        expect(url.searchParams.get('timezone')).toBeNull();
        expect(url.searchParams.get('start_date')).toBe('2026-06-23');
        expect(url.searchParams.get('end_date')).toBe('2026-06-24');
    });

    it('does not include the API key or apikey query parameter in the URL', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput());

        const urlText = getFetchUrl(fetchImpl).toString();
        expect(urlText).not.toContain(apiKey);
        expect(urlText).not.toContain('apikey');
    });

    it('fails before fetch for an empty API key', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey: '   ', baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'provider_not_configured',
            candles: [],
        });
    });

    it('fails before fetch for an unsupported interval', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '30m' as CandleInterval,
        }));

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'unsupported_interval',
        });
    });

    it.each([
        ['zero from', { from: 0 }],
        ['from after to', { from: to, to: from }],
        ['decimal to', { to: to + 0.5 }],
    ])('fails before fetch for invalid request %s', async (_label, overrides) => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput(overrides));

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_response',
        });
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('fails before fetch for invalid minimumCompletedBars %s', async (_label, minimumCompletedBars) => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ minimumCompletedBars }));

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_response',
        });
    });

    it('rejects extended-hours requests before fetch without exposing the token', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ includeExtendedHours: true }));

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'unsupported_interval',
            candles: [],
        });
        expect(JSON.stringify(result)).not.toContain(apiKey);
    });

    it('continues normally when includeExtendedHours is false', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ includeExtendedHours: false }));

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('available');
    });

    it('continues normally when includeExtendedHours is undefined', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ includeExtendedHours: undefined }));

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('available');
    });

    it('calls fetch exactly once for a valid request', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(createInput());

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});

describe('createTwelveDataHistoricalProvider intraday normalization', () => {
    it('normalizes a valid SOXL 5-minute fixture', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.status).toBe('available');
        expect(result.provider).toBe('twelve-data');
        expect(result.symbol).toBe('SOXL');
        expect(result.interval).toBe('5m');
        expect(result.candles).toHaveLength(3);
    });

    it('does not truncate a response containing more candles than minimumCompletedBars', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ minimumCompletedBars: 1 }));

        expect(result.status).toBe('available');
        expect(result.candles).toHaveLength(3);
    });

    it('filters provider candles to the exact requested range', async () => {
        const fetchImpl = createFetch(createIntradayBody({
            values: [
                {
                    datetime: '2026-06-22 14:25:00',
                    open: '29',
                    high: '30',
                    low: '28',
                    close: '29.5',
                    volume: '900',
                },
                ...createIntradayBody().values,
                {
                    datetime: '2026-06-22 14:53:20',
                    open: '32',
                    high: '33',
                    low: '31',
                    close: '32.5',
                    volume: '700',
                },
            ],
        }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({ minimumCompletedBars: 1 }));

        expect(result.candles.map((candle) => candle.timestamp)).toEqual([
            1_782_138_600,
            1_782_138_900,
            1_782_139_800,
        ]);
    });

    it('converts string OHLCV values to numbers without rounding prices', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles[0]).toMatchObject({
            open: 30.123456789,
            high: 31.5,
            low: 29.75,
            close: 30.5,
            volume: 1000,
        });
    });

    it('converts UTC datetimes to exact Unix seconds and preserves ascending order', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles.map((candle) => candle.timestamp)).toEqual([
            1_782_138_600,
            1_782_138_900,
            1_782_139_800,
        ]);
    });

    it('preserves requested symbol and interval on candles', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles.every((candle) => (
            candle.symbol === 'SOXL' && candle.interval === '5m'
        ))).toBe(true);
    });

    it('classifies intraday sessions through existing session helpers', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles.map((candle) => candle.session)).toEqual([
            'regular',
            'regular',
            'regular',
        ]);
    });

    it('calculates completion against the supplied to boundary', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles.map((candle) => candle.isComplete)).toEqual([
            true,
            true,
            false,
        ]);
    });

    it('does not count incomplete candles toward minimumCompletedBars', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            minimumCompletedBars: 3,
        }));

        expect(result.candles).toHaveLength(3);
        expect(result.candles.filter((candle) => candle.isComplete)).toHaveLength(2);
        expect(result).toMatchObject({
            status: 'insufficient_history',
            errorCode: 'insufficient_history',
        });
    });

    it('preserves zero volume', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.candles[1].volume).toBe(0);
    });

    it('does not mutate caller input or provider response fixtures', async () => {
        const body = createIntradayBody();
        const input = createInput();
        const bodyBefore = JSON.stringify(body);
        const inputBefore = JSON.stringify(input);
        const fetchImpl = createFetch(body);
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        await provider.getCandles(input);

        expect(JSON.stringify(body)).toBe(bodyBefore);
        expect(JSON.stringify(input)).toBe(inputBefore);
    });
});

describe('createTwelveDataHistoricalProvider daily normalization', () => {
    it('normalizes a valid SOXL daily fixture', async () => {
        const fetchImpl = createFetch(createDailyBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_345_600,
            minimumCompletedBars: 2,
        }));

        expect(result.status).toBe('available');
        expect(result.candles).toEqual([
            {
                symbol: 'SOXL',
                interval: '1d',
                timestamp: 1_782_172_800,
                open: 25,
                high: 27,
                low: 24,
                close: 26,
                volume: 1_000_000,
                isComplete: true,
                session: 'regular',
            },
            {
                symbol: 'SOXL',
                interval: '1d',
                timestamp: 1_782_259_200,
                open: 26,
                high: 28,
                low: 25.5,
                close: 27.25,
                volume: 1_100_000,
                isComplete: true,
                session: 'regular',
            },
        ]);
    });

    it('does not invent exchange-calendar dates', async () => {
        const fetchImpl = createFetch(createDailyBody({
            values: [
                createDailyBody().values[0],
                {
                    datetime: '2026-06-26',
                    open: '27',
                    high: '29',
                    low: '26',
                    close: '28',
                    volume: '1200000',
                },
            ],
        }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_518_400,
            minimumCompletedBars: 1,
        }));

        expect(result.candles.map((candle) => candle.timestamp)).toEqual([
            1_782_172_800,
            1_782_432_000,
        ]);
    });

    it('keeps a daily candle incomplete before its full interval boundary', async () => {
        const fetchImpl = createFetch(createDailyBody({
            values: [createDailyBody().values[0]],
        }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_172_800 + 60,
            minimumCompletedBars: 1,
        }));

        expect(result.candles[0]).toMatchObject({
            timestamp: 1_782_172_800,
            isComplete: false,
        });
        expect(result.status).toBe('insufficient_history');
    });

    it('marks a daily candle complete exactly at its full interval boundary', async () => {
        const fetchImpl = createFetch(createDailyBody({
            values: [createDailyBody().values[0]],
        }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_259_200,
            minimumCompletedBars: 1,
        }));

        expect(result.candles[0]).toMatchObject({
            timestamp: 1_782_172_800,
            isComplete: true,
        });
        expect(result.status).toBe('available');
    });

    it('does not automatically mark the returned latest daily candle complete', async () => {
        const fetchImpl = createFetch(createDailyBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            interval: '1d',
            from: 1_782_172_800,
            to: 1_782_259_200 + 60,
            minimumCompletedBars: 1,
        }));

        expect(result.candles.at(-1)).toMatchObject({
            timestamp: 1_782_259_200,
            isComplete: false,
        });
    });
});

describe('createTwelveDataHistoricalProvider response validation', () => {
    it('maps HTTP 200 provider status error', async () => {
        const fetchImpl = createFetch({ status: 'error', code: 400, message: `bad ${apiKey}` });
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_response',
        });
        expect(JSON.stringify(result)).not.toContain(apiKey);
    });

    it.each([
        [400, 'invalid_response'],
        [401, 'provider_not_configured'],
        [403, 'entitlement_required'],
        [404, 'insufficient_history'],
        [429, 'provider_error'],
        [500, 'provider_error'],
    ] as const)('maps HTTP %s responses', async (status, errorCode) => {
        const fetchImpl = createFetch({ status: 'error', code: status, message: 'sanitized' }, status);
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.errorCode).toBe(errorCode);
    });

    it('maps network rejection to provider_error', async () => {
        const fetchImpl = vi.fn<typeof fetch>(async () => {
            throw new Error('network down');
        });
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'provider_error',
        });
    });

    it('maps invalid JSON to invalid_response', async () => {
        const fetchImpl = createInvalidJsonFetch();
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result.errorCode).toBe('invalid_response');
    });

    it.each([
        ['missing metadata', { status: 'ok', values: createIntradayBody().values }],
        ['missing values', { status: 'ok', meta: createIntradayBody().meta }],
        ['empty values', createIntradayBody({ values: [] })],
        ['symbol mismatch', createIntradayBody({ meta: { ...createIntradayBody().meta, symbol: 'QQQ' } })],
        ['interval mismatch', createIntradayBody({ meta: { ...createIntradayBody().meta, interval: '1min' } })],
        ['malformed datetime', createIntradayBody({ values: [{ ...createIntradayBody().values[0], datetime: '2026/06/22 14:30:00' }] })],
        ['impossible date', createIntradayBody({ values: [{ ...createIntradayBody().values[0], datetime: '2026-02-30 14:30:00' }] })],
        ['non-numeric OHLC', createIntradayBody({ values: [{ ...createIntradayBody().values[0], open: 'bad' }] })],
        ['zero OHLC', createIntradayBody({ values: [{ ...createIntradayBody().values[0], open: '0' }] })],
        ['negative OHLC', createIntradayBody({ values: [{ ...createIntradayBody().values[0], low: '-1' }] })],
        ['missing volume', createIntradayBody({ values: [{ ...createIntradayBody().values[0], volume: undefined }] })],
        ['negative volume', createIntradayBody({ values: [{ ...createIntradayBody().values[0], volume: '-1' }] })],
        ['duplicate timestamp', createIntradayBody({
            values: [
                createIntradayBody().values[0],
                { ...createIntradayBody().values[1], datetime: createIntradayBody().values[0].datetime },
            ],
        })],
        ['descending timestamps', createIntradayBody({
            values: [
                createIntradayBody().values[1],
                createIntradayBody().values[0],
            ],
        })],
    ])('rejects %s as invalid_response', async (_label, body) => {
        const fetchImpl = createFetch(body);
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput());

        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_response',
            candles: [],
        });
    });

    it('maps candle-level OHLC consistency failures through existing validation', async () => {
        const fetchImpl = createFetch(createIntradayBody({
            values: [{
                datetime: '2026-06-22 14:30:00',
                open: '30',
                high: '29',
                low: '28',
                close: '30',
                volume: '100',
            }],
        }));
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            minimumCompletedBars: 1,
        }));

        expect(result).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_candles',
            candles: [],
        });
    });

    it('marks success as insufficient_history when completed bars are below minimumCompletedBars', async () => {
        const fetchImpl = createFetch(createIntradayBody());
        const provider = createTwelveDataHistoricalProvider({ apiKey, baseUrl, fetchImpl });

        const result = await provider.getCandles(createInput({
            minimumCompletedBars: 3,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            errorCode: 'insufficient_history',
        });
    });
});
