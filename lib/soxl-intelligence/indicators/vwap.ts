import type { MarketCandle } from '../market-data/candle-types';
import { prepareIndicatorCandles } from './prepare';
import type {
    IndicatorValue,
    SessionVolumeIndicatorInput,
    VolumeIndicatorIssue,
    VolumeIndicatorSeriesResult,
} from './types';

const REQUIRED_BARS = 1;
const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;

function isValidSessionBoundary(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function hasValidSessionWindow(input: SessionVolumeIndicatorInput): boolean {
    return (
        isValidSessionBoundary(input.sessionStart)
        && isValidSessionBoundary(input.sessionEnd)
        && input.sessionStart < input.sessionEnd
    );
}

function createEmptyLatest(
    status: IndicatorValue['status'],
    requiredBars: number,
    usedBars: number,
): IndicatorValue {
    return {
        value: null,
        timestamp: null,
        status,
        requiredBars,
        usedBars,
    };
}

function createUnavailableResult(
    status: 'insufficient_history' | 'invalid_input',
    issue: VolumeIndicatorIssue | undefined,
    requiredBars: number,
    usedBars: number,
    validationIssues: VolumeIndicatorSeriesResult['validationIssues'],
): VolumeIndicatorSeriesResult {
    return {
        values: [],
        latest: createEmptyLatest(status, requiredBars, usedBars),
        status,
        requiredBars,
        usedBars,
        validationIssues,
        ...(issue === undefined ? {} : { issue }),
    };
}

function getMatchingSessionCandles(
    candles: readonly MarketCandle[],
    input: SessionVolumeIndicatorInput,
): MarketCandle[] {
    return candles.filter((candle) => (
        candle.session === input.session
        && candle.timestamp >= input.sessionStart
        && candle.timestamp < input.sessionEnd
        && candle.timestamp <= input.asOf
    ));
}

export function calculateSessionVwapSeries(
    input: SessionVolumeIndicatorInput,
): VolumeIndicatorSeriesResult {
    if (input.expectedInterval === '1d') {
        return createUnavailableResult(
            'invalid_input',
            'unsupported_daily_interval',
            REQUIRED_BARS,
            0,
            [],
        );
    }

    if (!hasValidSessionWindow(input)) {
        return createUnavailableResult(
            'invalid_input',
            'invalid_session_window',
            REQUIRED_BARS,
            0,
            [],
        );
    }

    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: REQUIRED_BARS,
    });

    if (prepared.status === 'invalid_input') {
        return createUnavailableResult(
            'invalid_input',
            undefined,
            REQUIRED_BARS,
            0,
            prepared.validationIssues,
        );
    }

    const matchingCandles = getMatchingSessionCandles(prepared.candles, input);
    const usedBars = matchingCandles.length;

    if (usedBars === 0) {
        return createUnavailableResult(
            'insufficient_history',
            'no_matching_session_candles',
            REQUIRED_BARS,
            usedBars,
            [],
        );
    }

    const values: VolumeIndicatorSeriesResult['values'] = [];
    let cumulativePriceVolume = 0;
    let cumulativeVolume = 0;

    matchingCandles.forEach((candle) => {
        if (candle.volume === null) {
            return;
        }

        const typicalPrice = (candle.high + candle.low + candle.close) / 3;

        cumulativePriceVolume += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;

        if (cumulativeVolume > 0) {
            values.push({
                timestamp: candle.timestamp,
                value: cumulativePriceVolume / cumulativeVolume,
            });
        }
    });

    if (values.length === 0) {
        return createUnavailableResult(
            'insufficient_history',
            'zero_total_volume',
            REQUIRED_BARS,
            usedBars,
            [],
        );
    }

    const latestPoint = values[values.length - 1];

    return {
        values,
        latest: {
            value: latestPoint.value,
            timestamp: latestPoint.timestamp,
            status: 'available',
            requiredBars: REQUIRED_BARS,
            usedBars,
        },
        status: 'available',
        requiredBars: REQUIRED_BARS,
        usedBars,
        validationIssues: [],
    };
}

export function calculateLatestSessionVwap(
    input: SessionVolumeIndicatorInput,
): IndicatorValue {
    return calculateSessionVwapSeries(input).latest;
}
