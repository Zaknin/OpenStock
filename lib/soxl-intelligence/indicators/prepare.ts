import { getCompletedCandles, validateCandleSeries } from '../market-data/validation';
import type {
    PreparedIndicatorCandles,
    PrepareIndicatorCandlesInput,
} from './types';

function isValidMinimumCompletedBars(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

export function prepareIndicatorCandles(
    input: PrepareIndicatorCandlesInput,
): PreparedIndicatorCandles {
    const validation = validateCandleSeries({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        allowEmpty: false,
    });

    if (!isValidMinimumCompletedBars(input.minimumCompletedBars)) {
        return {
            status: 'invalid_input',
            candles: [],
            requiredBars: 0,
            usedBars: 0,
            validationIssues: validation.issues,
            preparationError: 'invalid_minimum_completed_bars',
        };
    }

    if (!validation.valid) {
        return {
            status: 'invalid_input',
            candles: [],
            requiredBars: input.minimumCompletedBars,
            usedBars: 0,
            validationIssues: validation.issues,
        };
    }

    const completedCandles = getCompletedCandles(validation.completedCandles, input.asOf);

    if (completedCandles.length < input.minimumCompletedBars) {
        return {
            status: 'insufficient_history',
            candles: completedCandles,
            requiredBars: input.minimumCompletedBars,
            usedBars: completedCandles.length,
            validationIssues: [],
        };
    }

    return {
        status: 'available',
        candles: completedCandles,
        requiredBars: input.minimumCompletedBars,
        usedBars: completedCandles.length,
        validationIssues: [],
    };
}
