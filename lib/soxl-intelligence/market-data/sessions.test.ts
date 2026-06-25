import { describe, expect, it } from 'vitest';
import type { CandleInterval } from '@/lib/soxl-intelligence/market-data/candle-types';
import {
    classifyUsEquitySession,
    getCandleCompletionStatus,
    INTRADAY_INTERVAL_SECONDS,
    isIntradayInterval,
} from '@/lib/soxl-intelligence/market-data/sessions';

function toUnixSeconds(timestamp: string): number {
    return Math.trunc(Date.parse(timestamp) / 1_000);
}

describe('classifyUsEquitySession', () => {
    const cases = [
        ['winter weekday premarket', '2026-01-05T08:00:00-05:00', 'premarket'],
        ['winter weekday regular session', '2026-01-05T10:00:00-05:00', 'regular'],
        ['winter weekday after-hours', '2026-01-05T17:00:00-05:00', 'after_hours'],
        ['summer weekday premarket', '2026-07-06T08:00:00-04:00', 'premarket'],
        ['summer weekday regular session', '2026-07-06T10:00:00-04:00', 'regular'],
        ['summer weekday after-hours', '2026-07-06T17:00:00-04:00', 'after_hours'],
        ['weekend closed', '2026-01-03T10:00:00-05:00', 'closed'],
        ['exactly 04:00 ET premarket', '2026-01-05T04:00:00-05:00', 'premarket'],
        ['exactly 09:30 ET regular', '2026-01-05T09:30:00-05:00', 'regular'],
        ['exactly 16:00 ET after-hours', '2026-01-05T16:00:00-05:00', 'after_hours'],
        ['exactly 20:00 ET closed', '2026-01-05T20:00:00-05:00', 'closed'],
    ] as const;

    it.each(cases)('classifies %s', (_label, timestamp, expectedSession) => {
        const result = classifyUsEquitySession(toUnixSeconds(timestamp));

        expect(result).toEqual({
            session: expectedSession,
            source: 'clock_only',
        });
    });

    it('reports clock_only for every initial classification result', () => {
        const sources = cases.map(([, timestamp]) => (
            classifyUsEquitySession(toUnixSeconds(timestamp)).source
        ));

        expect(sources).toEqual(cases.map(() => 'clock_only'));
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1_782_415_800.5],
        ['millisecond-looking', 1_782_415_800_000],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns unknown for %s timestamps', (_label, timestamp) => {
        expect(classifyUsEquitySession(timestamp)).toEqual({
            session: 'unknown',
            source: 'clock_only',
        });
    });
});

describe('interval utilities', () => {
    it('defines 1m, 5m, 15m, and 1h interval durations', () => {
        expect(INTRADAY_INTERVAL_SECONDS).toEqual({
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3_600,
        });
    });

    it('identifies intraday intervals', () => {
        const intervals: CandleInterval[] = ['1m', '5m', '15m', '1h', '1d'];

        expect(intervals.filter(isIntradayInterval)).toEqual(['1m', '5m', '15m', '1h']);
    });
});

describe('getCandleCompletionStatus', () => {
    it('returns complete for an intraday bar whose interval has elapsed', () => {
        expect(getCandleCompletionStatus({
            timestamp: 1_000,
            interval: '5m',
            asOf: 1_300,
        })).toBe('complete');
    });

    it('returns incomplete for an intraday bar whose interval has not elapsed', () => {
        expect(getCandleCompletionStatus({
            timestamp: 1_000,
            interval: '5m',
            asOf: 1_299,
        })).toBe('incomplete');
    });

    it('returns unknown for daily bars', () => {
        expect(getCandleCompletionStatus({
            timestamp: 1_000,
            interval: '1d',
            asOf: 100_000,
        })).toBe('unknown');
    });

    it.each([
        ['negative timestamp', -1, 1_000],
        ['zero timestamp', 0, 1_000],
        ['decimal timestamp', 1_000.5, 2_000],
        ['millisecond-looking timestamp', 1_000_000_000_000, 2_000],
        ['NaN timestamp', Number.NaN, 1_000],
        ['Infinity timestamp', Infinity, 1_000],
        ['invalid asOf', 1_000, Number.NaN],
        ['asOf earlier than timestamp', 1_000, 999],
    ])('returns unknown for %s', (_label, timestamp, asOf) => {
        expect(getCandleCompletionStatus({
            timestamp,
            interval: '1m',
            asOf,
        })).toBe('unknown');
    });
});
