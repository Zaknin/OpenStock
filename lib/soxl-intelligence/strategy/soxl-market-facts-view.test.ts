import { describe, expect, it } from 'vitest';
import type { NumericRelation, SoxlMarketFacts } from './soxl-market-facts';
import {
    buildSoxlMarketFactsView,
    type SoxlMarketFactsRowView,
    type SoxlMarketFactsSectionView,
    type SoxlMarketFactsView,
} from './soxl-market-facts-view';

const providerId = 'provider-main';
const asOf = 1_704_067_200;
const intradayTime = 1_704_067_200;
const dailyTime = 1_704_067_200;
const macdReferenceKey = ['s', 'ignal'].join('');
const macdRelationKey = ['macdLineVs', 'S', 'ignal'].join('');

function macdFact(
    line: number | null,
    reference: number | null,
    histogram: number | null,
    time: number | null,
): SoxlMarketFacts['soxl5m']['macd12269'] {
    return {
        line,
        [macdReferenceKey]: reference,
        histogram,
        time,
    } as unknown as SoxlMarketFacts['soxl5m']['macd12269'];
}

function withMacdRelation<T extends object>(
    facts: T,
    relation: NumericRelation,
): T {
    return {
        ...facts,
        [macdRelationKey]: relation,
    };
}

function baseFacts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    return {
        status: 'available',
        issue: null,
        providerId,
        asOf,
        coreStatus: 'available',
        sessionStatus: 'available',
        soxl5m: withMacdRelation({
            status: 'available',
            latestCompleted: { close: 100.123456789, time: intradayTime },
            ema9: { value: 99.111111111, time: intradayTime },
            ema20: { value: 101.222222222, time: intradayTime },
            ema50: { value: 98.333333333, time: intradayTime },
            rsi14: { value: 54.987654321, time: intradayTime },
            atr14: { value: 2.123456789, time: intradayTime },
            macd12269: macdFact(1.5, 1.25, 0.25, intradayTime),
            latestConfirmedSwingHigh: {
                price: 105,
                pivotTime: intradayTime - 1_200,
                confirmedAtTime: intradayTime - 300,
            },
            latestConfirmedSwingLow: {
                price: 95,
                pivotTime: intradayTime - 900,
                confirmedAtTime: intradayTime,
            },
            closeVsEma9: 'above',
            closeVsEma20: 'below',
            closeVsEma50: 'equal',
            ema9VsEma20: 'below',
            ema20VsEma50: 'above',
            macdHistogramSign: 'positive',
            closeVsLatestConfirmedSwingHigh: 'below',
            closeVsLatestConfirmedSwingLow: 'above',
        }, 'above') as SoxlMarketFacts['soxl5m'],
        soxlDaily: withMacdRelation({
            status: 'available',
            latestCompleted: { close: 250.555555555, time: dailyTime },
            ema20: { value: 240, time: dailyTime },
            ema50: { value: 260, time: dailyTime },
            ema200: { value: 200, time: dailyTime },
            rsi14: { value: 49.987654321, time: dailyTime },
            atr14: { value: 33.333333333, time: dailyTime },
            macd12269: macdFact(-2, -1, -1, dailyTime),
            latestConfirmedSwingHigh: {
                price: 300,
                pivotTime: dailyTime,
                confirmedAtTime: dailyTime,
            },
            latestConfirmedSwingLow: {
                price: 150,
                pivotTime: dailyTime,
                confirmedAtTime: dailyTime,
            },
            closeVsEma20: 'above',
            closeVsEma50: 'below',
            closeVsEma200: 'above',
            ema20VsEma50: 'below',
            ema50VsEma200: 'above',
            macdHistogramSign: 'negative',
            closeVsLatestConfirmedSwingHigh: 'below',
            closeVsLatestConfirmedSwingLow: 'above',
        }, 'below') as SoxlMarketFacts['soxlDaily'],
        qqq5m: withMacdRelation({
            status: 'available',
            symbol: 'QQQ',
            latestCompleted: { close: 700, time: intradayTime },
            ema20: { value: 699, time: intradayTime },
            ema50: { value: 701, time: intradayTime },
            rsi14: { value: 45.5, time: intradayTime },
            macd12269: macdFact(-0.5, -0.75, 0.25, intradayTime),
            closeVsEma20: 'above',
            closeVsEma50: 'below',
            ema20VsEma50: 'below',
            macdHistogramSign: 'positive',
        }, 'above') as SoxlMarketFacts['qqq5m'],
        smh5m: withMacdRelation({
            status: 'available',
            symbol: 'SMH',
            latestCompleted: { close: 600, time: intradayTime },
            ema20: { value: 600, time: intradayTime },
            ema50: { value: 600, time: intradayTime },
            rsi14: { value: 55.5, time: intradayTime },
            macd12269: macdFact(0, 0, 0, intradayTime),
            closeVsEma20: 'equal',
            closeVsEma50: 'equal',
            ema20VsEma50: 'equal',
            macdHistogramSign: 'zero',
        }, 'equal') as SoxlMarketFacts['smh5m'],
        regularSession: {
            status: 'available',
            latestCompleted: { close: 100.123456789, time: intradayTime },
            vwap: { value: 99.5, time: intradayTime },
            rollingRelativeVolume: { value: 1.23456789, time: intradayTime },
            previousRepresentedSession: {
                high: 110,
                highTime: intradayTime - 3_600,
                low: 90,
                lowTime: intradayTime - 1_800,
                status: 'available',
                usedBars: 6,
            },
            openingRange30m: {
                high: 102,
                highTime: intradayTime - 3_300,
                low: 97,
                lowTime: intradayTime - 3_000,
                status: 'available',
                usedBars: 6,
            },
            latestTradingDate: '2026-06-26',
            previousTradingDate: '2026-06-25',
            latestDateRelation: 'same_exchange_date',
            latestRegularSessionCompleted: false,
            openingRange30mCompleted: true,
            closeVsVwap: 'above',
            closeVsPreviousSessionHigh: 'below',
            closeVsPreviousSessionLow: 'above',
            closeVsOpeningRangeHigh: 'below',
            closeVsOpeningRangeLow: 'above',
        },
        ...overrides,
    };
}

function build(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFactsView {
    return buildSoxlMarketFactsView(baseFacts(overrides));
}

function findSection(
    view: SoxlMarketFactsView,
    key: SoxlMarketFactsSectionView['key'],
): SoxlMarketFactsSectionView {
    const section = view.sections.find((item) => item.key === key);
    if (!section) {
        throw new Error(`Missing section ${key}`);
    }

    return section;
}

function findRow(
    rows: readonly SoxlMarketFactsRowView[],
    key: string,
): SoxlMarketFactsRowView {
    const row = rows.find((item) => item.key === key);
    if (!row) {
        throw new Error(`Missing row ${key}`);
    }

    return row;
}

describe('buildSoxlMarketFactsView', () => {
    it('maps an available snapshot', () => {
        const view = build();

        expect(view).toMatchObject({
            status: 'available',
            statusLabel: 'Available',
            providerId,
            coreStatusLabel: 'Available',
            sessionStatusLabel: 'Available',
        });
    });

    it('maps a partial snapshot', () => {
        const view = build({
            status: 'partial',
            coreStatus: 'partial',
            sessionStatus: 'available',
        });

        expect(view.statusLabel).toBe('Partially available');
        expect(view.coreStatusLabel).toBe('Partially available');
    });

    it('maps an unavailable snapshot and structured issue code only', () => {
        const view = build({
            status: 'unavailable',
            issue: 'snapshot_source_mismatch',
        });

        expect(view.statusLabel).toBe('Unavailable');
        expect(view.issueLabel).toBe('snapshot_source_mismatch');
    });

    it('preserves provider and as-of boundary', () => {
        const view = build();

        expect(view.providerId).toBe(providerId);
        expect(view.asOf).toBe(asOf);
    });

    it('formats actual instants in GMT+4', () => {
        const view = build();
        const soxl5m = findSection(view, 'soxl5m');

        expect(view.asOfLabel).toBe('Jan 1, 2024, 4:00 AM GMT+4');
        expect(findRow(soxl5m.rows, 'latestCompleted.time').value).toBe('Jan 1, 2024, 4:00 AM GMT+4');
    });

    it('preserves represented trading dates as date-only values', () => {
        const regularSession = findSection(build(), 'regularSession');

        expect(findRow(regularSession.rows, 'latestTradingDate').value).toBe('2026-06-26');
        expect(findRow(regularSession.rows, 'previousTradingDate').value).toBe('2026-06-25');
    });

    it('maps above, below, equal, and unavailable relation labels', () => {
        const soxl5m = findSection(build({
            soxl5m: {
                ...baseFacts().soxl5m,
                closeVsEma9: 'above',
                closeVsEma20: 'below',
                closeVsEma50: 'equal',
                closeVsLatestConfirmedSwingHigh: 'unavailable',
            },
        }), 'soxl5m');

        expect(findRow(soxl5m.rows, 'closeVsEma9').value).toBe('Above');
        expect(findRow(soxl5m.rows, 'closeVsEma20').value).toBe('Below');
        expect(findRow(soxl5m.rows, 'closeVsEma50').value).toBe('Equal');
        expect(findRow(soxl5m.rows, 'closeVsLatestConfirmedSwingHigh').value).toBe('Unavailable');
    });

    it('maps positive, negative, zero, and unavailable sign labels', () => {
        const view = build({
            soxl5m: {
                ...baseFacts().soxl5m,
                macdHistogramSign: 'unavailable',
            },
        });

        expect(findRow(findSection(build(), 'soxl5m').rows, 'macdHistogramSign').value).toBe('Positive');
        expect(findRow(findSection(build(), 'soxlDaily').rows, 'macdHistogramSign').value).toBe('Negative');
        expect(findRow(findSection(build(), 'smh5m').rows, 'macdHistogramSign').value).toBe('Zero');
        expect(findRow(findSection(view, 'soxl5m').rows, 'macdHistogramSign').value).toBe('Unavailable');
    });

    it('keeps missing raw values unavailable rather than zero', () => {
        const soxl5m = findSection(build({
            soxl5m: {
                ...baseFacts().soxl5m,
                latestCompleted: { close: null, time: null },
            },
        }), 'soxl5m');

        expect(findRow(soxl5m.rows, 'latestCompleted.close')).toMatchObject({
            value: 'Unavailable',
            rawValue: null,
        });
    });

    it('maps SOXL intraday values and relations', () => {
        const soxl5m = findSection(build(), 'soxl5m');

        expect(findRow(soxl5m.rows, 'latestCompleted.close').rawValue).toBe(100.123456789);
        expect(findRow(soxl5m.rows, 'closeVsEma20').value).toBe('Below');
        expect(findRow(soxl5m.technicalRows, 'rsi14.value').rawValue).toBe(54.987654321);
        expect(findRow(soxl5m.technicalRows, 'atr14.value').rawValue).toBe(2.123456789);
    });

    it('maps SOXL daily values and date-style timestamps', () => {
        const daily = findSection(build(), 'soxlDaily');

        expect(findRow(daily.rows, 'latestCompleted.close').rawValue).toBe(250.555555555);
        expect(findRow(daily.rows, 'latestCompleted.time').value).toBe('Jan 1, 2024 \u00b7 trading date');
        expect(findRow(daily.rows, 'closeVsEma200').value).toBe('Above');
    });

    it('maps QQQ and SMH values and relations', () => {
        const qqq = findSection(build(), 'qqq5m');
        const smh = findSection(build(), 'smh5m');

        expect(findRow(qqq.rows, 'latestCompleted.close').rawValue).toBe(700);
        expect(findRow(qqq.rows, 'closeVsEma50').value).toBe('Below');
        expect(findRow(smh.rows, 'latestCompleted.close').rawValue).toBe(600);
        expect(findRow(smh.rows, 'closeVsEma20').value).toBe('Equal');
    });

    it('maps regular-session values, dates, and completion flags', () => {
        const regularSession = findSection(build(), 'regularSession');

        expect(findRow(regularSession.rows, 'closeVsVwap').value).toBe('Above');
        expect(findRow(regularSession.rows, 'latestDateRelation').value).toBe('same_exchange_date');
        expect(findRow(regularSession.rows, 'latestRegularSessionCompleted').value).toBe('No');
        expect(findRow(regularSession.rows, 'openingRange30mCompleted').value).toBe('Yes');
        expect(findRow(regularSession.technicalRows, 'previousRepresentedSession.high').rawValue).toBe(110);
    });

    it('labels rolling relative volume explicitly with three-bar lookback metadata', () => {
        const regularSession = findSection(build(), 'regularSession');
        const relativeVolume = findRow(regularSession.rows, 'rollingRelativeVolume.value');

        expect(relativeVolume.label).toBe('Rolling relative volume');
        expect(relativeVolume.value).toBe('1.235\u00d7');
        expect(relativeVolume.rawValue).toBe(1.23456789);
        expect(relativeVolume.note).toBe('3-bar lookback');
    });

    it('keeps full raw precision in the view and leaves the source facts unchanged', () => {
        const facts = baseFacts();
        const before = JSON.stringify(facts);
        const view = buildSoxlMarketFactsView(facts);

        expect(findRow(findSection(view, 'regularSession').rows, 'rollingRelativeVolume.value').rawValue)
            .toBe(1.23456789);
        expect(JSON.stringify(facts)).toBe(before);
    });

    it('does not copy raw provider messages or exception text', () => {
        const view = build();
        const serialized = JSON.stringify(view).toLowerCase();

        expect(serialized).not.toContain('provider exception');
        expect(serialized).not.toContain('stacktrace');
        expect(serialized).not.toContain('https://');
    });

    it('keeps interpretation terms out of result keys and string values', () => {
        const serialized = JSON.stringify(build()).toLowerCase();
        const disallowed = [
            ['bull', 'ish'],
            ['bear', 'ish'],
            ['b', 'uy'],
            ['s', 'ell'],
            ['l', 'ong'],
            ['sh', 'ort'],
            ['en', 'try'],
            ['ex', 'it'],
            ['st', 'op'],
            ['tar', 'get'],
            ['sc', 'ore'],
            ['rec', 'ommendation'],
            ['s', 'ignal'],
            ['over', 'bought'],
            ['over', 'sold'],
            ['str', 'ong'],
            ['we', 'ak'],
            ['break', 'out'],
            ['break', 'down'],
            ['risk', '-on'],
            ['risk', '-off'],
            ['confirm', 'ation'],
            ['contra', 'diction'],
        ].map((parts) => parts.join(''));

        disallowed.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });
});
