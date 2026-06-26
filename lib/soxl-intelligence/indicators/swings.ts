import type { MarketCandle } from '../market-data/candle-types';
import { prepareIndicatorCandles } from './prepare';
import type {
    SwingDetectionInput,
    SwingDetectionIssue,
    SwingDetectionResult,
    SwingPoint,
} from './types';

function isValidBarCount(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function createUnavailableResult(
    status: 'invalid_input' | 'insufficient_history',
    requiredBars: number,
    usedBars: number,
    validationIssues: SwingDetectionResult['validationIssues'],
    issue?: SwingDetectionIssue,
): SwingDetectionResult {
    return {
        status,
        swings: [],
        latestHigh: null,
        latestLow: null,
        requiredBars,
        usedBars,
        validationIssues,
        ...(issue === undefined ? {} : { issue }),
    };
}

function isSwingHigh(
    candles: readonly MarketCandle[],
    candidateIndex: number,
    leftBars: number,
    rightBars: number,
): boolean {
    const candidateHigh = candles[candidateIndex].high;

    for (let index = candidateIndex - leftBars; index < candidateIndex; index += 1) {
        if (candidateHigh <= candles[index].high) {
            return false;
        }
    }

    for (let index = candidateIndex + 1; index <= candidateIndex + rightBars; index += 1) {
        if (candidateHigh < candles[index].high) {
            return false;
        }
    }

    return true;
}

function isSwingLow(
    candles: readonly MarketCandle[],
    candidateIndex: number,
    leftBars: number,
    rightBars: number,
): boolean {
    const candidateLow = candles[candidateIndex].low;

    for (let index = candidateIndex - leftBars; index < candidateIndex; index += 1) {
        if (candidateLow >= candles[index].low) {
            return false;
        }
    }

    for (let index = candidateIndex + 1; index <= candidateIndex + rightBars; index += 1) {
        if (candidateLow > candles[index].low) {
            return false;
        }
    }

    return true;
}

function createSwingPoint(
    candles: readonly MarketCandle[],
    candidateIndex: number,
    rightBars: number,
    type: SwingPoint['type'],
): SwingPoint {
    const candidate = candles[candidateIndex];
    const confirmedAtIndex = candidateIndex + rightBars;

    return {
        type,
        price: type === 'high' ? candidate.high : candidate.low,
        pivotTimestamp: candidate.timestamp,
        confirmedAtTimestamp: candles[confirmedAtIndex].timestamp,
        pivotIndex: candidateIndex,
        confirmedAtIndex,
    };
}

export function detectConfirmedSwings(
    input: SwingDetectionInput,
): SwingDetectionResult {
    if (!isValidBarCount(input.leftBars)) {
        return createUnavailableResult(
            'invalid_input',
            0,
            0,
            [],
            'invalid_left_bars',
        );
    }

    if (!isValidBarCount(input.rightBars)) {
        return createUnavailableResult(
            'invalid_input',
            0,
            0,
            [],
            'invalid_right_bars',
        );
    }

    const requiredBars = input.leftBars + 1 + input.rightBars;
    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: requiredBars,
    });

    if (prepared.status === 'invalid_input') {
        return createUnavailableResult(
            'invalid_input',
            requiredBars,
            0,
            prepared.validationIssues,
        );
    }

    if (prepared.status === 'insufficient_history') {
        return createUnavailableResult(
            'insufficient_history',
            requiredBars,
            prepared.usedBars,
            [],
            'insufficient_confirmation_history',
        );
    }

    const swings: SwingPoint[] = [];

    for (
        let candidateIndex = input.leftBars;
        candidateIndex + input.rightBars < prepared.candles.length;
        candidateIndex += 1
    ) {
        if (isSwingHigh(prepared.candles, candidateIndex, input.leftBars, input.rightBars)) {
            swings.push(createSwingPoint(
                prepared.candles,
                candidateIndex,
                input.rightBars,
                'high',
            ));
        }

        if (isSwingLow(prepared.candles, candidateIndex, input.leftBars, input.rightBars)) {
            swings.push(createSwingPoint(
                prepared.candles,
                candidateIndex,
                input.rightBars,
                'low',
            ));
        }
    }

    const latestHigh = swings
        .filter((swing) => swing.type === 'high')
        .at(-1) ?? null;
    const latestLow = swings
        .filter((swing) => swing.type === 'low')
        .at(-1) ?? null;

    return {
        status: 'available',
        swings,
        latestHigh,
        latestLow,
        requiredBars,
        usedBars: prepared.usedBars,
        validationIssues: [],
    };
}
