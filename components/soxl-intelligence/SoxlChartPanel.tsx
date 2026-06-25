import TradingViewWidget from '@/components/TradingViewWidget';
import { CANDLE_CHART_WIDGET_CONFIG } from '@/lib/constants';

const TRADINGVIEW_SCRIPT_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
const TRADINGVIEW_SOXL_SYMBOL = 'AMEX:SOXL';

export default function SoxlChartPanel() {
    return (
        <section aria-labelledby="soxl-chart-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    TradingView chart
                </p>
                <h2 id="soxl-chart-heading" className="mt-2 text-2xl font-semibold text-white">
                    SOXL chart and visible levels
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Chart display is provided by TradingView. It is visual context only and is not used as
                    server-side candle data for Stage 2 snapshots.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <TradingViewWidget
                    scriptUrl={TRADINGVIEW_SCRIPT_URL}
                    config={CANDLE_CHART_WIDGET_CONFIG(TRADINGVIEW_SOXL_SYMBOL)}
                    className="custom-chart"
                    height={600}
                    allowExpand
                />
                <p className="mt-4 text-xs leading-5 text-gray-500">
                    Finnhub snapshot data and the TradingView chart may use different feeds or timestamps.
                </p>
            </div>
        </section>
    );
}
