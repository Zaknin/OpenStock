import type {
    CandleInterval,
    CandleSymbol,
    MarketCandle,
    MarketSession,
} from './candle-types';

const VALID_SESSIONS: readonly MarketSession[] = [
    'premarket',
    'regular',
    'after_hours',
    'closed',
    'unknown',
];

const MILLISECOND_TIMESTAMP_THRESHOLD = 10_000_000_000;

export type CandleValidationIssueCode =
    | 'invalid_as_of'
    | 'empty_series'
    | 'symbol_mismatch'
    | 'interval_mismatch'
    | 'invalid_timestamp'
    | 'timestamp_not_integer'
    | 'timestamp_unit_suspected'
    | 'future_timestamp'
    | 'duplicate_timestamp'
    | 'unsorted_timestamp'
    | 'invalid_open'
    | 'invalid_high'
    | 'invalid_low'
    | 'invalid_close'
    | 'invalid_ohlc_relationship'
    | 'invalid_volume'
    | 'invalid_completion_flag'
    | 'invalid_session';

export interface CandleValidationIssue {
    code: CandleValidationIssueCode;
    index: number | null;
    timestamp: number | null;
    message: string;
}

export interface ValidateCandleSeriesInput {
    candles: readonly MarketCandle[];
    expectedSymbol: CandleSymbol;
    expectedInterval: CandleInterval;

    /**
     * Unix seconds. Candles with bar-open timestamps after this boundary
     * are invalid.
     */
    asOf: number;

    allowEmpty?: boolean;
}

export interface CandleValidationResult {
    valid: boolean;
    issues: CandleValidationIssue[];
    completedCandles: MarketCandle[];
    incompleteCandles: MarketCandle[];
}

function getIssueTimestamp(timestamp: unknown): number | null {
    return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}

function createIssue(
    code: CandleValidationIssueCode,
    index: number | null,
    timestamp: unknown,
    message: string,
): CandleValidationIssue {
    return {
        code,
        index,
        timestamp: getIssueTimestamp(timestamp),
        message,
    };
}

function isPositiveFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidVolume(value: unknown): value is number | null {
    return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isValidUnixSecondBoundary(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MILLISECOND_TIMESTAMP_THRESHOLD
    );
}

function validatePriceField(
    issues: CandleValidationIssue[],
    code: CandleValidationIssueCode,
    fieldName: string,
    value: unknown,
    index: number,
    timestamp: unknown,
): void {
    if (!isPositiveFiniteNumber(value)) {
        issues.push(createIssue(code, index, timestamp, `${fieldName} must be a finite number greater than zero.`));
    }
}

function validateTimestamp(
    issues: CandleValidationIssue[],
    timestamp: unknown,
    index: number,
    asOf: number,
    hasValidAsOf: boolean,
): timestamp is number {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        issues.push(createIssue('invalid_timestamp', index, timestamp, 'Timestamp must be a finite positive Unix-second value.'));
        return false;
    }

    if (!Number.isInteger(timestamp)) {
        issues.push(createIssue('timestamp_not_integer', index, timestamp, 'Timestamp must be a whole Unix-second value.'));
    }

    if (timestamp > MILLISECOND_TIMESTAMP_THRESHOLD) {
        issues.push(createIssue('timestamp_unit_suspected', index, timestamp, 'Timestamp appears to be milliseconds instead of seconds.'));
    }

    if (hasValidAsOf && timestamp > asOf) {
        issues.push(createIssue('future_timestamp', index, timestamp, 'Timestamp is later than the validation boundary.'));
    }

    return true;
}

function validateAsOf(issues: CandleValidationIssue[], asOf: unknown): asOf is number {
    if (isValidUnixSecondBoundary(asOf)) {
        return true;
    }

    issues.push(createIssue('invalid_as_of', null, asOf, 'Validation boundary must be a finite positive whole Unix-second value.'));
    return false;
}

export function validateCandleSeries(input: ValidateCandleSeriesInput): CandleValidationResult {
    const issues: CandleValidationIssue[] = [];
    const completedCandles: MarketCandle[] = [];
    const incompleteCandles: MarketCandle[] = [];
    const seenTimestamps = new Set<number>();
    const hasValidAsOf = validateAsOf(issues, input.asOf);

    if (input.candles.length === 0 && input.allowEmpty !== true) {
        issues.push(createIssue('empty_series', null, null, 'Candle series must not be empty.'));
    }

    let previousTimestamp: number | null = null;

    input.candles.forEach((candle, index) => {
        if (candle.isComplete === true) {
            completedCandles.push(candle);
        } else if (candle.isComplete === false) {
            incompleteCandles.push(candle);
        }

        if (candle.symbol !== input.expectedSymbol) {
            issues.push(createIssue('symbol_mismatch', index, candle.timestamp, 'Candle symbol does not match the expected symbol.'));
        }

        if (candle.interval !== input.expectedInterval) {
            issues.push(createIssue('interval_mismatch', index, candle.timestamp, 'Candle interval does not match the expected interval.'));
        }

        if (validateTimestamp(issues, candle.timestamp, index, input.asOf, hasValidAsOf)) {
            if (seenTimestamps.has(candle.timestamp)) {
                issues.push(createIssue('duplicate_timestamp', index, candle.timestamp, 'Candle timestamp must be unique.'));
            }

            if (previousTimestamp !== null && candle.timestamp <= previousTimestamp) {
                issues.push(createIssue('unsorted_timestamp', index, candle.timestamp, 'Candles must be in strict ascending timestamp order.'));
            }

            seenTimestamps.add(candle.timestamp);
            previousTimestamp = candle.timestamp;
        }

        validatePriceField(issues, 'invalid_open', 'Open', candle.open, index, candle.timestamp);
        validatePriceField(issues, 'invalid_high', 'High', candle.high, index, candle.timestamp);
        validatePriceField(issues, 'invalid_low', 'Low', candle.low, index, candle.timestamp);
        validatePriceField(issues, 'invalid_close', 'Close', candle.close, index, candle.timestamp);

        if (
            isPositiveFiniteNumber(candle.open)
            && isPositiveFiniteNumber(candle.high)
            && isPositiveFiniteNumber(candle.low)
            && isPositiveFiniteNumber(candle.close)
            && (
                candle.high < candle.open
                || candle.high < candle.close
                || candle.low > candle.open
                || candle.low > candle.close
                || candle.high < candle.low
            )
        ) {
            issues.push(createIssue('invalid_ohlc_relationship', index, candle.timestamp, 'OHLC values have an invalid high, low, open, or close relationship.'));
        }

        if (!isValidVolume(candle.volume)) {
            issues.push(createIssue('invalid_volume', index, candle.timestamp, 'Volume must be null or a finite number greater than or equal to zero.'));
        }

        if (typeof candle.isComplete !== 'boolean') {
            issues.push(createIssue('invalid_completion_flag', index, candle.timestamp, 'Completion flag must be a boolean.'));
        }

        if (!VALID_SESSIONS.includes(candle.session)) {
            issues.push(createIssue('invalid_session', index, candle.timestamp, 'Session must be a recognized market session.'));
        }
    });

    return {
        valid: issues.length === 0,
        issues,
        completedCandles,
        incompleteCandles,
    };
}

export function getCompletedCandles(
    candles: readonly MarketCandle[],
    asOf: number,
): MarketCandle[] {
    return candles.filter((candle) => candle.isComplete === true && candle.timestamp <= asOf);
}
