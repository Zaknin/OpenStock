import type {
    SoxlAssessmentConditionView,
    SoxlAssessmentSectionView,
    SoxlMarketAssessmentView,
    SoxlScenarioAssessmentView,
} from '@/lib/soxl-intelligence/strategy/soxl-market-assessment-view';

export interface MarketAssessmentStatusCardProps {
    view: SoxlMarketAssessmentView;
}

function StatusPill({
    status,
    label,
}: {
    status: SoxlMarketAssessmentView['status'];
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

function ConditionStatePill({ condition }: { condition: SoxlAssessmentConditionView }) {
    const classes = condition.state === 'met'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : condition.state === 'not_met'
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
            : 'border-gray-700 bg-gray-900/60 text-gray-300';

    return (
        <span
            aria-label={`Condition state: ${condition.stateLabel}`}
            className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${classes}`}
        >
            {condition.stateLabel}
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

function CountGrid({
    item,
}: {
    item: Pick<SoxlScenarioAssessmentView | SoxlAssessmentSectionView,
        'metCount' | 'notMetCount' | 'unknownCount' | 'knownCount' | 'totalCount'>;
}) {
    return (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Detail label="Matches" value={item.metCount} />
            <Detail label="Does not match" value={item.notMetCount} />
            <Detail label="Unknown" value={item.unknownCount} />
            <Detail label="Known conditions" value={item.knownCount} />
            <Detail label="Total conditions" value={item.totalCount} />
        </dl>
    );
}

function ConditionRow({ condition }: { condition: SoxlAssessmentConditionView }) {
    return (
        <li className="rounded-lg border border-gray-800 bg-black/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <span className="text-sm font-medium leading-6 text-gray-100">
                    {condition.label}
                </span>
                <ConditionStatePill condition={condition} />
            </div>
            <details className="mt-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                    Technical details
                </summary>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Detail label="Expected" value={condition.expectedLabel} />
                    <Detail label="Actual" value={condition.actualLabel} />
                    <Detail label="Condition ID" value={condition.id} />
                </dl>
            </details>
        </li>
    );
}

function AssessmentSection({ section }: { section: SoxlAssessmentSectionView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h4 className="text-sm font-semibold text-white">{section.title}</h4>
            </div>
            <div className="mt-4">
                <CountGrid item={section} />
            </div>
            {section.id === 'regular_session' ? (
                <p className="mt-3 text-xs leading-5 text-gray-500">
                    Session average: Volume-weighted average price (VWAP)
                </p>
            ) : null}
            <ul className="mt-4 space-y-3">
                {section.conditions.map((condition) => (
                    <ConditionRow key={condition.id} condition={condition} />
                ))}
            </ul>
        </article>
    );
}

function ScenarioCard({ scenario }: { scenario: SoxlScenarioAssessmentView }) {
    return (
        <article className="rounded-lg border border-gray-800 bg-black/20 p-4">
            <div>
                <h3 className="text-base font-semibold text-white">{scenario.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-400">{scenario.description}</p>
            </div>
            <div className="mt-4">
                <CountGrid item={scenario} />
            </div>
            <div className="mt-5 space-y-3">
                {scenario.sections.map((section) => (
                    <AssessmentSection key={section.id} section={section} />
                ))}
            </div>
        </article>
    );
}

export default function MarketAssessmentStatusCard({ view }: MarketAssessmentStatusCardProps) {
    return (
        <section aria-labelledby="market-alignment-assessment-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Alignment assessment
                </p>
                <h2 id="market-alignment-assessment-heading" className="mt-2 text-2xl font-semibold text-white">
                    Market Alignment Assessment
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                    This panel compares current market facts with two symmetrical condition sets. It does not choose a scenario or tell you what to do.
                </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <StatusPill status={view.status} label={view.statusLabel} />
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-400 sm:grid-cols-2 lg:grid-cols-5">
                            <Detail label="Provider" value={view.providerId} />
                            <Detail label="As of" value={view.asOfLabel} />
                            <Detail label="Market-facts status" value={view.factsStatusLabel} />
                            <Detail label="Core calculation" value={view.coreStatusLabel} />
                            <Detail label="Session calculation" value={view.sessionStatusLabel} />
                            <Detail label="Opening-range completion" value={view.openingRangeCompleteLabel} />
                            <Detail label="Regular-session completion" value={view.regularSessionCompleteLabel} />
                            <Detail label="Structured issue" value={view.issueLabel ?? 'Unavailable'} />
                        </dl>
                        {view.issueExplanation ? (
                            <p className="mt-4 text-sm leading-6 text-gray-400">{view.issueExplanation}</p>
                        ) : null}
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {view.scenarios.map((scenario) => (
                        <ScenarioCard key={scenario.id} scenario={scenario} />
                    ))}
                </div>
            </div>
        </section>
    );
}
