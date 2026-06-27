import {
    formatSoxlDisplayTimestamp,
} from '../presentation/time-format';
import type {
    NumericRelation,
    NumericSign,
} from './soxl-market-facts';
import type {
    SoxlAssessmentSection,
    SoxlAssessmentSectionId,
    SoxlAssessmentStatus,
    SoxlConditionAssessment,
    SoxlConditionId,
    SoxlConditionState,
    SoxlMarketAssessment,
    SoxlMarketAssessmentIssue,
    SoxlScenarioAssessment,
    SoxlScenarioId,
} from './soxl-market-assessment';

export interface SoxlAssessmentConditionView {
    id: SoxlConditionId;
    label: string;
    state: SoxlConditionState;
    stateLabel: string;
    expected: SoxlConditionAssessment['expected'];
    expectedLabel: string;
    actual: NumericRelation | NumericSign;
    actualLabel: string;
}

export interface SoxlAssessmentSectionView {
    id: SoxlAssessmentSectionId;
    title: string;
    conditions: readonly SoxlAssessmentConditionView[];
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
}

export interface SoxlScenarioAssessmentView {
    id: SoxlScenarioId;
    title: string;
    description: string;
    sections: readonly SoxlAssessmentSectionView[];
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
}

export interface SoxlMarketAssessmentView {
    status: SoxlAssessmentStatus;
    statusLabel: string;
    providerId: string;
    asOf: number | null;
    asOfLabel: string;
    factsStatus: SoxlAssessmentStatus;
    factsStatusLabel: string;
    coreStatus: SoxlAssessmentStatus;
    coreStatusLabel: string;
    sessionStatus: SoxlAssessmentStatus;
    sessionStatusLabel: string;
    openingRangeComplete: boolean;
    openingRangeCompleteLabel: string;
    regularSessionComplete: boolean;
    regularSessionCompleteLabel: string;
    issue: SoxlMarketAssessmentIssue | null;
    issueLabel: string | null;
    issueExplanation: string | null;
    scenarios: readonly SoxlScenarioAssessmentView[];
}

const unavailableLabel = 'Unavailable';

const statusLabels: Record<SoxlAssessmentStatus, string> = {
    available: 'Available',
    partial: 'Partially available',
    unavailable: unavailableLabel,
};

const stateLabels: Record<SoxlConditionState, string> = {
    met: 'Matches',
    not_met: 'Does not match',
    unknown: 'Unknown',
};

const valueLabels: Record<NumericRelation | NumericSign, string> = {
    above: 'Above',
    below: 'Below',
    equal: 'Equal',
    positive: 'Positive',
    negative: 'Negative',
    zero: 'Zero',
    unavailable: unavailableLabel,
};

const issueLabels: Record<SoxlMarketAssessmentIssue, string> = {
    no_known_conditions: 'no_known_conditions',
    snapshot_identity_mismatch: 'snapshot_identity_mismatch',
    snapshot_source_mismatch: 'snapshot_source_mismatch',
    no_comparable_data: 'no_comparable_data',
};

const conditionLabels: Record<SoxlConditionId, string> = {
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

const sectionTitles: Record<SoxlAssessmentSectionId, string> = {
    soxl_5m: 'SOXL \u00b7 5 minute',
    soxl_daily: 'SOXL \u00b7 Daily',
    qqq_5m: 'QQQ \u00b7 5 minute',
    smh_5m: 'SMH \u00b7 5 minute',
    regular_session: 'Regular session',
};

const scenarioTitles: Record<SoxlScenarioId, string> = {
    upward_alignment: 'Upward alignment',
    downward_alignment: 'Downward alignment',
};

const scenarioDescriptions: Record<SoxlScenarioId, string> = {
    upward_alignment: 'Conditions defined by above or positive relationships.',
    downward_alignment: 'Conditions defined by below or negative relationships.',
};

function formatBoolean(value: boolean): string {
    return value ? 'Yes' : 'No';
}

function buildConditionView(
    condition: SoxlConditionAssessment,
): SoxlAssessmentConditionView {
    return {
        id: condition.id,
        label: conditionLabels[condition.id],
        state: condition.state,
        stateLabel: stateLabels[condition.state],
        expected: condition.expected,
        expectedLabel: valueLabels[condition.expected],
        actual: condition.actual,
        actualLabel: valueLabels[condition.actual],
    };
}

function buildSectionView(
    section: SoxlAssessmentSection,
): SoxlAssessmentSectionView {
    return {
        id: section.id,
        title: sectionTitles[section.id],
        conditions: section.conditions.map(buildConditionView),
        metCount: section.metCount,
        notMetCount: section.notMetCount,
        unknownCount: section.unknownCount,
        knownCount: section.knownCount,
        totalCount: section.totalCount,
    };
}

function buildScenarioView(
    scenario: SoxlScenarioAssessment,
): SoxlScenarioAssessmentView {
    return {
        id: scenario.id,
        title: scenarioTitles[scenario.id],
        description: scenarioDescriptions[scenario.id],
        sections: scenario.sections.map(buildSectionView),
        metCount: scenario.metCount,
        notMetCount: scenario.notMetCount,
        unknownCount: scenario.unknownCount,
        knownCount: scenario.knownCount,
        totalCount: scenario.totalCount,
    };
}

function getIssueExplanation(issue: SoxlMarketAssessmentIssue | null): string | null {
    if (issue === 'no_known_conditions') {
        return 'No assessment conditions could be evaluated from the currently available facts.';
    }

    return null;
}

export function buildSoxlMarketAssessmentView(
    assessment: SoxlMarketAssessment,
): SoxlMarketAssessmentView {
    return {
        status: assessment.status,
        statusLabel: statusLabels[assessment.status],
        providerId: assessment.providerId ?? unavailableLabel,
        asOf: assessment.asOf,
        asOfLabel: formatSoxlDisplayTimestamp(assessment.asOf),
        factsStatus: assessment.factsStatus,
        factsStatusLabel: statusLabels[assessment.factsStatus],
        coreStatus: assessment.coreStatus,
        coreStatusLabel: statusLabels[assessment.coreStatus],
        sessionStatus: assessment.sessionStatus,
        sessionStatusLabel: statusLabels[assessment.sessionStatus],
        openingRangeComplete: assessment.openingRangeComplete,
        openingRangeCompleteLabel: formatBoolean(assessment.openingRangeComplete),
        regularSessionComplete: assessment.regularSessionComplete,
        regularSessionCompleteLabel: formatBoolean(assessment.regularSessionComplete),
        issue: assessment.issue,
        issueLabel: assessment.issue === null ? null : issueLabels[assessment.issue],
        issueExplanation: getIssueExplanation(assessment.issue),
        scenarios: [
            buildScenarioView(assessment.upwardAlignment),
            buildScenarioView(assessment.downwardAlignment),
        ],
    };
}
