'use client';

import {
    useMemo,
    useState,
    useTransition,
    type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
    SoxlTradePlan,
} from '@/lib/soxl-intelligence/planning/soxl-trade-plan';
import type {
    SoxlMarketAssessment,
} from '@/lib/soxl-intelligence/strategy/soxl-market-assessment';
import type {
    SoxlMarketFacts,
} from '@/lib/soxl-intelligence/strategy/soxl-market-facts';
import {
    monitorSoxlTrade,
    type SoxlLiveTradeMonitor,
    type SoxlLiveTradeMonitorIssue,
} from '@/lib/soxl-intelligence/monitoring/soxl-live-trade-monitor';
import {
    buildSoxlLiveTradeMonitorView,
    buildSoxlSelectedTradePlanContextView,
    type SoxlLiveTradeMonitorView,
    type SoxlMonitorCountsView,
    type SoxlMonitorScenarioView,
    type SoxlMonitorSectionView,
    type SoxlMonitorTargetView,
    type SoxlMonitorValueView,
} from '@/lib/soxl-intelligence/monitoring/soxl-live-trade-monitor-view';

export interface LiveTradeMonitorCardProps {
    selectedPlan: SoxlTradePlan | null;
    currentAssessment: SoxlMarketAssessment;
    currentFacts: SoxlMarketFacts;
    onMonitoringChange: (active: boolean) => void;
}

interface ExecutionFormState {
    executionPrice: string;
    executedQuantity: string;
    actualEntryFee: string;
    estimatedCurrentExitFee: string;
}

interface ActiveMonitorSession {
    plan: SoxlTradePlan;
    baselineAssessment: SoxlMarketAssessment;
    executionPrice: number;
    executedQuantity: number;
    actualEntryFee: number;
    estimatedCurrentExitFee: number;
}

const initialExecutionForm: ExecutionFormState = {
    executionPrice: '',
    executedQuantity: '',
    actualEntryFee: '',
    estimatedCurrentExitFee: '',
};

const executionBlockingIssues = new Set<SoxlLiveTradeMonitorIssue>([
    'plan_unavailable',
    'invalid_execution_price',
    'invalid_executed_quantity',
    'invalid_actual_entry_fee',
    'invalid_estimated_current_exit_fee',
    'execution_invalidation_wrong_side',
]);

function parseDecimal(value: string): number {
    const trimmed = value.trim();

    return trimmed.length === 0 ? Number.NaN : Number(trimmed);
}

function StatusPill({
    status,
    label,
}: {
    status: 'available' | 'partial' | 'unavailable';
    label: string;
}) {
    const classes = status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : status === 'partial'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${classes}`}>
            {label}
        </span>
    );
}

function Detail({
    label,
    value,
}: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold text-gray-100">{value}</dd>
        </div>
    );
}

function Field({
    id,
    label,
    value,
    helperText,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    helperText: string;
    onChange: (value: string) => void;
}) {
    const helperId = `${id}-help`;

    return (
        <div className="min-w-0">
            <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </label>
            <input
                id={id}
                name={id}
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-describedby={helperId}
                className="mt-2 w-full rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-700 focus:border-teal-500"
                placeholder="Enter value"
            />
            <p id={helperId} className="mt-1 text-xs leading-5 text-gray-500">
                {helperText}
            </p>
        </div>
    );
}

function ValueDetail({
    label,
    item,
}: {
    label: string;
    item: SoxlMonitorValueView;
}) {
    return <Detail label={label} value={item.value} />;
}

function IssueList({ view }: { view: SoxlLiveTradeMonitorView }) {
    if (view.issues.length === 0) {
        return null;
    }

    return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <h3 className="text-sm font-semibold text-yellow-100">Monitoring details requiring attention</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-yellow-100">
                {view.issues.map((issue) => (
                    <li key={issue.code}>{issue.explanation}</li>
                ))}
            </ul>
            <details className="mt-4 border-t border-yellow-500/20 pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200">
                    Technical details
                </summary>
                <ul className="mt-3 space-y-1 font-mono text-xs text-yellow-100">
                    {view.issues.map((issue) => (
                        <li key={issue.code}>{issue.code}</li>
                    ))}
                </ul>
            </details>
        </div>
    );
}

function PlanContext({
    plan,
    captured = false,
}: {
    plan: SoxlTradePlan;
    captured?: boolean;
}) {
    const view = buildSoxlSelectedTradePlanContextView(plan);

    return (
        <section aria-labelledby="temporary-monitor-plan-context-heading" className="border-t border-gray-800 pt-5">
            <h3 id="temporary-monitor-plan-context-heading" className="text-base font-semibold text-white">
                {captured ? 'Captured plan context' : 'Selected plan context'}
            </h3>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="Side from selected plan" value={view.sideLabel} />
                <ValueDetail label="Planned invalidation price" item={view.invalidationPrice} />
                <ValueDetail label="Calculated maximum quantity from the selected plan" item={view.calculatedMaximumQuantity} />
                <ValueDetail label="Quantity increment" item={view.quantityIncrement} />
                <ValueDetail label="Maximum position value" item={view.maximumPositionValue} />
            </dl>
            {view.targets.length > 0 ? (
                <div className="mt-5">
                    <h4 className="text-sm font-semibold text-gray-200">Planned targets in supplied order</h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
                        {view.targets.map((target) => (
                            <div key={target.id} className="border-l-2 border-gray-700 pl-3">
                                <p className="break-words text-sm font-semibold text-white">{target.id}</p>
                                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <ValueDetail label="Supplied target price" item={target.price} />
                                    <ValueDetail label="Supplied estimated exit fee" item={target.estimatedExitFee} />
                                    <Detail label="Plan target status" value={target.statusLabel} />
                                    <Detail label="Plan target issue" value={target.issueLabel} />
                                </dl>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="mt-4 text-sm text-gray-500">No targets were supplied with the selected plan.</p>
            )}
        </section>
    );
}

function Counts({ counts }: { counts: SoxlMonitorCountsView }) {
    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <Detail label={counts.unchangedMetLabel} value={counts.unchangedMetCount} />
            <Detail label={counts.unchangedNotMetLabel} value={counts.unchangedNotMetCount} />
            <Detail label={counts.unchangedUnknownLabel} value={counts.unchangedUnknownCount} />
            <Detail label={counts.becameMetLabel} value={counts.becameMetCount} />
            <Detail label={counts.becameNotMetLabel} value={counts.becameNotMetCount} />
            <Detail label={counts.becameUnknownLabel} value={counts.becameUnknownCount} />
            <Detail label={counts.changedLabel} value={counts.changedCount} />
            <Detail label={counts.totalLabel} value={counts.totalCount} />
        </dl>
    );
}

function AssessmentSection({ section }: { section: SoxlMonitorSectionView }) {
    return (
        <section className="border-t border-gray-800 pt-4">
            <h5 className="text-sm font-semibold text-white">{section.title}</h5>
            <div className="mt-3">
                <Counts counts={section} />
            </div>
            {section.conditions.length > 0 ? (
                <ul className="mt-4 space-y-3">
                    {section.conditions.map((condition) => (
                        <li key={condition.conditionId} className="border-l-2 border-gray-700 pl-3">
                            <p className="text-sm font-medium leading-6 text-gray-100">{condition.label}</p>
                            <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Detail label="Baseline state" value={condition.baselineStateLabel} />
                                <Detail label="Current state" value={condition.currentStateLabel} />
                                <Detail label="Change" value={condition.changeLabel} />
                            </dl>
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                    Technical details
                                </summary>
                                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <Detail label="Condition ID" value={condition.conditionId} />
                                    <Detail label="Expected" value={condition.expectedLabel} />
                                    <Detail label="Baseline actual" value={condition.baselineActualLabel} />
                                    <Detail label="Current actual" value={condition.currentActualLabel} />
                                </dl>
                            </details>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-sm text-gray-500">No comparable conditions are available in this section.</p>
            )}
        </section>
    );
}

function Scenario({ scenario }: { scenario: SoxlMonitorScenarioView }) {
    return (
        <article className="min-w-0 rounded-lg border border-gray-800 bg-black/20 p-4">
            <h4 className="text-base font-semibold text-white">{scenario.title}</h4>
            <div className="mt-4">
                <Counts counts={scenario} />
            </div>
            <div className="mt-5 space-y-5">
                {scenario.sections.map((section) => (
                    <AssessmentSection key={section.id} section={section} />
                ))}
            </div>
        </article>
    );
}

function TargetMonitoring({ target }: { target: SoxlMonitorTargetView }) {
    return (
        <article className="min-w-0 rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h4 className="break-words text-sm font-semibold text-white">Target {target.id}</h4>
                <StatusPill status={target.monitoringStatus} label={target.monitoringStatusLabel} />
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ValueDetail label="Supplied target price" item={target.price} />
                <ValueDetail label="Supplied estimated exit fee" item={target.estimatedExitFee} />
                <Detail label="Plan target status" value={target.planStatusLabel} />
                <Detail label="Plan target issue" value={target.planIssueLabel} />
                <Detail label="Monitoring state" value={target.targetStateLabel} />
                <ValueDetail label="Remaining distance per unit" item={target.remainingDistancePerUnit} />
                <ValueDetail label="Hypothetical reward per unit" item={target.rewardPerUnit} />
                <ValueDetail label="Gross hypothetical profit at calculated maximum quantity" item={target.grossProfitAtMaximumQuantity} />
                <ValueDetail label="Estimated hypothetical net profit at calculated maximum quantity" item={target.estimatedNetProfitAtMaximumQuantity} />
                <ValueDetail label="Price reward-to-risk multiple" item={target.priceRewardToRiskMultiple} />
            </dl>
        </article>
    );
}

function MonitorResult({
    monitor,
    plan,
}: {
    monitor: SoxlLiveTradeMonitor;
    plan: SoxlTradePlan;
}) {
    const view = buildSoxlLiveTradeMonitorView(monitor);

    return (
        <div className="space-y-6">
            <div aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-base font-semibold text-white">Temporary monitoring result</h3>
                    <p className="mt-1 text-sm text-gray-500">Status changes are announced without interpreting the result.</p>
                </div>
                <StatusPill status={view.status} label={view.statusLabel} />
            </div>

            <IssueList view={view} />

            <section aria-labelledby="temporary-monitor-summary-heading" className="border-t border-gray-800 pt-5">
                <h3 id="temporary-monitor-summary-heading" className="text-base font-semibold text-white">Monitoring summary</h3>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Detail label="Monitoring status" value={view.statusLabel} />
                    <Detail label="Side from captured plan" value={view.sideLabel} />
                    <Detail label="Provider" value={view.summary.providerLabel} />
                    <Detail label="Baseline As of" value={view.summary.baselineAsOfLabel} />
                    <Detail label="Current As of" value={view.summary.currentAsOfLabel} />
                    <Detail label="Current facts status" value={view.summary.currentFactsStatusLabel} />
                    <Detail label="Current assessment status" value={view.summary.currentAssessmentStatusLabel} />
                    <Detail label="Price-monitoring status" value={view.summary.priceMonitoringStatusLabel} />
                    <Detail label="Assessment-comparison status" value={view.summary.assessmentComparisonStatusLabel} />
                    <Detail label="Current completed price timestamp" value={view.price.currentPriceTimestampLabel} />
                </dl>
            </section>

            <section aria-labelledby="temporary-monitor-execution-heading" className="border-t border-gray-800 pt-5">
                <h3 id="temporary-monitor-execution-heading" className="text-base font-semibold text-white">Captured execution details</h3>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ValueDetail label="Actual execution price" item={view.execution.executionPrice} />
                    <ValueDetail label="Executed quantity" item={view.execution.executedQuantity} />
                    <ValueDetail label="Actual entry fee" item={view.execution.actualEntryFee} />
                    <ValueDetail label="Estimated current exit fee" item={view.execution.estimatedCurrentExitFee} />
                </dl>
            </section>

            <PlanContext plan={plan} captured />

            <section aria-labelledby="temporary-monitor-price-heading" className="border-t border-gray-800 pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 id="temporary-monitor-price-heading" className="text-base font-semibold text-white">Price monitoring</h3>
                        <p className="mt-1 text-sm text-gray-500">{view.price.sourceLabel}</p>
                    </div>
                    <StatusPill status={view.price.status} label={view.price.statusLabel} />
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ValueDetail label="Latest completed five-minute price" item={view.price.currentPrice} />
                    <Detail label="Completed-candle timestamp" value={view.price.currentPriceTimestampLabel} />
                    <ValueDetail label="Entry notional" item={view.price.entryNotional} />
                    <ValueDetail label="Current notional at completed-candle price" item={view.price.currentNotional} />
                    <ValueDetail label="Side-aware price movement per unit" item={view.price.priceMovePerUnit} />
                    <ValueDetail label="Gross unrealized P&L" item={view.price.grossUnrealizedPnl} />
                    <ValueDetail label="Estimated net unrealized P&L after supplied fees" item={view.price.estimatedNetUnrealizedPnl} />
                    <ValueDetail label="Estimated net return on entry notional" item={view.price.estimatedNetReturnOnEntryNotional} />
                    <ValueDetail label="Initial risk per unit" item={view.price.initialRiskPerUnit} />
                    <ValueDetail label="Price movement in initial-risk units" item={view.price.priceMoveInInitialRiskUnits} />
                </dl>
            </section>

            <section aria-labelledby="temporary-monitor-invalidation-heading" className="border-t border-gray-800 pt-5">
                <h3 id="temporary-monitor-invalidation-heading" className="text-base font-semibold text-white">Invalidation monitoring</h3>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ValueDetail label="Supplied invalidation price" item={view.invalidation.invalidationPrice} />
                    <Detail label="State" value={view.invalidation.stateLabel} />
                    <ValueDetail label="Remaining distance per unit" item={view.invalidation.remainingDistancePerUnit} />
                </dl>
                <p className="mt-4 text-sm leading-6 text-gray-400">
                    A reached invalidation level is a factual price comparison. This monitor does not instruct you to take an action.
                </p>
            </section>

            <section aria-labelledby="temporary-monitor-quantity-heading" className="border-t border-gray-800 pt-5">
                <h3 id="temporary-monitor-quantity-heading" className="text-base font-semibold text-white">Quantity comparison</h3>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ValueDetail label="Executed quantity" item={view.quantity.executedQuantity} />
                    <ValueDetail label="Calculated maximum quantity from the selected plan" item={view.quantity.calculatedMaximumQuantity} />
                    <ValueDetail label="Signed quantity difference" item={view.quantity.quantityDifference} />
                    <Detail label="Comparison state" value={view.quantity.stateLabel} />
                </dl>
            </section>

            <section aria-labelledby="temporary-monitor-targets-heading" className="border-t border-gray-800 pt-5">
                <h3 id="temporary-monitor-targets-heading" className="text-base font-semibold text-white">Target monitoring</h3>
                <p className="mt-2 text-sm leading-6 text-gray-400">Target states are factual price comparisons only.</p>
                {view.targets.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                        {view.targets.map((target) => (
                            <TargetMonitoring key={target.id} target={target} />
                        ))}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-gray-500">No targets were supplied with the captured plan.</p>
                )}
            </section>

            <section aria-labelledby="temporary-monitor-assessment-heading" className="border-t border-gray-800 pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 id="temporary-monitor-assessment-heading" className="text-base font-semibold text-white">Assessment changes</h3>
                        <p className="mt-1 text-sm leading-6 text-gray-500">Both scenario condition sets are shown without selecting between them.</p>
                    </div>
                    <StatusPill
                        status={view.assessmentComparison.status}
                        label={view.assessmentComparison.statusLabel}
                    />
                </div>
                {view.assessmentComparison.scenarios.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {view.assessmentComparison.scenarios.map((scenario) => (
                            <Scenario key={scenario.id} scenario={scenario} />
                        ))}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-gray-500">Assessment-condition comparison is unavailable.</p>
                )}
            </section>
        </div>
    );
}

export default function LiveTradeMonitorCard({
    selectedPlan,
    currentAssessment,
    currentFacts,
    onMonitoringChange,
}: LiveTradeMonitorCardProps) {
    const router = useRouter();
    const [isRefreshing, startRefreshTransition] = useTransition();
    const [form, setForm] = useState<ExecutionFormState>(initialExecutionForm);
    const [activeSession, setActiveSession] = useState<ActiveMonitorSession | null>(null);
    const [validationMonitor, setValidationMonitor] = useState<SoxlLiveTradeMonitor | null>(null);

    const activeMonitor = useMemo(() => {
        if (activeSession === null) {
            return null;
        }

        return monitorSoxlTrade({
            plan: activeSession.plan,
            baselineAssessment: activeSession.baselineAssessment,
            currentAssessment,
            currentFacts,
            executionPrice: activeSession.executionPrice,
            executedQuantity: activeSession.executedQuantity,
            actualEntryFee: activeSession.actualEntryFee,
            estimatedCurrentExitFee: activeSession.estimatedCurrentExitFee,
        });
    }, [activeSession, currentAssessment, currentFacts]);

    const updateField = (field: keyof ExecutionFormState, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleStart = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (selectedPlan === null || activeSession !== null) {
            return;
        }

        const session: ActiveMonitorSession = {
            plan: selectedPlan,
            baselineAssessment: currentAssessment,
            executionPrice: parseDecimal(form.executionPrice),
            executedQuantity: parseDecimal(form.executedQuantity),
            actualEntryFee: parseDecimal(form.actualEntryFee),
            estimatedCurrentExitFee: parseDecimal(form.estimatedCurrentExitFee),
        };
        const candidate = monitorSoxlTrade({
            ...session,
            currentAssessment,
            currentFacts,
        });

        if (candidate.issues.some((issue) => executionBlockingIssues.has(issue))) {
            setValidationMonitor(candidate);
            return;
        }

        setValidationMonitor(null);
        setActiveSession(session);
        onMonitoringChange(true);
    };

    const handleRefresh = () => {
        if (isRefreshing) {
            return;
        }

        startRefreshTransition(() => {
            router.refresh();
        });
    };

    const handleStop = () => {
        setActiveSession(null);
        setValidationMonitor(null);
        setForm(initialExecutionForm);
        onMonitoringChange(false);
    };

    const validationView = validationMonitor === null
        ? null
        : buildSoxlLiveTradeMonitorView(validationMonitor);

    return (
        <section aria-labelledby="temporary-soxl-trade-monitor-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">Temporary manual monitoring</p>
                <h2 id="temporary-soxl-trade-monitor-heading" className="mt-2 text-2xl font-semibold text-white">
                    Temporary SOXL Trade Monitor
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">
                    This temporary monitor compares your manually entered execution with the latest completed five-minute SOXL candle. It does not use a live tick, save data, or recommend an action.
                </p>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">
                    Temporary monitoring data is lost when the page is fully reloaded or closed.
                </p>
            </div>

            <div className="min-w-0 rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                {selectedPlan === null ? (
                    <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm leading-6 text-gray-400">
                        Calculate a plan, then explicitly select it for temporary monitoring.
                    </p>
                ) : null}

                {selectedPlan !== null && activeSession === null ? (
                    <div className="space-y-5">
                        <PlanContext plan={selectedPlan} />
                        <form onSubmit={handleStart} className="space-y-5">
                            <fieldset className="rounded-lg border border-gray-800 bg-black/20 p-4">
                                <legend className="px-1 text-sm font-semibold text-white">Manual execution details</legend>
                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <Field
                                        id="temporary-monitor-execution-price"
                                        label="Actual execution price"
                                        value={form.executionPrice}
                                        onChange={(value) => updateField('executionPrice', value)}
                                        helperText="Actual execution price is the broker fill price."
                                    />
                                    <Field
                                        id="temporary-monitor-executed-quantity"
                                        label="Executed quantity"
                                        value={form.executedQuantity}
                                        onChange={(value) => updateField('executedQuantity', value)}
                                        helperText="Executed quantity may be below, equal to, or above the calculated maximum; the monitor reports the comparison without approving or rejecting it."
                                    />
                                    <Field
                                        id="temporary-monitor-entry-fee"
                                        label="Actual entry fee"
                                        value={form.actualEntryFee}
                                        onChange={(value) => updateField('actualEntryFee', value)}
                                        helperText="Enter the actual entry fee explicitly, including zero where appropriate."
                                    />
                                    <Field
                                        id="temporary-monitor-current-exit-fee"
                                        label="Estimated current exit fee"
                                        value={form.estimatedCurrentExitFee}
                                        onChange={(value) => updateField('estimatedCurrentExitFee', value)}
                                        helperText="Enter the estimated current exit fee explicitly, including zero where appropriate."
                                    />
                                </div>
                            </fieldset>
                            <button
                                type="submit"
                                className="rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300"
                            >
                                Start temporary monitoring
                            </button>
                        </form>
                        {validationView ? (
                            <div aria-live="polite">
                                <IssueList view={validationView} />
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {activeSession !== null && activeMonitor !== null ? (
                    <div className="space-y-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                aria-busy={isRefreshing}
                                className="rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isRefreshing ? 'Refreshing current market data' : 'Refresh current market data'}
                            </button>
                            <button
                                type="button"
                                onClick={handleStop}
                                className="rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                            >
                                Stop temporary monitor
                            </button>
                        </div>
                        <p className="text-sm leading-6 text-gray-400">
                            Refresh requests updated page data. The latest completed five-minute candle may remain unchanged until a newer candle is available.
                        </p>
                        <MonitorResult monitor={activeMonitor} plan={activeSession.plan} />
                    </div>
                ) : null}
            </div>
        </section>
    );
}
