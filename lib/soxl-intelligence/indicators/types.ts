import type {
    CandleInterval,
    CandleSymbol,
    MarketCandle,
} from '../market-data/candle-types';
import type {
    CandleValidationIssue,
} from '../market-data/validation';

export type IndicatorStatus =
    | 'available'
    | 'insufficient_history'
    | 'invalid_input';

export interface IndicatorPoint {
    timestamp: number;
    value: number;
}

export interface IndicatorValue {
    value: number | null;
    timestamp: number | null;
    status: IndicatorStatus;
    requiredBars: number;
    usedBars: number;
}

export interface IndicatorSeriesResult {
    values: IndicatorPoint[];
    latest: IndicatorValue;
    status: IndicatorStatus;
    requiredBars: number;
    usedBars: number;
    validationIssues: CandleValidationIssue[];
}

export interface PrepareIndicatorCandlesInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;
    minimumCompletedBars: number;
}

export type IndicatorPreparationError =
    | 'invalid_minimum_completed_bars';

export interface PreparedIndicatorCandles {
    status: IndicatorStatus;
    candles: MarketCandle[];
    requiredBars: number;
    usedBars: number;
    validationIssues: CandleValidationIssue[];
    preparationError?: IndicatorPreparationError;
}

export interface MovingAverageInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;
    period: number;
}
