import { describe, expect, it } from 'vitest';
import type {
    NumericRelation,
    NumericSign,
    SoxlMarketFacts,
} from './soxl-market-facts';
import {
    assessSoxlMarketFacts,
    type SoxlAssessmentSection,
    type SoxlConditionAssessment,
    type SoxlScenarioAssessment,
} from './soxl-market-assessment';

const providerId = 'provider-main';
const asOf = 1_782_400_000;

function baseFacts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    return {
        status: 'available',
        issue: null,
        providerId,
        asOf,
        coreStatus: 'available',
        sessionStatus: 'available',
        soxl5m: {
            status: 'available',
            latestCompleted: { close: 100.123456789, time: asOf },
            ema9: { value: 100.1, time: asOf },
            ema20: { value: 99.9, time: asOf },
            ema50: { value: 99.1, time: asOf },
            rsi14: { value: 51.123456789, time: asOf },
            atr14: { value: 2.987654321, time: asOf },
            macd12269: { line: 1.5, signal: 1.25, histogram: 0.25, time: asOf },
            latestConfirmedSwingHigh: { price: 99, pivotTime: asOf - 900, confirmedAtTime: asOf },
            latestConfirmedSwingLow: { price: 95, pivotTime: asOf - 1_800, confirmedAtTime: asOf - 900 },
            closeVsEma9: 'above',
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema9VsEma20: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
            closeVsLatestConfirmedSwingHigh: 'above',
            closeVsLatestConfirmedSwingLow: 'above',
        },
        soxlDaily: {
            status: 'available',
            latestCompleted: { close: 250.555555555, time: asOf },
            ema20: { value: 240, time: asOf },
            ema50: { value: 230, time: asOf },
            ema200: { value: 200, time: asOf },
            rsi14: { value: 49.987654321, time: asOf },
            atr14: { value: 33.333333333, time: asOf },
            macd12269: { line: 2, signal: 1, histogram: 1, time: asOf },
            latestConfirmedSwingHigh: { price: 240, pivotTime: asOf, confirmedAtTime: asOf },
            latestConfirmedSwingLow: { price: 150, pivotTime: asOf, confirmedAtTime: asOf },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            closeVsEma200: 'above',
            ema20VsEma50: 'above',
            ema50VsEma200: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
            closeVsLatestConfirmedSwingHigh: 'above',
            closeVsLatestConfirmedSwingLow: 'above',
        },
        qqq5m: {
            status: 'available',
            symbol: 'QQQ',
            latestCompleted: { close: 700, time: asOf },
            ema20: { value: 699, time: asOf },
            ema50: { value: 698, time: asOf },
            rsi14: { value: 45.5, time: asOf },
            macd12269: { line: 0.5, signal: 0.25, histogram: 0.25, time: asOf },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        smh5m: {
            status: 'available',
            symbol: 'SMH',
            latestCompleted: { close: 600, time: asOf },
            ema20: { value: 599, time: asOf },
            ema50: { value: 598, time: asOf },
            rsi14: { value: 55.5, time: asOf },
            macd12269: { line: 0.5, signal: 0.25, histogram: 0.25, time: asOf },
            closeVsEma20: 'above',
            closeVsEma50: 'above',
            ema20VsEma50: 'above',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        },
        regularSession: {
            status: 'available',
            latestCompleted: { close: 100.123456789, time: asOf },
            vwap: { value: 99.5, time: asOf },
            rollingRelativeVolume: { value: 1.23456789, time: asOf },
            previousRepresentedSession: {
                high: 99,
                highTime: asOf - 3_600,
                low: 90,
                lowTime: asOf - 1_800,
                status: 'available',
                usedBars: 6,
            },
            openingRange30m: {
                high: 98,
                highTime: asOf - 3_300,
                low: 97,
                lowTime: asOf - 3_000,
                status: 'available',
                usedBars: 6,
            },
            latestTradingDate: '2026-06-26',
            previousTradingDate: '2026-06-25',
            latestDateRelation: 'same_exchange_date',
            latestRegularSessionCompleted: false,
            openingRange30mCompleted: true,
            closeVsVwap: 'above',
            closeVsPreviousSessionHigh: 'above',
            closeVsPreviousSessionLow: 'above',
            closeVsOpeningRangeHigh: 'above',
            closeVsOpeningRangeLow: 'above',
        },
        ...overrides,
    };
}

function cloneFacts(facts: SoxlMarketFacts): SoxlMarketFacts {
    return JSON.parse(JSON.stringify(facts)) as SoxlMarketFacts;
}

function section(
    scenario: SoxlScenarioAssessment,
    id: SoxlAssessmentSection['id'],
): SoxlAssessmentSection {
    const found = scenario.sections.find((item) => item.id === id);

    if (!found) {
        throw new Error(`Missing section ${id}`);
    }

    return found;
}

function condition(
    sectionValue: SoxlAssessmentSection,
    id: SoxlConditionAssessment['id'],
): SoxlConditionAssessment {
    const found = sectionValue.conditions.find((item) => item.id === id);

    if (!found) {
        throw new Error(`Missing condition ${id}`);
    }

    return found;
}

function allUnknownFacts(overrides: Partial<SoxlMarketFacts> = {}): SoxlMarketFacts {
    const facts = baseFacts({
        status: 'partial',
        ...overrides,
    });
    const relation: NumericRelation = 'unavailable';
    const sign: NumericSign = 'unavailable';

    return {
        ...facts,
        soxl5m: {
            ...facts.soxl5m,
            closeVsEma20: relation,
            ema9VsEma20: relation,
            ema20VsEma50: relation,
            macdLineVsSignal: relation,
            macdHistogramSign: sign,
            closeVsLatestConfirmedSwingHigh: relation,
            closeVsLatestConfirmedSwingLow: relation,
        },
        soxlDaily: {
            ...facts.soxlDaily,
            closeVsEma50: relation,
            closeVsEma200: relation,
            ema20VsEma50: relation,
            ema50VsEma200: relation,
            macdLineVsSignal: relation,
            macdHistogramSign: sign,
            closeVsLatestConfirmedSwingHigh: relation,
            closeVsLatestConfirmedSwingLow: relation,
        },
        qqq5m: {
            ...facts.qqq5m,
            closeVsEma20: relation,
            ema20VsEma50: relation,
            macdHistogramSign: sign,
        },
        smh5m: {
            ...facts.smh5m,
            closeVsEma20: relation,
            ema20VsEma50: relation,
            macdHistogramSign: sign,
        },
        regularSession: {
            ...facts.regularSession,
            closeVsVwap: relation,
            closeVsOpeningRangeHigh: relation,
            closeVsOpeningRangeLow: relation,
            closeVsPreviousSessionHigh: relation,
            closeVsPreviousSessionLow: relation,
        },
    };
}

describe('assessSoxlMarketFacts status behavior', () => {
    it('returns available for available facts with all conditions known', () => {
        expect(assessSoxlMarketFacts(baseFacts()).status).toBe('available');
    });

    it('returns partial for partial facts with at least one known condition', () => {
        const assessment = assessSoxlMarketFacts(baseFacts({ status: 'partial' }));

        expect(assessment.status).toBe('partial');
        expect(assessment.issue).toBeNull();
    });

    it('returns unavailable for unavailable facts and preserves structured facts issue', () => {
        const assessment = assessSoxlMarketFacts(baseFacts({
            status: 'unavailable',
            issue: 'no_comparable_data',
        }));

        expect(assessment.status).toBe('unavailable');
        expect(assessment.issue).toBe('no_comparable_data');
    });

    it('returns no_known_conditions when every condition is unknown', () => {
        const assessment = assessSoxlMarketFacts(allUnknownFacts());

        expect(assessment.status).toBe('unavailable');
        expect(assessment.issue).toBe('no_known_conditions');
    });

    it('preserves provider, asOf, core status, and session status', () => {
        const assessment = assessSoxlMarketFacts(baseFacts({
            providerId: 'provider-2',
            asOf: 123.456789,
            coreStatus: 'partial',
            sessionStatus: 'unavailable',
        }));

        expect(assessment).toMatchObject({
            providerId: 'provider-2',
            asOf: 123.456789,
            factsStatus: 'available',
            coreStatus: 'partial',
            sessionStatus: 'unavailable',
        });
    });
});

describe('condition state mapping', () => {
    it('maps upward above relation to met', () => {
        const row = condition(section(assessSoxlMarketFacts(baseFacts()).upwardAlignment, 'soxl_5m'), 'soxl_5m_price_above_ema20');

        expect(row).toMatchObject({ expected: 'above', actual: 'above', state: 'met' });
    });

    it('maps upward below relation to not_met', () => {
        const facts = baseFacts({ soxl5m: { ...baseFacts().soxl5m, closeVsEma20: 'below' } });
        const row = condition(section(assessSoxlMarketFacts(facts).upwardAlignment, 'soxl_5m'), 'soxl_5m_price_above_ema20');

        expect(row.state).toBe('not_met');
    });

    it('maps downward below relation to met', () => {
        const facts = baseFacts({ soxl5m: { ...baseFacts().soxl5m, closeVsEma20: 'below' } });
        const row = condition(section(assessSoxlMarketFacts(facts).downwardAlignment, 'soxl_5m'), 'soxl_5m_price_below_ema20');

        expect(row).toMatchObject({ expected: 'below', actual: 'below', state: 'met' });
    });

    it('maps downward above relation to not_met', () => {
        const row = condition(section(assessSoxlMarketFacts(baseFacts()).downwardAlignment, 'soxl_5m'), 'soxl_5m_price_below_ema20');

        expect(row.state).toBe('not_met');
    });

    it('treats equality as not_met for both scenarios', () => {
        const facts = baseFacts({ soxl5m: { ...baseFacts().soxl5m, closeVsEma20: 'equal' } });
        const assessment = assessSoxlMarketFacts(facts);

        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_price_above_ema20').state)
            .toBe('not_met');
        expect(condition(section(assessment.downwardAlignment, 'soxl_5m'), 'soxl_5m_price_below_ema20').state)
            .toBe('not_met');
    });

    it('maps positive sign for upward and downward conditions', () => {
        const assessment = assessSoxlMarketFacts(baseFacts());

        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_positive').state)
            .toBe('met');
        expect(condition(section(assessment.downwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_negative').state)
            .toBe('not_met');
    });

    it('maps negative sign for downward and upward conditions', () => {
        const facts = baseFacts({ soxl5m: { ...baseFacts().soxl5m, macdHistogramSign: 'negative' } });
        const assessment = assessSoxlMarketFacts(facts);

        expect(condition(section(assessment.downwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_negative').state)
            .toBe('met');
        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_positive').state)
            .toBe('not_met');
    });

    it('treats zero sign as not_met for both scenarios', () => {
        const facts = baseFacts({ soxl5m: { ...baseFacts().soxl5m, macdHistogramSign: 'zero' } });
        const assessment = assessSoxlMarketFacts(facts);

        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_positive').state)
            .toBe('not_met');
        expect(condition(section(assessment.downwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_negative').state)
            .toBe('not_met');
    });

    it('maps unavailable relation and sign to unknown', () => {
        const facts = baseFacts({
            soxl5m: {
                ...baseFacts().soxl5m,
                closeVsEma20: 'unavailable',
                macdHistogramSign: 'unavailable',
            },
        });
        const assessment = assessSoxlMarketFacts(facts);

        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_price_above_ema20').state)
            .toBe('unknown');
        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_macd_histogram_positive').state)
            .toBe('unknown');
    });
});

describe('scenario section condition sets', () => {
    it('builds SOXL five-minute condition set and counts', () => {
        const sectionValue = section(assessSoxlMarketFacts(baseFacts()).upwardAlignment, 'soxl_5m');

        expect(sectionValue.conditions.map((item) => item.id)).toEqual([
            'soxl_5m_price_above_ema20',
            'soxl_5m_ema9_above_ema20',
            'soxl_5m_ema20_above_ema50',
            'soxl_5m_macd_line_above_signal',
            'soxl_5m_macd_histogram_positive',
            'soxl_5m_price_above_latest_swing_high',
        ]);
        expect(sectionValue).toMatchObject({ metCount: 6, notMetCount: 0, unknownCount: 0, knownCount: 6, totalCount: 6 });
    });

    it('builds SOXL daily condition set and counts', () => {
        const sectionValue = section(assessSoxlMarketFacts(baseFacts()).upwardAlignment, 'soxl_daily');

        expect(sectionValue.conditions.map((item) => item.id)).toEqual([
            'soxl_daily_price_above_ema50',
            'soxl_daily_price_above_ema200',
            'soxl_daily_ema20_above_ema50',
            'soxl_daily_ema50_above_ema200',
            'soxl_daily_macd_line_above_signal',
            'soxl_daily_macd_histogram_positive',
            'soxl_daily_price_above_latest_swing_high',
        ]);
        expect(sectionValue).toMatchObject({ metCount: 7, knownCount: 7, totalCount: 7 });
    });

    it('builds QQQ condition set and counts', () => {
        const sectionValue = section(assessSoxlMarketFacts(baseFacts()).upwardAlignment, 'qqq_5m');

        expect(sectionValue.conditions.map((item) => item.id)).toEqual([
            'qqq_5m_price_above_ema20',
            'qqq_5m_ema20_above_ema50',
            'qqq_5m_macd_histogram_positive',
        ]);
        expect(sectionValue).toMatchObject({ metCount: 3, totalCount: 3 });
    });

    it('builds SMH condition set and counts', () => {
        const sectionValue = section(assessSoxlMarketFacts(baseFacts()).upwardAlignment, 'smh_5m');

        expect(sectionValue.conditions.map((item) => item.id)).toEqual([
            'smh_5m_price_above_ema20',
            'smh_5m_ema20_above_ema50',
            'smh_5m_macd_histogram_positive',
        ]);
        expect(sectionValue).toMatchObject({ metCount: 3, totalCount: 3 });
    });

    it('builds regular-session symmetrical condition sets', () => {
        const assessment = assessSoxlMarketFacts(baseFacts());

        expect(section(assessment.upwardAlignment, 'regular_session').conditions.map((item) => item.id)).toEqual([
            'regular_session_price_above_vwap',
            'regular_session_price_above_opening_range_high',
            'regular_session_price_above_previous_session_high',
        ]);
        expect(section(assessment.downwardAlignment, 'regular_session').conditions.map((item) => item.id)).toEqual([
            'regular_session_price_below_vwap',
            'regular_session_price_below_opening_range_low',
            'regular_session_price_below_previous_session_low',
        ]);
    });

    it('maps missing swings to unknown swing conditions', () => {
        const facts = baseFacts({
            soxl5m: {
                ...baseFacts().soxl5m,
                closeVsLatestConfirmedSwingHigh: 'unavailable',
                closeVsLatestConfirmedSwingLow: 'unavailable',
            },
        });
        const assessment = assessSoxlMarketFacts(facts);

        expect(condition(section(assessment.upwardAlignment, 'soxl_5m'), 'soxl_5m_price_above_latest_swing_high').state)
            .toBe('unknown');
        expect(condition(section(assessment.downwardAlignment, 'soxl_5m'), 'soxl_5m_price_below_latest_swing_low').state)
            .toBe('unknown');
    });

    it('maps missing session levels to unknown session conditions', () => {
        const facts = baseFacts({
            regularSession: {
                ...baseFacts().regularSession,
                closeVsOpeningRangeHigh: 'unavailable',
                closeVsOpeningRangeLow: 'unavailable',
                closeVsPreviousSessionHigh: 'unavailable',
                closeVsPreviousSessionLow: 'unavailable',
            },
        });
        const assessment = assessSoxlMarketFacts(facts);

        expect(section(assessment.upwardAlignment, 'regular_session').unknownCount).toBe(2);
        expect(section(assessment.downwardAlignment, 'regular_session').unknownCount).toBe(2);
    });

    it('preserves completion flags without counting them as conditions', () => {
        const assessment = assessSoxlMarketFacts(baseFacts({
            regularSession: {
                ...baseFacts().regularSession,
                latestRegularSessionCompleted: true,
                openingRange30mCompleted: false,
            },
        }));

        expect(assessment.regularSessionComplete).toBe(true);
        expect(assessment.openingRangeComplete).toBe(false);
        expect(assessment.upwardAlignment.totalCount).toBe(22);
        expect(assessment.downwardAlignment.totalCount).toBe(22);
    });
});

describe('excluded inputs and deterministic safety', () => {
    it('does not use RSI, ATR, or rolling relative volume', () => {
        const baseline = assessSoxlMarketFacts(baseFacts());
        const changedFacts = baseFacts({
            soxl5m: {
                ...baseFacts().soxl5m,
                rsi14: { value: 1, time: 1 },
                atr14: { value: 999, time: 2 },
            },
            soxlDaily: {
                ...baseFacts().soxlDaily,
                rsi14: { value: 99, time: 3 },
                atr14: { value: 0.000001, time: 4 },
            },
            regularSession: {
                ...baseFacts().regularSession,
                rollingRelativeVolume: { value: 500, time: 5 },
            },
        });

        expect(assessSoxlMarketFacts(changedFacts)).toEqual(baseline);
    });

    it('produces equivalent results for repeated equivalent inputs', () => {
        const facts = baseFacts();

        expect(assessSoxlMarketFacts(facts)).toEqual(assessSoxlMarketFacts(cloneFacts(facts)));
    });

    it('does not mutate inputs', () => {
        const facts = baseFacts();
        const before = JSON.stringify(facts);

        assessSoxlMarketFacts(facts);

        expect(JSON.stringify(facts)).toBe(before);
    });

    it('does not round preserved metadata', () => {
        const assessment = assessSoxlMarketFacts(baseFacts({ asOf: 123.456789 }));

        expect(assessment.asOf).toBe(123.456789);
    });

    it('does not copy provider messages, URLs, exception text, or stacks', () => {
        const serialized = JSON.stringify(assessSoxlMarketFacts(baseFacts())).toLowerCase();

        expect(serialized).not.toContain('provider exception');
        expect(serialized).not.toContain('https://');
        expect(serialized).not.toContain('stacktrace');
        expect(serialized).not.toContain('error:');
    });

    it('does not expose winner, preference, recommendation, action, probability, confidence, or score fields', () => {
        const serialized = JSON.stringify(assessSoxlMarketFacts(baseFacts())).toLowerCase();
        const disallowed = [
            'preferredscenario',
            'dominantscenario',
            'winner',
            'direction',
            'recommendation',
            'decision',
            'tradeaction',
            'probability',
            'confidence',
            'percentage',
            'score',
        ];

        disallowed.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });

    it('does not contain trade execution wording or profitability conclusions', () => {
        const serialized = JSON.stringify(assessSoxlMarketFacts(baseFacts())).toLowerCase();
        const disallowed = [
            'buy',
            'sell',
            'entry',
            'exit',
            'stop',
            'target',
            'profitable',
            'profit',
        ];

        disallowed.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });
});
