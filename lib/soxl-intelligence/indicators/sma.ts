import type { MarketCandle } from '../market-data/candle-types';
import { prepareIndicatorCandles } from './prepare';
import type {
    IndicatorSeriesResult,
    IndicatorValue,
    MovingAverageInput,
} from './types';

export type { MovingAverageInput } from './types';

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

function calculateSmaPoints(candles: readonly MarketCandle[], period: number) {
    const values: IndicatorSeriesResult['values'] = [];
    let rollingSum = 0;

    candles.forEach((candle, index) => {
        rollingSum += candle.close;

        if (index >= period) {
            rollingSum -= candles[index - period].close;
        }

        if (index >= period - 1) {
            values.push({
                timestamp: candle.timestamp,
                value: rollingSum / period,
            });
        }
    });

    return values;
}

export function calculateSmaSeries(
    input: MovingAverageInput,
): IndicatorSeriesResult {
    if (!isValidPeriod(input.period)) {
        return createInvalidPeriodResult();
    }

    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: input.period,
    });

    if (prepared.status !== 'available') {
        return createUnavailableResult(
            prepared.status,
            input.period,
            prepared.usedBars,
            prepared.validationIssues,
        );
    }

    const values = calculateSmaPoints(prepared.candles, input.period);
    const latestPoint = values[values.length - 1];

    return {
        values,
        latest: {
            value: latestPoint.value,
            timestamp: latestPoint.timestamp,
            status: 'available',
            requiredBars: input.period,
            usedBars: prepared.usedBars,
        },
        status: 'available',
        requiredBars: input.period,
        usedBars: prepared.usedBars,
        validationIssues: [],
    };
}

export function calculateLatestSma(
    input: MovingAverageInput,
): IndicatorValue {
    return calculateSmaSeries(input).latest;
}
