import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSeriesStatus,
    CandleSymbol,
} from '../market-data/candle-types';
import type {
    SoxlMarketContextResult,
} from '../market-data/soxl-market-context';
import * as indicators from '../indicators';
import type {
    IndicatorSeriesResult,
    MacdSeriesResult,
    SwingDetectionResult,
} from '../indicators';

export type SoxlCoreIndicatorSeriesKey =
    | 'soxl5m'
    | 'soxl1d'
    | 'qqq5m'
    | 'smh5m';

export type SoxlCoreIndicatorStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlCoreIndicatorIssue =
    | 'indicator_calculation_failed';

interface SeriesDefinition {
    key: SoxlCoreIndicatorSeriesKey;
    symbol: CandleSymbol;
    interval: CandleInterval;
}

interface SourceSeriesMetadata {
    key: SoxlCoreIndicatorSeriesKey;
    symbol: CandleSymbol;
    interval: CandleInterval;
    status: SoxlCoreIndicatorStatus;
    sourceStatus: CandleSeriesStatus;
    sourceErrorCode: CandleSeriesErrorCode | null;
    issue: SoxlCoreIndicatorIssue | null;
    sourceCandleCount: number;
    completedCandleCount: number;
    latestCompletedTimestamp: number | null;
    latestCompletedClose: number | null;
}

export interface SoxlFiveMinuteIndicatorSnapshot extends SourceSeriesMetadata {
    key: 'soxl5m';
    symbol: 'SOXL';
    interval: '5m';
    ema9: IndicatorSeriesResult | null;
    ema20: IndicatorSeriesResult | null;
    ema50: IndicatorSeriesResult | null;
    rsi14: IndicatorSeriesResult | null;
    atr14: IndicatorSeriesResult | null;
    macd12269: MacdSeriesResult | null;
    swings333: SwingDetectionResult | null;
}

export interface SoxlDailyIndicatorSnapshot extends SourceSeriesMetadata {
    key: 'soxl1d';
    symbol: 'SOXL';
    interval: '1d';
    ema20: IndicatorSeriesResult | null;
    ema50: IndicatorSeriesResult | null;
    ema200: IndicatorSeriesResult | null;
    rsi14: IndicatorSeriesResult | null;
    atr14: IndicatorSeriesResult | null;
    macd12269: MacdSeriesResult | null;
    swings333: SwingDetectionResult | null;
}

export interface MarketFiveMinuteIndicatorSnapshot extends SourceSeriesMetadata {
    key: 'qqq5m' | 'smh5m';
    symbol: 'QQQ' | 'SMH';
    interval: '5m';
    ema20: IndicatorSeriesResult | null;
    ema50: IndicatorSeriesResult | null;
    rsi14: IndicatorSeriesResult | null;
    macd12269: MacdSeriesResult | null;
}

export interface SoxlCoreIndicatorSnapshot {
    status: SoxlCoreIndicatorStatus;
    asOf: number;
    providerId: string;
    series: Readonly<{
        soxl5m: SoxlFiveMinuteIndicatorSnapshot;
        soxl1d: SoxlDailyIndicatorSnapshot;
        qqq5m: MarketFiveMinuteIndicatorSnapshot;
        smh5m: MarketFiveMinuteIndicatorSnapshot;
    }>;
    availableSeries: readonly SoxlCoreIndicatorSeriesKey[];
    partialSeries: readonly SoxlCoreIndicatorSeriesKey[];
    unavailableSeries: readonly SoxlCoreIndicatorSeriesKey[];
}

const SERIES_DEFINITIONS: readonly SeriesDefinition[] = [
    { key: 'soxl5m', symbol: 'SOXL', interval: '5m' },
    { key: 'soxl1d', symbol: 'SOXL', interval: '1d' },
    { key: 'qqq5m', symbol: 'QQQ', interval: '5m' },
    { key: 'smh5m', symbol: 'SMH', interval: '5m' },
];

function getSourceMetadata(
    definition: SeriesDefinition,
    source: CandleSeries,
    issue: SoxlCoreIndicatorIssue | null = null,
): SourceSeriesMetadata {
    if (source.status !== 'available') {
        return {
            ...definition,
            status: 'unavailable',
            sourceStatus: source.status,
            sourceErrorCode: source.errorCode ?? null,
            issue,
            sourceCandleCount: 0,
            completedCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
        };
    }

    const completedCandles = source.candles.filter((candle) => candle.isComplete === true);
    const latestCompletedCandle = completedCandles.at(-1);

    return {
        ...definition,
        status: 'unavailable',
        sourceStatus: source.status,
        sourceErrorCode: null,
        issue,
        sourceCandleCount: source.candles.length,
        completedCandleCount: completedCandles.length,
        latestCompletedTimestamp: latestCompletedCandle?.timestamp ?? null,
        latestCompletedClose: latestCompletedCandle?.close ?? null,
    };
}

function getSeriesStatus(results: readonly { status: string }[]): SoxlCoreIndicatorStatus {
    const availableCount = results.filter((result) => result.status === 'available').length;

    if (availableCount === results.length) {
        return 'available';
    }

    if (availableCount > 0) {
        return 'partial';
    }

    return 'unavailable';
}

function buildPeriodInput(
    source: CandleSeries,
    context: SoxlMarketContextResult,
    period: number,
) {
    return {
        candles: source.candles,
        expectedSymbol: source.symbol,
        expectedInterval: source.interval,
        asOf: context.asOf,
        period,
    };
}

function buildMacdInput(
    source: CandleSeries,
    context: SoxlMarketContextResult,
) {
    return {
        candles: source.candles,
        expectedSymbol: source.symbol,
        expectedInterval: source.interval,
        asOf: context.asOf,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
    };
}

function buildSwingInput(
    source: CandleSeries,
    context: SoxlMarketContextResult,
) {
    return {
        candles: source.candles,
        expectedSymbol: source.symbol,
        expectedInterval: source.interval,
        asOf: context.asOf,
        leftBars: 3,
        rightBars: 3,
    };
}

function createUnavailableSoxlFiveMinute(
    metadata: SourceSeriesMetadata,
): SoxlFiveMinuteIndicatorSnapshot {
    return {
        ...metadata,
        key: 'soxl5m',
        symbol: 'SOXL',
        interval: '5m',
        status: 'unavailable',
        ema9: null,
        ema20: null,
        ema50: null,
        rsi14: null,
        atr14: null,
        macd12269: null,
        swings333: null,
    };
}

function createUnavailableSoxlDaily(
    metadata: SourceSeriesMetadata,
): SoxlDailyIndicatorSnapshot {
    return {
        ...metadata,
        key: 'soxl1d',
        symbol: 'SOXL',
        interval: '1d',
        status: 'unavailable',
        ema20: null,
        ema50: null,
        ema200: null,
        rsi14: null,
        atr14: null,
        macd12269: null,
        swings333: null,
    };
}

function createUnavailableMarketFiveMinute(
    metadata: SourceSeriesMetadata,
): MarketFiveMinuteIndicatorSnapshot {
    return {
        ...metadata,
        key: metadata.key === 'smh5m' ? 'smh5m' : 'qqq5m',
        symbol: metadata.symbol === 'SMH' ? 'SMH' : 'QQQ',
        interval: '5m',
        status: 'unavailable',
        ema20: null,
        ema50: null,
        rsi14: null,
        macd12269: null,
    };
}

function buildSoxlFiveMinuteSnapshot(
    context: SoxlMarketContextResult,
): SoxlFiveMinuteIndicatorSnapshot {
    const definition = SERIES_DEFINITIONS[0];
    const source = context.series.soxl5m;
    const metadata = getSourceMetadata(definition, source);

    if (source.status !== 'available') {
        return createUnavailableSoxlFiveMinute(metadata);
    }

    try {
        const ema9 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 9));
        const ema20 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 20));
        const ema50 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 50));
        const rsi14 = indicators.calculateRsiSeries(buildPeriodInput(source, context, 14));
        const atr14 = indicators.calculateAtrSeries(buildPeriodInput(source, context, 14));
        const macd12269 = indicators.calculateMacdSeries(buildMacdInput(source, context));
        const swings333 = indicators.detectConfirmedSwings(buildSwingInput(source, context));
        const status = getSeriesStatus([ema9, ema20, ema50, rsi14, atr14, macd12269, swings333]);

        return {
            ...metadata,
            key: 'soxl5m',
            symbol: 'SOXL',
            interval: '5m',
            status,
            ema9,
            ema20,
            ema50,
            rsi14,
            atr14,
            macd12269,
            swings333,
        };
    } catch {
        return createUnavailableSoxlFiveMinute(getSourceMetadata(
            definition,
            source,
            'indicator_calculation_failed',
        ));
    }
}

function buildSoxlDailySnapshot(
    context: SoxlMarketContextResult,
): SoxlDailyIndicatorSnapshot {
    const definition = SERIES_DEFINITIONS[1];
    const source = context.series.soxl1d;
    const metadata = getSourceMetadata(definition, source);

    if (source.status !== 'available') {
        return createUnavailableSoxlDaily(metadata);
    }

    try {
        const ema20 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 20));
        const ema50 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 50));
        const ema200 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 200));
        const rsi14 = indicators.calculateRsiSeries(buildPeriodInput(source, context, 14));
        const atr14 = indicators.calculateAtrSeries(buildPeriodInput(source, context, 14));
        const macd12269 = indicators.calculateMacdSeries(buildMacdInput(source, context));
        const swings333 = indicators.detectConfirmedSwings(buildSwingInput(source, context));
        const status = getSeriesStatus([ema20, ema50, ema200, rsi14, atr14, macd12269, swings333]);

        return {
            ...metadata,
            key: 'soxl1d',
            symbol: 'SOXL',
            interval: '1d',
            status,
            ema20,
            ema50,
            ema200,
            rsi14,
            atr14,
            macd12269,
            swings333,
        };
    } catch {
        return createUnavailableSoxlDaily(getSourceMetadata(
            definition,
            source,
            'indicator_calculation_failed',
        ));
    }
}

function buildMarketFiveMinuteSnapshot(
    context: SoxlMarketContextResult,
    definition: SeriesDefinition,
): MarketFiveMinuteIndicatorSnapshot {
    const source = context.series[definition.key];
    const metadata = getSourceMetadata(definition, source);

    if (source.status !== 'available') {
        return createUnavailableMarketFiveMinute(metadata);
    }

    try {
        const ema20 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 20));
        const ema50 = indicators.calculateEmaSeries(buildPeriodInput(source, context, 50));
        const rsi14 = indicators.calculateRsiSeries(buildPeriodInput(source, context, 14));
        const macd12269 = indicators.calculateMacdSeries(buildMacdInput(source, context));
        const status = getSeriesStatus([ema20, ema50, rsi14, macd12269]);

        return {
            ...metadata,
            key: definition.key === 'smh5m' ? 'smh5m' : 'qqq5m',
            symbol: definition.symbol === 'SMH' ? 'SMH' : 'QQQ',
            interval: '5m',
            status,
            ema20,
            ema50,
            rsi14,
            macd12269,
        };
    } catch {
        return createUnavailableMarketFiveMinute(getSourceMetadata(
            definition,
            source,
            'indicator_calculation_failed',
        ));
    }
}

function getAggregateStatus(
    series: readonly { status: SoxlCoreIndicatorStatus }[],
): SoxlCoreIndicatorStatus {
    if (series.every((item) => item.status === 'available')) {
        return 'available';
    }

    if (series.some((item) => item.status !== 'unavailable')) {
        return 'partial';
    }

    return 'unavailable';
}

export function buildSoxlCoreIndicatorSnapshot(
    context: SoxlMarketContextResult,
): SoxlCoreIndicatorSnapshot {
    const series = {
        soxl5m: buildSoxlFiveMinuteSnapshot(context),
        soxl1d: buildSoxlDailySnapshot(context),
        qqq5m: buildMarketFiveMinuteSnapshot(context, SERIES_DEFINITIONS[2]),
        smh5m: buildMarketFiveMinuteSnapshot(context, SERIES_DEFINITIONS[3]),
    };
    const orderedSeries = SERIES_DEFINITIONS.map((definition) => series[definition.key]);

    return {
        status: getAggregateStatus(orderedSeries),
        asOf: context.asOf,
        providerId: context.providerId,
        series,
        availableSeries: SERIES_DEFINITIONS
            .filter((definition) => series[definition.key].status === 'available')
            .map((definition) => definition.key),
        partialSeries: SERIES_DEFINITIONS
            .filter((definition) => series[definition.key].status === 'partial')
            .map((definition) => definition.key),
        unavailableSeries: SERIES_DEFINITIONS
            .filter((definition) => series[definition.key].status === 'unavailable')
            .map((definition) => definition.key),
    };
}
