import type { MarketCandle } from '../market-data/candle-types';
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

function calculateTrueRange(candle: MarketCandle, previousCandle: MarketCandle | null): number {
    if (previousCandle === null) {
        return candle.high - candle.low;
    }

    return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousCandle.close),
        Math.abs(candle.low - previousCandle.close),
    );
}

export function calculateAtrSeries(
    input: PeriodIndicatorInput,
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

    const trueRanges = prepared.candles.map((candle, index) => (
        calculateTrueRange(candle, prepared.candles[index - 1] ?? null)
    ));
    let previousAtr = 0;

    for (let index = 0; index < input.period; index += 1) {
        previousAtr += trueRanges[index];
    }

    previousAtr /= input.period;

    const values: IndicatorSeriesResult['values'] = [{
        timestamp: prepared.candles[input.period - 1].timestamp,
        value: previousAtr,
    }];

    for (let index = input.period; index < prepared.candles.length; index += 1) {
        previousAtr = ((previousAtr * (input.period - 1)) + trueRanges[index]) / input.period;

        values.push({
            timestamp: prepared.candles[index].timestamp,
            value: previousAtr,
        });
    }

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

export function calculateLatestAtr(
    input: PeriodIndicatorInput,
): IndicatorValue {
    return calculateAtrSeries(input).latest;
}
