import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSymbol,
} from '../candle-types';
import { loadSoxlMarketContext } from '../soxl-market-context';
import type {
    SoxlMarketContextResult,
    SoxlMarketSeriesKey,
} from '../soxl-market-context';
import { createTwelveDataHistoricalProvider } from '../providers/twelve-data';
import type { TwelveDataProviderConfig } from '../providers/twelve-data';
import type { HistoricalMarketDataProvider } from '../provider';

// Server-only module: import only from server code. It reads runtime configuration
// lazily and owns process-local cache state for the market-context load.

export interface TwelveDataRuntimeEnvironment {
    TWELVE_DATA_API_KEY?: string;
    TWELVE_DATA_BASE_URL?: string;
}

export interface SoxlMarketContextService {
    load(): Promise<SoxlMarketContextResult>;
}

export interface CreateSoxlMarketContextServiceOptions {
    environment?: TwelveDataRuntimeEnvironment;
    fetchImpl?: typeof fetch;

    /**
     * Returns Unix milliseconds.
     */
    clock?: () => number;

    cacheTtlMs?: number;
}

interface SeriesFailureDefinition {
    key: SoxlMarketSeriesKey;
    symbol: CandleSymbol;
    interval: CandleInterval;
    lookbackSeconds: number;
}

const DEFAULT_BASE_URL = 'https://api.twelvedata.com';
const DEFAULT_CACHE_TTL_MS = 60_000;
const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;
const DAY_SECONDS = 86_400;
const INTRADAY_LOOKBACK_SECONDS = 14 * DAY_SECONDS;
const DAILY_LOOKBACK_SECONDS = 550 * DAY_SECONDS;
const SYNTHETIC_FETCHED_AT = '1970-01-01T00:00:00.000Z';
const SERIES_FAILURE_DEFINITIONS: readonly SeriesFailureDefinition[] = [
    {
        key: 'soxl5m',
        symbol: 'SOXL',
        interval: '5m',
        lookbackSeconds: INTRADAY_LOOKBACK_SECONDS,
    },
    {
        key: 'soxl1d',
        symbol: 'SOXL',
        interval: '1d',
        lookbackSeconds: DAILY_LOOKBACK_SECONDS,
    },
    {
        key: 'qqq5m',
        symbol: 'QQQ',
        interval: '5m',
        lookbackSeconds: INTRADAY_LOOKBACK_SECONDS,
    },
    {
        key: 'smh5m',
        symbol: 'SMH',
        interval: '5m',
        lookbackSeconds: INTRADAY_LOOKBACK_SECONDS,
    },
];

let defaultService: SoxlMarketContextService | null = null;

function isValidCacheTtlMs(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function getAsOfFromClockValue(clockValueMs: unknown): number | null {
    if (
        typeof clockValueMs !== 'number'
        || !Number.isFinite(clockValueMs)
        || clockValueMs <= 0
        || !Number.isInteger(clockValueMs)
    ) {
        return null;
    }

    const asOf = Math.floor(clockValueMs / 1000);

    if (asOf <= 0 || asOf > MAX_UNIX_SECOND_BOUNDARY) {
        return null;
    }

    return asOf;
}

function createFailureSeries(
    providerId: string,
    definition: SeriesFailureDefinition,
    asOf: number,
    errorCode: CandleSeriesErrorCode,
): CandleSeries {
    return {
        symbol: definition.symbol,
        interval: definition.interval,
        candles: [],
        status: errorCode === 'insufficient_history' ? 'insufficient_history' : 'unavailable',
        provider: providerId,
        fetchedAt: SYNTHETIC_FETCHED_AT,
        timezone: 'America/New_York',
        includesExtendedHours: false,
        errorCode,
        metadata: {
            requestedFrom: asOf - definition.lookbackSeconds,
            requestedTo: asOf,
            providerLatency: 'unknown',
            entitlement: errorCode === 'entitlement_required' ? 'insufficient' : 'unknown',
        },
    };
}

function createUnavailableContext(
    providerId: string,
    asOf: number,
    errorCode: CandleSeriesErrorCode,
): SoxlMarketContextResult {
    const series = Object.fromEntries(SERIES_FAILURE_DEFINITIONS.map((definition) => [
        definition.key,
        createFailureSeries(providerId, definition, asOf, errorCode),
    ])) as Record<SoxlMarketSeriesKey, CandleSeries>;

    return {
        status: 'unavailable',
        asOf,
        providerId,
        series,
        availableSeries: [],
        unavailableSeries: SERIES_FAILURE_DEFINITIONS.map((definition) => definition.key),
    };
}

function createProviderConfig(
    environment: TwelveDataRuntimeEnvironment,
    fetchImpl: typeof fetch | undefined,
): TwelveDataProviderConfig | null {
    const apiKey = environment.TWELVE_DATA_API_KEY?.trim();

    if (apiKey === undefined || apiKey === '') {
        return null;
    }

    return {
        apiKey,
        baseUrl: environment.TWELVE_DATA_BASE_URL ?? DEFAULT_BASE_URL,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
    };
}

function getProcessEnvironment(): TwelveDataRuntimeEnvironment {
    return {
        TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
        TWELVE_DATA_BASE_URL: process.env.TWELVE_DATA_BASE_URL,
    };
}

export function createSoxlMarketContextService(
    options: CreateSoxlMarketContextServiceOptions = {},
): SoxlMarketContextService {
    const environment = options.environment ?? getProcessEnvironment();
    const clock = options.clock ?? Date.now;
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    let providerConfig: TwelveDataProviderConfig | null | undefined;
    let provider: HistoricalMarketDataProvider | null = null;
    let cachedResult: SoxlMarketContextResult | null = null;
    let expiresAtMs = 0;
    let inFlight: Promise<SoxlMarketContextResult> | null = null;

    function cacheResult(result: SoxlMarketContextResult, loadStartedAtMs: number): SoxlMarketContextResult {
        cachedResult = result;
        expiresAtMs = loadStartedAtMs + cacheTtlMs;

        return result;
    }

    function loadFresh(loadStartedAtMs: number, asOf: number): Promise<SoxlMarketContextResult> {
        if (!isValidCacheTtlMs(cacheTtlMs)) {
            return Promise.resolve(createUnavailableContext('twelve-data', asOf, 'invalid_response'));
        }

        providerConfig ??= createProviderConfig(environment, options.fetchImpl);

        if (providerConfig === null) {
            return Promise.resolve(cacheResult(
                createUnavailableContext('twelve-data', asOf, 'provider_not_configured'),
                loadStartedAtMs,
            ));
        }

        provider ??= createTwelveDataHistoricalProvider(providerConfig);

        return loadSoxlMarketContext({
            provider,
            asOf,
        }).catch(() => (
            createUnavailableContext('twelve-data', asOf, 'provider_error')
        )).then((result) => cacheResult(result, loadStartedAtMs));
    }

    return {
        async load(): Promise<SoxlMarketContextResult> {
            const loadStartedAtMs = clock();
            const asOf = getAsOfFromClockValue(loadStartedAtMs);

            if (asOf === null) {
                return createUnavailableContext('twelve-data', 0, 'invalid_response');
            }

            if (!isValidCacheTtlMs(cacheTtlMs)) {
                return createUnavailableContext('twelve-data', asOf, 'invalid_response');
            }

            if (cachedResult !== null && loadStartedAtMs < expiresAtMs) {
                return cachedResult;
            }

            if (inFlight !== null) {
                return inFlight;
            }

            inFlight = loadFresh(loadStartedAtMs, asOf).finally(() => {
                inFlight = null;
            });

            return inFlight;
        },
    };
}

export function loadServerSoxlMarketContext(): Promise<SoxlMarketContextResult> {
    defaultService ??= createSoxlMarketContextService({
        environment: getProcessEnvironment(),
    });

    return defaultService.load();
}
