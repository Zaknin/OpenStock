import type { ReactNode } from 'react';
import type {
    CandleSeriesErrorCode,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    PriceLevelIssue,
    PriceLevelStatus,
    VolumeIndicatorIssue,
} from '@/lib/soxl-intelligence/indicators';
import type {
    SoxlSessionAnalysisIssue,
    SoxlSessionCalculationIssue,
    SoxlSessionCalculationStatus,
} from '@/lib/soxl-intelligence/analysis/soxl-session-analysis';
import type {
    SoxlSessionAnalysisView,
    SoxlSessionLevelView,
    SoxlSessionSeriesValueView,
    SoxlSessionWindowPlanView,
    SoxlSessionWindowView,
} from '@/lib/soxl-intelligence/analysis/soxl-session-analysis-view';
import type {
    SoxlSessionDateRelation,
    SoxlSessionWindowIssue,
} from '@/lib/soxl-intelligence/analysis/soxl-session-windows';
import {
    formatSoxlDisplayTimestamp,
} from '@/lib/soxl-intelligence/presentation/time-format';

export interface SessionAnalysisStatusCardProps {
    view: SoxlSessionAnalysisView;
}

const statusLabels: Record<SoxlSessionAnalysisView['status'], string> = {
    available: 'Session calculations available',
    partial: 'Session calculations partially available',
    unavailable: 'Session calculations unavailable',
};

const sourceErrorLabels: Record<CandleSeriesErrorCode, string> = {
    provider_not_configured: 'Provider not configured',
    provider_error: 'Provider unavailable',
    invalid_response: 'Invalid provider response',
    invalid_candles: 'Invalid candle data',
    insufficient_history: 'Insufficient history',
    unsupported_interval: 'Unsupported interval',
    entitlement_required: 'Entitlement required',
};

const analysisIssueLabels: Record<SoxlSessionAnalysisIssue, string> = {
    source_unavailable: 'Source candles unavailable',
    session_windows_unavailable: 'Session windows unavailable',
    calculation_failed: 'Calculation failed',
};

const windowIssueLabels: Record<SoxlSessionWindowIssue, string> = {
    invalid_as_of: 'Invalid as-of timestamp',
    source_unavailable: 'Source candles unavailable',
    no_completed_regular_candles: 'No completed regular-session candles',
    previous_session_unavailable: 'Previous represented session unavailable',
    window_calculation_failed: 'Window calculation failed',
};

const dateRelationLabels: Record<SoxlSessionDateRelation, string> = {
    same_exchange_date: 'Latest represented session matches current New York date',
    prior_exchange_date: 'Latest represented session is from a prior New York date',
};

const calculationStatusLabels: Record<SoxlSessionCalculationStatus, string> = {
    available: 'available',
    unavailable: 'unavailable',
    not_run: 'not run',
    failed: 'failed',
};

const indicatorStatusLabels: Record<NonNullable<SoxlSessionSeriesValueView['status']>, string> = {
    available: 'available',
    insufficient_history: 'insufficient history',
    invalid_input: 'invalid input',
};

const calculationIssueLabels: Record<SoxlSessionCalculationIssue, string> = {
    session_windows_unavailable: 'Session windows unavailable',
    previous_session_unavailable: 'Previous represented session unavailable',
    calculation_failed: 'Calculation failed',
};

const volumeIssueLabels: Record<VolumeIndicatorIssue, string> = {
    invalid_session_window: 'Invalid session window',
    unsupported_daily_interval: 'Unsupported daily interval',
    no_matching_session_candles: 'No matching regular-session candles',
    insufficient_usable_volume: 'Insufficient usable volume',
    missing_current_volume: 'Missing current volume',
    missing_baseline_volume: 'Missing baseline volume',
    zero_total_volume: 'Zero total volume',
    zero_average_volume: 'Zero average volume',
    invalid_lookback: 'Invalid lookback',
};

const priceLevelIssueLabels: Record<PriceLevelIssue, string> = {
    invalid_window: 'Invalid window',
    window_not_completed: 'Window not completed',
    unsupported_daily_interval: 'Unsupported daily interval',
    interval_exceeds_window: 'Interval exceeds window',
    no_matching_candles: 'No matching candles',
};

const priceLevelStatusLabels: Record<PriceLevelStatus, string> = {
    available: 'available',
    insufficient_history: 'insufficient history',
    invalid_input: 'invalid input',
};

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

const ratioFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
});

const integerFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});

const tradingDateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
});

function formatMoney(value: number | null): string {
    if (value === null) {
        return '\u2014';
    }

    const formattedValue = usdFormatter.format(value);
    if (value !== 0 && Number(formattedValue.replace(/[^0-9.-]/gu, '')) === 0) {
        return value.toExponential(3);
    }

    return formattedValue;
}

function formatInteger(value: number | null): string {
    return value === null ? '\u2014' : integerFormatter.format(value);
}

function formatRatio(value: number | null): string {
    if (value === null) {
        return '\u2014';
    }

    const formattedValue = ratioFormatter.format(value);

    return `${formattedValue}\u00d7`;
}

function formatBoolean(value: boolean): string {
    return value ? 'Yes' : 'No';
}

function formatTradingDateKey(value: string | null): string {
    if (value === null) {
        return '\u2014';
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    if (!match) {
        return `${value} \u00b7 trading date`;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);

    return `${tradingDateFormatter.format(new Date(Date.UTC(year, monthIndex, day)))} \u00b7 trading date`;
}

function formatWindow(window: SoxlSessionWindowView | null): string {
    if (window === null) {
        return '\u2014';
    }

    return `${formatSoxlDisplayTimestamp(window.start)} to ${formatSoxlDisplayTimestamp(window.end)}`;
}

function StatusPill({ status }: { status: SoxlSessionAnalysisView['status'] }) {
    const classes = status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : status === 'partial'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${classes}`}>
            {statusLabels[status]}
        </span>
    );
}

function CalculationStatusPill({ status }: { status: SoxlSessionCalculationStatus }) {
    const classes = status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : status === 'failed'
            ? 'border-red-500/30 bg-red-500/10 text-red-300'
            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';

    return (
        <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${classes}`}>
            {calculationStatusLabels[status]}
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
        <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-100">{value}</dd>
        </div>
    );
}

function IssueLine({
    label,
    value,
}: {
    label: string;
    value: string | null;
}) {
    if (value === null) {
        return null;
    }

    return (
        <p className="mt-3 text-xs leading-5 text-gray-500">
            <span className="font-medium text-gray-400">{label}:</span> {value}
        </p>
    );
}

function WindowSection({ plan }: { plan: SoxlSessionWindowPlanView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white">Window plan</h3>
                    <p className="mt-1 text-xs text-gray-500">{plan.exchangeTimeZone}</p>
                </div>
                <span className="w-fit rounded-full border border-gray-700 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-300">
                    {plan.status}
                </span>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Detail label="Latest represented date" value={formatTradingDateKey(plan.latestTradingDate)} />
                <Detail label="Previous represented date" value={formatTradingDateKey(plan.previousTradingDate)} />
                <Detail
                    label="Freshness relation"
                    value={plan.latestDateRelation === null
                        ? '\u2014'
                        : dateRelationLabels[plan.latestDateRelation]}
                />
                <Detail label="Latest regular session" value={formatWindow(plan.latestRegularSession)} />
                <Detail label="Previous regular session" value={formatWindow(plan.previousRegularSession)} />
                <Detail label="Opening range 30m" value={formatWindow(plan.latestOpeningRange30m)} />
                <Detail
                    label="Regular session complete"
                    value={formatBoolean(plan.latestRegularSessionCompleted)}
                />
                <Detail
                    label="Opening range complete"
                    value={formatBoolean(plan.latestOpeningRange30mCompleted)}
                />
            </dl>

            <IssueLine
                label="Window detail"
                value={plan.issue === null
                    ? null
                    : `${windowIssueLabels[plan.issue]} (${plan.issue})`}
            />
        </article>
    );
}

function VolumeCalculationCard({
    title,
    result,
    status,
    issue,
    formatter,
    children,
}: {
    title: string;
    result: SoxlSessionSeriesValueView;
    status: SoxlSessionCalculationStatus;
    issue: SoxlSessionCalculationIssue | null;
    formatter: (value: number | null) => string;
    children?: ReactNode;
}) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <CalculationStatusPill status={status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
                <Detail label="Latest value" value={formatter(result.value)} />
                <Detail label="Timestamp" value={formatSoxlDisplayTimestamp(result.timestamp)} />
                <Detail label="Used bars" value={formatInteger(result.usedBars)} />
                <Detail label="Required bars" value={formatInteger(result.requiredBars)} />
                <Detail
                    label="Result status"
                    value={result.status === null
                        ? '\u2014'
                        : indicatorStatusLabels[result.status]}
                />
                {children}
            </dl>
            <IssueLine
                label="Calculation detail"
                value={issue === null
                    ? null
                    : `${calculationIssueLabels[issue]} (${issue})`}
            />
            <IssueLine
                label="Result detail"
                value={result.issue === null
                    ? null
                    : `${volumeIssueLabels[result.issue]} (${result.issue})`}
            />
        </article>
    );
}

function LevelCalculationCard({
    title,
    result,
    status,
    issue,
    showCompletion,
    isComplete,
}: {
    title: string;
    result: SoxlSessionLevelView;
    status: SoxlSessionCalculationStatus;
    issue: SoxlSessionCalculationIssue | null;
    showCompletion?: boolean;
    isComplete?: boolean;
}) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <CalculationStatusPill status={status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
                <Detail label="High" value={formatMoney(result.high)} />
                <Detail label="High timestamp" value={formatSoxlDisplayTimestamp(result.highTimestamp)} />
                <Detail label="Low" value={formatMoney(result.low)} />
                <Detail label="Low timestamp" value={formatSoxlDisplayTimestamp(result.lowTimestamp)} />
                <Detail label="Used bars" value={formatInteger(result.usedBars)} />
                <Detail
                    label="Level status"
                    value={result.status === null
                        ? '\u2014'
                        : priceLevelStatusLabels[result.status]}
                />
                {showCompletion && isComplete !== undefined ? (
                    <Detail label="Window complete" value={formatBoolean(isComplete)} />
                ) : null}
            </dl>
            <IssueLine
                label="Calculation detail"
                value={issue === null
                    ? null
                    : `${calculationIssueLabels[issue]} (${issue})`}
            />
            <IssueLine
                label="Result detail"
                value={result.issue === null
                    ? null
                    : `${priceLevelIssueLabels[result.issue]} (${result.issue})`}
            />
        </article>
    );
}

export default function SessionAnalysisStatusCard({ view }: SessionAnalysisStatusCardProps) {
    return (
        <section aria-labelledby="regular-session-analysis-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Session diagnostics
                </p>
                <h2 id="regular-session-analysis-heading" className="mt-2 text-2xl font-semibold text-white">
                    Regular Session Analysis
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Deterministic regular-session calculations from completed SOXL 5-minute candles. No trading assessment is active yet.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <StatusPill status={view.status} />
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-400 sm:grid-cols-2 lg:grid-cols-4">
                            <Detail label="Provider" value={view.providerId} />
                            <Detail label="As of" value={formatSoxlDisplayTimestamp(view.asOf)} />
                            <Detail label="Source bars" value={formatInteger(view.sourceCandleCount)} />
                            <Detail
                                label="Completed regular bars"
                                value={formatInteger(view.completedRegularCandleCount)}
                            />
                            <Detail
                                label="Latest completed close"
                                value={formatMoney(view.latestCompletedClose)}
                            />
                            <Detail
                                label="Latest completed bar"
                                value={formatSoxlDisplayTimestamp(view.latestCompletedTimestamp)}
                            />
                            <Detail label="Source status" value={view.sourceStatus} />
                        </dl>
                        <IssueLine
                            label="Source detail"
                            value={view.sourceErrorCode === null
                                ? null
                                : `${sourceErrorLabels[view.sourceErrorCode]} (${view.sourceErrorCode})`}
                        />
                        <IssueLine
                            label="Session detail"
                            value={view.issue === null
                                ? null
                                : `${analysisIssueLabels[view.issue]} (${view.issue})`}
                        />
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    <WindowSection plan={view.windowPlan} />
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <VolumeCalculationCard
                            title="Regular-session VWAP"
                            result={view.vwap}
                            status={view.calculationStates.vwap.status}
                            issue={view.calculationStates.vwap.issue}
                            formatter={formatMoney}
                        />
                        <VolumeCalculationCard
                            title="Rolling relative volume"
                            result={view.relativeVolume}
                            status={view.calculationStates.relativeVolume.status}
                            issue={view.calculationStates.relativeVolume.issue}
                            formatter={formatRatio}
                        >
                            <Detail
                                label="Configured lookback"
                                value={formatInteger(view.relativeVolume.lookbackBars)}
                            />
                        </VolumeCalculationCard>
                        <LevelCalculationCard
                            title="Previous represented regular session"
                            result={view.previousDayLevels}
                            status={view.calculationStates.previousDayLevels.status}
                            issue={view.calculationStates.previousDayLevels.issue}
                        />
                        <LevelCalculationCard
                            title={'Opening range \u00b7 30 minute'}
                            result={view.openingRange30mLevels}
                            status={view.calculationStates.openingRange30mLevels.status}
                            issue={view.calculationStates.openingRange30mLevels.issue}
                            showCompletion
                            isComplete={view.windowPlan.latestOpeningRange30mCompleted}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
