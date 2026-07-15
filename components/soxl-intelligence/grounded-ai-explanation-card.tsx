'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestCurrentSoxlExplanation } from '@/app/(root)/soxl-intelligence/actions';
import {
    buildSoxlAiExplanationView,
    type SoxlAiExplanationPointView,
    type SoxlAiExplanationView,
} from '@/lib/soxl-intelligence/ai/soxl-ai-explanation-view';
import type {
    SoxlAiCurrentExplanationResult,
} from '@/lib/soxl-intelligence/ai/soxl-ai-current-explanation.server';

export interface GroundedAiExplanationCardProps {
    readonly snapshotToken: string;
}

const initialMessage = 'Select Generate explanation to request a grounded explanation of the current deterministic snapshot.';

function StatusPill({ view }: { view: SoxlAiExplanationView }) {
    const classes = view.status === 'available'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : 'border-red-500/30 bg-red-500/10 text-red-300';

    return (
        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${classes}`}>
            {view.statusLabel}
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
        <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold text-gray-100">{value}</dd>
        </div>
    );
}

function EvidenceDetails({ point }: { point: SoxlAiExplanationPointView }) {
    return (
        <details className="mt-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                Evidence references
            </summary>
            <ul className="mt-3 space-y-1 font-mono text-xs text-gray-300">
                {point.evidenceIds.map((id) => (
                    <li key={id} className="break-words">{id}</li>
                ))}
            </ul>
        </details>
    );
}

function ExplanationSection({
    title,
    points,
}: {
    title: string;
    points: readonly SoxlAiExplanationPointView[];
}) {
    if (points.length === 0) {
        return null;
    }

    return (
        <section className="border-t border-gray-800 pt-5">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <ul className="mt-3 space-y-3">
                {points.map((point, index) => (
                    <li key={`${title}-${index}`} className="rounded-lg border border-gray-800 bg-black/20 p-4">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-300">{point.text}</p>
                        <EvidenceDetails point={point} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function Issues({ view }: { view: SoxlAiExplanationView }) {
    if (view.issues.length === 0) {
        return null;
    }

    return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <h3 className="text-sm font-semibold text-yellow-100">Explanation details</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-yellow-100">
                {view.issues.map((issue) => (
                    <li key={issue.code}>
                        {issue.message}
                        {issue.code === 'rate_limited' && view.retryAfterSeconds !== null
                            ? ` Try again in about ${view.retryAfterSeconds} seconds.`
                            : ''}
                    </li>
                ))}
            </ul>
            <details className="mt-4 border-t border-yellow-500/20 pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200">
                    Technical details
                </summary>
                <ul className="mt-3 space-y-1 font-mono text-xs text-yellow-100">
                    {view.issues.map((issue) => (
                        <li key={issue.code}>{issue.code}</li>
                    ))}
                </ul>
            </details>
        </div>
    );
}

export default function GroundedAiExplanationCard({
    snapshotToken,
}: GroundedAiExplanationCardProps) {
    const router = useRouter();
    const [result, setResult] = useState<SoxlAiCurrentExplanationResult | null>(null);
    const [pending, setPending] = useState(false);
    const canGenerate = snapshotToken.trim().length > 0;

    const view = useMemo(() => (
        result === null
            ? null
            : buildSoxlAiExplanationView(result, { snapshotToken })
    ), [result, snapshotToken]);

    const handleGenerate = async () => {
        if (pending || !canGenerate) {
            return;
        }

        setPending(true);
        try {
            setResult(await requestCurrentSoxlExplanation({
                expectedSnapshotToken: snapshotToken,
            }));
        } finally {
            setPending(false);
        }
    };

    const handleClear = () => {
        setResult(null);
    };

    const handleRefresh = () => {
        router.refresh();
    };

    const showRefresh = view?.issues.some((issue) => issue.code === 'stale_snapshot')
        || view?.describesCurrentSnapshot === false;

    return (
        <section aria-labelledby="grounded-soxl-explanation-heading" className="space-y-5">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
                    Manual grounded explanation
                </p>
                <h2 id="grounded-soxl-explanation-heading" className="mt-2 text-2xl font-semibold text-white">
                    Grounded SOXL Explanation
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">
                    This version explains the current deterministic market facts and alignment assessment only. It does not include the temporary trade plan or monitor.
                </p>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">
                    Explanations are generated only when you select the button.
                </p>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">
                    The explanation summarizes deterministic evidence. It does not change the calculations, guarantee an outcome, choose between scenarios, or place a trade.
                </p>
            </div>

            <div className="min-w-0 rounded-xl border border-gray-800 bg-gray-900/30 p-5 backdrop-blur-sm" aria-busy={pending}>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={pending || !canGenerate}
                        className="rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300 disabled:cursor-wait disabled:opacity-60"
                    >
                        {pending ? 'Generating explanation' : 'Generate explanation'}
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={pending && result === null}
                        className="rounded-md border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Clear explanation
                    </button>
                    {showRefresh ? (
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="rounded-md border border-teal-500/60 px-4 py-2 text-sm font-semibold text-teal-200 transition-colors hover:border-teal-300 hover:text-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        >
                            Refresh page data
                        </button>
                    ) : null}
                </div>

                <div className="mt-5" aria-live="polite">
                    {pending ? (
                        <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm leading-6 text-gray-400">
                            Requesting a grounded explanation for the displayed snapshot.
                        </p>
                    ) : null}

                    {!pending && view === null ? (
                        <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm leading-6 text-gray-400">
                            {initialMessage}
                        </p>
                    ) : null}

                    {view !== null ? (
                        <div
                            className="space-y-5"
                            data-testid="soxl-explanation-result"
                            data-status={view.status}
                            data-provider={view.providerId ?? undefined}
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <StatusPill view={view} />
                                    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {view.providerLabel !== null ? (
                                            <Detail label="Provider" value={view.providerLabel} />
                                        ) : null}
                                        <Detail label="As of" value={view.asOfLabel} />
                                        <Detail label="Explanation status" value={view.explanationStatusLabel} />
                                    </dl>
                                </div>
                            </div>

                            {!view.describesCurrentSnapshot ? (
                                <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
                                    This explanation describes an earlier snapshot. Generate again to explain the current page data.
                                </p>
                            ) : null}

                            <Issues view={view} />
                            <ExplanationSection title="Summary" points={view.summary} />
                            <ExplanationSection title="Supporting evidence" points={view.supportingEvidence} />
                            <ExplanationSection title="Conflicting evidence" points={view.conflictingEvidence} />
                            <ExplanationSection title="Missing evidence" points={view.missingEvidence} />
                            <ExplanationSection title="Risk reminders" points={view.riskReminders} />
                            <ExplanationSection title="Limitations" points={view.limitations} />
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
