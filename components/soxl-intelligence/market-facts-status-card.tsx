import type {
    SoxlMarketFactsRowView,
    SoxlMarketFactsSectionView,
    SoxlMarketFactsView,
} from '@/lib/soxl-intelligence/strategy/soxl-market-facts-view';

export interface MarketFactsStatusCardProps {
    view: SoxlMarketFactsView;
}

function StatusPill({
    status,
    label,
}: {
    status: SoxlMarketFactsView['status'];
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
    value: string;
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
    rows: readonly SoxlMarketFactsRowView[];
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

function FactsSection({ section }: { section: SoxlMarketFactsSectionView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                <StatusPill status={section.status} label={section.statusLabel} />
            </div>

            <div className="mt-4">
                <DetailGrid rows={section.rows} />
            </div>

            {section.technicalRows.length > 0 ? (
                <details className="mt-5 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Technical details
                    </summary>
                    <div className="mt-4">
                        <DetailGrid rows={section.technicalRows} />
                    </div>
                </details>
            ) : null}
        </article>
    );
}

export default function MarketFactsStatusCard({ view }: MarketFactsStatusCardProps) {
    return (
        <section aria-labelledby="current-market-facts-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Market facts
                </p>
                <h2 id="current-market-facts-heading" className="mt-2 text-2xl font-semibold text-white">
                    Current Market Facts
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    Read-only values and direct mathematical comparisons from the current SOXL calculation snapshots.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <StatusPill status={view.status} label={view.statusLabel} />
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-400 sm:grid-cols-2 lg:grid-cols-5">
                            <Detail label="Provider" value={view.providerId} />
                            <Detail label="As of" value={view.asOfLabel} />
                            <Detail label="Core calculation" value={view.coreStatusLabel} />
                            <Detail label="Session calculation" value={view.sessionStatusLabel} />
                            <Detail label="Structured issue" value={view.issueLabel ?? 'Unavailable'} />
                        </dl>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {view.sections.map((section) => (
                        <FactsSection key={section.key} section={section} />
                    ))}
                </div>
            </div>
        </section>
    );
}
