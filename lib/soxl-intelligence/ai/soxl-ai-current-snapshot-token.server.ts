import { createHash } from 'node:crypto';
import type {
    SoxlAiEvidenceItem,
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';

export type SoxlAiCurrentSnapshotToken = `soxl-current-v1:${string}`;

interface CanonicalEvidenceItem {
    readonly id: string;
    readonly source: SoxlAiEvidenceItem['source'];
    readonly snapshotRole: SoxlAiEvidenceItem['snapshotRole'];
    readonly sourcePath: string;
    readonly trustClass: SoxlAiEvidenceItem['trustClass'];
    readonly availability: SoxlAiEvidenceItem['availability'];
    readonly value: SoxlAiEvidenceItem['value'];
    readonly unit: string | null;
}

function isVolatileRequestTimeAsOf(item: SoxlAiEvidenceItem): boolean {
    return (
        item.source === 'market_facts'
        && item.sourcePath === 'facts.asOf'
    ) || (
        item.source === 'market_assessment'
        && item.sourcePath === 'assessment.asOf'
    );
}

function canonicalizeGroup(
    evidence: SoxlAiEvidencePackage,
    ids: readonly string[],
): readonly CanonicalEvidenceItem[] {
    const itemsById = new Map(evidence.items.map((item) => [item.id, item]));

    return ids.flatMap((id) => {
        const item = itemsById.get(id);
        if (item === undefined) {
            throw new Error(`Missing SOXL AI evidence item: ${id}`);
        }

        if (isVolatileRequestTimeAsOf(item)) {
            return [];
        }

        return [{
            id: item.id,
            source: item.source,
            snapshotRole: item.snapshotRole,
            sourcePath: item.sourcePath,
            trustClass: item.trustClass,
            availability: item.availability,
            value: item.value,
            unit: item.unit,
        }];
    });
}

export function buildSoxlAiCurrentSnapshotToken(
    evidence: SoxlAiEvidencePackage,
): SoxlAiCurrentSnapshotToken {
    const canonicalJson = JSON.stringify({
        currentMarketFacts: canonicalizeGroup(
            evidence,
            evidence.groups.currentMarketFacts,
        ),
        currentAssessment: canonicalizeGroup(
            evidence,
            evidence.groups.currentAssessment,
        ),
    });
    const digest = createHash('sha256').update(canonicalJson).digest('hex');

    return `soxl-current-v1:${digest}`;
}
