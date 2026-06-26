import type { MarketCandle } from '../market-data/candle-types';
import { prepareIndicatorCandles } from './prepare';
import type {
    IndicatorSeriesResult,
    IndicatorValue,
    MovingAverageInput,
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

function calculateInitialSma(candles: readonly MarketCandle[], period: number): number {
    let sum = 0;

    for (let index = 0; index < period; index += 1) {
        sum += candles[index].close;
    }

    return sum / period;
}

function calculateEmaPoints(candles: readonly MarketCandle[], period: number) {
    const values: IndicatorSeriesResult['values'] = [];
    const multiplier = 2 / (period + 1);
    let previousEma = calculateInitialSma(candles, period);

    values.push({
        timestamp: candles[period - 1].timestamp,
        value: previousEma,
    });

    for (let index = period; index < candles.length; index += 1) {
        previousEma = (candles[index].close - previousEma) * multiplier + previousEma;

        values.push({
            timestamp: candles[index].timestamp,
            value: previousEma,
        });
    }

    return values;
}

export function calculateEmaSeries(
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

    const values = calculateEmaPoints(prepared.candles, input.period);
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

export function calculateLatestEma(
    input: MovingAverageInput,
): IndicatorValue {
    return calculateEmaSeries(input).latest;
}
