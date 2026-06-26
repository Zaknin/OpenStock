import { prepareIndicatorCandles } from './prepare';
import type {
    IndicatorSeriesResult,
    IndicatorValue,
    PeriodIndicatorInput,
} from './types';

function isValidPeriod(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
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

function createInvalidPeriodResult(): IndicatorSeriesResult {
    return {
        values: [],
        latest: createEmptyLatest('invalid_input', 0, 0),
        status: 'invalid_input',
        requiredBars: 0,
        usedBars: 0,
        validationIssues: [],
    };
}

function createUnavailableResult(
    status: 'insufficient_history' | 'invalid_input',
    requiredBars: number,
    usedBars: number,
    validationIssues: IndicatorSeriesResult['validationIssues'],
): IndicatorSeriesResult {
    return {
        values: [],
        latest: createEmptyLatest(status, requiredBars, usedBars),
        status,
        requiredBars,
        usedBars,
        validationIssues,
    };
}

function calculateRsiValue(averageGain: number, averageLoss: number): number {
    if (averageGain === 0 && averageLoss === 0) {
        return 50;
    }

    if (averageLoss === 0) {
        return 100;
    }

    if (averageGain === 0) {
        return 0;
    }

    const relativeStrength = averageGain / averageLoss;
    const rsi = 100 - 100 / (1 + relativeStrength);

    return Math.max(0, Math.min(100, rsi));
}

export function calculateRsiSeries(
    input: PeriodIndicatorInput,
): IndicatorSeriesResult {
    if (!isValidPeriod(input.period)) {
        return createInvalidPeriodResult();
    }

    const requiredBars = input.period + 1;
    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: requiredBars,
    });

    if (prepared.status !== 'available') {
        return createUnavailableResult(
            prepared.status,
            requiredBars,
            prepared.usedBars,
            prepared.validationIssues,
        );
    }

    let averageGain = 0;
    let averageLoss = 0;

    for (let index = 1; index <= input.period; index += 1) {
        const change = prepared.candles[index].close - prepared.candles[index - 1].close;
        averageGain += Math.max(change, 0);
        averageLoss += Math.max(-change, 0);
    }

    averageGain /= input.period;
    averageLoss /= input.period;

    const values: IndicatorSeriesResult['values'] = [{
        timestamp: prepared.candles[input.period].timestamp,
        value: calculateRsiValue(averageGain, averageLoss),
    }];

    for (let index = input.period + 1; index < prepared.candles.length; index += 1) {
        const change = prepared.candles[index].close - prepared.candles[index - 1].close;
        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);

        averageGain = ((averageGain * (input.period - 1)) + gain) / input.period;
        averageLoss = ((averageLoss * (input.period - 1)) + loss) / input.period;

        values.push({
            timestamp: prepared.candles[index].timestamp,
            value: calculateRsiValue(averageGain, averageLoss),
        });
    }

    const latestPoint = values[values.length - 1];

    return {
        values,
        latest: {
            value: latestPoint.value,
            timestamp: latestPoint.timestamp,
            status: 'available',
            requiredBars,
            usedBars: prepared.usedBars,
        },
        status: 'available',
        requiredBars,
        usedBars: prepared.usedBars,
        validationIssues: [],
    };
}

export function calculateLatestRsi(
    input: PeriodIndicatorInput,
): IndicatorValue {
    return calculateRsiSeries(input).latest;
}
