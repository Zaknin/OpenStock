import type {
    SoxlAiEvidenceItem,
    SoxlAiEvidencePackage,
    SoxlAiEvidenceIssue,
} from './soxl-ai-evidence';

export const SOXL_AI_MAX_EVIDENCE_CATALOG_SIZE = 999;
export const SOXL_AI_MAX_EVIDENCE_REFS_PER_POINT = 20;
export const SOXL_AI_EVIDENCE_ALIAS_PATTERN = /^E\d{3}$/u;
export const soxlAiFormatterSections = [
    'summary',
    'supportingEvidence',
    'conflictingEvidence',
    'missingEvidence',
    'riskReminders',
    'limitations',
] as const;

export type SoxlAiFormatterSection = typeof soxlAiFormatterSections[number];

export interface SoxlAiFormatterEvidenceReferencePolicy {
    readonly allowedRefs: Readonly<Record<SoxlAiFormatterSection, readonly string[]>>;
    readonly maxRefs: Readonly<Record<SoxlAiFormatterSection, number>>;
}

export interface SoxlAiEvidenceReference {
    readonly alias: string;
    readonly evidenceId: string;
}

export interface SoxlAiEvidenceReferenceCatalog {
    readonly entries: readonly SoxlAiEvidenceReference[];
    readonly aliasToEvidenceId: ReadonlyMap<string, string>;
    readonly evidenceIdToAlias: ReadonlyMap<string, string>;
}

export type SoxlAiEvidenceReferenceCatalogResult =
    | {
        readonly ok: true;
        readonly catalog: SoxlAiEvidenceReferenceCatalog;
    }
    | {
        readonly ok: false;
        readonly issue: 'evidence_catalog_too_large';
    };

export interface SoxlAiModelEvidenceItem extends Omit<SoxlAiEvidenceItem, 'id'> {
    readonly ref: string;
}

export interface SoxlAiModelEvidencePackage {
    readonly status: SoxlAiEvidencePackage['status'];
    readonly issues: readonly SoxlAiEvidenceIssue[];
    readonly items: readonly SoxlAiModelEvidenceItem[];
    readonly groups: {
        readonly currentMarketFacts: readonly string[];
        readonly currentAssessment: readonly string[];
        readonly missingEvidence: readonly string[];
    };
}

export interface SoxlAiFormatterEvidencePackage {
    readonly status: SoxlAiEvidencePackage['status'];
    readonly selectedOutcome: 'current_evidence_state';
    readonly issues: readonly SoxlAiEvidenceIssue[];
    readonly items: readonly SoxlAiModelEvidenceItem[];
    readonly groups: {
        readonly currentMarketFacts: readonly string[];
        readonly missingEvidence: readonly string[];
    };
    readonly sectionEvidenceRefs: SoxlAiFormatterEvidenceReferencePolicy['allowedRefs'];
    readonly sectionEvidenceRefMaximums: SoxlAiFormatterEvidenceReferencePolicy['maxRefs'];
}

function aliasForIndex(index: number): string {
    return `E${String(index + 1).padStart(3, '0')}`;
}

function currentEvidenceIds(evidence: SoxlAiEvidencePackage): ReadonlySet<string> {
    return new Set([
        ...evidence.groups.currentMarketFacts,
        ...evidence.groups.currentAssessment,
    ]);
}

export function buildSoxlAiEvidenceReferenceCatalog(
    evidence: SoxlAiEvidencePackage,
): SoxlAiEvidenceReferenceCatalogResult {
    const currentIds = currentEvidenceIds(evidence);
    const currentItems = evidence.items.filter(({ id }) => currentIds.has(id));
    if (currentItems.length > SOXL_AI_MAX_EVIDENCE_CATALOG_SIZE) {
        return { ok: false, issue: 'evidence_catalog_too_large' };
    }

    const entries = currentItems.map(({ id }, index) => ({
        alias: aliasForIndex(index),
        evidenceId: id,
    }));

    return {
        ok: true,
        catalog: {
            entries,
            aliasToEvidenceId: new Map(entries.map(({ alias, evidenceId }) => [alias, evidenceId])),
            evidenceIdToAlias: new Map(entries.map(({ alias, evidenceId }) => [evidenceId, alias])),
        },
    };
}

function aliasesForIds(
    ids: readonly string[],
    catalog: SoxlAiEvidenceReferenceCatalog,
): readonly string[] {
    return ids.flatMap((id) => {
        const alias = catalog.evidenceIdToAlias.get(id);
        return alias === undefined ? [] : [alias];
    });
}

function currentIssues(issues: readonly SoxlAiEvidenceIssue[]): readonly SoxlAiEvidenceIssue[] {
    return issues.filter((issue) => (
        issue === 'current_snapshot_identity_mismatch'
        || issue === 'no_current_market_evidence'
    ));
}

export function buildSoxlAiModelEvidencePackage(
    evidence: SoxlAiEvidencePackage,
    catalog: SoxlAiEvidenceReferenceCatalog,
): SoxlAiModelEvidencePackage {
    const itemsById = new Map(evidence.items.map((item) => [item.id, item]));
    const items = catalog.entries.flatMap(({ alias, evidenceId }) => {
        const item = itemsById.get(evidenceId);
        if (item === undefined) {
            return [];
        }

        return [{
            ref: alias,
            source: item.source,
            snapshotRole: item.snapshotRole,
            sourcePath: item.sourcePath,
            label: item.label,
            trustClass: item.trustClass,
            availability: item.availability,
            value: item.value,
            unit: item.unit,
        }];
    });

    return {
        status: evidence.status,
        issues: currentIssues(evidence.issues),
        items,
        groups: {
            currentMarketFacts: aliasesForIds(evidence.groups.currentMarketFacts, catalog),
            currentAssessment: aliasesForIds(evidence.groups.currentAssessment, catalog),
            missingEvidence: aliasesForIds(evidence.groups.missingEvidence, catalog),
        },
    };
}

function formatterEvidenceIds(
    evidence: SoxlAiEvidencePackage,
): ReadonlySet<string> {
    const itemsById = new Map(evidence.items.map((item) => [item.id, item]));
    const selected = evidence.groups.currentMarketFacts.filter((id) => {
        const item = itemsById.get(id);
        return item !== undefined && (
            item.availability !== 'available'
            || typeof item.value === 'string'
        );
    });

    if (selected.length === 0 && evidence.groups.currentMarketFacts[0] !== undefined) {
        selected.push(evidence.groups.currentMarketFacts[0]);
    }

    return new Set([
        ...selected,
        // The formatter must retain every missing item so the unchanged
        // application validator can require exact missing-evidence coverage.
        ...evidence.groups.missingEvidence,
    ]);
}

const formatterReferencePriorities: Readonly<Record<
    Exclude<SoxlAiFormatterSection, 'missingEvidence'>,
    readonly string[]
>> = {
    summary: [
        'current.market_facts.status',
    ],
    supportingEvidence: [
        'current.market_facts.soxl_5m.close_vs_ema20',
        'current.market_facts.soxl_5m.macd_histogram_sign',
        'current.market_facts.soxl_daily.close_vs_ema50',
        'current.market_facts.regular_session.close_vs_vwap',
    ],
    conflictingEvidence: [
        'current.market_facts.soxl_5m.close_vs_latest_confirmed_swing_high',
        'current.market_facts.soxl_daily.close_vs_latest_confirmed_swing_high',
        'current.market_facts.regular_session.close_vs_opening_range_high',
        'current.market_facts.regular_session.close_vs_previous_session_high',
    ],
    riskReminders: [
        'current.market_facts.core_status',
        'current.market_facts.session_status',
    ],
    limitations: [
        'current.market_facts.status',
        'current.market_facts.issue',
    ],
};

const formatterReferenceMaximums: SoxlAiFormatterEvidenceReferencePolicy['maxRefs'] = {
    summary: 1,
    supportingEvidence: 4,
    conflictingEvidence: 4,
    missingEvidence: 1,
    riskReminders: 2,
    limitations: 2,
};

function formatterAliasesForIds(
    ids: readonly string[],
    selectedIds: ReadonlySet<string>,
    catalog: SoxlAiEvidenceReferenceCatalog,
): readonly string[] {
    return aliasesForIds(ids.filter((id) => selectedIds.has(id)), catalog);
}

function firstFormatterAlias(
    selectedIds: ReadonlySet<string>,
    catalog: SoxlAiEvidenceReferenceCatalog,
): readonly string[] {
    const first = catalog.entries.find(({ evidenceId }) => selectedIds.has(evidenceId));
    return first === undefined ? [] : [first.alias];
}

function withFallback(
    aliases: readonly string[],
    fallback: readonly string[],
): readonly string[] {
    return aliases.length > 0 ? aliases : fallback;
}

export function buildSoxlAiFormatterEvidenceReferencePolicy(
    evidence: SoxlAiEvidencePackage,
    catalog: SoxlAiEvidenceReferenceCatalog,
): SoxlAiFormatterEvidenceReferencePolicy {
    const selectedIds = formatterEvidenceIds(evidence);
    const fallback = firstFormatterAlias(selectedIds, catalog);
    const missingEvidence = formatterAliasesForIds(
        evidence.groups.missingEvidence,
        selectedIds,
        catalog,
    );
    const limitations = missingEvidence.length > 0
        ? missingEvidence.slice(0, formatterReferenceMaximums.limitations)
        : withFallback(
            formatterAliasesForIds(
                formatterReferencePriorities.limitations,
                selectedIds,
                catalog,
            ),
            fallback,
        );
    const summary = [
        ...withFallback(
            formatterAliasesForIds(
                formatterReferencePriorities.summary,
                selectedIds,
                catalog,
            ),
            fallback,
        ),
        ...missingEvidence.slice(0, 1),
    ].filter((alias, index, aliases) => aliases.indexOf(alias) === index);

    return {
        allowedRefs: {
            summary,
            supportingEvidence: withFallback(
                formatterAliasesForIds(
                    formatterReferencePriorities.supportingEvidence,
                    selectedIds,
                    catalog,
                ),
                fallback,
            ),
            conflictingEvidence: withFallback(
                formatterAliasesForIds(
                    formatterReferencePriorities.conflictingEvidence,
                    selectedIds,
                    catalog,
                ),
                fallback,
            ),
            missingEvidence,
            riskReminders: withFallback(
                formatterAliasesForIds(
                    formatterReferencePriorities.riskReminders,
                    selectedIds,
                    catalog,
                ),
                fallback,
            ),
            limitations,
        },
        maxRefs: formatterReferenceMaximums,
    };
}

export function buildSoxlAiFormatterEvidencePackage(
    evidence: SoxlAiEvidencePackage,
    catalog: SoxlAiEvidenceReferenceCatalog,
): SoxlAiFormatterEvidencePackage {
    const selectedIds = formatterEvidenceIds(evidence);
    const policy = buildSoxlAiFormatterEvidenceReferencePolicy(evidence, catalog);
    const allowedRefs = new Set(Object.values(policy.allowedRefs).flat());
    const full = buildSoxlAiModelEvidencePackage(evidence, catalog);
    const items = full.items.filter(({ ref }) => {
        const canonicalId = catalog.aliasToEvidenceId.get(ref);
        return canonicalId !== undefined
            && selectedIds.has(canonicalId)
            && allowedRefs.has(ref);
    });

    return {
        status: full.status,
        selectedOutcome: 'current_evidence_state',
        issues: full.issues,
        items,
        groups: {
            currentMarketFacts: aliasesForIds(
                evidence.groups.currentMarketFacts.filter((id) => (
                    selectedIds.has(id)
                    && allowedRefs.has(catalog.evidenceIdToAlias.get(id) ?? '')
                )),
                catalog,
            ),
            missingEvidence: aliasesForIds(evidence.groups.missingEvidence, catalog),
        },
        sectionEvidenceRefs: policy.allowedRefs,
        sectionEvidenceRefMaximums: policy.maxRefs,
    };
}
