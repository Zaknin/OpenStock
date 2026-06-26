import type {
    CandleSeries,
    CandleSeriesErrorCode,
    MarketCandle,
} from '../market-data/candle-types';
import { MARKET_TIMEZONE } from '../market-data/sessions';
import type {
    SoxlMarketContextResult,
} from '../market-data/soxl-market-context';
import type {
    PriceLevelWindow,
} from '../indicators/types';

export type SoxlSessionWindowStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlSessionWindowIssue =
    | 'invalid_as_of'
    | 'source_unavailable'
    | 'no_completed_regular_candles'
    | 'previous_session_unavailable'
    | 'window_calculation_failed';

export type SoxlSessionDateRelation =
    | 'same_exchange_date'
    | 'prior_exchange_date';

export type UnixSecondWindow = PriceLevelWindow;

export interface SoxlSessionWindowPlan {
    status: SoxlSessionWindowStatus;
    asOf: number;
    exchangeTimeZone: typeof MARKET_TIMEZONE;

    latestTradingDate: string | null;
    previousTradingDate: string | null;
    latestDateRelation: SoxlSessionDateRelation | null;

    latestRegularSession: UnixSecondWindow | null;
    previousRegularSession: UnixSecondWindow | null;
    latestOpeningRange30m: UnixSecondWindow | null;

    latestRegularSessionCompleted: boolean;
    latestOpeningRange30mCompleted: boolean;

    sourceCandleCount: number;
    completedRegularCandleCount: number;

    sourceErrorCode: CandleSeriesErrorCode | null;
    issue: SoxlSessionWindowIssue | null;
}

const MAX_UNIX_SECOND_BOUNDARY = 10_000_000_000;
const REGULAR_SESSION_START_SECONDS = 9 * 3_600 + 30 * 60;
const REGULAR_SESSION_DURATION_SECONDS = 23_400;
const OPENING_RANGE_30M_SECONDS = 1_800;

const exchangeDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

interface ExchangeDateTimeParts {
    dateKey: string;
    secondsSinceMidnight: number;
}

interface SessionDateCandidate {
    tradingDate: string;
    anchorCandle: MarketCandle;
}

function isValidUnixSecond(value: unknown): value is number {
    return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && Number.isInteger(value)
        && value <= MAX_UNIX_SECOND_BOUNDARY
    );
}

function createUnavailablePlan(input: {
    asOf: number;
    sourceCandleCount: number;
    completedRegularCandleCount: number;
    sourceErrorCode: CandleSeriesErrorCode | null;
    issue: SoxlSessionWindowIssue;
}): SoxlSessionWindowPlan {
    return {
        status: 'unavailable',
        asOf: input.asOf,
        exchangeTimeZone: MARKET_TIMEZONE,
        latestTradingDate: null,
        previousTradingDate: null,
        latestDateRelation: null,
        latestRegularSession: null,
        previousRegularSession: null,
        latestOpeningRange30m: null,
        latestRegularSessionCompleted: false,
        latestOpeningRange30mCompleted: false,
        sourceCandleCount: input.sourceCandleCount,
        completedRegularCandleCount: input.completedRegularCandleCount,
        sourceErrorCode: input.sourceErrorCode,
        issue: input.issue,
    };
}

function getExchangeDateTimeParts(timestamp: number): ExchangeDateTimeParts | null {
    if (!isValidUnixSecond(timestamp)) {
        return null;
    }

    const parts = exchangeDateTimeFormatter.formatToParts(new Date(timestamp * 1_000));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const second = Number(parts.find((part) => part.type === 'second')?.value);

    if (
        year === undefined
        || month === undefined
        || day === undefined
        || !Number.isInteger(hour)
        || !Number.isInteger(minute)
        || !Number.isInteger(second)
    ) {
        return null;
    }

    return {
        dateKey: `${year}-${month}-${day}`,
        secondsSinceMidnight: hour * 3_600 + minute * 60 + second,
    };
}

function isEligibleCompletedRegularCandle(candle: MarketCandle, asOf: number): boolean {
    return (
        candle.isComplete === true
        && candle.session === 'regular'
        && candle.timestamp <= asOf
    );
}

function getRepresentedSessionDates(
    candles: readonly MarketCandle[],
): {
    latest: SessionDateCandidate;
    previous: SessionDateCandidate | null;
} | null {
    const representedDates: SessionDateCandidate[] = [];

    candles.forEach((candle) => {
        const parts = getExchangeDateTimeParts(candle.timestamp);

        if (parts === null) {
            return;
        }

        const latestCandidate = representedDates.at(-1);

        if (latestCandidate?.tradingDate === parts.dateKey) {
            latestCandidate.anchorCandle = candle;
            return;
        }

        representedDates.push({
            tradingDate: parts.dateKey,
            anchorCandle: candle,
        });
    });

    const latest = representedDates.at(-1);

    if (!latest) {
        return null;
    }

    return {
        latest,
        previous: representedDates.length > 1
            ? representedDates[representedDates.length - 2]
            : null,
    };
}

function buildRegularSessionWindow(anchorCandle: MarketCandle): UnixSecondWindow | null {
    const parts = getExchangeDateTimeParts(anchorCandle.timestamp);

    if (parts === null) {
        return null;
    }

    const start = anchorCandle.timestamp - (
        parts.secondsSinceMidnight - REGULAR_SESSION_START_SECONDS
    );
    const end = start + REGULAR_SESSION_DURATION_SECONDS;

    if (!isValidUnixSecond(start) || !isValidUnixSecond(end) || start >= end) {
        return null;
    }

    return { start, end };
}

function buildOpeningRangeWindow(session: UnixSecondWindow): UnixSecondWindow | null {
    const end = session.start + OPENING_RANGE_30M_SECONDS;

    if (!isValidUnixSecond(end) || session.start >= end) {
        return null;
    }

    return {
        start: session.start,
        end,
    };
}

function getLatestDateRelation(
    asOf: number,
    latestTradingDate: string,
): SoxlSessionDateRelation | null {
    const asOfParts = getExchangeDateTimeParts(asOf);

    if (asOfParts === null) {
        return null;
    }

    return asOfParts.dateKey === latestTradingDate
        ? 'same_exchange_date'
        : 'prior_exchange_date';
}

function getSourceErrorCode(source: CandleSeries): CandleSeriesErrorCode | null {
    return source.errorCode ?? null;
}

export function buildSoxlSessionWindowPlan(
    context: SoxlMarketContextResult,
): SoxlSessionWindowPlan {
    const { asOf } = context;

    if (!isValidUnixSecond(asOf)) {
        return createUnavailablePlan({
            asOf,
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            sourceErrorCode: null,
            issue: 'invalid_as_of',
        });
    }

    const source = context.series.soxl5m;

    if (source.status !== 'available') {
        return createUnavailablePlan({
            asOf,
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            sourceErrorCode: getSourceErrorCode(source),
            issue: 'source_unavailable',
        });
    }

    const eligibleCandles = source.candles.filter((candle) => (
        isEligibleCompletedRegularCandle(candle, asOf)
    ));
    const sourceCandleCount = source.candles.length;
    const completedRegularCandleCount = eligibleCandles.length;

    if (eligibleCandles.length === 0) {
        return createUnavailablePlan({
            asOf,
            sourceCandleCount,
            completedRegularCandleCount,
            sourceErrorCode: null,
            issue: 'no_completed_regular_candles',
        });
    }

    try {
        const representedDates = getRepresentedSessionDates(eligibleCandles);

        if (representedDates === null) {
            return createUnavailablePlan({
                asOf,
                sourceCandleCount,
                completedRegularCandleCount,
                sourceErrorCode: null,
                issue: 'no_completed_regular_candles',
            });
        }

        const latestRegularSession = buildRegularSessionWindow(
            representedDates.latest.anchorCandle,
        );
        const latestOpeningRange30m = latestRegularSession === null
            ? null
            : buildOpeningRangeWindow(latestRegularSession);
        const previousRegularSession = representedDates.previous === null
            ? null
            : buildRegularSessionWindow(representedDates.previous.anchorCandle);
        const latestDateRelation = getLatestDateRelation(
            asOf,
            representedDates.latest.tradingDate,
        );

        if (
            latestRegularSession === null
            || latestOpeningRange30m === null
            || latestDateRelation === null
            || (
                representedDates.previous !== null
                && previousRegularSession === null
            )
        ) {
            return createUnavailablePlan({
                asOf,
                sourceCandleCount,
                completedRegularCandleCount,
                sourceErrorCode: null,
                issue: 'window_calculation_failed',
            });
        }

        if (representedDates.previous === null) {
            return {
                status: 'partial',
                asOf,
                exchangeTimeZone: MARKET_TIMEZONE,
                latestTradingDate: representedDates.latest.tradingDate,
                previousTradingDate: null,
                latestDateRelation,
                latestRegularSession,
                previousRegularSession: null,
                latestOpeningRange30m,
                latestRegularSessionCompleted: latestRegularSession.end <= asOf,
                latestOpeningRange30mCompleted: latestOpeningRange30m.end <= asOf,
                sourceCandleCount,
                completedRegularCandleCount,
                sourceErrorCode: null,
                issue: 'previous_session_unavailable',
            };
        }

        return {
            status: 'available',
            asOf,
            exchangeTimeZone: MARKET_TIMEZONE,
            latestTradingDate: representedDates.latest.tradingDate,
            previousTradingDate: representedDates.previous.tradingDate,
            latestDateRelation,
            latestRegularSession,
            previousRegularSession,
            latestOpeningRange30m,
            latestRegularSessionCompleted: latestRegularSession.end <= asOf,
            latestOpeningRange30mCompleted: latestOpeningRange30m.end <= asOf,
            sourceCandleCount,
            completedRegularCandleCount,
            sourceErrorCode: null,
            issue: null,
        };
    } catch {
        return createUnavailablePlan({
            asOf,
            sourceCandleCount,
            completedRegularCandleCount,
            sourceErrorCode: null,
            issue: 'window_calculation_failed',
        });
    }
}
