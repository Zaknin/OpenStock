import type {
    SoxlTradePlan,
    SoxlTradeTarget,
} from '../planning/soxl-trade-plan';
import type {
    SoxlAssessmentSection,
    SoxlConditionAssessment,
    SoxlConditionState,
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
} from '../strategy/soxl-market-assessment';
import type {
    NumericRelation,
    NumericSign,
    SoxlMarketFacts,
} from '../strategy/soxl-market-facts';

export type SoxlLiveTradeMonitorStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlPriceLevelState =
    | 'not_reached'
    | 'reached'
    | 'unavailable';

export type SoxlQuantityUsageState =
    | 'below_calculated_maximum'
    | 'at_calculated_maximum'
    | 'above_calculated_maximum'
    | 'unavailable';

export type SoxlConditionChangeState =
    | 'unchanged_met'
    | 'unchanged_not_met'
    | 'unchanged_unknown'
    | 'became_met'
    | 'became_not_met'
    | 'became_unknown';

export type SoxlAssessmentComparisonStatus =
    | 'available'
    | 'unavailable';

export type SoxlPriceMonitoringStatus =
    | 'available'
    | 'unavailable';

export type SoxlLiveTradeMonitorIssue =
    | 'plan_unavailable'
    | 'invalid_execution_price'
    | 'invalid_executed_quantity'
    | 'invalid_actual_entry_fee'
    | 'invalid_estimated_current_exit_fee'
    | 'execution_invalidation_wrong_side'
    | 'plan_baseline_identity_mismatch'
    | 'current_snapshot_identity_mismatch'
    | 'provider_mismatch'
    | 'condition_set_mismatch'
    | 'current_price_unavailable'
    | 'no_monitoring_data';

export interface MonitorSoxlTradeInput {
    plan: SoxlTradePlan;
    baselineAssessment: SoxlMarketAssessment;
    currentAssessment: SoxlMarketAssessment;
    currentFacts: SoxlMarketFacts;
    executionPrice: number;
    executedQuantity: number;
    actualEntryFee: number;
    estimatedCurrentExitFee: number;
}

export interface SoxlPriceMonitoring {
    status: SoxlPriceMonitoringStatus;
    source: 'completed_soxl_five_minute_candle';
    currentPrice: number | null;
    currentPriceTimestamp: number | null;
    entryNotional: number | null;
    currentNotional: number | null;
    priceMovePerUnit: number | null;
    grossUnrealizedPnl: number | null;
    estimatedNetUnrealizedPnl: number | null;
    estimatedNetReturnOnEntryNotional: number | null;
    initialRiskPerUnit: number | null;
    priceMoveInInitialRiskUnits: number | null;
    invalidationPrice: number;
    invalidationState: SoxlPriceLevelState;
    remainingDistanceToInvalidationPerUnit: number | null;
}

export interface SoxlQuantityComparison {
    executedQuantity: number;
    calculatedMaximumQuantity: number | null;
    quantityUsageState: SoxlQuantityUsageState;
    quantityDifference: number | null;
}

export interface SoxlTargetMonitoring {
    id: string;
    planStatus: SoxlTradeTarget['status'];
    planIssue: SoxlTradeTarget['issue'];
    price: number;
    estimatedExitFee: number;
    rewardPerUnit: number | null;
    grossProfitAtMaximumQuantity: number | null;
    estimatedNetProfitAtMaximumQuantity: number | null;
    priceRewardToRiskMultiple: number | null;
    monitoringStatus: SoxlPriceMonitoringStatus;
    targetState: SoxlPriceLevelState;
    remainingDistanceToTargetPerUnit: number | null;
}

export interface SoxlConditionComparisonCounts {
    unchangedMetCount: number;
    unchangedNotMetCount: number;
    unchangedUnknownCount: number;
    becameMetCount: number;
    becameNotMetCount: number;
    becameUnknownCount: number;
    changedCount: number;
    totalCount: number;
}

export interface SoxlConditionComparison {
    scenarioId: SoxlScenarioAssessment['id'];
    sectionId: SoxlAssessmentSection['id'];
    conditionId: SoxlConditionAssessment['id'];
    expected: SoxlConditionAssessment['expected'];
    baselineActual: NumericRelation | NumericSign;
    baselineState: SoxlConditionState;
    currentActual: NumericRelation | NumericSign;
    currentState: SoxlConditionState;
    changeState: SoxlConditionChangeState;
}

export interface SoxlSectionComparison extends SoxlConditionComparisonCounts {
    id: SoxlAssessmentSection['id'];
    conditions: readonly SoxlConditionComparison[];
}

export interface SoxlScenarioComparison extends SoxlConditionComparisonCounts {
    id: SoxlScenarioAssessment['id'];
    sections: readonly SoxlSectionComparison[];
}

export interface SoxlAssessmentComparison {
    status: SoxlAssessmentComparisonStatus;
    scenarios: readonly SoxlScenarioComparison[];
}

export interface SoxlLiveTradeMonitor {
    status: SoxlLiveTradeMonitorStatus;
    issues: readonly SoxlLiveTradeMonitorIssue[];
    providerId: string | null;
    baselineAsOf: number | null;
    currentAsOf: number | null;
    currentFactsStatus: SoxlMarketFacts['status'];
    currentAssessmentStatus: SoxlMarketAssessment['status'];
    side: SoxlTradePlan['side'];
    executionPrice: number;
    executedQuantity: number;
    actualEntryFee: number;
    estimatedCurrentExitFee: number;
    priceMonitoring: SoxlPriceMonitoring;
    quantityComparison: SoxlQuantityComparison;
    targets: readonly SoxlTargetMonitoring[];
    assessmentComparison: SoxlAssessmentComparison;
}

function appendIssue(
    issues: SoxlLiveTradeMonitorIssue[],
    issue: SoxlLiveTradeMonitorIssue,
): void {
    if (!issues.includes(issue)) {
        issues.push(issue);
    }
}

function unavailablePriceMonitoring(
    plan: SoxlTradePlan,
    currentPriceTimestamp: number | null = null,
): SoxlPriceMonitoring {
    return {
        status: 'unavailable',
        source: 'completed_soxl_five_minute_candle',
        currentPrice: null,
        currentPriceTimestamp,
        entryNotional: null,
        currentNotional: null,
        priceMovePerUnit: null,
        grossUnrealizedPnl: null,
        estimatedNetUnrealizedPnl: null,
        estimatedNetReturnOnEntryNotional: null,
        initialRiskPerUnit: null,
        priceMoveInInitialRiskUnits: null,
        invalidationPrice: plan.invalidationPrice,
        invalidationState: 'unavailable',
        remainingDistanceToInvalidationPerUnit: null,
    };
}

function unavailableQuantityComparison(
    input: MonitorSoxlTradeInput,
): SoxlQuantityComparison {
    return {
        executedQuantity: input.executedQuantity,
        calculatedMaximumQuantity: input.plan.calculation?.maximumQuantity ?? null,
        quantityUsageState: 'unavailable',
        quantityDifference: null,
    };
}

function unavailableTargets(plan: SoxlTradePlan): readonly SoxlTargetMonitoring[] {
    return plan.targets.map((target) => ({
        ...preserveTarget(target),
        monitoringStatus: 'unavailable',
        targetState: 'unavailable',
        remainingDistanceToTargetPerUnit: null,
    }));
}

function unavailableResult(
    input: MonitorSoxlTradeInput,
    issues: readonly SoxlLiveTradeMonitorIssue[],
): SoxlLiveTradeMonitor {
    return {
        status: 'unavailable',
        issues,
        providerId: input.baselineAssessment.providerId,
        baselineAsOf: input.baselineAssessment.asOf,
        currentAsOf: input.currentAssessment.asOf,
        currentFactsStatus: input.currentFacts.status,
        currentAssessmentStatus: input.currentAssessment.status,
        side: input.plan.side,
        executionPrice: input.executionPrice,
        executedQuantity: input.executedQuantity,
        actualEntryFee: input.actualEntryFee,
        estimatedCurrentExitFee: input.estimatedCurrentExitFee,
        priceMonitoring: unavailablePriceMonitoring(input.plan),
        quantityComparison: unavailableQuantityComparison(input),
        targets: unavailableTargets(input.plan),
        assessmentComparison: {
            status: 'unavailable',
            scenarios: [],
        },
    };
}

function executionIssues(input: MonitorSoxlTradeInput): SoxlLiveTradeMonitorIssue[] {
    const issues: SoxlLiveTradeMonitorIssue[] = [];

    if (!Number.isFinite(input.executionPrice) || input.executionPrice <= 0) {
        appendIssue(issues, 'invalid_execution_price');
    }

    if (!Number.isFinite(input.executedQuantity) || input.executedQuantity <= 0) {
        appendIssue(issues, 'invalid_executed_quantity');
    }

    if (!Number.isFinite(input.actualEntryFee) || input.actualEntryFee < 0) {
        appendIssue(issues, 'invalid_actual_entry_fee');
    }

    if (
        !Number.isFinite(input.estimatedCurrentExitFee)
        || input.estimatedCurrentExitFee < 0
    ) {
        appendIssue(issues, 'invalid_estimated_current_exit_fee');
    }

    if (
        Number.isFinite(input.executionPrice)
        && input.executionPrice > 0
        && (
            (input.plan.side === 'long'
                && input.executionPrice <= input.plan.invalidationPrice)
            || (input.plan.side === 'short'
                && input.executionPrice >= input.plan.invalidationPrice)
        )
    ) {
        appendIssue(issues, 'execution_invalidation_wrong_side');
    }

    return issues;
}

function planMatchesBaseline(input: MonitorSoxlTradeInput): boolean {
    const context = input.plan.assessmentContext;
    const baseline = input.baselineAssessment;

    return context.providerId === baseline.providerId
        && context.asOf === baseline.asOf
        && context.status === baseline.status
        && context.factsStatus === baseline.factsStatus
        && context.coreStatus === baseline.coreStatus
        && context.sessionStatus === baseline.sessionStatus;
}

function currentSnapshotsMatch(input: MonitorSoxlTradeInput): boolean {
    return input.currentFacts.providerId === input.currentAssessment.providerId
        && input.currentFacts.asOf === input.currentAssessment.asOf;
}

function preserveTarget(target: SoxlTradeTarget) {
    return {
        id: target.id,
        planStatus: target.status,
        planIssue: target.issue,
        price: target.price,
        estimatedExitFee: target.estimatedExitFee,
        rewardPerUnit: target.rewardPerUnit,
        grossProfitAtMaximumQuantity: target.grossProfitAtMaximumQuantity,
        estimatedNetProfitAtMaximumQuantity: target.estimatedNetProfitAtMaximumQuantity,
        priceRewardToRiskMultiple: target.priceRewardToRiskMultiple,
    };
}

function quantityComparison(input: MonitorSoxlTradeInput): SoxlQuantityComparison {
    const maximumQuantity = input.plan.calculation?.maximumQuantity;

    if (maximumQuantity === undefined) {
        return unavailableQuantityComparison(input);
    }

    const quantityUsageState: SoxlQuantityUsageState = input.executedQuantity < maximumQuantity
        ? 'below_calculated_maximum'
        : input.executedQuantity === maximumQuantity
            ? 'at_calculated_maximum'
            : 'above_calculated_maximum';

    return {
        executedQuantity: input.executedQuantity,
        calculatedMaximumQuantity: maximumQuantity,
        quantityUsageState,
        quantityDifference: input.executedQuantity - maximumQuantity,
    };
}

function priceMonitoring(
    input: MonitorSoxlTradeInput,
    currentPrice: number,
): SoxlPriceMonitoring {
    const side = input.plan.side;
    const invalidationPrice = input.plan.invalidationPrice;
    const priceMovePerUnit = side === 'long'
        ? currentPrice - input.executionPrice
        : input.executionPrice - currentPrice;
    const entryNotional = input.executionPrice * input.executedQuantity;
    const grossUnrealizedPnl = priceMovePerUnit * input.executedQuantity;
    const estimatedNetUnrealizedPnl = grossUnrealizedPnl
        - input.actualEntryFee
        - input.estimatedCurrentExitFee;
    const initialRiskPerUnit = Math.abs(input.executionPrice - invalidationPrice);
    const invalidationReached = side === 'long'
        ? currentPrice <= invalidationPrice
        : currentPrice >= invalidationPrice;

    return {
        status: 'available',
        source: 'completed_soxl_five_minute_candle',
        currentPrice,
        currentPriceTimestamp: input.currentFacts.soxl5m.latestCompleted.time,
        entryNotional,
        currentNotional: currentPrice * input.executedQuantity,
        priceMovePerUnit,
        grossUnrealizedPnl,
        estimatedNetUnrealizedPnl,
        estimatedNetReturnOnEntryNotional: estimatedNetUnrealizedPnl / entryNotional,
        initialRiskPerUnit,
        priceMoveInInitialRiskUnits: priceMovePerUnit / initialRiskPerUnit,
        invalidationPrice,
        invalidationState: invalidationReached ? 'reached' : 'not_reached',
        remainingDistanceToInvalidationPerUnit: side === 'long'
            ? currentPrice - invalidationPrice
            : invalidationPrice - currentPrice,
    };
}

function targetMonitoring(
    plan: SoxlTradePlan,
    currentPrice: number | null,
): readonly SoxlTargetMonitoring[] {
    return plan.targets.map((target) => {
        if (target.status === 'unavailable' || currentPrice === null) {
            return {
                ...preserveTarget(target),
                monitoringStatus: 'unavailable',
                targetState: 'unavailable',
                remainingDistanceToTargetPerUnit: null,
            };
        }

        const reached = plan.side === 'long'
            ? currentPrice >= target.price
            : currentPrice <= target.price;

        return {
            ...preserveTarget(target),
            monitoringStatus: 'available',
            targetState: reached ? 'reached' : 'not_reached',
            remainingDistanceToTargetPerUnit: plan.side === 'long'
                ? target.price - currentPrice
                : currentPrice - target.price,
        };
    });
}

function conditionSetsMatch(
    baseline: SoxlScenarioAssessment,
    current: SoxlScenarioAssessment,
): boolean {
    if (baseline.id !== current.id || baseline.sections.length !== current.sections.length) {
        return false;
    }

    return baseline.sections.every((baselineSection, sectionIndex) => {
        const currentSection = current.sections[sectionIndex];

        if (
            baselineSection.id !== currentSection.id
            || baselineSection.conditions.length !== currentSection.conditions.length
        ) {
            return false;
        }

        return baselineSection.conditions.every((baselineCondition, conditionIndex) => {
            const currentCondition = currentSection.conditions[conditionIndex];

            return baselineCondition.id === currentCondition.id
                && baselineCondition.expected === currentCondition.expected;
        });
    });
}

function changeState(
    baseline: SoxlConditionState,
    current: SoxlConditionState,
): SoxlConditionChangeState {
    if (baseline === current) {
        if (current === 'met') {
            return 'unchanged_met';
        }

        if (current === 'not_met') {
            return 'unchanged_not_met';
        }

        return 'unchanged_unknown';
    }

    if (current === 'met') {
        return 'became_met';
    }

    if (current === 'not_met') {
        return 'became_not_met';
    }

    return 'became_unknown';
}

function emptyCounts(): SoxlConditionComparisonCounts {
    return {
        unchangedMetCount: 0,
        unchangedNotMetCount: 0,
        unchangedUnknownCount: 0,
        becameMetCount: 0,
        becameNotMetCount: 0,
        becameUnknownCount: 0,
        changedCount: 0,
        totalCount: 0,
    };
}

function countComparisons(
    conditions: readonly SoxlConditionComparison[],
): SoxlConditionComparisonCounts {
    return conditions.reduce<SoxlConditionComparisonCounts>((counts, condition) => {
        const next = { ...counts, totalCount: counts.totalCount + 1 };

        switch (condition.changeState) {
            case 'unchanged_met':
                next.unchangedMetCount += 1;
                break;
            case 'unchanged_not_met':
                next.unchangedNotMetCount += 1;
                break;
            case 'unchanged_unknown':
                next.unchangedUnknownCount += 1;
                break;
            case 'became_met':
                next.becameMetCount += 1;
                next.changedCount += 1;
                break;
            case 'became_not_met':
                next.becameNotMetCount += 1;
                next.changedCount += 1;
                break;
            case 'became_unknown':
                next.becameUnknownCount += 1;
                next.changedCount += 1;
                break;
        }

        return next;
    }, emptyCounts());
}

function addCounts(
    left: SoxlConditionComparisonCounts,
    right: SoxlConditionComparisonCounts,
): SoxlConditionComparisonCounts {
    return {
        unchangedMetCount: left.unchangedMetCount + right.unchangedMetCount,
        unchangedNotMetCount: left.unchangedNotMetCount + right.unchangedNotMetCount,
        unchangedUnknownCount: left.unchangedUnknownCount + right.unchangedUnknownCount,
        becameMetCount: left.becameMetCount + right.becameMetCount,
        becameNotMetCount: left.becameNotMetCount + right.becameNotMetCount,
        becameUnknownCount: left.becameUnknownCount + right.becameUnknownCount,
        changedCount: left.changedCount + right.changedCount,
        totalCount: left.totalCount + right.totalCount,
    };
}

function compareScenario(
    baseline: SoxlScenarioAssessment,
    current: SoxlScenarioAssessment,
): SoxlScenarioComparison {
    const sections = baseline.sections.map((baselineSection, sectionIndex) => {
        const currentSection = current.sections[sectionIndex];
        const conditions = baselineSection.conditions.map((baselineCondition, conditionIndex) => {
            const currentCondition = currentSection.conditions[conditionIndex];

            return {
                scenarioId: baseline.id,
                sectionId: baselineSection.id,
                conditionId: baselineCondition.id,
                expected: baselineCondition.expected,
                baselineActual: baselineCondition.actual,
                baselineState: baselineCondition.state,
                currentActual: currentCondition.actual,
                currentState: currentCondition.state,
                changeState: changeState(baselineCondition.state, currentCondition.state),
            };
        });

        return {
            id: baselineSection.id,
            conditions,
            ...countComparisons(conditions),
        };
    });
    const counts = sections.reduce(
        (total, section) => addCounts(total, section),
        emptyCounts(),
    );

    return {
        id: baseline.id,
        sections,
        ...counts,
    };
}

function compareAssessments(
    baseline: SoxlMarketAssessment,
    current: SoxlMarketAssessment,
): SoxlAssessmentComparison {
    const baselineScenarios = [baseline.upwardAlignment, baseline.downwardAlignment] as const;
    const currentScenarios = [current.upwardAlignment, current.downwardAlignment] as const;

    if (
        !baselineScenarios.every((scenario, index) => (
            conditionSetsMatch(scenario, currentScenarios[index])
        ))
    ) {
        return {
            status: 'unavailable',
            scenarios: [],
        };
    }

    return {
        status: 'available',
        scenarios: baselineScenarios.map((scenario, index) => (
            compareScenario(scenario, currentScenarios[index])
        )),
    };
}

function monitorStatus(
    input: MonitorSoxlTradeInput,
    priceStatus: SoxlPriceMonitoringStatus,
    assessmentStatus: SoxlAssessmentComparisonStatus,
): SoxlLiveTradeMonitorStatus {
    if (priceStatus === 'unavailable' && assessmentStatus === 'unavailable') {
        return 'unavailable';
    }

    if (
        priceStatus === 'unavailable'
        || assessmentStatus === 'unavailable'
        || input.currentFacts.status !== 'available'
        || input.currentAssessment.status !== 'available'
        || input.plan.targets.some((target) => target.status === 'unavailable')
    ) {
        return 'partial';
    }

    return 'available';
}

export function monitorSoxlTrade(
    input: MonitorSoxlTradeInput,
): SoxlLiveTradeMonitor {
    if (input.plan.calculation === null || input.plan.status === 'unavailable') {
        return unavailableResult(input, ['plan_unavailable']);
    }

    const validationIssues = executionIssues(input);

    if (validationIssues.length > 0) {
        return unavailableResult(input, validationIssues);
    }

    if (!planMatchesBaseline(input)) {
        return unavailableResult(input, ['plan_baseline_identity_mismatch']);
    }

    if (!currentSnapshotsMatch(input)) {
        return unavailableResult(input, ['current_snapshot_identity_mismatch']);
    }

    if (input.baselineAssessment.providerId !== input.currentAssessment.providerId) {
        return unavailableResult(input, ['provider_mismatch']);
    }

    const issues: SoxlLiveTradeMonitorIssue[] = [];
    const completedPrice = input.currentFacts.soxl5m.latestCompleted.close;
    const hasCurrentPrice = typeof completedPrice === 'number' && Number.isFinite(completedPrice);
    const currentPrice = hasCurrentPrice ? completedPrice : null;
    const price = currentPrice === null
        ? unavailablePriceMonitoring(
            input.plan,
            input.currentFacts.soxl5m.latestCompleted.time,
        )
        : priceMonitoring(input, currentPrice);

    if (currentPrice === null) {
        appendIssue(issues, 'current_price_unavailable');
    }

    const assessment = compareAssessments(
        input.baselineAssessment,
        input.currentAssessment,
    );

    if (assessment.status === 'unavailable') {
        appendIssue(issues, 'condition_set_mismatch');
    }

    if (price.status === 'unavailable' && assessment.status === 'unavailable') {
        appendIssue(issues, 'no_monitoring_data');
    }

    return {
        status: monitorStatus(input, price.status, assessment.status),
        issues,
        providerId: input.baselineAssessment.providerId,
        baselineAsOf: input.baselineAssessment.asOf,
        currentAsOf: input.currentAssessment.asOf,
        currentFactsStatus: input.currentFacts.status,
        currentAssessmentStatus: input.currentAssessment.status,
        side: input.plan.side,
        executionPrice: input.executionPrice,
        executedQuantity: input.executedQuantity,
        actualEntryFee: input.actualEntryFee,
        estimatedCurrentExitFee: input.estimatedCurrentExitFee,
        priceMonitoring: price,
        quantityComparison: quantityComparison(input),
        targets: targetMonitoring(input.plan, currentPrice),
        assessmentComparison: assessment,
    };
}
