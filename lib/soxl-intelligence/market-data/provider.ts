import type {
    CandleInterval,
    CandleSeries,
    CandleSymbol,
} from './candle-types';

export interface GetCandlesInput {
    symbol: CandleSymbol;
    interval: CandleInterval;

    /**
     * Inclusive Unix-second lower bound.
     */
    from: number;

    /**
     * Exclusive Unix-second upper bound and evaluation boundary.
     */
    to: number;

    includeExtendedHours?: boolean;
    minimumCompletedBars?: number;
}

export interface HistoricalMarketDataProvider {
    readonly id: string;

    getCandles(input: GetCandlesInput): Promise<CandleSeries>;
}
