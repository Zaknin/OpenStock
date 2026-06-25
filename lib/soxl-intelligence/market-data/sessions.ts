import type { CandleInterval, MarketSession } from './candle-types';

export const MARKET_TIMEZONE = 'America/New_York' as const;

export type SessionClassificationSource =
    | 'clock_only'
    | 'exchange_calendar';

export interface MarketSessionClassification {
    session: MarketSession;
    source: SessionClassificationSource;
}

export const INTRADAY_INTERVAL_SECONDS = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
} as const;

export type CandleCompletionStatus =
    | 'complete'
    | 'incomplete'
    | 'unknown';

const MAX_UNIX_SECOND_TIMESTAMP = 10_000_000_000;

const easternDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

function isValidUnixSecondTimestamp(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_TIMESTAMP
    );
}

function getEasternClockParts(timestamp: number): { weekday: string; hour: number; minute: number } | null {
    if (!isValidUnixSecondTimestamp(timestamp)) {
        return null;
    }

    const date = new Date(timestamp * 1000);

    if (!Number.isFinite(date.getTime())) {
        return null;
    }

    const parts = easternDateTimeFormatter.formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);

    if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
    }

    return {
        weekday,
        hour,
        minute,
    };
}

/**
 * Classifies the US equity session using only the New York weekday and clock time.
 * This does not recognize exchange holidays or early closes. A future
 * exchange-calendar implementation must override this clock-only classification.
 */
export function classifyUsEquitySession(
    timestamp: number,
): MarketSessionClassification {
    const clockParts = getEasternClockParts(timestamp);

    if (clockParts === null) {
        return {
            session: 'unknown',
            source: 'clock_only',
        };
    }

    if (clockParts.weekday === 'Sat' || clockParts.weekday === 'Sun') {
        return {
            session: 'closed',
            source: 'clock_only',
        };
    }

    const minutesAfterMidnight = clockParts.hour * 60 + clockParts.minute;

    if (minutesAfterMidnight < 4 * 60) {
        return {
            session: 'closed',
            source: 'clock_only',
        };
    }

    if (minutesAfterMidnight < 9 * 60 + 30) {
        return {
            session: 'premarket',
            source: 'clock_only',
        };
    }

    if (minutesAfterMidnight < 16 * 60) {
        return {
            session: 'regular',
            source: 'clock_only',
        };
    }

    if (minutesAfterMidnight < 20 * 60) {
        return {
            session: 'after_hours',
            source: 'clock_only',
        };
    }

    return {
        session: 'closed',
        source: 'clock_only',
    };
}

export function isIntradayInterval(
    interval: CandleInterval,
): interval is keyof typeof INTRADAY_INTERVAL_SECONDS {
    return interval in INTRADAY_INTERVAL_SECONDS;
}

export function getCandleCompletionStatus(input: {
    timestamp: number;
    interval: CandleInterval;
    asOf: number;
}): CandleCompletionStatus {
    if (!isValidUnixSecondTimestamp(input.timestamp) || !isValidUnixSecondTimestamp(input.asOf)) {
        return 'unknown';
    }

    if (input.asOf < input.timestamp) {
        return 'unknown';
    }

    if (!isIntradayInterval(input.interval)) {
        return 'unknown';
    }

    return input.timestamp + INTRADAY_INTERVAL_SECONDS[input.interval] <= input.asOf
        ? 'complete'
        : 'incomplete';
}
