import type {
    CandleInterval,
    CandleSeriesErrorCode,
    CandleSeriesStatus,
    CandleSymbol,
} from '../market-data/candle-types';
import type {
    IndicatorSeriesResult,
    IndicatorStatus,
    MacdSeriesResult,
    SwingDetectionIssue,
    SwingDetectionResult,
    SwingPoint,
} from '../indicators';
import type {
    MarketFiveMinuteIndicatorSnapshot,
    SoxlCoreIndicatorIssue,
    SoxlCoreIndicatorSeriesKey,
    SoxlCoreIndicatorSnapshot,
    SoxlCoreIndicatorStatus,
    SoxlDailyIndicatorSnapshot,
    SoxlFiveMinuteIndicatorSnapshot,
} from './soxl-core-indicators';

export type SoxlCoreIndicatorValueKind =
    | 'price'
    | 'rsi'
    | 'atr'
    | 'macd';

export interface SoxlCoreIndicatorValueView {
    key: string;
    label: string;
    kind: SoxlCoreIndicatorValueKind;
    status: IndicatorStatus | null;
    value: number | null;
}

export interface SoxlCoreIndicatorMacdView {
    macd: SoxlCoreIndicatorValueView;
    signal: SoxlCoreIndicatorValueView;
    histogram: SoxlCoreIndicatorValueView;
}

export interface SoxlCoreIndicatorSwingPointView {
    price: number;
    pivotTimestamp: number;
    confirmedAtTimestamp: number;
}

export interface SoxlCoreIndicatorSwingsView {
    status: IndicatorStatus | null;
    issue: SwingDetectionIssue | null;
    latestHigh: SoxlCoreIndicatorSwingPointView | null;
    latestLow: SoxlCoreIndicatorSwingPointView | null;
}

export interface SoxlCoreIndicatorSeriesView {
    key: SoxlCoreIndicatorSeriesKey;
    label: string;
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
    values: readonly SoxlCoreIndicatorValueView[];
    macd: SoxlCoreIndicatorMacdView | null;
    swings: SoxlCoreIndicatorSwingsView | null;
}

export interface SoxlCoreIndicatorView {
    status: SoxlCoreIndicatorStatus;
    providerId: string;
    asOf: number;
    availableCount: number;
    partialCount: number;
    unavailableCount: number;
    series: readonly SoxlCoreIndicatorSeriesView[];
}

const SERIES_LABELS: Record<SoxlCoreIndicatorSeriesKey, string> = {
    soxl5m: 'SOXL \u00b7 5 minute',
    soxl1d: 'SOXL \u00b7 Daily',
    qqq5m: 'QQQ \u00b7 5 minute',
    smh5m: 'SMH \u00b7 5 minute',
};

const ORDERED_SERIES_KEYS: readonly SoxlCoreIndicatorSeriesKey[] = [
    'soxl5m',
    'soxl1d',
    'qqq5m',
    'smh5m',
];

function getLatestValue(result: IndicatorSeriesResult | null): {
    status: IndicatorStatus | null;
    value: number | null;
} {
    if (!result) {
        return { status: null, value: null };
    }

    const latestPoint = result.values.at(-1);

    return {
        status: result.status,
        value: result.status === 'available' && latestPoint
            ? latestPoint.value
            : null,
    };
}

function buildValue(
    key: string,
    label: string,
    kind: SoxlCoreIndicatorValueKind,
    result: IndicatorSeriesResult | null,
): SoxlCoreIndicatorValueView {
    const latest = getLatestValue(result);

    return {
        key,
        label,
        kind,
        status: latest.status,
        value: latest.value,
    };
}

function buildMacd(
    result: MacdSeriesResult | null,
): SoxlCoreIndicatorMacdView | null {
    if (!result) {
        return null;
    }

    const latestPoint = result.values.at(-1);
    const macd = result.status === 'available' && latestPoint ? latestPoint.macd : null;
    const signal = result.status === 'available' && latestPoint ? latestPoint.signal : null;
    const histogram = result.status === 'available' && latestPoint ? latestPoint.histogram : null;

    return {
        macd: {
            key: 'macd12269.line',
            label: 'MACD line',
            kind: 'macd',
            status: result.status,
            value: macd,
        },
        signal: {
            key: 'macd12269.signal',
            label: 'MACD signal',
            kind: 'macd',
            status: result.status,
            value: signal,
        },
        histogram: {
            key: 'macd12269.histogram',
            label: 'MACD histogram',
            kind: 'macd',
            status: result.status,
            value: histogram,
        },
    };
}

function buildSwingPoint(point: SwingPoint | null): SoxlCoreIndicatorSwingPointView | null {
    if (!point) {
        return null;
    }

    return {
        price: point.price,
        pivotTimestamp: point.pivotTimestamp,
        confirmedAtTimestamp: point.confirmedAtTimestamp,
    };
}

function buildSwings(
    result: SwingDetectionResult | null,
): SoxlCoreIndicatorSwingsView | null {
    if (!result) {
        return null;
    }

    return {
        status: result.status,
        issue: result.issue ?? null,
        latestHigh: result.status === 'available'
            ? buildSwingPoint(result.latestHigh)
            : null,
        latestLow: result.status === 'available'
            ? buildSwingPoint(result.latestLow)
            : null,
    };
}

function buildSoxlFiveMinuteSeriesView(
    series: SoxlFiveMinuteIndicatorSnapshot,
): SoxlCoreIndicatorSeriesView {
    return {
        ...buildBaseSeriesView(series),
        values: [
            buildValue('ema9', 'EMA 9', 'price', series.ema9),
            buildValue('ema20', 'EMA 20', 'price', series.ema20),
            buildValue('ema50', 'EMA 50', 'price', series.ema50),
            buildValue('rsi14', 'RSI 14', 'rsi', series.rsi14),
            buildValue('atr14', 'ATR 14', 'atr', series.atr14),
        ],
        macd: buildMacd(series.macd12269),
        swings: buildSwings(series.swings333),
    };
}

function buildSoxlDailySeriesView(
    series: SoxlDailyIndicatorSnapshot,
): SoxlCoreIndicatorSeriesView {
    return {
        ...buildBaseSeriesView(series),
        values: [
            buildValue('ema20', 'EMA 20', 'price', series.ema20),
            buildValue('ema50', 'EMA 50', 'price', series.ema50),
            buildValue('ema200', 'EMA 200', 'price', series.ema200),
            buildValue('rsi14', 'RSI 14', 'rsi', series.rsi14),
            buildValue('atr14', 'ATR 14', 'atr', series.atr14),
        ],
        macd: buildMacd(series.macd12269),
        swings: buildSwings(series.swings333),
    };
}

function buildMarketFiveMinuteSeriesView(
    series: MarketFiveMinuteIndicatorSnapshot,
): SoxlCoreIndicatorSeriesView {
    return {
        ...buildBaseSeriesView(series),
        values: [
            buildValue('ema20', 'EMA 20', 'price', series.ema20),
            buildValue('ema50', 'EMA 50', 'price', series.ema50),
            buildValue('rsi14', 'RSI 14', 'rsi', series.rsi14),
        ],
        macd: buildMacd(series.macd12269),
        swings: null,
    };
}

function buildBaseSeriesView(
    series: SoxlFiveMinuteIndicatorSnapshot
        | SoxlDailyIndicatorSnapshot
        | MarketFiveMinuteIndicatorSnapshot,
): Omit<SoxlCoreIndicatorSeriesView, 'values' | 'macd' | 'swings'> {
    return {
        key: series.key,
        label: SERIES_LABELS[series.key],
        symbol: series.symbol,
        interval: series.interval,
        status: series.status,
        sourceStatus: series.sourceStatus,
        sourceErrorCode: series.sourceErrorCode,
        issue: series.issue,
        sourceCandleCount: series.sourceCandleCount,
        completedCandleCount: series.completedCandleCount,
        latestCompletedTimestamp: series.latestCompletedTimestamp,
        latestCompletedClose: series.latestCompletedClose,
    };
}

function buildSeriesView(
    snapshot: SoxlCoreIndicatorSnapshot,
    key: SoxlCoreIndicatorSeriesKey,
): SoxlCoreIndicatorSeriesView {
    if (key === 'soxl5m') {
        return buildSoxlFiveMinuteSeriesView(snapshot.series.soxl5m);
    }

    if (key === 'soxl1d') {
        return buildSoxlDailySeriesView(snapshot.series.soxl1d);
    }

    return buildMarketFiveMinuteSeriesView(snapshot.series[key]);
}

export function buildSoxlCoreIndicatorView(
    snapshot: SoxlCoreIndicatorSnapshot,
): SoxlCoreIndicatorView {
    return {
        status: snapshot.status,
        providerId: snapshot.providerId,
        asOf: snapshot.asOf,
        availableCount: snapshot.availableSeries.length,
        partialCount: snapshot.partialSeries.length,
        unavailableCount: snapshot.unavailableSeries.length,
        series: ORDERED_SERIES_KEYS.map((key) => buildSeriesView(snapshot, key)),
    };
}
