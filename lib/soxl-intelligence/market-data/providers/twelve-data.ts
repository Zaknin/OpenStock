import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    MarketCandle,
} from '../candle-types';
import type {
    GetCandlesInput,
    HistoricalMarketDataProvider,
} from '../provider';
import {
    classifyUsEquitySession,
    getCandleCompletionStatus,
    isIntradayInterval,
} from '../sessions';
import { validateCandleSeries } from '../validation';

export interface TwelveDataProviderConfig {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
}

type TwelveDataInterval =
    | '1min'
    | '5min'
    | '15min'
    | '1h'
    | '1day';

type ProviderFailureClassification =
    | 'invalid_request'
    | 'authentication_failed'
    | 'entitlement_required'
    | 'rate_limited'
    | 'not_found_or_no_data'
    | 'invalid_provider_response'
    | 'provider_unavailable';

interface TwelveDataSuccessResponse {
    status: 'ok';
    meta: {
        symbol: string;
        interval: string;
        exchange_timezone?: string;
        exchange?: string;
        type?: string;
    };
    values: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
    }>;
}

interface TwelveDataErrorResponse {
    status: 'error';
    code?: number;
    message?: string;
}

const DEFAULT_BASE_URL = 'https://api.twelvedata.com';
const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;
const DAILY_INTERVAL_SECONDS = 86_400;

const INTERVAL_BY_REPOSITORY_INTERVAL: Partial<Record<CandleInterval, TwelveDataInterval>> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '1h': '1h',
    '1d': '1day',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidUnixSecondBoundary(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function isValidLimit(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function getTwelveDataInterval(interval: CandleInterval): TwelveDataInterval | null {
    return INTERVAL_BY_REPOSITORY_INTERVAL[interval] ?? null;
}

function sanitizeMessage(message: unknown): string | undefined {
    return typeof message === 'string' ? message.slice(0, 200) : undefined;
}

function toCandleSeriesErrorCode(
    classification: ProviderFailureClassification,
): CandleSeriesErrorCode {
    switch (classification) {
        case 'entitlement_required':
            return 'entitlement_required';
        case 'not_found_or_no_data':
            return 'insufficient_history';
        case 'invalid_provider_response':
        case 'invalid_request':
            return 'invalid_response';
        case 'authentication_failed':
            return 'provider_not_configured';
        case 'rate_limited':
        case 'provider_unavailable':
            return 'provider_error';
    }
}

function createUnavailableSeries(
    input: GetCandlesInput,
    errorCode: CandleSeriesErrorCode,
): CandleSeries {
    return {
        symbol: input.symbol,
        interval: input.interval,
        candles: [],
        status: errorCode === 'insufficient_history' ? 'insufficient_history' : 'unavailable',
        provider: 'twelve-data',
        fetchedAt: new Date().toISOString(),
        timezone: 'America/New_York',
        includesExtendedHours: input.includeExtendedHours === true,
        errorCode,
        metadata: {
            requestedFrom: input.from,
            requestedTo: input.to,
            providerLatency: 'unknown',
            entitlement: errorCode === 'entitlement_required' ? 'insufficient' : 'unknown',
        },
    };
}

function createProviderFailureSeries(
    input: GetCandlesInput,
    classification: ProviderFailureClassification,
): CandleSeries {
    return createUnavailableSeries(input, toCandleSeriesErrorCode(classification));
}

function padNumber(value: number): string {
    return String(value).padStart(2, '0');
}

function formatUtcDateTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);

    return [
        date.getUTCFullYear(),
        padNumber(date.getUTCMonth() + 1),
        padNumber(date.getUTCDate()),
    ].join('-')
        + ' '
        + [
            padNumber(date.getUTCHours()),
            padNumber(date.getUTCMinutes()),
            padNumber(date.getUTCSeconds()),
        ].join(':');
}

function formatUtcDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);

    return [
        date.getUTCFullYear(),
        padNumber(date.getUTCMonth() + 1),
        padNumber(date.getUTCDate()),
    ].join('-');
}

function parseUtcIntradayDatetime(datetime: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(datetime);

    if (match === null) {
        return null;
    }

    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const timestampMilliseconds = Date.UTC(year, month - 1, day, hour, minute, second);
    const date = new Date(timestampMilliseconds);

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
        || date.getUTCHours() !== hour
        || date.getUTCMinutes() !== minute
        || date.getUTCSeconds() !== second
    ) {
        return null;
    }

    return Math.trunc(timestampMilliseconds / 1000);
}

function parseUtcDailyDate(datetime: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datetime);

    if (match === null) {
        return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const timestampMilliseconds = Date.UTC(year, month - 1, day, 0, 0, 0);
    const date = new Date(timestampMilliseconds);

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }

    return Math.trunc(timestampMilliseconds / 1000);
}

function parseProviderNumber(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveProviderNumber(value: unknown): number | null {
    const parsed = parseProviderNumber(value);

    return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeProviderNumber(value: unknown): number | null {
    const parsed = parseProviderNumber(value);

    return parsed !== null && parsed >= 0 ? parsed : null;
}

function isTwelveDataErrorResponse(value: unknown): value is TwelveDataErrorResponse {
    return isRecord(value) && value.status === 'error';
}

function isTwelveDataSuccessResponse(value: unknown): value is TwelveDataSuccessResponse {
    if (!isRecord(value) || value.status !== 'ok' || !isRecord(value.meta) || !Array.isArray(value.values)) {
        return false;
    }

    return value.values.every((item) => (
        isRecord(item)
        && typeof item.datetime === 'string'
        && typeof item.open === 'string'
        && typeof item.high === 'string'
        && typeof item.low === 'string'
        && typeof item.close === 'string'
        && (item.volume === undefined || typeof item.volume === 'string')
    ));
}

function classifyHttpFailure(status: number): ProviderFailureClassification {
    if (status === 400) {
        return 'invalid_request';
    }

    if (status === 401) {
        return 'authentication_failed';
    }

    if (status === 403) {
        return 'entitlement_required';
    }

    if (status === 404) {
        return 'not_found_or_no_data';
    }

    if (status === 429) {
        return 'rate_limited';
    }

    if (status >= 500) {
        return 'provider_unavailable';
    }

    return 'invalid_provider_response';
}

function classifyProviderError(
    response: TwelveDataErrorResponse,
): ProviderFailureClassification {
    const code = response.code;

    if (code === 400) {
        return 'invalid_request';
    }

    if (code === 401) {
        return 'authentication_failed';
    }

    if (code === 403) {
        return 'entitlement_required';
    }

    if (code === 404) {
        return 'not_found_or_no_data';
    }

    if (code === 429) {
        return 'rate_limited';
    }

    if (typeof code === 'number' && code >= 500) {
        return 'provider_unavailable';
    }

    return 'provider_unavailable';
}

function validateRequest(input: GetCandlesInput): CandleSeriesErrorCode | null {
    if (getTwelveDataInterval(input.interval) === null) {
        return 'unsupported_interval';
    }

    if (input.includeExtendedHours === true) {
        return 'unsupported_interval';
    }

    if (
        !isValidUnixSecondBoundary(input.from)
        || !isValidUnixSecondBoundary(input.to)
        || input.from >= input.to
    ) {
        return 'invalid_response';
    }

    if (
        input.minimumCompletedBars !== undefined
        && !isValidLimit(input.minimumCompletedBars)
    ) {
        return 'invalid_response';
    }

    return null;
}

function buildTimeSeriesUrl(
    baseUrl: string,
    input: GetCandlesInput,
    providerInterval: TwelveDataInterval,
): URL {
    const url = new URL('/time_series', baseUrl);
    const endInclusive = input.to - 1;

    url.searchParams.set('symbol', input.symbol);
    url.searchParams.set('interval', providerInterval);
    url.searchParams.set('format', 'JSON');
    url.searchParams.set('order', 'asc');

    if (isIntradayInterval(input.interval)) {
        url.searchParams.set('timezone', 'UTC');
        url.searchParams.set('start_date', formatUtcDateTime(input.from));
        url.searchParams.set('end_date', formatUtcDateTime(endInclusive));
    } else {
        url.searchParams.set('start_date', formatUtcDate(input.from));
        url.searchParams.set('end_date', formatUtcDate(endInclusive));
    }

    return url;
}

function getIsCandleComplete(input: {
    timestamp: number;
    interval: CandleInterval;
    asOf: number;
}): boolean {
    const completionStatus = getCandleCompletionStatus(input);

    if (completionStatus !== 'unknown') {
        return completionStatus === 'complete';
    }

    return input.interval === '1d'
        && input.timestamp + DAILY_INTERVAL_SECONDS <= input.asOf;
}

function normalizeValueToCandle(
    value: TwelveDataSuccessResponse['values'][number],
    input: GetCandlesInput,
): MarketCandle | null {
    const timestamp = input.interval === '1d'
        ? parseUtcDailyDate(value.datetime)
        : parseUtcIntradayDatetime(value.datetime);
    const open = parsePositiveProviderNumber(value.open);
    const high = parsePositiveProviderNumber(value.high);
    const low = parsePositiveProviderNumber(value.low);
    const close = parsePositiveProviderNumber(value.close);
    const volume = parseNonNegativeProviderNumber(value.volume);

    if (
        timestamp === null
        || open === null
        || high === null
        || low === null
        || close === null
        || volume === null
    ) {
        return null;
    }

    const isComplete = getIsCandleComplete({
        timestamp,
        interval: input.interval,
        asOf: input.to,
    });

    return {
        symbol: input.symbol,
        interval: input.interval,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        isComplete,
        session: input.interval === '1d'
            ? 'regular'
            : classifyUsEquitySession(timestamp).session,
    };
}

function normalizeCandles(
    response: TwelveDataSuccessResponse,
    input: GetCandlesInput,
    providerInterval: TwelveDataInterval,
): MarketCandle[] | null {
    if (
        response.meta.symbol !== input.symbol
        || response.meta.interval !== providerInterval
        || response.values.length === 0
    ) {
        return null;
    }

    const candles: MarketCandle[] = [];
    let previousTimestamp: number | null = null;

    for (const value of response.values) {
        const candle = normalizeValueToCandle(value, input);

        if (candle === null) {
            return null;
        }

        if (candle.timestamp < input.from || candle.timestamp >= input.to) {
            continue;
        }

        if (previousTimestamp !== null && candle.timestamp <= previousTimestamp) {
            return null;
        }

        previousTimestamp = candle.timestamp;
        candles.push(candle);
    }

    return candles;
}

function createAvailableSeries(
    input: GetCandlesInput,
    candles: MarketCandle[],
): CandleSeries {
    const minimumCompletedBars = input.minimumCompletedBars ?? 1;
    const completedBars = candles.filter((candle) => candle.isComplete).length;
    const hasSufficientHistory = completedBars >= minimumCompletedBars;

    return {
        symbol: input.symbol,
        interval: input.interval,
        candles,
        status: hasSufficientHistory ? 'available' : 'insufficient_history',
        provider: 'twelve-data',
        fetchedAt: new Date().toISOString(),
        timezone: 'America/New_York',
        includesExtendedHours: input.includeExtendedHours === true,
        ...(hasSufficientHistory ? {} : { errorCode: 'insufficient_history' as const }),
        metadata: {
            requestedFrom: input.from,
            requestedTo: input.to,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
    };
}

export function createTwelveDataHistoricalProvider(
    config: TwelveDataProviderConfig,
): HistoricalMarketDataProvider {
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const fetchImpl = config.fetchImpl ?? fetch;

    return {
        id: 'twelve-data',
        async getCandles(input: GetCandlesInput): Promise<CandleSeries> {
            if (config.apiKey.trim() === '') {
                return createUnavailableSeries(input, 'provider_not_configured');
            }

            const requestValidationError = validateRequest(input);
            const providerInterval = getTwelveDataInterval(input.interval);

            if (requestValidationError !== null || providerInterval === null) {
                return createUnavailableSeries(
                    input,
                    requestValidationError ?? 'unsupported_interval',
                );
            }

            const url = buildTimeSeriesUrl(baseUrl, input, providerInterval);
            let response: Response;

            try {
                response = await fetchImpl(url, {
                    headers: {
                        Authorization: `apikey ${config.apiKey}`,
                    },
                });
            } catch {
                return createProviderFailureSeries(input, 'provider_unavailable');
            }

            let payload: unknown;

            try {
                payload = await response.json();
            } catch {
                return createProviderFailureSeries(input, 'invalid_provider_response');
            }

            if (!response.ok) {
                if (isTwelveDataErrorResponse(payload)) {
                    sanitizeMessage(payload.message);
                }

                return createProviderFailureSeries(input, classifyHttpFailure(response.status));
            }

            if (isTwelveDataErrorResponse(payload)) {
                sanitizeMessage(payload.message);
                return createProviderFailureSeries(input, classifyProviderError(payload));
            }

            if (!isTwelveDataSuccessResponse(payload)) {
                return createProviderFailureSeries(input, 'invalid_provider_response');
            }

            const candles = normalizeCandles(payload, input, providerInterval);

            if (candles === null) {
                return createProviderFailureSeries(input, 'invalid_provider_response');
            }

            const validation = validateCandleSeries({
                candles,
                expectedSymbol: input.symbol,
                expectedInterval: input.interval,
                asOf: input.to,
                allowEmpty: false,
            });

            if (!validation.valid) {
                return createUnavailableSeries(input, 'invalid_candles');
            }

            return createAvailableSeries(input, candles);
        },
    };
}
