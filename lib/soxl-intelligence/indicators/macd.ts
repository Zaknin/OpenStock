import { prepareIndicatorCandles } from './prepare';
import type {
    MacdInput,
    MacdPoint,
    MacdSeriesResult,
    MacdValue,
} from './types';

const DEFAULT_FAST_PERIOD = 12;
const DEFAULT_SLOW_PERIOD = 26;
const DEFAULT_SIGNAL_PERIOD = 9;

interface TimestampedValue {
    timestamp: number;
    value: number;
}

interface ResolvedMacdPeriods {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
    requiredBars: number;
}

function isValidPeriod(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
    );
}

function resolveMacdPeriods(input: MacdInput): ResolvedMacdPeriods | null {
    const fastPeriod = input.fastPeriod ?? DEFAULT_FAST_PERIOD;
    const slowPeriod = input.slowPeriod ?? DEFAULT_SLOW_PERIOD;
    const signalPeriod = input.signalPeriod ?? DEFAULT_SIGNAL_PERIOD;

    if (
        !isValidPeriod(fastPeriod)
        || !isValidPeriod(slowPeriod)
        || !isValidPeriod(signalPeriod)
        || fastPeriod >= slowPeriod
    ) {
        return null;
    }

    return {
        fastPeriod,
        slowPeriod,
        signalPeriod,
        requiredBars: slowPeriod + signalPeriod - 1,
    };
}

function createEmptyLatest(
    status: MacdValue['status'],
    requiredBars: number,
    usedBars: number,
): MacdValue {
    return {
        macd: null,
        signal: null,
        histogram: null,
        timestamp: null,
        status,
        requiredBars,
        usedBars,
    };
}

function createInvalidPeriodResult(): MacdSeriesResult {
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
    validationIssues: MacdSeriesResult['validationIssues'],
): MacdSeriesResult {
    return {
        values: [],
        latest: createEmptyLatest(status, requiredBars, usedBars),
        status,
        requiredBars,
        usedBars,
        validationIssues,
    };
}

function calculateSeedSma(points: readonly TimestampedValue[], period: number): number {
    let sum = 0;

    for (let index = 0; index < period; index += 1) {
        sum += points[index].value;
    }

    return sum / period;
}

function calculateEmaValues(
    points: readonly TimestampedValue[],
    period: number,
): TimestampedValue[] {
    const values: TimestampedValue[] = [];
    const multiplier = 2 / (period + 1);
    let previousEma = calculateSeedSma(points, period);

    values.push({
        timestamp: points[period - 1].timestamp,
        value: previousEma,
    });

    for (let index = period; index < points.length; index += 1) {
        previousEma = (points[index].value - previousEma) * multiplier + previousEma;

        values.push({
            timestamp: points[index].timestamp,
            value: previousEma,
        });
    }

    return values;
}

function buildMacdLine(
    closePoints: readonly TimestampedValue[],
    fastPeriod: number,
    slowPeriod: number,
): TimestampedValue[] {
    const fastEmaValues = calculateEmaValues(closePoints, fastPeriod);
    const slowEmaValues = calculateEmaValues(closePoints, slowPeriod);
    const fastByTimestamp = new Map(fastEmaValues.map((point) => [point.timestamp, point.value]));

    return slowEmaValues.flatMap((slowPoint) => {
        const fastValue = fastByTimestamp.get(slowPoint.timestamp);

        if (fastValue === undefined) {
            return [];
        }

        return [{
            timestamp: slowPoint.timestamp,
            value: fastValue - slowPoint.value,
        }];
    });
}

export function calculateMacdSeries(
    input: MacdInput,
): MacdSeriesResult {
    const periods = resolveMacdPeriods(input);

    if (periods === null) {
        return createInvalidPeriodResult();
    }

    const prepared = prepareIndicatorCandles({
        candles: input.candles,
        expectedSymbol: input.expectedSymbol,
        expectedInterval: input.expectedInterval,
        asOf: input.asOf,
        minimumCompletedBars: periods.requiredBars,
    });

    if (prepared.status !== 'available') {
        return createUnavailableResult(
            prepared.status,
            periods.requiredBars,
            prepared.usedBars,
            prepared.validationIssues,
        );
    }

    const closePoints = prepared.candles.map((candle) => ({
        timestamp: candle.timestamp,
        value: candle.close,
    }));
    const macdLine = buildMacdLine(closePoints, periods.fastPeriod, periods.slowPeriod);
    const signalLine = calculateEmaValues(macdLine, periods.signalPeriod);
    const macdByTimestamp = new Map(macdLine.map((point) => [point.timestamp, point.value]));
    const values: MacdPoint[] = signalLine.flatMap((signalPoint) => {
        const macd = macdByTimestamp.get(signalPoint.timestamp);

        if (macd === undefined) {
            return [];
        }

        return [{
            timestamp: signalPoint.timestamp,
            macd,
            signal: signalPoint.value,
            histogram: macd - signalPoint.value,
        }];
    });
    const latestPoint = values[values.length - 1];

    return {
        values,
        latest: {
            macd: latestPoint.macd,
            signal: latestPoint.signal,
            histogram: latestPoint.histogram,
            timestamp: latestPoint.timestamp,
            status: 'available',
            requiredBars: periods.requiredBars,
            usedBars: prepared.usedBars,
        },
        status: 'available',
        requiredBars: periods.requiredBars,
        usedBars: prepared.usedBars,
        validationIssues: [],
    };
}

export function calculateLatestMacd(
    input: MacdInput,
): MacdValue {
    return calculateMacdSeries(input).latest;
}
