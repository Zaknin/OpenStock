import type {
    CandleSeriesErrorCode,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    IndicatorStatus,
    SwingDetectionIssue,
} from '@/lib/soxl-intelligence/indicators';
import type {
    SoxlCoreIndicatorSeriesView,
    SoxlCoreIndicatorValueView,
    SoxlCoreIndicatorView,
} from '@/lib/soxl-intelligence/analysis/soxl-core-indicators-view';
import {
    formatSoxlDailyTradingDate,
    formatSoxlDisplayTimestamp,
} from '@/lib/soxl-intelligence/presentation/time-format';

export interface CoreIndicatorStatusCardProps {
    view: SoxlCoreIndicatorView;
}

const statusLabels: Record<SoxlCoreIndicatorView['status'], string> = {
    available: 'Core indicators available',
    partial: 'Core indicators partially available',
    unavailable: 'Core indicators unavailable',
};

const seriesStatusLabels: Record<SoxlCoreIndicatorSeriesView['status'], string> = {
    available: 'available',
    partial: 'partial',
    unavailable: 'unavailable',
};

const readinessLabels: Record<IndicatorStatus, string> = {
    available: 'available',
    insufficient_history: 'insufficient history',
    invalid_input: 'invalid input',
};

const errorLabels: Record<CandleSeriesErrorCode, string> = {
    provider_not_configured: 'Provider not configured',
    provider_error: 'Provider unavailable',
    invalid_response: 'Invalid provider response',
    invalid_candles: 'Invalid candle data',
    insufficient_history: 'Insufficient history',
    unsupported_interval: 'Unsupported interval',
    entitlement_required: 'Entitlement required',
};

const swingIssueLabels: Record<SwingDetectionIssue, string> = {
    invalid_left_bars: 'Invalid left bars',
    invalid_right_bars: 'Invalid right bars',
    insufficient_confirmation_history: 'Insufficient confirmation history',
};

const issueLabels: Record<NonNullable<SoxlCoreIndicatorSeriesView['issue']>, string> = {
    indicator_calculation_failed: 'Indicator calculation failed',
};

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

const rsiFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
});

function formatMoney(value: number | null): string {
    return value === null ? '\u2014' : usdFormatter.format(value);
}

function formatDecimal(value: number | null): string {
    return value === null ? '\u2014' : decimalFormatter.format(value);
}

function formatMacd(value: number | null): string {
    if (value === null) {
        return '\u2014';
    }

    const roundedValue = decimalFormatter.format(value);
    if (value !== 0 && Number(roundedValue) === 0) {
        return value.toExponential(3);
    }

    return roundedValue;
}

function formatIndicatorValue(indicator: SoxlCoreIndicatorValueView): string {
    if (indicator.kind === 'price') {
        return formatMoney(indicator.value);
    }

    if (indicator.kind === 'rsi') {
        return indicator.value === null ? '\u2014' : rsiFormatter.format(indicator.value);
    }

    if (indicator.kind === 'macd') {
        return formatMacd(indicator.value);
    }

    return formatDecimal(indicator.value);
}

function formatSeriesTimestamp(
    timestamp: number | null,
    series: SoxlCoreIndicatorSeriesView,
): string {
    return series.interval === '1d'
        ? formatSoxlDailyTradingDate(timestamp)
        : formatSoxlDisplayTimestamp(timestamp);
}

function StatusPill({ status }: { status: SoxlCoreIndicatorSeriesView['status'] }) {
    const classes = status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : status === 'partial'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${classes}`}>
            {seriesStatusLabels[status]}
        </span>
    );
}

function IndicatorValueList({
    values,
}: {
    values: readonly SoxlCoreIndicatorValueView[];
}) {
    return (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {values.map((indicator) => (
                <div key={indicator.key}>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        {indicator.label}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">
                        {formatIndicatorValue(indicator)}
                    </dd>
                    {indicator.value === null && indicator.status ? (
                        <dd className="mt-1 text-[11px] text-gray-500">
                            {readinessLabels[indicator.status]}
                        </dd>
                    ) : null}
                </div>
            ))}
        </dl>
    );
}

function MacdValues({ series }: { series: SoxlCoreIndicatorSeriesView }) {
    if (!series.macd) {
        return null;
    }

    return (
        <IndicatorValueList values={[
            series.macd.macd,
            series.macd.signal,
            series.macd.histogram,
        ]} />
    );
}

function SwingDetail({
    label,
    price,
    pivot,
    confirmed,
}: {
    label: string;
    price: number | null;
    pivot: string;
    confirmed: string;
}) {
    return (
        <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-100">{formatMoney(price)}</dd>
            <dd className="mt-1 text-[11px] leading-5 text-gray-500">
                Pivot {pivot} {'\u00b7'} Confirmed {confirmed}
            </dd>
        </div>
    );
}

function Swings({ series }: { series: SoxlCoreIndicatorSeriesView }) {
    if (!series.swings) {
        return null;
    }

    const high = series.swings.latestHigh;
    const low = series.swings.latestLow;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Confirmed swings
                </h4>
                {series.swings.status && series.swings.status !== 'available' ? (
                    <span className="text-xs text-gray-500">
                        {readinessLabels[series.swings.status]}
                    </span>
                ) : null}
                {series.swings.issue ? (
                    <span className="text-xs text-gray-500">
                        {swingIssueLabels[series.swings.issue]} ({series.swings.issue})
                    </span>
                ) : null}
            </div>
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SwingDetail
                    label="Latest high"
                    price={high?.price ?? null}
                    pivot={formatSeriesTimestamp(high?.pivotTimestamp ?? null, series)}
                    confirmed={formatSeriesTimestamp(high?.confirmedAtTimestamp ?? null, series)}
                />
                <SwingDetail
                    label="Latest low"
                    price={low?.price ?? null}
                    pivot={formatSeriesTimestamp(low?.pivotTimestamp ?? null, series)}
                    confirmed={formatSeriesTimestamp(low?.confirmedAtTimestamp ?? null, series)}
                />
            </dl>
        </div>
    );
}

function SeriesIssue({ series }: { series: SoxlCoreIndicatorSeriesView }) {
    if (!series.sourceErrorCode && !series.issue) {
        return null;
    }

    return (
        <p className="text-xs leading-5 text-gray-500">
            {series.sourceErrorCode ? (
                <>
                    <span className="font-medium text-gray-400">Source:</span>{' '}
                    {errorLabels[series.sourceErrorCode] ?? 'Unavailable'}{' '}
                    <span className="text-gray-600">({series.sourceErrorCode})</span>
                </>
            ) : null}
            {series.sourceErrorCode && series.issue ? ' ' : null}
            {series.issue ? (
                <>
                    <span className="font-medium text-gray-400">Readiness:</span>{' '}
                    {issueLabels[series.issue]}{' '}
                    <span className="text-gray-600">({series.issue})</span>
                </>
            ) : null}
        </p>
    );
}

function SeriesRow({ series }: { series: SoxlCoreIndicatorSeriesView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white">{series.label}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                        {series.symbol} {'\u00b7'} {series.interval}
                    </p>
                </div>
                <StatusPill status={series.status} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Source bars
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">{series.sourceCandleCount}</dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Completed bars
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">{series.completedCandleCount}</dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Latest completed bar
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">
                        {formatSeriesTimestamp(series.latestCompletedTimestamp, series)}
                    </dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Latest completed close
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">
                        {formatMoney(series.latestCompletedClose)}
                    </dd>
                </div>
            </dl>

            <div className="mt-5 space-y-4">
                <IndicatorValueList values={series.values} />
                <MacdValues series={series} />
                <Swings series={series} />
                <SeriesIssue series={series} />
            </div>
        </article>
    );
}

export default function CoreIndicatorStatusCard({ view }: CoreIndicatorStatusCardProps) {
    const statusClasses = view.status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : view.status === 'partial'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <section aria-labelledby="core-indicator-readiness-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Indicator diagnostics
                </p>
                <h2 id="core-indicator-readiness-heading" className="mt-2 text-2xl font-semibold text-white">
                    Core Indicator Readiness
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Deterministic calculations from completed regular-session candles. No trading assessment is active yet.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${statusClasses}`}>
                            {statusLabels[view.status]}
                        </span>
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-400 sm:grid-cols-5">
                            <div>
                                <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                                    Provider
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">{view.providerId}</dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                                    As of
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">
                                    {formatSoxlDisplayTimestamp(view.asOf)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                                    Available
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">{view.availableCount}</dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                                    Partial
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">{view.partialCount}</dd>
                            </div>
                            <div>
                                <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                                    Unavailable
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">{view.unavailableCount}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {view.series.map((series) => (
                        <SeriesRow key={series.key} series={series} />
                    ))}
                </div>
            </div>
        </section>
    );
}
