import MarketSnapshotGrid from '@/components/soxl-intelligence/MarketSnapshotGrid';
import MarketDataStatusCard from '@/components/soxl-intelligence/market-data-status-card';
import MarketFactsStatusCard from '@/components/soxl-intelligence/market-facts-status-card';
import MarketAssessmentStatusCard from '@/components/soxl-intelligence/market-assessment-status-card';
import TradePlanCalculatorCard from '@/components/soxl-intelligence/trade-plan-calculator-card';
import CoreIndicatorStatusCard from '@/components/soxl-intelligence/core-indicator-status-card';
import SessionAnalysisStatusCard from '@/components/soxl-intelligence/session-analysis-status-card';
import SoxlChartPanel from '@/components/soxl-intelligence/SoxlChartPanel';
import { buildSoxlCoreIndicatorSnapshot } from '@/lib/soxl-intelligence/analysis/soxl-core-indicators';
import { buildSoxlCoreIndicatorView } from '@/lib/soxl-intelligence/analysis/soxl-core-indicators-view';
import { buildSoxlSessionAnalysisSnapshot } from '@/lib/soxl-intelligence/analysis/soxl-session-analysis';
import { buildSoxlSessionAnalysisView } from '@/lib/soxl-intelligence/analysis/soxl-session-analysis-view';
import { buildSoxlMarketFacts } from '@/lib/soxl-intelligence/strategy/soxl-market-facts';
import { buildSoxlMarketFactsView } from '@/lib/soxl-intelligence/strategy/soxl-market-facts-view';
import { assessSoxlMarketFacts } from '@/lib/soxl-intelligence/strategy/soxl-market-assessment';
import { buildSoxlMarketAssessmentView } from '@/lib/soxl-intelligence/strategy/soxl-market-assessment-view';
import {
    MARKET_SNAPSHOT_SYMBOLS,
    createUnavailableMarketSnapshot,
} from '@/lib/soxl-intelligence/market-data/types';
import { getSoxlMarketSnapshots } from '@/lib/soxl-intelligence/market-data/snapshots';
import { buildSoxlMarketContextView } from '@/lib/soxl-intelligence/market-data/soxl-market-context-view';
import { loadServerSoxlMarketContext } from '@/lib/soxl-intelligence/market-data/server/soxl-market-context-service';

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
    const sessionAnalysisSnapshot = buildSoxlSessionAnalysisSnapshot(historicalContext);
    const sessionAnalysisView = buildSoxlSessionAnalysisView(sessionAnalysisSnapshot);
    const marketFacts = buildSoxlMarketFacts({
        core: coreIndicatorSnapshot,
        session: sessionAnalysisSnapshot,
    });
    const marketFactsView = buildSoxlMarketFactsView(marketFacts);
    const marketAssessment = assessSoxlMarketFacts(marketFacts);
    const marketAssessmentView = buildSoxlMarketAssessmentView(marketAssessment);

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
                <SessionAnalysisStatusCard view={sessionAnalysisView} />
                <MarketFactsStatusCard view={marketFactsView} />
                <MarketAssessmentStatusCard view={marketAssessmentView} />
                <TradePlanCalculatorCard assessment={marketAssessment} />
                <SoxlChartPanel />
            </div>
        </div>
    );
}
