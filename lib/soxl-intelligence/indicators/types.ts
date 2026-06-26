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

export interface PeriodIndicatorInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;
    period: number;
}

export interface MacdInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
}

export interface MacdPoint {
    timestamp: number;
    macd: number;
    signal: number;
    histogram: number;
}

export interface MacdValue {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
    timestamp: number | null;
    status: IndicatorStatus;
    requiredBars: number;
    usedBars: number;
}

export interface MacdSeriesResult {
    values: MacdPoint[];
    latest: MacdValue;
    status: IndicatorStatus;
    requiredBars: number;
    usedBars: number;
    validationIssues: CandleValidationIssue[];
}

export type IntradayIndicatorSession =
    | 'premarket'
    | 'regular'
    | 'after_hours';

export interface SessionVolumeIndicatorInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;

    session: IntradayIndicatorSession;

    /**
     * Inclusive Unix-second session-window boundary.
     */
    sessionStart: number;

    /**
     * Exclusive Unix-second session-window boundary.
     */
    sessionEnd: number;
}

export interface RelativeVolumeInput
    extends SessionVolumeIndicatorInput {
    lookbackBars: number;
}

export type VolumeIndicatorIssue =
    | 'invalid_session_window'
    | 'unsupported_daily_interval'
    | 'no_matching_session_candles'
    | 'insufficient_usable_volume'
    | 'missing_current_volume'
    | 'missing_baseline_volume'
    | 'zero_total_volume'
    | 'zero_average_volume'
    | 'invalid_lookback';

export interface VolumeIndicatorSeriesResult
    extends IndicatorSeriesResult {
    issue?: VolumeIndicatorIssue;
}
