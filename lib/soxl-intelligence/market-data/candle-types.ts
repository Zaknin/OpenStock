export const CANDLE_SYMBOLS = ['SOXL', 'QQQ', 'SMH'] as const;

export type CandleSymbol = (typeof CANDLE_SYMBOLS)[number];

export const CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;

export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export type MarketSession =
    | 'premarket'
    | 'regular'
    | 'after_hours'
    | 'closed'
    | 'unknown';

export interface MarketCandle {
    symbol: CandleSymbol;
    interval: CandleInterval;

    /**
     * Unix timestamp in whole seconds representing the bar-open time.
     */
    timestamp: number;

    open: number;
    high: number;
    low: number;
    close: number;

    /**
     * Null means the provider did not supply volume.
     * Zero is a legitimate supplied value and must remain zero.
     */
    volume: number | null;

    isComplete: boolean;
    session: MarketSession;
}

export type CandleSeriesStatus =
    | 'available'
    | 'insufficient_history'
    | 'unavailable';

export type CandleSeriesErrorCode =
    | 'provider_not_configured'
    | 'provider_error'
    | 'invalid_response'
    | 'invalid_candles'
    | 'insufficient_history'
    | 'unsupported_interval'
    | 'entitlement_required';

export interface CandleSeries {
    symbol: CandleSymbol;
    interval: CandleInterval;
    candles: MarketCandle[];
    status: CandleSeriesStatus;

    provider: string;
    fetchedAt: string;

    timezone: 'America/New_York';
    includesExtendedHours: boolean;

    errorCode?: CandleSeriesErrorCode;

    metadata: {
        requestedFrom: number;
        requestedTo: number;
        providerLatency:
            | 'realtime'
            | 'delayed'
            | 'end_of_day'
            | 'unknown';
        entitlement:
            | 'confirmed'
            | 'unknown'
            | 'insufficient';
    };
}
