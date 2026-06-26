import type {
    CandleSeriesErrorCode,
} from './candle-types';
import type {
    SoxlMarketContextResult,
    SoxlMarketContextStatus,
    SoxlMarketSeriesKey,
} from './soxl-market-context';

export interface SoxlMarketSeriesView {
    key: SoxlMarketSeriesKey;
    label: string;
    symbol: string;
    interval: string;
    status: 'available' | 'unavailable';
    candleCount: number;
    completedCandleCount: number;
    latestCompletedTimestamp: number | null;
    latestCompletedClose: number | null;
    errorCode: CandleSeriesErrorCode | null;
}

export interface SoxlMarketContextView {
    status: SoxlMarketContextStatus;
    providerId: string;
    asOf: number;
    availableCount: number;
    unavailableCount: number;
    series: readonly SoxlMarketSeriesView[];
}

interface SeriesPresentationDefinition {
    key: SoxlMarketSeriesKey;
    label: string;
    symbol: string;
    interval: string;
}

const SERIES_PRESENTATION: readonly SeriesPresentationDefinition[] = [
    {
        key: 'soxl5m',
        label: 'SOXL \u00b7 5 minute',
        symbol: 'SOXL',
        interval: '5m',
    },
    {
        key: 'soxl1d',
        label: 'SOXL \u00b7 Daily',
        symbol: 'SOXL',
        interval: '1d',
    },
    {
        key: 'qqq5m',
        label: 'QQQ \u00b7 5 minute',
        symbol: 'QQQ',
        interval: '5m',
    },
    {
        key: 'smh5m',
        label: 'SMH \u00b7 5 minute',
        symbol: 'SMH',
        interval: '5m',
    },
];

const etDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
});

const utcTradingDateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
});

export type MarketDataTimestampKind = 'aggregate' | 'intraday' | 'daily';

export function formatMarketDataTimestamp(
    timestamp: number | null,
    kind: MarketDataTimestampKind,
): string {
    if (timestamp === null) {
        return '\u2014';
    }

    const date = new Date(timestamp * 1000);

    if (Number.isNaN(date.getTime())) {
        return '\u2014';
    }

    if (kind === 'daily') {
        return `${utcTradingDateFormatter.format(date)} \u00b7 trading date`;
    }

    return `${etDateTimeFormatter.format(date)} ET`;
}

export function buildSoxlMarketContextView(
    context: SoxlMarketContextResult,
): SoxlMarketContextView {
    const series = SERIES_PRESENTATION.map((definition): SoxlMarketSeriesView => {
        const result = context.series[definition.key];

        if (result.status !== 'available') {
            return {
                ...definition,
                status: 'unavailable',
                candleCount: 0,
                completedCandleCount: 0,
                latestCompletedTimestamp: null,
                latestCompletedClose: null,
                errorCode: result.errorCode ?? null,
            };
        }

        const completedCandles = result.candles.filter((candle) => candle.isComplete === true);
        const latestCompletedCandle = completedCandles.at(-1);

        return {
            ...definition,
            status: 'available',
            candleCount: result.candles.length,
            completedCandleCount: completedCandles.length,
            latestCompletedTimestamp: latestCompletedCandle?.timestamp ?? null,
            latestCompletedClose: latestCompletedCandle?.close ?? null,
            errorCode: null,
        };
    });
    const availableCount = series.filter((item) => item.status === 'available').length;

    return {
        status: context.status,
        providerId: context.providerId,
        asOf: context.asOf,
        availableCount,
        unavailableCount: series.length - availableCount,
        series,
    };
}
