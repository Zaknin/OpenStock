import {
    formatSoxlDisplayTimestamp,
} from '../presentation/time-format';
import type {
    SoxlTradePlan,
    SoxlTradePlanAssessmentContext,
    SoxlTradePlanBindingLimit,
    SoxlTradePlanCalculation,
    SoxlTradePlanIssue,
    SoxlTradePlanStatus,
    SoxlTradeTarget,
    SoxlTradeTargetIssue,
    SoxlTradeTargetStatus,
} from './soxl-trade-plan';

export interface SoxlTradePlanRowView {
    key: string;
    label: string;
    value: string;
    rawValue: number | string | boolean | null;
    note: string | null;
}

export interface SoxlTradePlanScenarioCountsView {
    metCount: number;
    notMetCount: number;
    unknownCount: number;
    knownCount: number;
    totalCount: number;
    label: string;
}

export interface SoxlTradePlanAssessmentContextView {
    providerId: string;
    asOf: number | null;
    asOfLabel: string;
    status: SoxlTradePlanAssessmentContext['status'];
    statusLabel: string;
    factsStatus: SoxlTradePlanAssessmentContext['factsStatus'];
    factsStatusLabel: string;
    coreStatus: SoxlTradePlanAssessmentContext['coreStatus'];
    coreStatusLabel: string;
    sessionStatus: SoxlTradePlanAssessmentContext['sessionStatus'];
    sessionStatusLabel: string;
    issue: SoxlTradePlanAssessmentContext['issue'];
    issueLabel: string;
    openingRangeComplete: boolean;
    openingRangeCompleteLabel: string;
    regularSessionComplete: boolean;
    regularSessionCompleteLabel: string;
    upwardAlignment: SoxlTradePlanScenarioCountsView;
    downwardAlignment: SoxlTradePlanScenarioCountsView;
}

export interface SoxlTradeTargetView {
    id: string;
    status: SoxlTradeTargetStatus;
    statusLabel: string;
    issue: SoxlTradeTargetIssue | null;
    issueLabel: string | null;
    issueExplanation: string | null;
    inputRows: readonly SoxlTradePlanRowView[];
    outcomeRows: readonly SoxlTradePlanRowView[];
    technicalRows: readonly SoxlTradePlanRowView[];
}

export interface SoxlTradePlanView {
    status: SoxlTradePlanStatus;
    statusLabel: string;
    issue: SoxlTradePlanIssue | null;
    issueLabel: string | null;
    issueExplanation: string | null;
    side: SoxlTradePlan['side'];
    sideLabel: string;
    inputRows: readonly SoxlTradePlanRowView[];
    calculationRows: readonly SoxlTradePlanRowView[];
    technicalRows: readonly SoxlTradePlanRowView[];
    assessmentContext: SoxlTradePlanAssessmentContextView;
    targets: readonly SoxlTradeTargetView[];
}

const unavailableLabel = 'Unavailable';

const statusLabels: Record<SoxlTradePlanStatus, string> = {
    available: 'Available',
    partial: 'Partially available',
    unavailable: unavailableLabel,
};

const targetStatusLabels: Record<SoxlTradeTargetStatus, string> = {
    available: 'Available',
    unavailable: unavailableLabel,
};

const assessmentStatusLabels: Record<SoxlTradePlanAssessmentContext['status'], string> = {
    available: 'Available',
    partial: 'Partially available',
    unavailable: unavailableLabel,
};

const issueLabels: Record<SoxlTradePlanIssue, string> = {
    invalid_entry_price: 'invalid_entry_price',
    invalid_invalidation_price: 'invalid_invalidation_price',
    invalid_maximum_loss: 'invalid_maximum_loss',
    invalid_entry_fee: 'invalid_entry_fee',
    invalid_invalidation_exit_fee: 'invalid_invalidation_exit_fee',
    invalid_quantity_increment: 'invalid_quantity_increment',
    invalid_maximum_position_value: 'invalid_maximum_position_value',
    invalidation_wrong_side: 'invalidation_wrong_side',
    non_positive_risk_budget_after_fees: 'non_positive_risk_budget_after_fees',
    no_affordable_quantity: 'no_affordable_quantity',
};

const issueExplanations: Record<SoxlTradePlanIssue, string> = {
    invalid_entry_price: 'Enter a positive proposed entry price.',
    invalid_invalidation_price: 'Enter a positive proposed invalidation price.',
    invalid_maximum_loss: 'Enter a positive maximum acceptable loss.',
    invalid_entry_fee: 'Enter an estimated entry fee of zero or more.',
    invalid_invalidation_exit_fee: 'Enter an estimated invalidation-exit fee of zero or more.',
    invalid_quantity_increment: 'Enter a positive quantity increment.',
    invalid_maximum_position_value: 'Enter a positive maximum position value or leave it blank.',
    invalidation_wrong_side: 'For a long plan, invalidation must be below entry. For a short plan, invalidation must be above entry.',
    non_positive_risk_budget_after_fees: 'Estimated fees use all or more of the maximum acceptable loss.',
    no_affordable_quantity: 'The supplied limits do not permit even one quantity increment.',
};

const targetIssueLabels: Record<SoxlTradeTargetIssue, string> = {
    base_plan_unavailable: 'base_plan_unavailable',
    invalid_target_id: 'invalid_target_id',
    duplicate_target_id: 'duplicate_target_id',
    invalid_target_price: 'invalid_target_price',
    invalid_target_exit_fee: 'invalid_target_exit_fee',
    target_wrong_side: 'target_wrong_side',
};

const targetIssueExplanations: Record<SoxlTradeTargetIssue, string> = {
    base_plan_unavailable: 'Target outcomes are unavailable because the base plan calculation is unavailable.',
    invalid_target_id: 'The target identifier is missing.',
    duplicate_target_id: 'The target identifier is duplicated.',
    invalid_target_price: 'Enter a positive target price.',
    invalid_target_exit_fee: 'Enter an estimated target-exit fee of zero or more.',
    target_wrong_side: 'For a long plan, target price must be above entry. For a short plan, target price must be below entry.',
};

const bindingLimitLabels: Record<SoxlTradePlanBindingLimit, string> = {
    risk_budget: 'Maximum-loss limit',
    position_value: 'Maximum-position-value limit',
    equal: 'Both limits are equal',
};

function row(
    key: string,
    label: string,
    value: string,
    rawValue: number | string | boolean | null,
    note: string | null = null,
): SoxlTradePlanRowView {
    return {
        key,
        label,
        value,
        rawValue,
        note,
    };
}

function formatOptional(value: number | null, formatter: (input: number) => string): string {
    return value === null ? unavailableLabel : formatter(value);
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

function formatNumber(value: number, maximumFractionDigits: number): string {
    if (!Number.isFinite(value)) {
        return unavailableLabel;
    }

    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    }).format(value);
}

function formatPrice(value: number): string {
    return formatNumber(value, 4);
}

function formatMoney(value: number): string {
    if (!Number.isFinite(value)) {
        return unavailableLabel;
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatQuantity(value: number, increment: number): string {
    return formatNumber(value, Math.min(8, Math.max(4, decimalPlaces(increment))));
}

function formatRatio(value: number): string {
    return `${formatNumber(value, 3)}x`;
}

function formatBoolean(value: boolean): string {
    return value ? 'Yes' : 'No';
}

function sideLabel(side: SoxlTradePlan['side']): string {
    return side === 'long' ? 'Long' : 'Short';
}

function issueLabel(issue: SoxlTradePlanIssue | null): string | null {
    return issue === null ? null : issueLabels[issue];
}

function issueExplanation(issue: SoxlTradePlanIssue | null): string | null {
    return issue === null ? null : issueExplanations[issue];
}

function targetIssueLabel(issue: SoxlTradeTargetIssue | null): string | null {
    return issue === null ? null : targetIssueLabels[issue];
}

function targetIssueExplanation(issue: SoxlTradeTargetIssue | null): string | null {
    return issue === null ? null : targetIssueExplanations[issue];
}

function contextIssueLabel(issue: SoxlTradePlanAssessmentContext['issue']): string {
    return issue ?? unavailableLabel;
}

function scenarioCountsView(
    label: string,
    counts: SoxlTradePlanAssessmentContext['upwardAlignment'],
): SoxlTradePlanScenarioCountsView {
    return {
        label,
        metCount: counts.metCount,
        notMetCount: counts.notMetCount,
        unknownCount: counts.unknownCount,
        knownCount: counts.knownCount,
        totalCount: counts.totalCount,
    };
}

function buildAssessmentContextView(
    context: SoxlTradePlanAssessmentContext,
): SoxlTradePlanAssessmentContextView {
    return {
        providerId: context.providerId ?? unavailableLabel,
        asOf: context.asOf,
        asOfLabel: formatSoxlDisplayTimestamp(context.asOf),
        status: context.status,
        statusLabel: assessmentStatusLabels[context.status],
        factsStatus: context.factsStatus,
        factsStatusLabel: assessmentStatusLabels[context.factsStatus],
        coreStatus: context.coreStatus,
        coreStatusLabel: assessmentStatusLabels[context.coreStatus],
        sessionStatus: context.sessionStatus,
        sessionStatusLabel: assessmentStatusLabels[context.sessionStatus],
        issue: context.issue,
        issueLabel: contextIssueLabel(context.issue),
        openingRangeComplete: context.openingRangeComplete,
        openingRangeCompleteLabel: formatBoolean(context.openingRangeComplete),
        regularSessionComplete: context.regularSessionComplete,
        regularSessionCompleteLabel: formatBoolean(context.regularSessionComplete),
        upwardAlignment: scenarioCountsView('Upward scenario raw counts', context.upwardAlignment),
        downwardAlignment: scenarioCountsView('Downward scenario raw counts', context.downwardAlignment),
    };
}

function buildInputRows(plan: SoxlTradePlan): readonly SoxlTradePlanRowView[] {
    return [
        row('side', 'Side', sideLabel(plan.side), plan.side),
        row('entryPrice', 'Proposed entry price', formatPrice(plan.entryPrice), plan.entryPrice),
        row('invalidationPrice', 'Proposed invalidation price', formatPrice(plan.invalidationPrice), plan.invalidationPrice),
        row('maximumLossAmount', 'Maximum acceptable loss', formatMoney(plan.maximumLossAmount), plan.maximumLossAmount),
        row('estimatedEntryFee', 'Estimated entry fee', formatMoney(plan.estimatedEntryFee), plan.estimatedEntryFee),
        row('estimatedInvalidationExitFee', 'Estimated invalidation-exit fee', formatMoney(plan.estimatedInvalidationExitFee), plan.estimatedInvalidationExitFee),
        row('quantityIncrement', 'Quantity increment', formatQuantity(plan.quantityIncrement, plan.quantityIncrement), plan.quantityIncrement),
        row(
            'maximumPositionValue',
            'Maximum position value',
            formatOptional(plan.maximumPositionValue, formatMoney),
            plan.maximumPositionValue,
            'Optional',
        ),
    ];
}

function buildCalculationRows(
    calculation: SoxlTradePlanCalculation | null,
): readonly SoxlTradePlanRowView[] {
    if (calculation === null) {
        return [];
    }

    const increment = calculation.quantityIncrement;

    return [
        row('riskPerUnit', 'Price risk per unit', formatPrice(calculation.riskPerUnit), calculation.riskPerUnit),
        row('riskBudgetAfterFees', 'Risk budget remaining after fees', formatMoney(calculation.riskBudgetAfterFees), calculation.riskBudgetAfterFees),
        row('rawRiskLimitedQuantity', 'Raw risk-limited maximum quantity', formatQuantity(calculation.rawRiskLimitedQuantity, increment), calculation.rawRiskLimitedQuantity),
        row(
            'rawPositionValueLimitedQuantity',
            'Raw position-value-limited maximum quantity',
            formatOptional(calculation.rawPositionValueLimitedQuantity, (value) => formatQuantity(value, increment)),
            calculation.rawPositionValueLimitedQuantity,
        ),
        row('bindingLimit', 'Binding limit', bindingLimitLabels[calculation.bindingLimit], calculation.bindingLimit),
        row('rawMaximumQuantity', 'Raw maximum quantity before increment', formatQuantity(calculation.rawMaximumQuantity, increment), calculation.rawMaximumQuantity),
        row('maximumQuantity', 'Calculated maximum quantity', formatQuantity(calculation.maximumQuantity, increment), calculation.maximumQuantity),
        row('entryNotional', 'Entry notional at maximum quantity', formatMoney(calculation.entryNotional), calculation.entryNotional),
        row('grossLossAtInvalidation', 'Gross loss at invalidation', formatMoney(calculation.grossLossAtInvalidation), calculation.grossLossAtInvalidation),
        row('estimatedLossAtInvalidation', 'Estimated loss at invalidation including fees', formatMoney(calculation.estimatedLossAtInvalidation), calculation.estimatedLossAtInvalidation),
        row('unusedLossBudget', 'Unused loss budget', formatMoney(calculation.unusedLossBudget), calculation.unusedLossBudget),
    ];
}

function buildTechnicalRows(
    calculation: SoxlTradePlanCalculation | null,
): readonly SoxlTradePlanRowView[] {
    if (calculation === null) {
        return [];
    }

    const increment = calculation.quantityIncrement;

    return [
        row('estimatedInvalidationFees', 'Estimated invalidation fees', formatMoney(calculation.estimatedInvalidationFees), calculation.estimatedInvalidationFees),
        row('rawRiskLimitedQuantity.raw', 'Raw risk-limited quantity', formatQuantity(calculation.rawRiskLimitedQuantity, increment), calculation.rawRiskLimitedQuantity),
        row('rawMaximumQuantity.raw', 'Raw maximum quantity', formatQuantity(calculation.rawMaximumQuantity, increment), calculation.rawMaximumQuantity),
        row('quantityIncrement.raw', 'Quantity increment', formatQuantity(increment, increment), increment),
    ];
}

function buildTargetView(
    target: SoxlTradeTarget,
    increment: number,
): SoxlTradeTargetView {
    return {
        id: target.id,
        status: target.status,
        statusLabel: targetStatusLabels[target.status],
        issue: target.issue,
        issueLabel: targetIssueLabel(target.issue),
        issueExplanation: targetIssueExplanation(target.issue),
        inputRows: [
            row('id', 'Target identifier', target.id, target.id),
            row('price', 'Supplied target price', formatPrice(target.price), target.price),
            row('estimatedExitFee', 'Supplied estimated target-exit fee', formatMoney(target.estimatedExitFee), target.estimatedExitFee),
        ],
        outcomeRows: target.status === 'available'
            ? [
                row('rewardPerUnit', 'Hypothetical reward per unit', formatOptional(target.rewardPerUnit, formatPrice), target.rewardPerUnit),
                row('grossProfitAtMaximumQuantity', 'Gross hypothetical profit at calculated maximum quantity', formatOptional(target.grossProfitAtMaximumQuantity, formatMoney), target.grossProfitAtMaximumQuantity),
                row('estimatedNetProfitAtMaximumQuantity', 'Estimated hypothetical net profit after fees', formatOptional(target.estimatedNetProfitAtMaximumQuantity, formatMoney), target.estimatedNetProfitAtMaximumQuantity),
                row('priceRewardToRiskMultiple', 'Price reward-to-risk multiple', formatOptional(target.priceRewardToRiskMultiple, formatRatio), target.priceRewardToRiskMultiple),
            ]
            : [],
        technicalRows: [
            row('status', 'Status', targetStatusLabels[target.status], target.status),
            row('issue', 'Structured issue', targetIssueLabel(target.issue) ?? unavailableLabel, target.issue),
            row('rawTargetPrice', 'Raw target price', formatPrice(target.price), target.price),
            row('rawExitFee', 'Raw target-exit fee', formatMoney(target.estimatedExitFee), target.estimatedExitFee),
            row('quantityIncrement', 'Quantity increment used for plan', formatQuantity(increment, increment), increment),
        ],
    };
}

export function buildSoxlTradePlanView(
    plan: SoxlTradePlan,
): SoxlTradePlanView {
    const increment = plan.calculation?.quantityIncrement ?? plan.quantityIncrement;

    return {
        status: plan.status,
        statusLabel: statusLabels[plan.status],
        issue: plan.issue,
        issueLabel: issueLabel(plan.issue),
        issueExplanation: issueExplanation(plan.issue),
        side: plan.side,
        sideLabel: sideLabel(plan.side),
        inputRows: buildInputRows(plan),
        calculationRows: buildCalculationRows(plan.calculation),
        technicalRows: buildTechnicalRows(plan.calculation),
        assessmentContext: buildAssessmentContextView(plan.assessmentContext),
        targets: plan.targets.map((target) => buildTargetView(target, increment)),
    };
}
