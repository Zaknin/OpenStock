import type {
    SoxlAssessmentStatus,
    SoxlMarketAssessment,
    SoxlMarketAssessmentIssue,
} from '../strategy/soxl-market-assessment';
import type {
    SoxlMarketFactsStatus,
} from '../strategy/soxl-market-facts';

export type SoxlTradeSide =
    | 'long'
    | 'short';

export type SoxlTradePlanStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlTradeTargetStatus =
    | 'available'
    | 'unavailable';

export type SoxlTradePlanBindingLimit =
    | 'risk_budget'
    | 'position_value'
    | 'equal';

export type SoxlTradePlanIssue =
    | 'invalid_entry_price'
    | 'invalid_invalidation_price'
    | 'invalid_maximum_loss'
    | 'invalid_entry_fee'
    | 'invalid_invalidation_exit_fee'
    | 'invalid_quantity_increment'
    | 'invalid_maximum_position_value'
    | 'invalidation_wrong_side'
    | 'non_positive_risk_budget_after_fees'
    | 'no_affordable_quantity';

export type SoxlTradeTargetIssue =
    | 'base_plan_unavailable'
    | 'invalid_target_id'
    | 'duplicate_target_id'
    | 'invalid_target_price'
    | 'invalid_target_exit_fee'
    | 'target_wrong_side';

export interface SoxlTradeTargetInput {
    id: string;
    price: number;
    estimatedExitFee: number;
}

export interface BuildSoxlTradePlanInput {
    assessment: SoxlMarketAssessment;
    side: SoxlTradeSide;
    entryPrice: number;
    invalidationPrice: number;
    maximumLossAmount: number;
    estimatedEntryFee: number;
    estimatedInvalidationExitFee: number;
    quantityIncrement: number;
    maximumPositionValue: number | null;
    targets: readonly SoxlTradeTargetInput[];
}

export interface SoxlTradePlanScenarioCounts {
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
}

export interface SoxlTradePlanAssessmentContext {
    providerId: string | null;
    asOf: number | null;
    status: SoxlAssessmentStatus;
    factsStatus: SoxlMarketFactsStatus;
    coreStatus: SoxlMarketAssessment['coreStatus'];
    sessionStatus: SoxlMarketAssessment['sessionStatus'];
    issue: SoxlMarketAssessmentIssue | null;
    openingRangeComplete: boolean;
    regularSessionComplete: boolean;
    upwardAlignment: SoxlTradePlanScenarioCounts;
    downwardAlignment: SoxlTradePlanScenarioCounts;
}

export interface SoxlTradePlanCalculation {
    riskPerUnit: number;
    estimatedInvalidationFees: number;
    riskBudgetAfterFees: number;
    rawRiskLimitedQuantity: number;
    rawPositionValueLimitedQuantity: number | null;
    rawMaximumQuantity: number;
    maximumQuantity: number;
    quantityIncrement: number;
    bindingLimit: SoxlTradePlanBindingLimit;
    entryNotional: number;
    grossLossAtInvalidation: number;
    estimatedLossAtInvalidation: number;
    unusedLossBudget: number;
}

export interface SoxlTradeTarget {
    id: string;
    price: number;
    estimatedExitFee: number;
    status: SoxlTradeTargetStatus;
    issue: SoxlTradeTargetIssue | null;
    rewardPerUnit: number | null;
    grossProfitAtMaximumQuantity: number | null;
    estimatedNetProfitAtMaximumQuantity: number | null;
    priceRewardToRiskMultiple: number | null;
}

export interface SoxlTradePlan {
    status: SoxlTradePlanStatus;
    issue: SoxlTradePlanIssue | null;
    assessmentContext: SoxlTradePlanAssessmentContext;
    side: SoxlTradeSide;
    entryPrice: number;
    invalidationPrice: number;
    maximumLossAmount: number;
    estimatedEntryFee: number;
    estimatedInvalidationExitFee: number;
    quantityIncrement: number;
    maximumPositionValue: number | null;
    calculation: SoxlTradePlanCalculation | null;
    targets: readonly SoxlTradeTarget[];
}

interface BaseValidationResult {
    issue: SoxlTradePlanIssue | null;
    calculation: SoxlTradePlanCalculation | null;
}

function scenarioCounts(
    scenario: SoxlMarketAssessment['upwardAlignment'],
): SoxlTradePlanScenarioCounts {
    return {
        metCount: scenario.metCount,
        notMetCount: scenario.notMetCount,
        unknownCount: scenario.unknownCount,
        knownCount: scenario.knownCount,
        totalCount: scenario.totalCount,
    };
}

function assessmentContext(
    assessment: SoxlMarketAssessment,
): SoxlTradePlanAssessmentContext {
    return {
        providerId: assessment.providerId,
        asOf: assessment.asOf,
        status: assessment.status,
        factsStatus: assessment.factsStatus,
        coreStatus: assessment.coreStatus,
        sessionStatus: assessment.sessionStatus,
        issue: assessment.issue,
        openingRangeComplete: assessment.openingRangeComplete,
        regularSessionComplete: assessment.regularSessionComplete,
        upwardAlignment: scenarioCounts(assessment.upwardAlignment),
        downwardAlignment: scenarioCounts(assessment.downwardAlignment),
    };
}

function isFiniteNumber(value: number): boolean {
    return Number.isFinite(value);
}

function isInvalidSideRelationship(
    side: SoxlTradeSide,
    entryPrice: number,
    invalidationPrice: number,
): boolean {
    return side === 'long'
        ? invalidationPrice >= entryPrice
        : invalidationPrice <= entryPrice;
}

function isInvalidTargetSideRelationship(
    side: SoxlTradeSide,
    entryPrice: number,
    targetPrice: number,
): boolean {
    return side === 'long'
        ? targetPrice <= entryPrice
        : targetPrice >= entryPrice;
}

function decimalPlaces(value: number): number {
    const text = value.toString().toLowerCase();

    if (!text.includes('e')) {
        return text.includes('.') ? text.split('.')[1].length : 0;
    }

    const [coefficient, exponentText] = text.split('e');
    const exponent = Number(exponentText);
    const coefficientDecimals = coefficient.includes('.')
        ? coefficient.split('.')[1].length
        : 0;

    return Math.max(0, coefficientDecimals - exponent);
}

function roundDownToIncrement(value: number, increment: number): number {
    const units = Math.floor(value / increment);
    const rounded = units * increment;
    const precision = Math.min(100, decimalPlaces(increment) + 10);

    return Number(rounded.toFixed(precision));
}

function bindingLimit(
    rawRiskLimitedQuantity: number,
    rawPositionValueLimitedQuantity: number | null,
): SoxlTradePlanBindingLimit {
    if (rawPositionValueLimitedQuantity === null) {
        return 'risk_budget';
    }

    if (rawRiskLimitedQuantity < rawPositionValueLimitedQuantity) {
        return 'risk_budget';
    }

    if (rawPositionValueLimitedQuantity < rawRiskLimitedQuantity) {
        return 'position_value';
    }

    return 'equal';
}

function validateBase(
    input: BuildSoxlTradePlanInput,
): BaseValidationResult {
    if (!isFiniteNumber(input.entryPrice) || input.entryPrice <= 0) {
        return { issue: 'invalid_entry_price', calculation: null };
    }

    if (!isFiniteNumber(input.invalidationPrice) || input.invalidationPrice <= 0) {
        return { issue: 'invalid_invalidation_price', calculation: null };
    }

    if (!isFiniteNumber(input.maximumLossAmount) || input.maximumLossAmount <= 0) {
        return { issue: 'invalid_maximum_loss', calculation: null };
    }

    if (!isFiniteNumber(input.estimatedEntryFee) || input.estimatedEntryFee < 0) {
        return { issue: 'invalid_entry_fee', calculation: null };
    }

    if (
        !isFiniteNumber(input.estimatedInvalidationExitFee)
        || input.estimatedInvalidationExitFee < 0
    ) {
        return { issue: 'invalid_invalidation_exit_fee', calculation: null };
    }

    if (!isFiniteNumber(input.quantityIncrement) || input.quantityIncrement <= 0) {
        return { issue: 'invalid_quantity_increment', calculation: null };
    }

    if (
        input.maximumPositionValue !== null
        && (!isFiniteNumber(input.maximumPositionValue) || input.maximumPositionValue <= 0)
    ) {
        return { issue: 'invalid_maximum_position_value', calculation: null };
    }

    if (isInvalidSideRelationship(input.side, input.entryPrice, input.invalidationPrice)) {
        return { issue: 'invalidation_wrong_side', calculation: null };
    }

    const riskPerUnit = Math.abs(input.entryPrice - input.invalidationPrice);
    const estimatedInvalidationFees = input.estimatedEntryFee + input.estimatedInvalidationExitFee;
    const riskBudgetAfterFees = input.maximumLossAmount - estimatedInvalidationFees;

    if (riskBudgetAfterFees <= 0) {
        return { issue: 'non_positive_risk_budget_after_fees', calculation: null };
    }

    const rawRiskLimitedQuantity = riskBudgetAfterFees / riskPerUnit;
    const rawPositionValueLimitedQuantity = input.maximumPositionValue === null
        ? null
        : input.maximumPositionValue / input.entryPrice;
    const limit = bindingLimit(rawRiskLimitedQuantity, rawPositionValueLimitedQuantity);
    const rawMaximumQuantity = rawPositionValueLimitedQuantity === null
        ? rawRiskLimitedQuantity
        : Math.min(rawRiskLimitedQuantity, rawPositionValueLimitedQuantity);
    const maximumQuantity = roundDownToIncrement(rawMaximumQuantity, input.quantityIncrement);

    if (maximumQuantity <= 0) {
        return { issue: 'no_affordable_quantity', calculation: null };
    }

    const entryNotional = maximumQuantity * input.entryPrice;
    const grossLossAtInvalidation = maximumQuantity * riskPerUnit;
    const estimatedLossAtInvalidation = grossLossAtInvalidation
        + input.estimatedEntryFee
        + input.estimatedInvalidationExitFee;

    return {
        issue: null,
        calculation: {
            riskPerUnit,
            estimatedInvalidationFees,
            riskBudgetAfterFees,
            rawRiskLimitedQuantity,
            rawPositionValueLimitedQuantity,
            rawMaximumQuantity,
            maximumQuantity,
            quantityIncrement: input.quantityIncrement,
            bindingLimit: limit,
            entryNotional,
            grossLossAtInvalidation,
            estimatedLossAtInvalidation,
            unusedLossBudget: input.maximumLossAmount - estimatedLossAtInvalidation,
        },
    };
}

function unavailableTarget(
    input: SoxlTradeTargetInput,
    issue: SoxlTradeTargetIssue,
): SoxlTradeTarget {
    return {
        id: input.id,
        price: input.price,
        estimatedExitFee: input.estimatedExitFee,
        status: 'unavailable',
        issue,
        rewardPerUnit: null,
        grossProfitAtMaximumQuantity: null,
        estimatedNetProfitAtMaximumQuantity: null,
        priceRewardToRiskMultiple: null,
    };
}

function availableTarget(
    input: SoxlTradeTargetInput,
    planInput: BuildSoxlTradePlanInput,
    calculation: SoxlTradePlanCalculation,
): SoxlTradeTarget {
    const rewardPerUnit = Math.abs(input.price - planInput.entryPrice);
    const grossProfitAtMaximumQuantity = calculation.maximumQuantity * rewardPerUnit;

    return {
        id: input.id,
        price: input.price,
        estimatedExitFee: input.estimatedExitFee,
        status: 'available',
        issue: null,
        rewardPerUnit,
        grossProfitAtMaximumQuantity,
        estimatedNetProfitAtMaximumQuantity: grossProfitAtMaximumQuantity
            - planInput.estimatedEntryFee
            - input.estimatedExitFee,
        priceRewardToRiskMultiple: rewardPerUnit / calculation.riskPerUnit,
    };
}

function buildTargets(
    input: BuildSoxlTradePlanInput,
    calculation: SoxlTradePlanCalculation | null,
): readonly SoxlTradeTarget[] {
    if (calculation === null) {
        return input.targets.map((target) => unavailableTarget(target, 'base_plan_unavailable'));
    }

    const usedIds = new Set<string>();

    return input.targets.map((target) => {
        const trimmedId = target.id.trim();

        if (trimmedId.length === 0) {
            return unavailableTarget(target, 'invalid_target_id');
        }

        if (usedIds.has(trimmedId)) {
            return unavailableTarget(target, 'duplicate_target_id');
        }

        usedIds.add(trimmedId);

        if (!isFiniteNumber(target.price) || target.price <= 0) {
            return unavailableTarget(target, 'invalid_target_price');
        }

        if (!isFiniteNumber(target.estimatedExitFee) || target.estimatedExitFee < 0) {
            return unavailableTarget(target, 'invalid_target_exit_fee');
        }

        if (isInvalidTargetSideRelationship(input.side, input.entryPrice, target.price)) {
            return unavailableTarget(target, 'target_wrong_side');
        }

        return availableTarget(target, input, calculation);
    });
}

function tradePlanStatus(
    baseIssue: SoxlTradePlanIssue | null,
    targets: readonly SoxlTradeTarget[],
): SoxlTradePlanStatus {
    if (baseIssue !== null) {
        return 'unavailable';
    }

    return targets.some((target) => target.status === 'unavailable')
        ? 'partial'
        : 'available';
}

export function buildSoxlTradePlan(
    input: BuildSoxlTradePlanInput,
): SoxlTradePlan {
    const base = validateBase(input);
    const targets = buildTargets(input, base.calculation);

    return {
        status: tradePlanStatus(base.issue, targets),
        issue: base.issue,
        assessmentContext: assessmentContext(input.assessment),
        side: input.side,
        entryPrice: input.entryPrice,
        invalidationPrice: input.invalidationPrice,
        maximumLossAmount: input.maximumLossAmount,
        estimatedEntryFee: input.estimatedEntryFee,
        estimatedInvalidationExitFee: input.estimatedInvalidationExitFee,
        quantityIncrement: input.quantityIncrement,
        maximumPositionValue: input.maximumPositionValue,
        calculation: base.calculation,
        targets,
    };
}
