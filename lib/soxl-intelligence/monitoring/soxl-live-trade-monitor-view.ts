import {
    formatSoxlDisplayTimestamp,
} from '../presentation/time-format';
import type {
    SoxlTradePlan,
} from '../planning/soxl-trade-plan';
import type {
    SoxlConditionId,
} from '../strategy/soxl-market-assessment';
import type {
    NumericRelation,
    NumericSign,
} from '../strategy/soxl-market-facts';
import type {
    SoxlConditionChangeState,
    SoxlConditionComparisonCounts,
    SoxlLiveTradeMonitor,
    SoxlLiveTradeMonitorIssue,
    SoxlLiveTradeMonitorStatus,
    SoxlPriceLevelState,
    SoxlQuantityUsageState,
    SoxlSectionComparison,
} from './soxl-live-trade-monitor';

export interface SoxlMonitorValueView {
    rawValue: number | string | null;
    value: string;
}

export interface SoxlMonitorIssueView {
    code: SoxlLiveTradeMonitorIssue;
    explanation: string;
}

export interface SoxlMonitorSummaryView {
    providerId: string | null;
    providerLabel: string;
    baselineAsOf: number | null;
    baselineAsOfLabel: string;
    currentAsOf: number | null;
    currentAsOfLabel: string;
    currentFactsStatus: SoxlLiveTradeMonitor['currentFactsStatus'];
    currentFactsStatusLabel: string;
    currentAssessmentStatus: SoxlLiveTradeMonitor['currentAssessmentStatus'];
    currentAssessmentStatusLabel: string;
    priceMonitoringStatus: SoxlLiveTradeMonitor['priceMonitoring']['status'];
    priceMonitoringStatusLabel: string;
    assessmentComparisonStatus: SoxlLiveTradeMonitor['assessmentComparison']['status'];
    assessmentComparisonStatusLabel: string;
}

export interface SoxlMonitorExecutionView {
    executionPrice: SoxlMonitorValueView;
    executedQuantity: SoxlMonitorValueView;
    actualEntryFee: SoxlMonitorValueView;
    estimatedCurrentExitFee: SoxlMonitorValueView;
}

export interface SoxlMonitorPriceView {
    status: SoxlLiveTradeMonitor['priceMonitoring']['status'];
    statusLabel: string;
    source: SoxlLiveTradeMonitor['priceMonitoring']['source'];
    sourceLabel: 'Latest completed five-minute candle';
    currentPrice: SoxlMonitorValueView;
    currentPriceTimestamp: number | null;
    currentPriceTimestampLabel: string;
    entryNotional: SoxlMonitorValueView;
    currentNotional: SoxlMonitorValueView;
    priceMovePerUnit: SoxlMonitorValueView;
    grossUnrealizedPnl: SoxlMonitorValueView;
    estimatedNetUnrealizedPnl: SoxlMonitorValueView;
    estimatedNetReturnOnEntryNotional: SoxlMonitorValueView;
    initialRiskPerUnit: SoxlMonitorValueView;
    priceMoveInInitialRiskUnits: SoxlMonitorValueView;
}

export interface SoxlMonitorInvalidationView {
    invalidationPrice: SoxlMonitorValueView;
    state: SoxlPriceLevelState;
    stateLabel: string;
    remainingDistancePerUnit: SoxlMonitorValueView;
}

export interface SoxlMonitorQuantityView {
    executedQuantity: SoxlMonitorValueView;
    calculatedMaximumQuantity: SoxlMonitorValueView;
    quantityDifference: SoxlMonitorValueView;
    state: SoxlQuantityUsageState;
    stateLabel: string;
}

export interface SoxlMonitorTargetView {
    id: string;
    planStatus: SoxlLiveTradeMonitor['targets'][number]['planStatus'];
    planStatusLabel: string;
    planIssue: SoxlLiveTradeMonitor['targets'][number]['planIssue'];
    planIssueLabel: string;
    price: SoxlMonitorValueView;
    estimatedExitFee: SoxlMonitorValueView;
    monitoringStatus: SoxlLiveTradeMonitor['targets'][number]['monitoringStatus'];
    monitoringStatusLabel: string;
    targetState: SoxlPriceLevelState;
    targetStateLabel: string;
    remainingDistancePerUnit: SoxlMonitorValueView;
    rewardPerUnit: SoxlMonitorValueView;
    grossProfitAtMaximumQuantity: SoxlMonitorValueView;
    estimatedNetProfitAtMaximumQuantity: SoxlMonitorValueView;
    priceRewardToRiskMultiple: SoxlMonitorValueView;
}

export interface SoxlMonitorCountsView extends SoxlConditionComparisonCounts {
    unchangedMetLabel: 'Still matches';
    unchangedNotMetLabel: 'Still does not match';
    unchangedUnknownLabel: 'Still unknown';
    becameMetLabel: 'Now matches';
    becameNotMetLabel: 'Now does not match';
    becameUnknownLabel: 'Now unknown';
    changedLabel: 'Changed conditions';
    totalLabel: 'Total conditions';
}

export interface SoxlMonitorConditionView {
    scenarioId: SoxlLiveTradeMonitor['assessmentComparison']['scenarios'][number]['id'];
    sectionId: SoxlSectionComparison['id'];
    conditionId: SoxlConditionId;
    label: string;
    expected: SoxlLiveTradeMonitor['assessmentComparison']['scenarios'][number]['sections'][number]['conditions'][number]['expected'];
    expectedLabel: string;
    baselineActual: NumericRelation | NumericSign;
    baselineActualLabel: string;
    baselineState: SoxlLiveTradeMonitor['assessmentComparison']['scenarios'][number]['sections'][number]['conditions'][number]['baselineState'];
    baselineStateLabel: string;
    currentActual: NumericRelation | NumericSign;
    currentActualLabel: string;
    currentState: SoxlLiveTradeMonitor['assessmentComparison']['scenarios'][number]['sections'][number]['conditions'][number]['currentState'];
    currentStateLabel: string;
    changeState: SoxlConditionChangeState;
    changeLabel: string;
}

export interface SoxlMonitorSectionView extends SoxlMonitorCountsView {
    id: SoxlSectionComparison['id'];
    title: string;
    conditions: readonly SoxlMonitorConditionView[];
}

export interface SoxlMonitorScenarioView extends SoxlMonitorCountsView {
    id: SoxlLiveTradeMonitor['assessmentComparison']['scenarios'][number]['id'];
    title: string;
    sections: readonly SoxlMonitorSectionView[];
}

export interface SoxlMonitorAssessmentComparisonView {
    status: SoxlLiveTradeMonitor['assessmentComparison']['status'];
    statusLabel: string;
    scenarios: readonly SoxlMonitorScenarioView[];
}

export interface SoxlLiveTradeMonitorView {
    status: SoxlLiveTradeMonitorStatus;
    statusLabel: string;
    issues: readonly SoxlMonitorIssueView[];
    side: SoxlLiveTradeMonitor['side'];
    sideLabel: string;
    summary: SoxlMonitorSummaryView;
    execution: SoxlMonitorExecutionView;
    price: SoxlMonitorPriceView;
    invalidation: SoxlMonitorInvalidationView;
    quantity: SoxlMonitorQuantityView;
    targets: readonly SoxlMonitorTargetView[];
    assessmentComparison: SoxlMonitorAssessmentComparisonView;
}

export interface SoxlSelectedTradePlanContextView {
    side: SoxlTradePlan['side'];
    sideLabel: string;
    invalidationPrice: SoxlMonitorValueView;
    calculatedMaximumQuantity: SoxlMonitorValueView;
    quantityIncrement: SoxlMonitorValueView;
    maximumPositionValue: SoxlMonitorValueView;
    targets: readonly {
        id: string;
        status: SoxlTradePlan['targets'][number]['status'];
        statusLabel: string;
        issue: SoxlTradePlan['targets'][number]['issue'];
        issueLabel: string;
        price: SoxlMonitorValueView;
        estimatedExitFee: SoxlMonitorValueView;
    }[];
}

const unavailableLabel = 'Unavailable';

const statusLabels = {
    available: 'Available',
    partial: 'Partially available',
    unavailable: unavailableLabel,
} as const;

const priceLevelLabels: Record<SoxlPriceLevelState, string> = {
    reached: 'Level reached',
    not_reached: 'Level not reached',
    unavailable: unavailableLabel,
};

const quantityUsageLabels: Record<SoxlQuantityUsageState, string> = {
    below_calculated_maximum: 'Below calculated maximum',
    at_calculated_maximum: 'At calculated maximum',
    above_calculated_maximum: 'Above calculated maximum',
    unavailable: unavailableLabel,
};

const issueExplanations: Record<SoxlLiveTradeMonitorIssue, string> = {
    plan_unavailable: 'The selected plan does not contain an available base risk calculation.',
    invalid_execution_price: 'Enter a positive actual execution price.',
    invalid_executed_quantity: 'Enter a positive executed quantity.',
    invalid_actual_entry_fee: 'Enter an actual entry fee of zero or more.',
    invalid_estimated_current_exit_fee: 'Enter an estimated current exit fee of zero or more.',
    execution_invalidation_wrong_side: 'The execution price must remain on the valid side of the plan\'s invalidation level.',
    plan_baseline_identity_mismatch: 'The selected plan and captured baseline assessment do not describe the same market snapshot.',
    current_snapshot_identity_mismatch: 'The current market facts and assessment do not describe the same snapshot.',
    provider_mismatch: 'The baseline and current snapshots use different providers.',
    condition_set_mismatch: 'The baseline and current assessments do not contain the same condition structure.',
    current_price_unavailable: 'The latest completed five-minute SOXL price is unavailable.',
    no_monitoring_data: 'Neither price monitoring nor condition comparison is currently available.',
};

const conditionStateLabels = {
    met: 'Matches',
    not_met: 'Does not match',
    unknown: 'Unknown',
} as const;

const changeLabels: Record<SoxlConditionChangeState, string> = {
    unchanged_met: 'Still matches',
    unchanged_not_met: 'Still does not match',
    unchanged_unknown: 'Still unknown',
    became_met: 'Now matches',
    became_not_met: 'Now does not match',
    became_unknown: 'Now unknown',
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

const sectionTitles: Record<SoxlSectionComparison['id'], string> = {
    soxl_5m: 'SOXL \u00b7 5 minute',
    soxl_daily: 'SOXL \u00b7 Daily',
    qqq_5m: 'QQQ \u00b7 5 minute',
    smh_5m: 'SMH \u00b7 5 minute',
    regular_session: 'Regular session',
};

const scenarioTitles = {
    upward_alignment: 'Upward alignment changes',
    downward_alignment: 'Downward alignment changes',
} as const;

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

function formatNumber(value: number | null, maximumFractionDigits: number): string {
    if (value === null || !Number.isFinite(value)) {
        return unavailableLabel;
    }

    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    }).format(value);
}

function formatMoney(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
        return unavailableLabel;
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function price(value: number | null): SoxlMonitorValueView {
    return { rawValue: value, value: formatNumber(value, 4) };
}

function money(value: number | null): SoxlMonitorValueView {
    return { rawValue: value, value: formatMoney(value) };
}

function quantity(value: number | null): SoxlMonitorValueView {
    return { rawValue: value, value: formatNumber(value, 8) };
}

function ratio(value: number | null): SoxlMonitorValueView {
    return {
        rawValue: value,
        value: value === null || !Number.isFinite(value)
            ? unavailableLabel
            : new Intl.NumberFormat('en-US', {
                style: 'percent',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            }).format(value),
    };
}

function riskUnits(value: number | null): SoxlMonitorValueView {
    return {
        rawValue: value,
        value: value === null || !Number.isFinite(value)
            ? unavailableLabel
            : `${formatNumber(value, 3)}x`,
    };
}

function timestamp(value: number | null): string {
    return value === null ? unavailableLabel : formatSoxlDisplayTimestamp(value);
}

function countsView(counts: SoxlConditionComparisonCounts): SoxlMonitorCountsView {
    return {
        unchangedMetCount: counts.unchangedMetCount,
        unchangedNotMetCount: counts.unchangedNotMetCount,
        unchangedUnknownCount: counts.unchangedUnknownCount,
        becameMetCount: counts.becameMetCount,
        becameNotMetCount: counts.becameNotMetCount,
        becameUnknownCount: counts.becameUnknownCount,
        changedCount: counts.changedCount,
        totalCount: counts.totalCount,
        unchangedMetLabel: 'Still matches',
        unchangedNotMetLabel: 'Still does not match',
        unchangedUnknownLabel: 'Still unknown',
        becameMetLabel: 'Now matches',
        becameNotMetLabel: 'Now does not match',
        becameUnknownLabel: 'Now unknown',
        changedLabel: 'Changed conditions',
        totalLabel: 'Total conditions',
    };
}

function buildSectionView(section: SoxlSectionComparison): SoxlMonitorSectionView {
    return {
        id: section.id,
        title: sectionTitles[section.id],
        conditions: section.conditions.map((condition) => ({
            scenarioId: condition.scenarioId,
            sectionId: condition.sectionId,
            conditionId: condition.conditionId,
            label: conditionLabels[condition.conditionId],
            expected: condition.expected,
            expectedLabel: valueLabels[condition.expected],
            baselineActual: condition.baselineActual,
            baselineActualLabel: valueLabels[condition.baselineActual],
            baselineState: condition.baselineState,
            baselineStateLabel: conditionStateLabels[condition.baselineState],
            currentActual: condition.currentActual,
            currentActualLabel: valueLabels[condition.currentActual],
            currentState: condition.currentState,
            currentStateLabel: conditionStateLabels[condition.currentState],
            changeState: condition.changeState,
            changeLabel: changeLabels[condition.changeState],
        })),
        ...countsView(section),
    };
}

export function buildSoxlSelectedTradePlanContextView(
    plan: SoxlTradePlan,
): SoxlSelectedTradePlanContextView {
    return {
        side: plan.side,
        sideLabel: plan.side === 'long' ? 'Long' : 'Short',
        invalidationPrice: price(plan.invalidationPrice),
        calculatedMaximumQuantity: quantity(plan.calculation?.maximumQuantity ?? null),
        quantityIncrement: quantity(plan.quantityIncrement),
        maximumPositionValue: money(plan.maximumPositionValue),
        targets: plan.targets.map((target) => ({
            id: target.id,
            status: target.status,
            statusLabel: statusLabels[target.status],
            issue: target.issue,
            issueLabel: target.issue ?? 'None',
            price: price(target.price),
            estimatedExitFee: money(target.estimatedExitFee),
        })),
    };
}

export function buildSoxlLiveTradeMonitorView(
    monitor: SoxlLiveTradeMonitor,
): SoxlLiveTradeMonitorView {
    return {
        status: monitor.status,
        statusLabel: statusLabels[monitor.status],
        issues: monitor.issues.map((issue) => ({
            code: issue,
            explanation: issueExplanations[issue],
        })),
        side: monitor.side,
        sideLabel: monitor.side === 'long' ? 'Long' : 'Short',
        summary: {
            providerId: monitor.providerId,
            providerLabel: monitor.providerId ?? unavailableLabel,
            baselineAsOf: monitor.baselineAsOf,
            baselineAsOfLabel: timestamp(monitor.baselineAsOf),
            currentAsOf: monitor.currentAsOf,
            currentAsOfLabel: timestamp(monitor.currentAsOf),
            currentFactsStatus: monitor.currentFactsStatus,
            currentFactsStatusLabel: statusLabels[monitor.currentFactsStatus],
            currentAssessmentStatus: monitor.currentAssessmentStatus,
            currentAssessmentStatusLabel: statusLabels[monitor.currentAssessmentStatus],
            priceMonitoringStatus: monitor.priceMonitoring.status,
            priceMonitoringStatusLabel: statusLabels[monitor.priceMonitoring.status],
            assessmentComparisonStatus: monitor.assessmentComparison.status,
            assessmentComparisonStatusLabel: statusLabels[monitor.assessmentComparison.status],
        },
        execution: {
            executionPrice: price(monitor.executionPrice),
            executedQuantity: quantity(monitor.executedQuantity),
            actualEntryFee: money(monitor.actualEntryFee),
            estimatedCurrentExitFee: money(monitor.estimatedCurrentExitFee),
        },
        price: {
            status: monitor.priceMonitoring.status,
            statusLabel: statusLabels[monitor.priceMonitoring.status],
            source: monitor.priceMonitoring.source,
            sourceLabel: 'Latest completed five-minute candle',
            currentPrice: price(monitor.priceMonitoring.currentPrice),
            currentPriceTimestamp: monitor.priceMonitoring.currentPriceTimestamp,
            currentPriceTimestampLabel: timestamp(monitor.priceMonitoring.currentPriceTimestamp),
            entryNotional: money(monitor.priceMonitoring.entryNotional),
            currentNotional: money(monitor.priceMonitoring.currentNotional),
            priceMovePerUnit: price(monitor.priceMonitoring.priceMovePerUnit),
            grossUnrealizedPnl: money(monitor.priceMonitoring.grossUnrealizedPnl),
            estimatedNetUnrealizedPnl: money(monitor.priceMonitoring.estimatedNetUnrealizedPnl),
            estimatedNetReturnOnEntryNotional: ratio(
                monitor.priceMonitoring.estimatedNetReturnOnEntryNotional,
            ),
            initialRiskPerUnit: price(monitor.priceMonitoring.initialRiskPerUnit),
            priceMoveInInitialRiskUnits: riskUnits(
                monitor.priceMonitoring.priceMoveInInitialRiskUnits,
            ),
        },
        invalidation: {
            invalidationPrice: price(monitor.priceMonitoring.invalidationPrice),
            state: monitor.priceMonitoring.invalidationState,
            stateLabel: priceLevelLabels[monitor.priceMonitoring.invalidationState],
            remainingDistancePerUnit: price(
                monitor.priceMonitoring.remainingDistanceToInvalidationPerUnit,
            ),
        },
        quantity: {
            executedQuantity: quantity(monitor.quantityComparison.executedQuantity),
            calculatedMaximumQuantity: quantity(
                monitor.quantityComparison.calculatedMaximumQuantity,
            ),
            quantityDifference: quantity(monitor.quantityComparison.quantityDifference),
            state: monitor.quantityComparison.quantityUsageState,
            stateLabel: quantityUsageLabels[monitor.quantityComparison.quantityUsageState],
        },
        targets: monitor.targets.map((target) => ({
            id: target.id,
            planStatus: target.planStatus,
            planStatusLabel: statusLabels[target.planStatus],
            planIssue: target.planIssue,
            planIssueLabel: target.planIssue ?? 'None',
            price: price(target.price),
            estimatedExitFee: money(target.estimatedExitFee),
            monitoringStatus: target.monitoringStatus,
            monitoringStatusLabel: statusLabels[target.monitoringStatus],
            targetState: target.targetState,
            targetStateLabel: priceLevelLabels[target.targetState],
            remainingDistancePerUnit: price(target.remainingDistanceToTargetPerUnit),
            rewardPerUnit: price(target.rewardPerUnit),
            grossProfitAtMaximumQuantity: money(target.grossProfitAtMaximumQuantity),
            estimatedNetProfitAtMaximumQuantity: money(
                target.estimatedNetProfitAtMaximumQuantity,
            ),
            priceRewardToRiskMultiple: riskUnits(target.priceRewardToRiskMultiple),
        })),
        assessmentComparison: {
            status: monitor.assessmentComparison.status,
            statusLabel: statusLabels[monitor.assessmentComparison.status],
            scenarios: monitor.assessmentComparison.scenarios.map((scenario) => ({
                id: scenario.id,
                title: scenarioTitles[scenario.id],
                sections: scenario.sections.map(buildSectionView),
                ...countsView(scenario),
            })),
        },
    };
}
