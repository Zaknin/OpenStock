import MarketSnapshotCard from '@/components/soxl-intelligence/MarketSnapshotCard';
import type { MarketSnapshot } from '@/lib/soxl-intelligence/market-data/types';

interface MarketSnapshotGridProps {
    snapshots: MarketSnapshot[];
}

export default function MarketSnapshotGrid({ snapshots }: MarketSnapshotGridProps) {
    return (
        <section aria-labelledby="market-snapshots-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Finnhub current snapshots
                </p>
                <h2 id="market-snapshots-heading" className="mt-2 text-2xl font-semibold text-white">
                    SOXL, QQQ, and SMH market data
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Current quote data is fetched server-side. Each symbol is handled independently so one
                    unavailable quote does not affect the others.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                {snapshots.map((snapshot) => (
                    <MarketSnapshotCard key={snapshot.symbol} snapshot={snapshot} />
                ))}
            </div>
        </section>
    );
}
