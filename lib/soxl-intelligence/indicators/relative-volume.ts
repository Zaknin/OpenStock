import type { MarketCandle } from '../market-data/candle-types';
import { prepareIndicatorCandles } from './prepare';
import type {
    IndicatorValue,
    RelativeVolumeInput,
    VolumeIndicatorIssue,
    VolumeIndicatorSeriesResult,
} from './types';

const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;

function isValidLookbackBars(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function isValidSessionBoundary(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function hasValidSessionWindow(input: RelativeVolumeInput): boolean {
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
    input: RelativeVolumeInput,
): MarketCandle[] {
    return candles.filter((candle) => (
        candle.session === input.session
        && candle.timestamp >= input.sessionStart
        && candle.timestamp < input.sessionEnd
        && candle.timestamp <= input.asOf
    ));
}

function getBaselineIssue(
    candles: readonly MarketCandle[],
    currentIndex: number,
    lookbackBars: number,
): VolumeIndicatorIssue | null {
    const current = candles[currentIndex];

    if (current.volume === null) {
        return 'missing_current_volume';
    }

    let baselineVolume = 0;

    for (let index = currentIndex - lookbackBars; index < currentIndex; index += 1) {
        const volume = candles[index].volume;

        if (volume === null) {
            return 'missing_baseline_volume';
        }

        baselineVolume += volume;
    }

    if (baselineVolume / lookbackBars === 0) {
        return 'zero_average_volume';
    }

    return null;
}

function calculateRelativeVolumeAt(
    candles: readonly MarketCandle[],
    currentIndex: number,
    lookbackBars: number,
): number | null {
    const current = candles[currentIndex];

    if (current.volume === null) {
        return null;
    }

    let baselineVolume = 0;

    for (let index = currentIndex - lookbackBars; index < currentIndex; index += 1) {
        const volume = candles[index].volume;

        if (volume === null) {
            return null;
        }

        baselineVolume += volume;
    }

    const averagePreviousVolume = baselineVolume / lookbackBars;

    if (averagePreviousVolume === 0) {
        return null;
    }

    return current.volume / averagePreviousVolume;
}

export function calculateRelativeVolumeSeries(
    input: RelativeVolumeInput,
): VolumeIndicatorSeriesResult {
    if (!isValidLookbackBars(input.lookbackBars)) {
        return createUnavailableResult(
            'invalid_input',
            'invalid_lookback',
            0,
            0,
            [],
        );
    }

    const requiredBars = input.lookbackBars + 1;

    if (input.expectedInterval === '1d') {
        return createUnavailableResult(
            'invalid_input',
            'unsupported_daily_interval',
            requiredBars,
            0,
            [],
        );
    }

    if (!hasValidSessionWindow(input)) {
        return createUnavailableResult(
            'invalid_input',
            'invalid_session_window',
            requiredBars,
            0,
            [],
        );
    }

    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: 1,
    });

    if (prepared.status === 'invalid_input') {
        return createUnavailableResult(
            'invalid_input',
            undefined,
            requiredBars,
            0,
            prepared.validationIssues,
        );
    }

    const matchingCandles = getMatchingSessionCandles(prepared.candles, input);
    const usedBars = matchingCandles.length;

    if (usedBars < requiredBars) {
        return createUnavailableResult(
            'insufficient_history',
            'insufficient_usable_volume',
            requiredBars,
            usedBars,
            [],
        );
    }

    const finalIndex = matchingCandles.length - 1;
    const finalIssue = getBaselineIssue(
        matchingCandles,
        finalIndex,
        input.lookbackBars,
    );

    if (finalIssue !== null) {
        return createUnavailableResult(
            'insufficient_history',
            finalIssue,
            requiredBars,
            usedBars,
            [],
        );
    }

    const values: VolumeIndicatorSeriesResult['values'] = [];

    for (let index = input.lookbackBars; index < matchingCandles.length; index += 1) {
        const value = calculateRelativeVolumeAt(
            matchingCandles,
            index,
            input.lookbackBars,
        );

        if (value !== null) {
            values.push({
                timestamp: matchingCandles[index].timestamp,
                value,
            });
        }
    }

    const latestPoint = values[values.length - 1];

    return {
        values,
        latest: {
            value: latestPoint.value,
            timestamp: latestPoint.timestamp,
            status: 'available',
            requiredBars,
            usedBars,
        },
        status: 'available',
        requiredBars,
        usedBars,
        validationIssues: [],
    };
}

export function calculateLatestRelativeVolume(
    input: RelativeVolumeInput,
): IndicatorValue {
    return calculateRelativeVolumeSeries(input).latest;
}
