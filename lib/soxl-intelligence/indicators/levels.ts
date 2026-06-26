import type { MarketCandle, MarketSession } from '../market-data/candle-types';
import {
    INTRADAY_INTERVAL_SECONDS,
    isIntradayInterval,
} from '../market-data/sessions';
import { prepareIndicatorCandles } from './prepare';
import type {
    OpeningRangeLevelsInput,
    PremarketLevelsInput,
    PreviousDayLevelsInput,
    PriceLevelInput,
    PriceLevelIssue,
    PriceLevelStatus,
    PriceRangeLevel,
} from './types';

const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;

function isValidUnixSecondBoundary(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function hasValidWindow(input: PriceLevelInput): boolean {
    return (
        isValidUnixSecondBoundary(input.window.start)
        && isValidUnixSecondBoundary(input.window.end)
        && isValidUnixSecondBoundary(input.asOf)
        && input.window.start < input.window.end
    );
}

function isValidOpeningRangeMinutes(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function createUnavailableLevel(
    status: Exclude<PriceLevelStatus, 'available'>,
    input: PriceLevelInput,
    issue: PriceLevelIssue | undefined,
    usedBars: number,
    validationIssues: PriceRangeLevel['validationIssues'],
): PriceRangeLevel {
    return {
        high: null,
        low: null,
        highTimestamp: null,
        lowTimestamp: null,
        status,
        usedBars,
        window: input.window,
        validationIssues,
        ...(issue === undefined ? {} : { issue }),
    };
}

function getMatchingCandles(
    candles: readonly MarketCandle[],
    input: PriceLevelInput,
    session: MarketSession,
): MarketCandle[] {
    return candles.filter((candle) => (
        candle.session === session
        && candle.timestamp >= input.window.start
        && candle.timestamp < input.window.end
        && candle.timestamp <= input.asOf
    ));
}

function calculateRangeLevel(
    input: PriceLevelInput,
    session: MarketSession,
): PriceRangeLevel {
    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: 1,
    });

    if (prepared.status === 'invalid_input') {
        return createUnavailableLevel(
            'invalid_input',
            input,
            undefined,
            0,
            prepared.validationIssues,
        );
    }

    const matchingCandles = getMatchingCandles(prepared.candles, input, session);
    const usedBars = matchingCandles.length;

    if (usedBars === 0) {
        return createUnavailableLevel(
            'insufficient_history',
            input,
            'no_matching_candles',
            usedBars,
            [],
        );
    }

    let high = matchingCandles[0].high;
    let low = matchingCandles[0].low;
    let highTimestamp = matchingCandles[0].timestamp;
    let lowTimestamp = matchingCandles[0].timestamp;

    matchingCandles.forEach((candle) => {
        if (candle.high > high) {
            high = candle.high;
            highTimestamp = candle.timestamp;
        }

        if (candle.low < low) {
            low = candle.low;
            lowTimestamp = candle.timestamp;
        }
    });

    return {
        high,
        low,
        highTimestamp,
        lowTimestamp,
        status: 'available',
        usedBars,
        window: input.window,
        validationIssues: [],
    };
}

function validateSharedInput(input: PriceLevelInput): PriceRangeLevel | null {
    if (input.expectedInterval === '1d') {
        return createUnavailableLevel(
            'invalid_input',
            input,
            'unsupported_daily_interval',
            0,
            [],
        );
    }

    if (!hasValidWindow(input)) {
        return createUnavailableLevel(
            'invalid_input',
            input,
            'invalid_window',
            0,
            [],
        );
    }

    return null;
}

function validateCompletedWindow(input: PriceLevelInput): PriceRangeLevel | null {
    if (input.window.end > input.asOf) {
        return createUnavailableLevel(
            'insufficient_history',
            input,
            'window_not_completed',
            0,
            [],
        );
    }

    return null;
}

export function calculatePreviousDayLevels(
    input: PreviousDayLevelsInput,
): PriceRangeLevel {
    const sharedValidation = validateSharedInput(input);

    if (sharedValidation !== null) {
        return sharedValidation;
    }

    const completionValidation = validateCompletedWindow(input);

    if (completionValidation !== null) {
        return completionValidation;
    }

    return calculateRangeLevel(input, 'regular');
}

export function calculatePremarketLevels(
    input: PremarketLevelsInput,
): PriceRangeLevel {
    const sharedValidation = validateSharedInput(input);

    if (sharedValidation !== null) {
        return sharedValidation;
    }

    const completionValidation = validateCompletedWindow(input);

    if (completionValidation !== null) {
        return completionValidation;
    }

    return calculateRangeLevel(input, 'premarket');
}

export function calculateOpeningRangeLevels(
    input: OpeningRangeLevelsInput,
): PriceRangeLevel {
    const sharedValidation = validateSharedInput(input);

    if (sharedValidation !== null) {
        return sharedValidation;
    }

    if (
        !isValidOpeningRangeMinutes(input.openingRangeMinutes)
        || input.window.end - input.window.start !== input.openingRangeMinutes * 60
    ) {
        return createUnavailableLevel(
            'invalid_input',
            input,
            'invalid_window',
            0,
            [],
        );
    }

    if (
        isIntradayInterval(input.expectedInterval)
        && INTRADAY_INTERVAL_SECONDS[input.expectedInterval] > input.openingRangeMinutes * 60
    ) {
        return createUnavailableLevel(
            'invalid_input',
            input,
            'interval_exceeds_window',
            0,
            [],
        );
    }

    const completionValidation = validateCompletedWindow(input);

    if (completionValidation !== null) {
        return completionValidation;
    }

    return calculateRangeLevel(input, 'regular');
}
