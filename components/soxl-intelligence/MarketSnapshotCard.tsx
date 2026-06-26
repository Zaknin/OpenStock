import type { MarketSnapshot } from '@/lib/soxl-intelligence/market-data/types';
import {
    formatSoxlDisplayIsoTimestamp,
    formatSoxlDisplayTimestamp,
} from '@/lib/soxl-intelligence/presentation/time-format';

interface MarketSnapshotCardProps {
    snapshot: MarketSnapshot;
}

const usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatUsd(value: number | null): string {
    return value === null ? 'N/A' : usdFormatter.format(value);
}

function formatSignedUsd(value: number | null): string {
    if (value === null) return 'N/A';
    if (value > 0) return `+${usdFormatter.format(value)}`;
    if (value < 0) return `-${usdFormatter.format(Math.abs(value))}`;
    return usdFormatter.format(0);
}

function formatPercent(value: number | null): string {
    if (value === null) return 'N/A';
    if (value > 0) return `+${value.toFixed(2)}%`;
    if (value < 0) return `${value.toFixed(2)}%`;
    return '0.00%';
}

function getChangeClasses(value: number | null): string {
    if (value === null || value === 0) return 'text-gray-300 bg-gray-500/10';
    return value > 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10';
}

function formatProviderTimestamp(timestamp: number | null): string {
    return formatSoxlDisplayTimestamp(timestamp);
}

function formatFetchedAt(fetchedAt: string): string {
    return formatSoxlDisplayIsoTimestamp(fetchedAt);
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-800 bg-black/20 p-3">
            <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-2 text-sm font-semibold text-gray-100">{value}</dd>
        </div>
    );
}

export default function MarketSnapshotCard({ snapshot }: MarketSnapshotCardProps) {
    const changeClasses = getChangeClasses(snapshot.change);
    const statusClasses =
        snapshot.status === 'available'
            ? 'border-green-500/30 bg-green-500/10 text-green-300'
            : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <article className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                        {snapshot.symbol}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-white">{snapshot.label}</h2>
                </div>
                <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${statusClasses}`}
                >
                    {snapshot.status}
                </span>
            </header>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                        Current price
                    </p>
                    <p className="mt-2 text-3xl font-bold text-white">{formatUsd(snapshot.price)}</p>
                </div>
                <div className={`w-fit rounded-lg px-3 py-2 text-sm font-semibold ${changeClasses}`}>
                    <span>{formatSignedUsd(snapshot.change)}</span>
                    <span className="ml-2">({formatPercent(snapshot.changePercent)})</span>
                </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3">
                <SnapshotMetric label="Open" value={formatUsd(snapshot.sessionOpen)} />
                <SnapshotMetric label="Day high" value={formatUsd(snapshot.sessionHigh)} />
                <SnapshotMetric label="Day low" value={formatUsd(snapshot.sessionLow)} />
                <SnapshotMetric label="Previous close" value={formatUsd(snapshot.previousClose)} />
            </dl>

            <footer className="mt-6 space-y-2 border-t border-gray-800 pt-4 text-xs text-gray-500">
                <p>
                    <span className="font-medium text-gray-400">Last provider update:</span>{' '}
                    {formatProviderTimestamp(snapshot.providerTimestamp)}
                </p>
                <p>
                    <span className="font-medium text-gray-400">Fetched at:</span>{' '}
                    {formatFetchedAt(snapshot.fetchedAt)}
                </p>
                {snapshot.errorCode ? (
                    <p>
                        <span className="font-medium text-gray-400">Status detail:</span>{' '}
                        {snapshot.errorCode.replaceAll('_', ' ')}
                    </p>
                ) : null}
            </footer>
        </article>
    );
}
