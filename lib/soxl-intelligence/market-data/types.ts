export const MARKET_SNAPSHOT_SYMBOLS = ['SOXL', 'QQQ', 'SMH'] as const;

export type MarketSnapshotSymbol = (typeof MARKET_SNAPSHOT_SYMBOLS)[number];

export type MarketSnapshotStatus = 'available' | 'unavailable';

export type MarketSnapshotErrorCode =
    | 'missing_api_key'
    | 'provider_error'
    | 'missing_price'
    | 'invalid_response';

export interface FinnhubQuotePayload {
    c?: number;
    d?: number;
    dp?: number;
    h?: number;
    l?: number;
    o?: number;
    pc?: number;
    t?: number;
}

export interface MarketSnapshot {
    symbol: MarketSnapshotSymbol;
    label: string;
    price: number | null;
    change: number | null;
    changePercent: number | null;
    sessionOpen: number | null;
    sessionHigh: number | null;
    sessionLow: number | null;
    previousClose: number | null;
    providerTimestamp: number | null;
    fetchedAt: string;
    status: MarketSnapshotStatus;
    errorCode?: MarketSnapshotErrorCode;
}

export const MARKET_SNAPSHOT_LABELS: Record<MarketSnapshotSymbol, string> = {
    SOXL: 'Direxion Daily Semiconductor Bull 3X Shares',
    QQQ: 'Invesco QQQ Trust',
    SMH: 'VanEck Semiconductor ETF',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNullableFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toPositivePrice(value: unknown): number | null {
    const numberValue = toNullableFiniteNumber(value);
    return numberValue !== null && numberValue > 0 ? numberValue : null;
}

function toProviderTimestamp(value: unknown): number | null {
    const numberValue = toNullableFiniteNumber(value);
    return numberValue !== null && numberValue > 0 ? Math.trunc(numberValue) : null;
}

export function createUnavailableMarketSnapshot(
    symbol: MarketSnapshotSymbol,
    fetchedAt: string,
    errorCode: MarketSnapshotErrorCode,
): MarketSnapshot {
    return {
        symbol,
        label: MARKET_SNAPSHOT_LABELS[symbol],
        price: null,
        change: null,
        changePercent: null,
        sessionOpen: null,
        sessionHigh: null,
        sessionLow: null,
        previousClose: null,
        providerTimestamp: null,
        fetchedAt,
        status: 'unavailable',
        errorCode,
    };
}

export function normalizeMarketSnapshot(
    symbol: MarketSnapshotSymbol,
    payload: unknown,
    fetchedAt: string,
): MarketSnapshot {
    if (!isRecord(payload)) {
        return createUnavailableMarketSnapshot(symbol, fetchedAt, 'invalid_response');
    }

    const price = toPositivePrice(payload.c);

    if (price === null) {
        return {
            ...createUnavailableMarketSnapshot(symbol, fetchedAt, 'missing_price'),
            change: toNullableFiniteNumber(payload.d),
            changePercent: toNullableFiniteNumber(payload.dp),
            sessionOpen: toNullableFiniteNumber(payload.o),
            sessionHigh: toNullableFiniteNumber(payload.h),
            sessionLow: toNullableFiniteNumber(payload.l),
            previousClose: toNullableFiniteNumber(payload.pc),
            providerTimestamp: toProviderTimestamp(payload.t),
        };
    }

    return {
        symbol,
        label: MARKET_SNAPSHOT_LABELS[symbol],
        price,
        change: toNullableFiniteNumber(payload.d),
        changePercent: toNullableFiniteNumber(payload.dp),
        sessionOpen: toNullableFiniteNumber(payload.o),
        sessionHigh: toNullableFiniteNumber(payload.h),
        sessionLow: toNullableFiniteNumber(payload.l),
        previousClose: toNullableFiniteNumber(payload.pc),
        providerTimestamp: toProviderTimestamp(payload.t),
        fetchedAt,
        status: 'available',
    };
}
