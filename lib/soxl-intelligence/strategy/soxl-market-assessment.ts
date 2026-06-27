import type {
    NumericRelation,
    NumericSign,
    SoxlMarketFacts,
    SoxlMarketFactsIssue,
    SoxlMarketFactsStatus,
} from './soxl-market-facts';

export type SoxlConditionState =
    | 'met'
    | 'not_met'
    | 'unknown';

export type SoxlAssessmentStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlScenarioId =
    | 'upward_alignment'
    | 'downward_alignment';

export type SoxlAssessmentSectionId =
    | 'soxl_5m'
    | 'soxl_daily'
    | 'qqq_5m'
    | 'smh_5m'
    | 'regular_session';

export type SoxlMarketAssessmentIssue =
    | 'no_known_conditions'
    | SoxlMarketFactsIssue;

export type SoxlConditionId =
    | 'soxl_5m_price_above_ema20'
    | 'soxl_5m_ema9_above_ema20'
    | 'soxl_5m_ema20_above_ema50'
    | 'soxl_5m_macd_line_above_signal'
    | 'soxl_5m_macd_histogram_positive'
    | 'soxl_5m_price_above_latest_swing_high'
    | 'soxl_daily_price_above_ema50'
    | 'soxl_daily_price_above_ema200'
    | 'soxl_daily_ema20_above_ema50'
    | 'soxl_daily_ema50_above_ema200'
    | 'soxl_daily_macd_line_above_signal'
    | 'soxl_daily_macd_histogram_positive'
    | 'soxl_daily_price_above_latest_swing_high'
    | 'qqq_5m_price_above_ema20'
    | 'qqq_5m_ema20_above_ema50'
    | 'qqq_5m_macd_histogram_positive'
    | 'smh_5m_price_above_ema20'
    | 'smh_5m_ema20_above_ema50'
    | 'smh_5m_macd_histogram_positive'
    | 'regular_session_price_above_vwap'
    | 'regular_session_price_above_opening_range_high'
    | 'regular_session_price_above_previous_session_high'
    | 'soxl_5m_price_below_ema20'
    | 'soxl_5m_ema9_below_ema20'
    | 'soxl_5m_ema20_below_ema50'
    | 'soxl_5m_macd_line_below_signal'
    | 'soxl_5m_macd_histogram_negative'
    | 'soxl_5m_price_below_latest_swing_low'
    | 'soxl_daily_price_below_ema50'
    | 'soxl_daily_price_below_ema200'
    | 'soxl_daily_ema20_below_ema50'
    | 'soxl_daily_ema50_below_ema200'
    | 'soxl_daily_macd_line_below_signal'
    | 'soxl_daily_macd_histogram_negative'
    | 'soxl_daily_price_below_latest_swing_low'
    | 'qqq_5m_price_below_ema20'
    | 'qqq_5m_ema20_below_ema50'
    | 'qqq_5m_macd_histogram_negative'
    | 'smh_5m_price_below_ema20'
    | 'smh_5m_ema20_below_ema50'
    | 'smh_5m_macd_histogram_negative'
    | 'regular_session_price_below_vwap'
    | 'regular_session_price_below_opening_range_low'
    | 'regular_session_price_below_previous_session_low';

export interface SoxlConditionAssessment {
    id: SoxlConditionId;
    state: SoxlConditionState;
    expected:
        | 'above'
        | 'below'
        | 'positive'
        | 'negative';
    actual:
        | NumericRelation
        | NumericSign;
}

export interface SoxlAssessmentSection {
    id: SoxlAssessmentSectionId;
    conditions: readonly SoxlConditionAssessment[];
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
}

export interface SoxlScenarioAssessment {
    id: SoxlScenarioId;
    sections: readonly SoxlAssessmentSection[];
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
}

export interface SoxlMarketAssessment {
    status: SoxlAssessmentStatus;
    providerId: string | null;
    asOf: number | null;
    factsStatus: SoxlMarketFactsStatus;
    coreStatus: SoxlMarketFacts['coreStatus'];
    sessionStatus: SoxlMarketFacts['sessionStatus'];
    issue: SoxlMarketAssessmentIssue | null;
    upwardAlignment: SoxlScenarioAssessment;
    downwardAlignment: SoxlScenarioAssessment;
    openingRangeComplete: boolean;
    regularSessionComplete: boolean;
}

function evaluateRelation(
    actual: NumericRelation,
    expected: 'above' | 'below',
): SoxlConditionState {
    if (actual === 'unavailable') {
        return 'unknown';
    }

    if (actual === expected) {
        return 'met';
    }

    return 'not_met';
}

function evaluateSign(
    actual: NumericSign,
    expected: 'positive' | 'negative',
): SoxlConditionState {
    if (actual === 'unavailable') {
        return 'unknown';
    }

    if (actual === expected) {
        return 'met';
    }

    return 'not_met';
}

function relationCondition(
    id: SoxlConditionId,
    actual: NumericRelation,
    expected: 'above' | 'below',
): SoxlConditionAssessment {
    return {
        id,
        state: evaluateRelation(actual, expected),
        expected,
        actual,
    };
}

function signCondition(
    id: SoxlConditionId,
    actual: NumericSign,
    expected: 'positive' | 'negative',
): SoxlConditionAssessment {
    return {
        id,
        state: evaluateSign(actual, expected),
        expected,
        actual,
    };
}

function countConditions(
    conditions: readonly SoxlConditionAssessment[],
): Omit<SoxlAssessmentSection, 'id' | 'conditions'> {
    const metCount = conditions.filter((condition) => condition.state === 'met').length;
    const notMetCount = conditions.filter((condition) => condition.state === 'not_met').length;
    const unknownCount = conditions.filter((condition) => condition.state === 'unknown').length;
    const totalCount = conditions.length;

    return {
        metCount,
        notMetCount,
        unknownCount,
        knownCount: totalCount - unknownCount,
        totalCount,
    };
}

function buildSection(
    id: SoxlAssessmentSectionId,
    conditions: readonly SoxlConditionAssessment[],
): SoxlAssessmentSection {
    return {
        id,
        conditions,
        ...countConditions(conditions),
    };
}

function countSections(
    sections: readonly SoxlAssessmentSection[],
): Omit<SoxlScenarioAssessment, 'id' | 'sections'> {
    return sections.reduce(
        (counts, section) => ({
            metCount: counts.metCount + section.metCount,
            notMetCount: counts.notMetCount + section.notMetCount,
            unknownCount: counts.unknownCount + section.unknownCount,
            knownCount: counts.knownCount + section.knownCount,
            totalCount: counts.totalCount + section.totalCount,
        }),
        {
            metCount: 0,
            notMetCount: 0,
            unknownCount: 0,
            knownCount: 0,
            totalCount: 0,
        },
    );
}

function buildScenario(
    id: SoxlScenarioId,
    sections: readonly SoxlAssessmentSection[],
): SoxlScenarioAssessment {
    return {
        id,
        sections,
        ...countSections(sections),
    };
}

function buildUpwardAlignment(facts: SoxlMarketFacts): SoxlScenarioAssessment {
    return buildScenario('upward_alignment', [
        buildSection('soxl_5m', [
            relationCondition('soxl_5m_price_above_ema20', facts.soxl5m.closeVsEma20, 'above'),
            relationCondition('soxl_5m_ema9_above_ema20', facts.soxl5m.ema9VsEma20, 'above'),
            relationCondition('soxl_5m_ema20_above_ema50', facts.soxl5m.ema20VsEma50, 'above'),
            relationCondition('soxl_5m_macd_line_above_signal', facts.soxl5m.macdLineVsSignal, 'above'),
            signCondition('soxl_5m_macd_histogram_positive', facts.soxl5m.macdHistogramSign, 'positive'),
            relationCondition(
                'soxl_5m_price_above_latest_swing_high',
                facts.soxl5m.closeVsLatestConfirmedSwingHigh,
                'above',
            ),
        ]),
        buildSection('soxl_daily', [
            relationCondition('soxl_daily_price_above_ema50', facts.soxlDaily.closeVsEma50, 'above'),
            relationCondition('soxl_daily_price_above_ema200', facts.soxlDaily.closeVsEma200, 'above'),
            relationCondition('soxl_daily_ema20_above_ema50', facts.soxlDaily.ema20VsEma50, 'above'),
            relationCondition('soxl_daily_ema50_above_ema200', facts.soxlDaily.ema50VsEma200, 'above'),
            relationCondition('soxl_daily_macd_line_above_signal', facts.soxlDaily.macdLineVsSignal, 'above'),
            signCondition('soxl_daily_macd_histogram_positive', facts.soxlDaily.macdHistogramSign, 'positive'),
            relationCondition(
                'soxl_daily_price_above_latest_swing_high',
                facts.soxlDaily.closeVsLatestConfirmedSwingHigh,
                'above',
            ),
        ]),
        buildSection('qqq_5m', [
            relationCondition('qqq_5m_price_above_ema20', facts.qqq5m.closeVsEma20, 'above'),
            relationCondition('qqq_5m_ema20_above_ema50', facts.qqq5m.ema20VsEma50, 'above'),
            signCondition('qqq_5m_macd_histogram_positive', facts.qqq5m.macdHistogramSign, 'positive'),
        ]),
        buildSection('smh_5m', [
            relationCondition('smh_5m_price_above_ema20', facts.smh5m.closeVsEma20, 'above'),
            relationCondition('smh_5m_ema20_above_ema50', facts.smh5m.ema20VsEma50, 'above'),
            signCondition('smh_5m_macd_histogram_positive', facts.smh5m.macdHistogramSign, 'positive'),
        ]),
        buildSection('regular_session', [
            relationCondition('regular_session_price_above_vwap', facts.regularSession.closeVsVwap, 'above'),
            relationCondition(
                'regular_session_price_above_opening_range_high',
                facts.regularSession.closeVsOpeningRangeHigh,
                'above',
            ),
            relationCondition(
                'regular_session_price_above_previous_session_high',
                facts.regularSession.closeVsPreviousSessionHigh,
                'above',
            ),
        ]),
    ]);
}

function buildDownwardAlignment(facts: SoxlMarketFacts): SoxlScenarioAssessment {
    return buildScenario('downward_alignment', [
        buildSection('soxl_5m', [
            relationCondition('soxl_5m_price_below_ema20', facts.soxl5m.closeVsEma20, 'below'),
            relationCondition('soxl_5m_ema9_below_ema20', facts.soxl5m.ema9VsEma20, 'below'),
            relationCondition('soxl_5m_ema20_below_ema50', facts.soxl5m.ema20VsEma50, 'below'),
            relationCondition('soxl_5m_macd_line_below_signal', facts.soxl5m.macdLineVsSignal, 'below'),
            signCondition('soxl_5m_macd_histogram_negative', facts.soxl5m.macdHistogramSign, 'negative'),
            relationCondition(
                'soxl_5m_price_below_latest_swing_low',
                facts.soxl5m.closeVsLatestConfirmedSwingLow,
                'below',
            ),
        ]),
        buildSection('soxl_daily', [
            relationCondition('soxl_daily_price_below_ema50', facts.soxlDaily.closeVsEma50, 'below'),
            relationCondition('soxl_daily_price_below_ema200', facts.soxlDaily.closeVsEma200, 'below'),
            relationCondition('soxl_daily_ema20_below_ema50', facts.soxlDaily.ema20VsEma50, 'below'),
            relationCondition('soxl_daily_ema50_below_ema200', facts.soxlDaily.ema50VsEma200, 'below'),
            relationCondition('soxl_daily_macd_line_below_signal', facts.soxlDaily.macdLineVsSignal, 'below'),
            signCondition('soxl_daily_macd_histogram_negative', facts.soxlDaily.macdHistogramSign, 'negative'),
            relationCondition(
                'soxl_daily_price_below_latest_swing_low',
                facts.soxlDaily.closeVsLatestConfirmedSwingLow,
                'below',
            ),
        ]),
        buildSection('qqq_5m', [
            relationCondition('qqq_5m_price_below_ema20', facts.qqq5m.closeVsEma20, 'below'),
            relationCondition('qqq_5m_ema20_below_ema50', facts.qqq5m.ema20VsEma50, 'below'),
            signCondition('qqq_5m_macd_histogram_negative', facts.qqq5m.macdHistogramSign, 'negative'),
        ]),
        buildSection('smh_5m', [
            relationCondition('smh_5m_price_below_ema20', facts.smh5m.closeVsEma20, 'below'),
            relationCondition('smh_5m_ema20_below_ema50', facts.smh5m.ema20VsEma50, 'below'),
            signCondition('smh_5m_macd_histogram_negative', facts.smh5m.macdHistogramSign, 'negative'),
        ]),
        buildSection('regular_session', [
            relationCondition('regular_session_price_below_vwap', facts.regularSession.closeVsVwap, 'below'),
            relationCondition(
                'regular_session_price_below_opening_range_low',
                facts.regularSession.closeVsOpeningRangeLow,
                'below',
            ),
            relationCondition(
                'regular_session_price_below_previous_session_low',
                facts.regularSession.closeVsPreviousSessionLow,
                'below',
            ),
        ]),
    ]);
}

function getAssessmentStatus(
    factsStatus: SoxlMarketFactsStatus,
    knownCount: number,
    unknownCount: number,
): SoxlAssessmentStatus {
    if (factsStatus === 'unavailable' || knownCount === 0) {
        return 'unavailable';
    }

    if (factsStatus === 'partial' || unknownCount > 0) {
        return 'partial';
    }

    return 'available';
}

function getAssessmentIssue(
    facts: SoxlMarketFacts,
    status: SoxlAssessmentStatus,
    knownCount: number,
): SoxlMarketAssessmentIssue | null {
    if (facts.issue !== null) {
        return facts.issue;
    }

    if (status === 'unavailable' && knownCount === 0) {
        return 'no_known_conditions';
    }

    return null;
}

export function assessSoxlMarketFacts(
    facts: SoxlMarketFacts,
): SoxlMarketAssessment {
    const upwardAlignment = buildUpwardAlignment(facts);
    const downwardAlignment = buildDownwardAlignment(facts);
    const knownCount = upwardAlignment.knownCount + downwardAlignment.knownCount;
    const unknownCount = upwardAlignment.unknownCount + downwardAlignment.unknownCount;
    const status = getAssessmentStatus(facts.status, knownCount, unknownCount);

    return {
        status,
        providerId: facts.providerId,
        asOf: facts.asOf,
        factsStatus: facts.status,
        coreStatus: facts.coreStatus,
        sessionStatus: facts.sessionStatus,
        issue: getAssessmentIssue(facts, status, knownCount),
        upwardAlignment,
        downwardAlignment,
        openingRangeComplete: facts.regularSession.openingRange30mCompleted,
        regularSessionComplete: facts.regularSession.latestRegularSessionCompleted,
    };
}
