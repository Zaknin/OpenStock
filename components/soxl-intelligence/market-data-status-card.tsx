import type {
    CandleSeriesErrorCode,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    SoxlMarketContextView,
    SoxlMarketSeriesView,
} from '@/lib/soxl-intelligence/market-data/soxl-market-context-view';
import {
    formatSoxlDailyTradingDate,
    formatSoxlDisplayTimestamp,
} from '@/lib/soxl-intelligence/presentation/time-format';

export interface MarketDataStatusCardProps {
    view: SoxlMarketContextView;
}

const statusLabels: Record<SoxlMarketContextView['status'], string> = {
    available: 'Historical data available',
    partial: 'Historical data partially available',
    unavailable: 'Historical data unavailable',
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

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

function formatClose(value: number | null): string {
    return value === null ? '\u2014' : usdFormatter.format(value);
}

function StatusPill({ status }: { status: SoxlMarketSeriesView['status'] }) {
    const classes = status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${classes}`}>
            {status}
        </span>
    );
}

function SeriesRow({ series }: { series: SoxlMarketSeriesView }) {
    const latestCompletedBar = series.interval === '1d'
        ? formatSoxlDailyTradingDate(series.latestCompletedTimestamp)
        : formatSoxlDisplayTimestamp(series.latestCompletedTimestamp);

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
                        Total bars
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">{series.candleCount}</dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Completed
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">{series.completedCandleCount}</dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Latest completed bar
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">
                        {latestCompletedBar}
                    </dd>
                </div>
                <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                        Latest completed close
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-100">
                        {formatClose(series.latestCompletedClose)}
                    </dd>
                </div>
            </dl>

            {series.errorCode ? (
                <p className="mt-4 text-xs leading-5 text-gray-500">
                    <span className="font-medium text-gray-400">Status detail:</span>{' '}
                    {errorLabels[series.errorCode] ?? 'Unavailable'}{' '}
                    <span className="text-gray-600">({series.errorCode})</span>
                </p>
            ) : null}
        </article>
    );
}

export default function MarketDataStatusCard({ view }: MarketDataStatusCardProps) {
    const statusClasses = view.status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : view.status === 'partial'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <section aria-labelledby="historical-market-data-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Historical Market Data
                </p>
                <h2 id="historical-market-data-heading" className="mt-2 text-2xl font-semibold text-white">
                    Server-side candle readiness
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Regular-session candles used by the upcoming indicator engine.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${statusClasses}`}>
                            {statusLabels[view.status]}
                        </span>
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-400 sm:grid-cols-3">
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
                                    Series available
                                </dt>
                                <dd className="mt-1 font-semibold text-gray-100">
                                    {view.availableCount} of {view.availableCount + view.unavailableCount}
                                </dd>
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
