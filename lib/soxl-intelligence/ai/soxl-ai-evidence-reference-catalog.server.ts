import type {
    SoxlAiEvidenceItem,
    SoxlAiEvidencePackage,
    SoxlAiEvidenceIssue,
} from './soxl-ai-evidence';

export const SOXL_AI_MAX_EVIDENCE_CATALOG_SIZE = 999;
export const SOXL_AI_MAX_EVIDENCE_REFS_PER_POINT = 20;
export const SOXL_AI_EVIDENCE_ALIAS_PATTERN = /^E\d{3}$/u;

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
