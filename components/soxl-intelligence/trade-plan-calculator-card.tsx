'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type {
    SoxlMarketAssessment,
} from '@/lib/soxl-intelligence/strategy/soxl-market-assessment';
import type {
    SoxlMarketFacts,
} from '@/lib/soxl-intelligence/strategy/soxl-market-facts';
import {
    buildSoxlTradePlan,
    type SoxlTradePlan,
    type SoxlTradeSide,
    type SoxlTradeTargetInput,
} from '@/lib/soxl-intelligence/planning/soxl-trade-plan';
import {
    buildSoxlTradePlanView,
    type SoxlTradePlanAssessmentContextView,
    type SoxlTradePlanRowView,
    type SoxlTradePlanScenarioCountsView,
    type SoxlTradePlanView,
    type SoxlTradeTargetView,
} from '@/lib/soxl-intelligence/planning/soxl-trade-plan-view';
import LiveTradeMonitorCard from './live-trade-monitor-card';

export interface TradePlanCalculatorCardProps {
    assessment: SoxlMarketAssessment;
    marketFacts: SoxlMarketFacts;
}

interface SelectedMonitorPlan {
    selectionId: number;
    plan: SoxlTradePlan;
}

interface TargetFormState {
    id: 'target-1' | 'target-2' | 'target-3';
    price: string;
    estimatedExitFee: string;
}

interface FormState {
    side: SoxlTradeSide | '';
    entryPrice: string;
    invalidationPrice: string;
    maximumLossAmount: string;
    estimatedEntryFee: string;
    estimatedInvalidationExitFee: string;
    quantityIncrement: string;
    maximumPositionValue: string;
    targets: readonly TargetFormState[];
}

const initialTargets: readonly TargetFormState[] = [
    { id: 'target-1', price: '', estimatedExitFee: '' },
    { id: 'target-2', price: '', estimatedExitFee: '' },
    { id: 'target-3', price: '', estimatedExitFee: '' },
];

const initialForm: FormState = {
    side: '',
    entryPrice: '',
    invalidationPrice: '',
    maximumLossAmount: '',
    estimatedEntryFee: '',
    estimatedInvalidationExitFee: '',
    quantityIncrement: '',
    maximumPositionValue: '',
    targets: initialTargets,
};

function StatusPill({
    status,
    label,
}: {
    status: SoxlTradePlanView['status'] | SoxlTradeTargetView['status'];
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
    note,
}: {
    label: string;
    value: string | number;
    note?: string | null;
}) {
    return (
        <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-100">{value}</dd>
            {note ? (
                <dd className="mt-1 text-[11px] leading-5 text-gray-500">{note}</dd>
            ) : null}
        </div>
    );
}

function DetailGrid({
    rows,
}: {
    rows: readonly SoxlTradePlanRowView[];
}) {
    return (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
                <Detail
                    key={row.key}
                    label={row.label}
                    value={row.value}
                    note={row.note}
                />
            ))}
        </dl>
    );
}

function CountGrid({
    counts,
}: {
    counts: SoxlTradePlanScenarioCountsView;
}) {
    return (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Detail label="Matches" value={counts.metCount} />
            <Detail label="Does not match" value={counts.notMetCount} />
            <Detail label="Unknown" value={counts.unknownCount} />
            <Detail label="Known conditions" value={counts.knownCount} />
            <Detail label="Total conditions" value={counts.totalCount} />
        </dl>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    helperText,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    helperText?: string;
}) {
    const helperId = helperText ? `${id}-help` : undefined;

    return (
        <div>
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
            {helperText ? (
                <p id={helperId} className="mt-1 text-xs leading-5 text-gray-500">
                    {helperText}
                </p>
            ) : null}
        </div>
    );
}

function parseDecimal(value: string): number {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return Number.NaN;
    }

    return Number(trimmed);
}

function parseOptionalDecimal(value: string): number | null {
    const trimmed = value.trim();

    return trimmed.length === 0 ? null : Number(trimmed);
}

function targetInputs(targets: readonly TargetFormState[]): readonly SoxlTradeTargetInput[] {
    return targets.flatMap((target) => {
        const hasPrice = target.price.trim().length > 0;
        const hasFee = target.estimatedExitFee.trim().length > 0;

        if (!hasPrice && !hasFee) {
            return [];
        }

        return [{
            id: target.id,
            price: parseDecimal(target.price),
            estimatedExitFee: parseDecimal(target.estimatedExitFee),
        }];
    });
}

function AssessmentContext({ context }: { context: SoxlTradePlanAssessmentContextView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Current market context</h3>
            <p className="mt-2 text-xs leading-5 text-gray-500">
                These market-alignment counts are context only and do not change the risk calculations.
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="Assessment status" value={context.statusLabel} />
                <Detail label="Provider" value={context.providerId} />
                <Detail label="As of" value={context.asOfLabel} />
                <Detail label="Market-facts status" value={context.factsStatusLabel} />
                <Detail label="Core status" value={context.coreStatusLabel} />
                <Detail label="Session status" value={context.sessionStatusLabel} />
                <Detail label="Opening-range completion" value={context.openingRangeCompleteLabel} />
                <Detail label="Regular-session completion" value={context.regularSessionCompleteLabel} />
            </dl>
            <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        {context.upwardAlignment.label}
                    </h4>
                    <div className="mt-3">
                        <CountGrid counts={context.upwardAlignment} />
                    </div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        {context.downwardAlignment.label}
                    </h4>
                    <div className="mt-3">
                        <CountGrid counts={context.downwardAlignment} />
                    </div>
                </div>
            </div>
        </article>
    );
}

function TargetResult({ target }: { target: SoxlTradeTargetView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h4 className="text-sm font-semibold text-white">Hypothetical target {target.id}</h4>
                <StatusPill status={target.status} label={target.statusLabel} />
            </div>
            {target.issueExplanation ? (
                <p className="mt-3 text-sm leading-6 text-yellow-200">{target.issueExplanation}</p>
            ) : null}
            <div className="mt-4">
                <DetailGrid rows={target.inputRows} />
            </div>
            {target.outcomeRows.length > 0 ? (
                <div className="mt-4">
                    <DetailGrid rows={target.outcomeRows} />
                </div>
            ) : null}
            <details className="mt-5 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Technical details
                </summary>
                <div className="mt-4">
                    <DetailGrid rows={target.technicalRows} />
                </div>
            </details>
        </article>
    );
}

function PlanResult({ view }: { view: SoxlTradePlanView }) {
    const hasCalculation = view.calculationRows.length > 0;

    return (
        <div className="space-y-5" aria-live="polite">
            <div className="rounded-lg border border-gray-800 bg-black/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="text-sm font-semibold text-white">Calculation result</h3>
                    <StatusPill status={view.status} label={view.statusLabel} />
                </div>
                {view.issueExplanation ? (
                    <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm leading-6 text-yellow-100">
                        {view.issueExplanation}
                    </div>
                ) : null}
                <details className="mt-4 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Technical details
                    </summary>
                    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Detail label="Structured issue" value={view.issueLabel ?? 'Unavailable'} />
                    </dl>
                </details>
            </div>

            <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
                <h3 className="text-sm font-semibold text-white">User-supplied plan</h3>
                <div className="mt-4">
                    <DetailGrid rows={view.inputRows} />
                </div>
            </article>

            {hasCalculation ? (
                <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
                    <h3 className="text-sm font-semibold text-white">Calculated risk boundaries</h3>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                        This is the maximum quantity permitted by the supplied assumptions, not a recommendation to use that quantity.
                    </p>
                    <div className="mt-4">
                        <DetailGrid rows={view.calculationRows} />
                    </div>
                    <details className="mt-5 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                            Technical details
                        </summary>
                        <div className="mt-4">
                            <DetailGrid rows={view.technicalRows} />
                        </div>
                    </details>
                </article>
            ) : null}

            {view.targets.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                    {view.targets.map((target) => (
                        <TargetResult key={target.id} target={target} />
                    ))}
                </div>
            ) : null}

            <AssessmentContext context={view.assessmentContext} />
        </div>
    );
}

export default function TradePlanCalculatorCard({
    assessment,
    marketFacts,
}: TradePlanCalculatorCardProps) {
    const [form, setForm] = useState<FormState>(initialForm);
    const [plan, setPlan] = useState<SoxlTradePlan | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [selectedMonitorPlan, setSelectedMonitorPlan] = useState<SelectedMonitorPlan | null>(null);
    const [monitoringActive, setMonitoringActive] = useState(false);

    const updateField = (key: keyof Omit<FormState, 'targets'>, value: string) => {
        setForm((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const updateTarget = (
        targetId: TargetFormState['id'],
        key: keyof Pick<TargetFormState, 'price' | 'estimatedExitFee'>,
        value: string,
    ) => {
        setForm((current) => ({
            ...current,
            targets: current.targets.map((target) => (
                target.id === targetId ? { ...target, [key]: value } : target
            )),
        }));
    };

    const handleSideChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;

        if (value === 'long' || value === 'short') {
            updateField('side', value);
        }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (form.side !== 'long' && form.side !== 'short') {
            setPlan(null);
            setFormError('Select Long or Short before calculating the plan.');
            return;
        }

        setFormError(null);
        setPlan(buildSoxlTradePlan({
            assessment,
            side: form.side,
            entryPrice: parseDecimal(form.entryPrice),
            invalidationPrice: parseDecimal(form.invalidationPrice),
            maximumLossAmount: parseDecimal(form.maximumLossAmount),
            estimatedEntryFee: parseDecimal(form.estimatedEntryFee),
            estimatedInvalidationExitFee: parseDecimal(form.estimatedInvalidationExitFee),
            quantityIncrement: parseDecimal(form.quantityIncrement),
            maximumPositionValue: parseOptionalDecimal(form.maximumPositionValue),
            targets: targetInputs(form.targets),
        }));
    };

    const handleReset = () => {
        setForm(initialForm);
        setPlan(null);
        setFormError(null);
    };

    const handleSelectForMonitoring = () => {
        if (plan === null || plan.calculation === null || monitoringActive) {
            return;
        }

        setSelectedMonitorPlan((current) => ({
            selectionId: (current?.selectionId ?? 0) + 1,
            plan,
        }));
    };

    const view = plan === null ? null : buildSoxlTradePlanView(plan);

    return (
        <>
            <section aria-labelledby="soxl-trade-plan-calculator-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Manual risk calculator
                </p>
                <h2 id="soxl-trade-plan-calculator-heading" className="mt-2 text-2xl font-semibold text-white">
                    SOXL Trade Plan Calculator
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Enter your own hypothetical prices and risk limits. The calculator performs risk arithmetic only and does not recommend a trade.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <form onSubmit={handleSubmit} className="space-y-5">
                    <fieldset className="rounded-lg border border-gray-800 bg-black/20 p-4">
                        <legend className="px-1 text-sm font-semibold text-white">Plan direction</legend>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <label className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-3 text-sm text-gray-100">
                                <input
                                    type="radio"
                                    name="side"
                                    value="long"
                                    checked={form.side === 'long'}
                                    onChange={handleSideChange}
                                    className="h-4 w-4 accent-teal-500"
                                />
                                Long
                            </label>
                            <label className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-3 text-sm text-gray-100">
                                <input
                                    type="radio"
                                    name="side"
                                    value="short"
                                    checked={form.side === 'short'}
                                    onChange={handleSideChange}
                                    className="h-4 w-4 accent-teal-500"
                                />
                                Short
                            </label>
                        </div>
                    </fieldset>

                    <fieldset className="rounded-lg border border-gray-800 bg-black/20 p-4">
                        <legend className="px-1 text-sm font-semibold text-white">Proposed prices and risk</legend>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <Field id="trade-plan-entry-price" label="Proposed entry price" value={form.entryPrice} onChange={(value) => updateField('entryPrice', value)} />
                            <Field id="trade-plan-invalidation-price" label="Proposed invalidation price" value={form.invalidationPrice} onChange={(value) => updateField('invalidationPrice', value)} />
                            <Field
                                id="trade-plan-maximum-loss"
                                label="Maximum acceptable loss"
                                value={form.maximumLossAmount}
                                onChange={(value) => updateField('maximumLossAmount', value)}
                                helperText="Maximum acceptable loss includes the estimated entry and invalidation-exit fees."
                            />
                            <Field id="trade-plan-entry-fee" label="Estimated entry fee" value={form.estimatedEntryFee} onChange={(value) => updateField('estimatedEntryFee', value)} />
                            <Field id="trade-plan-invalidation-exit-fee" label="Estimated invalidation-exit fee" value={form.estimatedInvalidationExitFee} onChange={(value) => updateField('estimatedInvalidationExitFee', value)} />
                            <Field
                                id="trade-plan-quantity-increment"
                                label="Quantity increment"
                                value={form.quantityIncrement}
                                onChange={(value) => updateField('quantityIncrement', value)}
                                helperText="Quantity increment may be 1 for whole shares or a fractional amount such as 0.001."
                            />
                            <Field
                                id="trade-plan-maximum-position-value"
                                label="Maximum position value"
                                value={form.maximumPositionValue}
                                onChange={(value) => updateField('maximumPositionValue', value)}
                                helperText="Maximum position value is optional."
                            />
                        </div>
                    </fieldset>

                    <fieldset className="rounded-lg border border-gray-800 bg-black/20 p-4">
                        <legend className="px-1 text-sm font-semibold text-white">Hypothetical targets</legend>
                        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                            {form.targets.map((target, index) => (
                                <div key={target.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                                        Target {index + 1}
                                    </p>
                                    <div className="mt-4 space-y-4">
                                        <Field
                                            id={`${target.id}-price`}
                                            label="Target price"
                                            value={target.price}
                                            onChange={(value) => updateTarget(target.id, 'price', value)}
                                        />
                                        <Field
                                            id={`${target.id}-exit-fee`}
                                            label="Estimated target-exit fee"
                                            value={target.estimatedExitFee}
                                            onChange={(value) => updateTarget(target.id, 'estimatedExitFee', value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </fieldset>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            type="submit"
                            className="rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300"
                        >
                            Calculate plan
                        </button>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        >
                            Reset
                        </button>
                    </div>
                </form>

                {formError ? (
                    <div className="mt-5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm leading-6 text-yellow-100" role="alert">
                        {formError}
                    </div>
                ) : null}

                <div className="mt-5" aria-live="polite">
                    {view ? (
                        <div className="space-y-5">
                            <PlanResult view={view} />
                            {plan?.calculation ? (
                                <div className="rounded-lg border border-gray-800 bg-black/20 p-4">
                                    <button
                                        type="button"
                                        onClick={handleSelectForMonitoring}
                                        disabled={monitoringActive}
                                        className="rounded-md border border-teal-500/60 px-4 py-2 text-sm font-semibold text-teal-200 transition-colors hover:border-teal-300 hover:text-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                                    >
                                        Use this plan for temporary monitoring
                                    </button>
                                    {monitoringActive ? (
                                        <p className="mt-3 text-sm leading-6 text-gray-400">
                                            Stop the existing temporary monitor before selecting another plan.
                                        </p>
                                    ) : selectedMonitorPlan?.plan === plan ? (
                                        <p className="mt-3 text-sm leading-6 text-gray-400">
                                            This plan is selected. Enter execution details in the temporary monitor below.
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm leading-6 text-gray-400">
                            Enter your hypothetical plan and select Calculate plan.
                        </p>
                    )}
                </div>
                </div>
            </section>
            <LiveTradeMonitorCard
                key={selectedMonitorPlan?.selectionId ?? 0}
                selectedPlan={selectedMonitorPlan?.plan ?? null}
                currentAssessment={assessment}
                currentFacts={marketFacts}
                onMonitoringChange={setMonitoringActive}
            />
        </>
    );
}
