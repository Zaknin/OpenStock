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

export type PriceLevelStatus =
    | 'available'
    | 'insufficient_history'
    | 'invalid_input';

export type PriceLevelIssue =
    | 'invalid_window'
    | 'window_not_completed'
    | 'unsupported_daily_interval'
    | 'interval_exceeds_window'
    | 'no_matching_candles';

export interface PriceLevelWindow {
    /**
     * Inclusive Unix-second boundary.
     */
    start: number;

    /**
     * Exclusive Unix-second boundary.
     */
    end: number;
}

export interface PriceLevelInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;
    window: PriceLevelWindow;
}

export interface PriceRangeLevel {
    high: number | null;
    low: number | null;
    highTimestamp: number | null;
    lowTimestamp: number | null;
    status: PriceLevelStatus;
    usedBars: number;
    window: PriceLevelWindow;
    issue?: PriceLevelIssue;
    validationIssues: CandleValidationIssue[];
}

export type PreviousDayLevelsInput = PriceLevelInput;

export type PremarketLevelsInput = PriceLevelInput;

export interface OpeningRangeLevelsInput extends PriceLevelInput {
    openingRangeMinutes: number;
}

export type SwingType =
    | 'high'
    | 'low';

export type SwingDetectionIssue =
    | 'invalid_left_bars'
    | 'invalid_right_bars'
    | 'insufficient_confirmation_history';

export interface SwingDetectionInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;
    asOf: number;

    /**
     * Number of completed candles required before the candidate pivot.
     */
    leftBars: number;

    /**
     * Number of completed candles required after the candidate pivot
     * before it becomes confirmed.
     */
    rightBars: number;
}

export interface SwingPoint {
    type: SwingType;
    price: number;

    /**
     * Timestamp of the candle where the pivot occurred.
     */
    pivotTimestamp: number;

    /**
     * Timestamp of the final right-side candle that confirmed the pivot.
     * The swing must not be exposed before this timestamp.
     */
    confirmedAtTimestamp: number;

    pivotIndex: number;
    confirmedAtIndex: number;
}

export interface SwingDetectionResult {
    status: IndicatorStatus;
    swings: SwingPoint[];
    latestHigh: SwingPoint | null;
    latestLow: SwingPoint | null;
    requiredBars: number;
    usedBars: number;
    issue?: SwingDetectionIssue;
    validationIssues: CandleValidationIssue[];
}
