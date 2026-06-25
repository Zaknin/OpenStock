import { describe, expect, it } from 'vitest';
import {
    createUnavailableMarketSnapshot,
    normalizeMarketSnapshot,
} from '@/lib/soxl-intelligence/market-data/types';

const fetchedAt = '2026-06-25T19:30:00.000Z';

describe('normalizeMarketSnapshot', () => {
    it('normalizes a complete Finnhub quote payload', () => {
        const snapshot = normalizeMarketSnapshot(
            'SOXL',
            {
                c: 31.42,
                d: 1.23,
                dp: 4.08,
                o: 30.1,
                h: 32,
                l: 29.9,
                pc: 30.19,
                t: 1782415800,
            },
            fetchedAt,
        );

        expect(snapshot).toMatchObject({
            symbol: 'SOXL',
            label: 'Direxion Daily Semiconductor Bull 3X Shares',
            price: 31.42,
            change: 1.23,
            changePercent: 4.08,
            sessionOpen: 30.1,
            sessionHigh: 32,
            sessionLow: 29.9,
            previousClose: 30.19,
            providerTimestamp: 1782415800,
            fetchedAt,
            status: 'available',
        });
    });

    it('preserves legitimate zero daily change values', () => {
        const snapshot = normalizeMarketSnapshot(
            'QQQ',
            {
                c: 481.5,
                d: 0,
                dp: 0,
            },
            fetchedAt,
        );

        expect(snapshot.status).toBe('available');
        expect(snapshot.change).toBe(0);
        expect(snapshot.changePercent).toBe(0);
    });

    it('converts missing optional fields to null', () => {
        const snapshot = normalizeMarketSnapshot('SMH', { c: 252.2 }, fetchedAt);

        expect(snapshot).toMatchObject({
            status: 'available',
            price: 252.2,
            change: null,
            changePercent: null,
            sessionOpen: null,
            sessionHigh: null,
            sessionLow: null,
            previousClose: null,
            providerTimestamp: null,
        });
    });

    it('marks missing current price as unavailable without turning fields into zero', () => {
        const snapshot = normalizeMarketSnapshot(
            'SOXL',
            {
                d: 0,
                dp: 0,
                h: 31,
                l: 29,
            },
            fetchedAt,
        );

        expect(snapshot).toMatchObject({
            status: 'unavailable',
            errorCode: 'missing_price',
            price: null,
            change: 0,
            changePercent: 0,
            sessionHigh: 31,
            sessionLow: 29,
        });
    });

    it('converts malformed numeric values to null', () => {
        const snapshot = normalizeMarketSnapshot(
            'QQQ',
            {
                c: 481.5,
                d: Number.NaN,
                dp: Infinity,
                o: '480',
                h: null,
                l: 479,
                pc: 480.25,
                t: 'now',
            },
            fetchedAt,
        );

        expect(snapshot).toMatchObject({
            status: 'available',
            price: 481.5,
            change: null,
            changePercent: null,
            sessionOpen: null,
            sessionHigh: null,
            sessionLow: 479,
            previousClose: 480.25,
            providerTimestamp: null,
        });
    });

    it('normalizes decimal positive provider timestamps to integer Unix seconds', () => {
        const snapshot = normalizeMarketSnapshot('SOXL', { c: 31.42, t: 1782415800.9 }, fetchedAt);

        expect(snapshot.providerTimestamp).toBe(1782415800);
    });

    it('converts invalid provider timestamps to null', () => {
        expect(normalizeMarketSnapshot('SOXL', { c: 31.42, t: -1 }, fetchedAt).providerTimestamp).toBeNull();
        expect(normalizeMarketSnapshot('QQQ', { c: 481.5, t: 0 }, fetchedAt).providerTimestamp).toBeNull();
        expect(
            normalizeMarketSnapshot('SMH', { c: 252.2, t: Infinity }, fetchedAt).providerTimestamp,
        ).toBeNull();
    });

    it('marks non-object payloads as invalid responses', () => {
        const snapshot = normalizeMarketSnapshot('SMH', null, fetchedAt);

        expect(snapshot).toMatchObject({
            status: 'unavailable',
            errorCode: 'invalid_response',
            price: null,
        });
    });
});

describe('createUnavailableMarketSnapshot', () => {
    it('creates a fully null unavailable snapshot for provider failures', () => {
        const snapshot = createUnavailableMarketSnapshot('SMH', fetchedAt, 'provider_error');

        expect(snapshot).toMatchObject({
            symbol: 'SMH',
            label: 'VanEck Semiconductor ETF',
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
            errorCode: 'provider_error',
        });
    });
});
