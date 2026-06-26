import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSymbol,
} from './candle-types';
import type {
    GetCandlesInput,
    HistoricalMarketDataProvider,
} from './provider';

export type SoxlMarketSeriesKey =
    | 'soxl5m'
    | 'soxl1d'
    | 'qqq5m'
    | 'smh5m';

export type SoxlMarketContextStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export interface LoadSoxlMarketContextInput {
    provider: HistoricalMarketDataProvider;

    /**
     * Unix-second evaluation boundary.
     *
     * This value is passed as the exclusive `to` boundary for every
     * provider request.
     */
    asOf: number;
}

export interface SoxlMarketContextResult {
    status: SoxlMarketContextStatus;
    asOf: number;
    providerId: string;

    /**
     * Preserve the complete provider result for every requested series,
     * including structured failures.
     */
    series: Readonly<Record<SoxlMarketSeriesKey, CandleSeries>>;

    availableSeries: readonly SoxlMarketSeriesKey[];
    unavailableSeries: readonly SoxlMarketSeriesKey[];
}

interface SeriesRequestDefinition {
    key: SoxlMarketSeriesKey;
    symbol: CandleSymbol;
    interval: CandleInterval;
    lookbackSeconds: number;
}

const DAY_SECONDS = 86_400;
const INTRADAY_LOOKBACK_SECONDS = 14 * DAY_SECONDS;
const DAILY_LOOKBACK_SECONDS = 550 * DAY_SECONDS;
const MINIMUM_COMPLETED_BARS = 250;
const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;
const SYNTHETIC_FETCHED_AT = '1970-01-01T00:00:00.000Z';

const SERIES_REQUESTS: readonly SeriesRequestDefinition[] = [
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

function isValidAsOf(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function createRequest(
    definition: SeriesRequestDefinition,
    asOf: number,
): GetCandlesInput {
    return {
        symbol: definition.symbol,
        interval: definition.interval,
        from: asOf - definition.lookbackSeconds,
        to: asOf,
        includeExtendedHours: false,
        minimumCompletedBars: MINIMUM_COMPLETED_BARS,
    };
}

function createSyntheticSeries(
    providerId: string,
    request: GetCandlesInput,
    errorCode: CandleSeriesErrorCode,
): CandleSeries {
    return {
        symbol: request.symbol,
        interval: request.interval,
        candles: [],
        status: errorCode === 'insufficient_history' ? 'insufficient_history' : 'unavailable',
        provider: providerId,
        fetchedAt: SYNTHETIC_FETCHED_AT,
        timezone: 'America/New_York',
        includesExtendedHours: request.includeExtendedHours === true,
        errorCode,
        metadata: {
            requestedFrom: request.from,
            requestedTo: request.to,
            providerLatency: 'unknown',
            entitlement: 'unknown',
        },
    };
}

function getAggregateStatus(
    availableSeries: readonly SoxlMarketSeriesKey[],
): SoxlMarketContextStatus {
    if (availableSeries.length === SERIES_REQUESTS.length) {
        return 'available';
    }

    if (availableSeries.length > 0) {
        return 'partial';
    }

    return 'unavailable';
}

function buildResult(
    asOf: number,
    providerId: string,
    series: Record<SoxlMarketSeriesKey, CandleSeries>,
): SoxlMarketContextResult {
    const availableSeries = SERIES_REQUESTS
        .map((definition) => definition.key)
        .filter((key) => series[key].status === 'available');
    const unavailableSeries = SERIES_REQUESTS
        .map((definition) => definition.key)
        .filter((key) => series[key].status !== 'available');

    return {
        status: getAggregateStatus(availableSeries),
        asOf,
        providerId,
        series,
        availableSeries,
        unavailableSeries,
    };
}

export async function loadSoxlMarketContext(
    input: LoadSoxlMarketContextInput,
): Promise<SoxlMarketContextResult> {
    const requests = SERIES_REQUESTS.map((definition) => ({
        key: definition.key,
        request: createRequest(definition, input.asOf),
    }));

    if (!isValidAsOf(input.asOf)) {
        const series = Object.fromEntries(requests.map(({ key, request }) => [
            key,
            createSyntheticSeries(input.provider.id, request, 'invalid_response'),
        ])) as Record<SoxlMarketSeriesKey, CandleSeries>;

        return buildResult(input.asOf, input.provider.id, series);
    }

    const settledResults = await Promise.allSettled(
        requests.map(({ request }) => input.provider.getCandles(request)),
    );
    const seriesEntries = settledResults.map((settledResult, index) => {
        const { key, request } = requests[index];

        if (settledResult.status === 'fulfilled') {
            return [key, settledResult.value] as const;
        }

        return [
            key,
            createSyntheticSeries(input.provider.id, request, 'provider_error'),
        ] as const;
    });
    const series = Object.fromEntries(seriesEntries) as Record<SoxlMarketSeriesKey, CandleSeries>;

    return buildResult(input.asOf, input.provider.id, series);
}
