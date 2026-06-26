import { describe, expect, it, vi } from 'vitest';
import {
    SOXL_DISPLAY_TIME_ZONE,
    formatSoxlDailyTradingDate,
    formatSoxlDisplayIsoTimestamp,
    formatSoxlDisplayTimestamp,
} from '@/lib/soxl-intelligence/presentation/time-format';

const fixedUtcTimestamp = Date.UTC(2026, 5, 26, 17, 5, 0) / 1000;
const dailyUtcMidnight = Date.UTC(2026, 5, 25, 0, 0, 0) / 1000;
const fixedIsoTimestamp = '2026-06-26T17:05:00.000Z';
const bakuDisplayValue = 'Jun 26, 2026, 9:05 PM GMT+4';

describe('SOXL display time formatting', () => {
    it('uses the focused Asia/Baku display timezone constant', () => {
        expect(SOXL_DISPLAY_TIME_ZONE).toBe('Asia/Baku');
    });

    it('formats a fixed Unix timestamp four hours ahead of UTC', () => {
        expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toBe(bakuDisplayValue);
    });

    it('shows the GMT+4 suffix visibly', () => {
        expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toContain('GMT+4');
    });

    it('is independent of the machine timezone', () => {
        const originalTimeZone = process.env.TZ;

        process.env.TZ = 'America/New_York';
        const easternMachineOutput = formatSoxlDisplayTimestamp(fixedUtcTimestamp);
        process.env.TZ = 'UTC';
        const utcMachineOutput = formatSoxlDisplayTimestamp(fixedUtcTimestamp);

        if (originalTimeZone === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = originalTimeZone;
        }

        expect(easternMachineOutput).toBe(bakuDisplayValue);
        expect(utcMachineOutput).toBe(bakuDisplayValue);
    });

    it('formats aggregate historical asOf timestamps with GMT+4', () => {
        expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toBe(bakuDisplayValue);
    });

    it('formats intraday latest-completed timestamps with GMT+4', () => {
        expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toBe(bakuDisplayValue);
    });

    it('formats Finnhub provider-update timestamps with GMT+4', () => {
        expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toBe(bakuDisplayValue);
    });

    it('formats Finnhub fetched timestamps with GMT+4', () => {
        expect(formatSoxlDisplayIsoTimestamp(fixedIsoTimestamp)).toBe(bakuDisplayValue);
    });

    it('renders null timestamps as an em dash', () => {
        expect(formatSoxlDisplayTimestamp(null)).toBe('\u2014');
        expect(formatSoxlDisplayIsoTimestamp(null)).toBe('\u2014');
        expect(formatSoxlDailyTradingDate(null)).toBe('\u2014');
    });

    it('preserves the daily UTC-midnight candle trading date', () => {
        expect(formatSoxlDailyTradingDate(dailyUtcMidnight)).toBe(
            'Jun 25, 2026 \u00b7 trading date',
        );
    });

    it('does not show a clock or GMT+4 on daily trading dates', () => {
        const formatted = formatSoxlDailyTradingDate(dailyUtcMidnight);

        expect(formatted).toBe('Jun 25, 2026 \u00b7 trading date');
        expect(formatted).not.toContain('GMT+4');
        expect(formatted).not.toContain(':');
        expect(formatted).not.toContain('AM');
        expect(formatted).not.toContain('PM');
    });

    it('does not use the system clock', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('Date.now should not be used');
        });

        try {
            expect(formatSoxlDisplayTimestamp(fixedUtcTimestamp)).toBe(bakuDisplayValue);
            expect(formatSoxlDisplayIsoTimestamp(fixedIsoTimestamp)).toBe(bakuDisplayValue);
            expect(formatSoxlDailyTradingDate(dailyUtcMidnight)).toBe(
                'Jun 25, 2026 \u00b7 trading date',
            );
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('does not mutate numeric values or timestamp inputs', () => {
        const snapshot = {
            price: 31.42,
            providerTimestamp: fixedUtcTimestamp,
            fetchedAt: fixedIsoTimestamp,
        };
        const before = JSON.stringify(snapshot);

        formatSoxlDisplayTimestamp(snapshot.providerTimestamp);
        formatSoxlDisplayIsoTimestamp(snapshot.fetchedAt);

        expect(snapshot.price).toBe(31.42);
        expect(snapshot.providerTimestamp).toBe(fixedUtcTimestamp);
        expect(snapshot.fetchedAt).toBe(fixedIsoTimestamp);
        expect(JSON.stringify(snapshot)).toBe(before);
    });
});
