import 'server-only';

import {
    MARKET_SNAPSHOT_SYMBOLS,
    createUnavailableMarketSnapshot,
    normalizeMarketSnapshot,
    type MarketSnapshot,
    type MarketSnapshotSymbol,
} from './types';

const FINNHUB_BASE_URL = (
    process.env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1'
).replace(/\/+$/, '');
const QUOTE_REVALIDATE_SECONDS = 30;

function getFinnhubApiKey() {
    return process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
}

async function getMarketSnapshot(symbol: MarketSnapshotSymbol): Promise<MarketSnapshot> {
    const fetchedAt = new Date().toISOString();
    const apiKey = getFinnhubApiKey();

    if (!apiKey) {
        return createUnavailableMarketSnapshot(symbol, fetchedAt, 'missing_api_key');
    }

    try {
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}`;
        const response = await fetch(url, {
            headers: {
                'X-Finnhub-Token': apiKey,
            },
            next: { revalidate: QUOTE_REVALIDATE_SECONDS },
        });

        if (!response.ok) {
            return createUnavailableMarketSnapshot(symbol, fetchedAt, 'provider_error');
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            return createUnavailableMarketSnapshot(symbol, fetchedAt, 'provider_error');
        }

        return normalizeMarketSnapshot(symbol, payload, fetchedAt);
    } catch {
        return createUnavailableMarketSnapshot(symbol, fetchedAt, 'provider_error');
    }
}

export async function getSoxlMarketSnapshots(): Promise<MarketSnapshot[]> {
    const results = await Promise.allSettled(
        MARKET_SNAPSHOT_SYMBOLS.map((symbol) => getMarketSnapshot(symbol)),
    );

    return results.map((result, index) => {
        const symbol = MARKET_SNAPSHOT_SYMBOLS[index];

        if (result.status === 'fulfilled') {
            return result.value;
        }

        return createUnavailableMarketSnapshot(
            symbol,
            new Date().toISOString(),
            'provider_error',
        );
    });
}
