import { describe, expect, it } from 'vitest';
import type {
    NumericRelation,
    NumericSign,
} from './soxl-market-facts';
import type {
    SoxlAssessmentSection,
    SoxlConditionAssessment,
    SoxlConditionId,
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
} from './soxl-market-assessment';
import {
    buildSoxlMarketAssessmentView,
    type SoxlAssessmentConditionView,
    type SoxlAssessmentSectionView,
    type SoxlMarketAssessmentView,
} from './soxl-market-assessment-view';

const providerId = 'provider-main';
const asOf = 1_704_067_200;

const upwardConditionIds = {
    soxl5m: [
        'soxl_5m_price_above_ema20',
        'soxl_5m_ema9_above_ema20',
        'soxl_5m_ema20_above_ema50',
        'soxl_5m_macd_line_above_signal',
        'soxl_5m_macd_histogram_positive',
        'soxl_5m_price_above_latest_swing_high',
    ],
    daily: [
        'soxl_daily_price_above_ema50',
        'soxl_daily_price_above_ema200',
        'soxl_daily_ema20_above_ema50',
        'soxl_daily_ema50_above_ema200',
        'soxl_daily_macd_line_above_signal',
        'soxl_daily_macd_histogram_positive',
        'soxl_daily_price_above_latest_swing_high',
    ],
    qqq: [
        'qqq_5m_price_above_ema20',
        'qqq_5m_ema20_above_ema50',
        'qqq_5m_macd_histogram_positive',
    ],
    smh: [
        'smh_5m_price_above_ema20',
        'smh_5m_ema20_above_ema50',
        'smh_5m_macd_histogram_positive',
    ],
    session: [
        'regular_session_price_above_vwap',
        'regular_session_price_above_opening_range_high',
        'regular_session_price_above_previous_session_high',
    ],
} satisfies Record<string, readonly SoxlConditionId[]>;

const downwardConditionIds = {
    soxl5m: [
        'soxl_5m_price_below_ema20',
        'soxl_5m_ema9_below_ema20',
        'soxl_5m_ema20_below_ema50',
        'soxl_5m_macd_line_below_signal',
        'soxl_5m_macd_histogram_negative',
        'soxl_5m_price_below_latest_swing_low',
    ],
    daily: [
        'soxl_daily_price_below_ema50',
        'soxl_daily_price_below_ema200',
        'soxl_daily_ema20_below_ema50',
        'soxl_daily_ema50_below_ema200',
        'soxl_daily_macd_line_below_signal',
        'soxl_daily_macd_histogram_negative',
        'soxl_daily_price_below_latest_swing_low',
    ],
    qqq: [
        'qqq_5m_price_below_ema20',
        'qqq_5m_ema20_below_ema50',
        'qqq_5m_macd_histogram_negative',
    ],
    smh: [
        'smh_5m_price_below_ema20',
        'smh_5m_ema20_below_ema50',
        'smh_5m_macd_histogram_negative',
    ],
    session: [
        'regular_session_price_below_vwap',
        'regular_session_price_below_opening_range_low',
        'regular_session_price_below_previous_session_low',
    ],
} satisfies Record<string, readonly SoxlConditionId[]>;

const requiredLabels: Record<SoxlConditionId, string> = {
    soxl_5m_price_above_ema20: 'Price above the 20-period average',
    soxl_5m_ema9_above_ema20: '9-period average above the 20-period average',
    soxl_5m_ema20_above_ema50: '20-period average above the 50-period average',
    soxl_5m_macd_line_above_signal: 'MACD line above its signal line',
    soxl_5m_macd_histogram_positive: 'MACD histogram positive',
    soxl_5m_price_above_latest_swing_high: 'Price above the latest confirmed swing high',
    soxl_daily_price_above_ema50: 'Price above the 50-period average',
    soxl_daily_price_above_ema200: 'Price above the 200-period average',
    soxl_daily_ema20_above_ema50: '20-period average above the 50-period average',
    soxl_daily_ema50_above_ema200: '50-period average above the 200-period average',
    soxl_daily_macd_line_above_signal: 'MACD line above its signal line',
    soxl_daily_macd_histogram_positive: 'MACD histogram positive',
    soxl_daily_price_above_latest_swing_high: 'Price above the latest confirmed swing high',
    qqq_5m_price_above_ema20: 'Price above the 20-period average',
    qqq_5m_ema20_above_ema50: '20-period average above the 50-period average',
    qqq_5m_macd_histogram_positive: 'MACD histogram positive',
    smh_5m_price_above_ema20: 'Price above the 20-period average',
    smh_5m_ema20_above_ema50: '20-period average above the 50-period average',
    smh_5m_macd_histogram_positive: 'MACD histogram positive',
    regular_session_price_above_vwap: 'Price above the session average price',
    regular_session_price_above_opening_range_high: 'Price above the opening-range high',
    regular_session_price_above_previous_session_high: 'Price above the previous-session high',
    soxl_5m_price_below_ema20: 'Price below the 20-period average',
    soxl_5m_ema9_below_ema20: '9-period average below the 20-period average',
    soxl_5m_ema20_below_ema50: '20-period average below the 50-period average',
    soxl_5m_macd_line_below_signal: 'MACD line below its signal line',
    soxl_5m_macd_histogram_negative: 'MACD histogram negative',
    soxl_5m_price_below_latest_swing_low: 'Price below the latest confirmed swing low',
    soxl_daily_price_below_ema50: 'Price below the 50-period average',
    soxl_daily_price_below_ema200: 'Price below the 200-period average',
    soxl_daily_ema20_below_ema50: '20-period average below the 50-period average',
    soxl_daily_ema50_below_ema200: '50-period average below the 200-period average',
    soxl_daily_macd_line_below_signal: 'MACD line below its signal line',
    soxl_daily_macd_histogram_negative: 'MACD histogram negative',
    soxl_daily_price_below_latest_swing_low: 'Price below the latest confirmed swing low',
    qqq_5m_price_below_ema20: 'Price below the 20-period average',
    qqq_5m_ema20_below_ema50: '20-period average below the 50-period average',
    qqq_5m_macd_histogram_negative: 'MACD histogram negative',
    smh_5m_price_below_ema20: 'Price below the 20-period average',
    smh_5m_ema20_below_ema50: '20-period average below the 50-period average',
    smh_5m_macd_histogram_negative: 'MACD histogram negative',
    regular_session_price_below_vwap: 'Price below the session average price',
    regular_session_price_below_opening_range_low: 'Price below the opening-range low',
    regular_session_price_below_previous_session_low: 'Price below the previous-session low',
};

function condition(
    id: SoxlConditionId,
    state: SoxlConditionAssessment['state'],
    expected: SoxlConditionAssessment['expected'],
    actual: NumericRelation | NumericSign,
): SoxlConditionAssessment {
    return {
        id,
        state,
        expected,
        actual,
    };
}

function section(
    id: SoxlAssessmentSection['id'],
    ids: readonly SoxlConditionId[],
    expected: SoxlConditionAssessment['expected'],
    actual: NumericRelation | NumericSign,
    state: SoxlConditionAssessment['state'],
): SoxlAssessmentSection {
    const conditions = ids.map((id) => condition(id, state, expected, actual));
    const metCount = conditions.filter((item) => item.state === 'met').length;
    const notMetCount = conditions.filter((item) => item.state === 'not_met').length;
    const unknownCount = conditions.filter((item) => item.state === 'unknown').length;
    const totalCount = conditions.length;

    return {
        id,
        conditions,
        metCount,
        notMetCount,
        unknownCount,
        knownCount: totalCount - unknownCount,
        totalCount,
    };
}

function scenario(
    id: SoxlScenarioAssessment['id'],
    sections: readonly SoxlAssessmentSection[],
): SoxlScenarioAssessment {
    return sections.reduce(
        (result, current) => ({
            ...result,
            metCount: result.metCount + current.metCount,
            notMetCount: result.notMetCount + current.notMetCount,
            unknownCount: result.unknownCount + current.unknownCount,
            knownCount: result.knownCount + current.knownCount,
            totalCount: result.totalCount + current.totalCount,
        }),
        {
            id,
            sections,
            metCount: 0,
            notMetCount: 0,
            unknownCount: 0,
            knownCount: 0,
            totalCount: 0,
        },
    );
}

function baseAssessment(overrides: Partial<SoxlMarketAssessment> = {}): SoxlMarketAssessment {
    const upward = scenario('upward_alignment', [
        section('soxl_5m', upwardConditionIds.soxl5m, 'above', 'above', 'met'),
        section('soxl_daily', upwardConditionIds.daily, 'above', 'above', 'met'),
        section('qqq_5m', upwardConditionIds.qqq, 'positive', 'positive', 'met'),
        section('smh_5m', upwardConditionIds.smh, 'positive', 'positive', 'met'),
        section('regular_session', upwardConditionIds.session, 'above', 'above', 'met'),
    ]);
    const downward = scenario('downward_alignment', [
        section('soxl_5m', downwardConditionIds.soxl5m, 'below', 'above', 'not_met'),
        section('soxl_daily', downwardConditionIds.daily, 'below', 'above', 'not_met'),
        section('qqq_5m', downwardConditionIds.qqq, 'negative', 'positive', 'not_met'),
        section('smh_5m', downwardConditionIds.smh, 'negative', 'positive', 'not_met'),
        section('regular_session', downwardConditionIds.session, 'below', 'above', 'not_met'),
    ]);

    return {
        status: 'available',
        providerId,
        asOf,
        factsStatus: 'available',
        coreStatus: 'available',
        sessionStatus: 'available',
        issue: null,
        upwardAlignment: upward,
        downwardAlignment: downward,
        openingRangeComplete: true,
        regularSessionComplete: false,
        ...overrides,
    };
}

function findScenario(
    view: SoxlMarketAssessmentView,
    id: SoxlScenarioAssessment['id'],
) {
    const found = view.scenarios.find((item) => item.id === id);
    if (!found) {
        throw new Error(`Missing scenario ${id}`);
    }

    return found;
}

function findSection(
    view: SoxlMarketAssessmentView,
    scenarioId: SoxlScenarioAssessment['id'],
    sectionId: SoxlAssessmentSection['id'],
): SoxlAssessmentSectionView {
    const found = findScenario(view, scenarioId).sections.find((item) => item.id === sectionId);
    if (!found) {
        throw new Error(`Missing section ${sectionId}`);
    }

    return found;
}

function findCondition(
    view: SoxlMarketAssessmentView,
    id: SoxlConditionId,
): SoxlAssessmentConditionView {
    const found = view.scenarios
        .flatMap((scenarioValue) => scenarioValue.sections)
        .flatMap((sectionValue) => sectionValue.conditions)
        .find((conditionValue) => conditionValue.id === id);

    if (!found) {
        throw new Error(`Missing condition ${id}`);
    }

    return found;
}

describe('buildSoxlMarketAssessmentView', () => {
    it('maps available, partial, and unavailable assessments', () => {
        expect(buildSoxlMarketAssessmentView(baseAssessment()).statusLabel).toBe('Available');
        expect(buildSoxlMarketAssessmentView(baseAssessment({ status: 'partial' })).statusLabel)
            .toBe('Partially available');
        expect(buildSoxlMarketAssessmentView(baseAssessment({ status: 'unavailable' })).statusLabel)
            .toBe('Unavailable');
    });

    it('preserves provider, asOf, and GMT+4 asOf formatting', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());

        expect(view.providerId).toBe(providerId);
        expect(view.asOf).toBe(asOf);
        expect(view.asOfLabel).toBe('Jan 1, 2024, 4:00 AM GMT+4');
    });

    it('maps facts, core, session statuses and completion flags', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment({
            factsStatus: 'partial',
            coreStatus: 'unavailable',
            sessionStatus: 'available',
            openingRangeComplete: false,
            regularSessionComplete: true,
        }));

        expect(view.factsStatusLabel).toBe('Partially available');
        expect(view.coreStatusLabel).toBe('Unavailable');
        expect(view.sessionStatusLabel).toBe('Available');
        expect(view.openingRangeCompleteLabel).toBe('No');
        expect(view.regularSessionCompleteLabel).toBe('Yes');
    });

    it('preserves structured issues and no-known-conditions explanation', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment({ issue: 'no_known_conditions' }));

        expect(view.issue).toBe('no_known_conditions');
        expect(view.issueLabel).toBe('no_known_conditions');
        expect(view.issueExplanation).toBe(
            'No assessment conditions could be evaluated from the currently available facts.',
        );
    });

    it('maps upward and downward scenarios without changing order', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());

        expect(view.scenarios.map((item) => item.id)).toEqual([
            'upward_alignment',
            'downward_alignment',
        ]);
        expect(findScenario(view, 'upward_alignment')).toMatchObject({
            title: 'Upward alignment',
            description: 'Conditions defined by above or positive relationships.',
        });
        expect(findScenario(view, 'downward_alignment')).toMatchObject({
            title: 'Downward alignment',
            description: 'Conditions defined by below or negative relationships.',
        });
    });

    it('preserves section order in each scenario', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());

        expect(findScenario(view, 'upward_alignment').sections.map((item) => item.id)).toEqual([
            'soxl_5m',
            'soxl_daily',
            'qqq_5m',
            'smh_5m',
            'regular_session',
        ]);
    });

    it('preserves scenario and section counts', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());

        expect(findScenario(view, 'upward_alignment')).toMatchObject({
            metCount: 22,
            notMetCount: 0,
            unknownCount: 0,
            knownCount: 22,
            totalCount: 22,
        });
        expect(findSection(view, 'upward_alignment', 'soxl_5m')).toMatchObject({
            metCount: 6,
            totalCount: 6,
        });
    });

    it('maps condition state labels', () => {
        const mixedSection: SoxlAssessmentSection = {
            id: 'soxl_5m',
            conditions: [
                condition('soxl_5m_price_above_ema20', 'met', 'above', 'above'),
                condition('soxl_5m_ema9_above_ema20', 'not_met', 'above', 'below'),
                condition('soxl_5m_ema20_above_ema50', 'unknown', 'above', 'unavailable'),
            ],
            metCount: 1,
            notMetCount: 1,
            unknownCount: 1,
            knownCount: 2,
            totalCount: 3,
        };
        const view = buildSoxlMarketAssessmentView(baseAssessment({
            upwardAlignment: scenario('upward_alignment', [mixedSection]),
        }));

        expect(findCondition(view, 'soxl_5m_price_above_ema20').stateLabel).toBe('Matches');
        expect(findCondition(view, 'soxl_5m_ema9_above_ema20').stateLabel).toBe('Does not match');
        expect(findCondition(view, 'soxl_5m_ema20_above_ema50').stateLabel).toBe('Unknown');
    });

    it('maps relation and sign display labels', () => {
        const mixedSection: SoxlAssessmentSection = {
            id: 'soxl_5m',
            conditions: [
                condition('soxl_5m_price_above_ema20', 'met', 'above', 'equal'),
                condition('soxl_5m_ema9_above_ema20', 'met', 'below', 'below'),
                condition('soxl_5m_macd_histogram_positive', 'met', 'positive', 'positive'),
                condition('soxl_5m_macd_histogram_negative', 'met', 'negative', 'negative'),
                condition('soxl_5m_price_below_ema20', 'not_met', 'below', 'zero'),
                condition('soxl_5m_ema20_below_ema50', 'unknown', 'below', 'unavailable'),
            ],
            metCount: 4,
            notMetCount: 1,
            unknownCount: 1,
            knownCount: 5,
            totalCount: 6,
        };
        const view = buildSoxlMarketAssessmentView(baseAssessment({
            upwardAlignment: scenario('upward_alignment', [mixedSection]),
        }));

        expect(findCondition(view, 'soxl_5m_price_above_ema20').actualLabel).toBe('Equal');
        expect(findCondition(view, 'soxl_5m_ema9_above_ema20').expectedLabel).toBe('Below');
        expect(findCondition(view, 'soxl_5m_macd_histogram_positive').actualLabel).toBe('Positive');
        expect(findCondition(view, 'soxl_5m_macd_histogram_negative').actualLabel).toBe('Negative');
        expect(findCondition(view, 'soxl_5m_price_below_ema20').actualLabel).toBe('Zero');
        expect(findCondition(view, 'soxl_5m_ema20_below_ema50').actualLabel).toBe('Unavailable');
    });

    it('maps every required condition ID to its plain-language label', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());

        (Object.keys(requiredLabels) as SoxlConditionId[]).forEach((id) => {
            expect(findCondition(view, id).label).toBe(requiredLabels[id]);
        });
    });

    it('keeps unknown swing and session-level conditions unknown', () => {
        const swingSection = section(
            'soxl_5m',
            [
                'soxl_5m_price_above_latest_swing_high',
                'soxl_5m_price_below_latest_swing_low',
            ],
            'above',
            'unavailable',
            'unknown',
        );
        const sessionSection = section(
            'regular_session',
            [
                'regular_session_price_above_opening_range_high',
                'regular_session_price_below_opening_range_low',
            ],
            'above',
            'unavailable',
            'unknown',
        );
        const view = buildSoxlMarketAssessmentView(baseAssessment({
            upwardAlignment: scenario('upward_alignment', [swingSection, sessionSection]),
        }));

        expect(findCondition(view, 'soxl_5m_price_above_latest_swing_high').stateLabel).toBe('Unknown');
        expect(findCondition(view, 'soxl_5m_price_below_latest_swing_low').stateLabel).toBe('Unknown');
        expect(findCondition(view, 'regular_session_price_above_opening_range_high').stateLabel).toBe('Unknown');
        expect(findCondition(view, 'regular_session_price_below_opening_range_low').stateLabel).toBe('Unknown');
    });

    it('does not create percentages, ranks, or scenario selection fields', () => {
        const view = buildSoxlMarketAssessmentView(baseAssessment());
        const serialized = JSON.stringify(view).toLowerCase();
        const disallowed = [
            ['per', 'centage'],
            ['ra', 'nk'],
            ['pref', 'erred'],
            ['win', 'ner'],
            ['dom', 'inant'],
        ].map((parts) => parts.join(''));

        disallowed.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });

    it('does not mutate inputs or recalculate counts', () => {
        const assessment = baseAssessment();
        const before = JSON.stringify(assessment);
        const view = buildSoxlMarketAssessmentView(assessment);

        expect(JSON.stringify(assessment)).toBe(before);
        expect(view.scenarios[0]?.metCount).toBe(assessment.upwardAlignment.metCount);
        expect(view.scenarios[1]?.notMetCount).toBe(assessment.downwardAlignment.notMetCount);
    });

    it('does not copy raw provider messages or exception text', () => {
        const serialized = JSON.stringify(buildSoxlMarketAssessmentView(baseAssessment())).toLowerCase();

        expect(serialized).not.toContain('provider exception');
        expect(serialized).not.toContain('https://');
        expect(serialized).not.toContain('stacktrace');
    });

    it('keeps prohibited concepts out of result keys and string values except formal MACD wording', () => {
        const serialized = JSON.stringify(buildSoxlMarketAssessmentView(baseAssessment()))
            .toLowerCase()
            .replaceAll('macd signal line', '')
            .replaceAll('_signal', '');
        const disallowed = [
            ['b', 'uy'],
            ['s', 'ell'],
            ['en', 'try'],
            ['ex', 'it'],
            ['st', 'op'],
            ['tar', 'get'],
            ['rec', 'ommendation'],
            ['pref', 'erred'],
            ['win', 'ner'],
            ['dom', 'inant'],
            ['prob', 'ability'],
            ['conf', 'idence percentage'],
            ['sc', 'ore'],
            ['trade ', 'action'],
            ['profit ', 'potential'],
            ['str', 'ong'],
            ['we', 'ak'],
            ['over', 'bought'],
            ['over', 'sold'],
            ['break', 'out'],
            ['break', 'down'],
            ['risk', '-on'],
            ['risk', '-off'],
        ].map((parts) => parts.join(''));

        disallowed.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });
});
