import MarketSnapshotGrid from '@/components/soxl-intelligence/MarketSnapshotGrid';
import MarketDataStatusCard from '@/components/soxl-intelligence/market-data-status-card';
import CoreIndicatorStatusCard from '@/components/soxl-intelligence/core-indicator-status-card';
import SoxlChartPanel from '@/components/soxl-intelligence/SoxlChartPanel';
import { buildSoxlCoreIndicatorSnapshot } from '@/lib/soxl-intelligence/analysis/soxl-core-indicators';
import { buildSoxlCoreIndicatorView } from '@/lib/soxl-intelligence/analysis/soxl-core-indicators-view';
import {
    MARKET_SNAPSHOT_SYMBOLS,
    createUnavailableMarketSnapshot,
} from '@/lib/soxl-intelligence/market-data/types';
import { getSoxlMarketSnapshots } from '@/lib/soxl-intelligence/market-data/snapshots';
import { buildSoxlMarketContextView } from '@/lib/soxl-intelligence/market-data/soxl-market-context-view';
import { loadServerSoxlMarketContext } from '@/lib/soxl-intelligence/market-data/server/soxl-market-context-service';

const placeholderSections = [
    {
        title: 'Deterministic assessment',
        status: 'Coming in Stage 3',
        description: 'The deterministic SOXL signal state, entry conditions, invalidation, and targets will appear here in a later stage.',
    },
    {
        title: 'AI explanation',
        status: 'Coming in Stage 4',
        description: 'AI-generated commentary will explain deterministic analysis results without inventing prices, levels, or timestamps.',
    },
    {
        title: 'Signal history',
        status: 'Coming in Stage 5',
        description: 'Historical SOXL signals, outcomes, expirations, and evaluations will be tracked here once persistence is added.',
    },
];

async function loadMarketSnapshots() {
    try {
        return await getSoxlMarketSnapshots();
    } catch {
        const fetchedAt = new Date().toISOString();

        return MARKET_SNAPSHOT_SYMBOLS.map((symbol) =>
            createUnavailableMarketSnapshot(symbol, fetchedAt, 'provider_error'),
        );
    }
}

export default async function SoxlIntelligencePage() {
    const [snapshots, historicalContext] = await Promise.all([
        loadMarketSnapshots(),
        loadServerSoxlMarketContext(),
    ]);
    const historicalContextView = buildSoxlMarketContextView(historicalContext);
    const coreIndicatorSnapshot = buildSoxlCoreIndicatorSnapshot(historicalContext);
    const coreIndicatorView = buildSoxlCoreIndicatorView(coreIndicatorSnapshot);

    return (
        <div className="min-h-screen bg-black text-gray-100 p-6 md:p-8">
            <section className="mb-8 max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Dedicated analysis workspace
                </p>
                <h1 className="mt-3 text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 md:text-4xl">
                    SOXL Intelligence
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-400">
                    This is the dedicated SOXL analysis workspace. It is ready for the staged buildout of
                    deterministic SOXL signals, market context, AI explanations, and historical signal tracking.
                </p>
            </section>

            <div className="space-y-10">
                <MarketSnapshotGrid snapshots={snapshots} />
                <MarketDataStatusCard view={historicalContextView} />
                <CoreIndicatorStatusCard view={coreIndicatorView} />
                <SoxlChartPanel />
            </div>

            <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
                {placeholderSections.map((section) => (
                    <article
                        key={section.title}
                        className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                            <span className="w-fit rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-teal-300">
                                {section.status}
                            </span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-gray-400">{section.description}</p>
                    </article>
                ))}
            </section>
        </div>
    );
}
