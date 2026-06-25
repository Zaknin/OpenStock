const placeholderSections = [
    {
        title: 'Current assessment',
        status: 'Not configured yet',
        description: 'The deterministic SOXL signal state and current trade assessment will appear here in a later stage.',
    },
    {
        title: 'SOXL chart and levels',
        status: 'Coming in Stage 2',
        description: 'SOXL chart context, price levels, entry zones, invalidation, and targets will be added after market snapshots are wired.',
    },
    {
        title: 'QQQ and SMH market context',
        status: 'Coming in Stage 2',
        description: 'QQQ market regime and SMH semiconductor-sector context will be shown here once reusable snapshots are available.',
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

export default function SoxlIntelligencePage() {
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

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
