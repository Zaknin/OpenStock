import { describe, expect, it, vi } from 'vitest';
import type { SoxlAiEvidenceItem, SoxlAiEvidencePackage } from './soxl-ai-evidence';
import {
    buildSoxlAiEvidenceReferenceCatalog,
    buildSoxlAiFormatterEvidencePackage,
    buildSoxlAiModelEvidencePackage,
    SOXL_AI_EVIDENCE_ALIAS_PATTERN,
    SOXL_AI_MAX_EVIDENCE_CATALOG_SIZE,
} from './soxl-ai-evidence-reference-catalog.server';

function item(id: string, snapshotRole: SoxlAiEvidenceItem['snapshotRole'] = 'current'): SoxlAiEvidenceItem {
    return {
        id,
        source: snapshotRole === 'current' ? 'market_facts' : 'trade_plan',
        snapshotRole,
        sourcePath: 'source.path',
        label: 'Evidence label',
        trustClass: snapshotRole === 'current'
            ? 'deterministic_market_fact'
            : 'user_supplied_plan_assumption',
        availability: 'available',
        value: 1,
        unit: null,
    };
}

function evidence(ids: readonly string[]): SoxlAiEvidencePackage {
    const planId = 'plan.assumptions.excluded';
    const monitorId = 'monitor.calculations.excluded';
    return {
        status: 'available',
        issues: [],
        snapshotIdentities: [{
            role: 'current',
            providerId: 'provider',
            asOf: 123,
            factsStatus: 'available',
            assessmentStatus: 'available',
            coreStatus: 'available',
            sessionStatus: 'available',
            openingRangeComplete: true,
            regularSessionComplete: false,
        }],
        items: [
            ...ids.map((id) => item(id)),
            item(planId, 'plan_context'),
            {
                ...item(monitorId, 'monitoring_current'),
                source: 'live_trade_monitor',
                trustClass: 'deterministic_monitoring_calculation',
            },
        ],
        groups: {
            currentMarketFacts: [...ids],
            currentAssessment: [],
            planAssumptions: [planId],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [monitorId],
            missingEvidence: [],
        },
    };
}

function catalogFor(value: SoxlAiEvidencePackage) {
    const result = buildSoxlAiEvidenceReferenceCatalog(value);
    expect(result.ok).toBe(true);
    if (!result.ok) {
        throw new Error('Expected catalog');
    }
    return result.catalog;
}

describe('SOXL AI evidence reference catalog', () => {
    it('is deterministic, ordered, unique, reversible, and non-mutating', () => {
        const input = evidence(['canonical.b', 'canonical.a']);
        const before = JSON.stringify(input);
        const first = catalogFor(input);
        const second = catalogFor(JSON.parse(before) as SoxlAiEvidencePackage);

        expect(first.entries).toEqual([
            { alias: 'E001', evidenceId: 'canonical.b' },
            { alias: 'E002', evidenceId: 'canonical.a' },
        ]);
        expect(second.entries).toEqual(first.entries);
        expect(new Set(first.entries.map(({ alias }) => alias)).size).toBe(2);
        expect(first.entries.every(({ alias }) => SOXL_AI_EVIDENCE_ALIAS_PATTERN.test(alias))).toBe(true);
        expect(first.entries.map(({ alias }) => first.aliasToEvidenceId.get(alias))).toEqual([
            'canonical.b',
            'canonical.a',
        ]);
        expect(JSON.stringify(input)).toBe(before);
    });

    it('assigns aliases according to a changed curated order', () => {
        expect(catalogFor(evidence(['canonical.a', 'canonical.b'])).entries).toEqual([
            { alias: 'E001', evidenceId: 'canonical.a' },
            { alias: 'E002', evidenceId: 'canonical.b' },
        ]);
    });

    it('serializes current aliases without canonical IDs, snapshots, plans, or monitors', () => {
        const input = evidence(['canonical.current']);
        const modelPackage = buildSoxlAiModelEvidencePackage(input, catalogFor(input));
        const serialized = JSON.stringify(modelPackage);

        expect(modelPackage.items).toHaveLength(1);
        expect(modelPackage.items[0]).toMatchObject({ ref: 'E001' });
        expect(serialized).not.toContain('canonical.current');
        expect(serialized).not.toContain('snapshotIdentities');
        expect(serialized).not.toContain('plan.assumptions.excluded');
        expect(serialized).not.toContain('monitor.calculations.excluded');
    });

    it('builds a compact formatter package without competing assessment definitions', () => {
        const input = evidence(['canonical.current']);
        const assessmentId = 'current.assessment.upward_alignment.total_count';
        const withAssessment: SoxlAiEvidencePackage = {
            ...input,
            items: [
                { ...input.items[0], value: 'above' },
                {
                    ...item(assessmentId),
                    source: 'market_assessment',
                    trustClass: 'deterministic_assessment',
                    value: 9,
                },
                ...input.items.slice(1),
            ],
            groups: {
                ...input.groups,
                currentAssessment: [assessmentId],
            },
        };
        const catalog = catalogFor(withAssessment);
        const formatter = buildSoxlAiFormatterEvidencePackage(withAssessment, catalog);
        const serialized = JSON.stringify(formatter);

        expect(formatter.selectedOutcome).toBe('current_evidence_state');
        expect(formatter.items.map(({ ref }) => ref)).toEqual(['E001']);
        expect(serialized).not.toContain('upward_alignment');
        expect(serialized).not.toContain(assessmentId);
    });

    it('fails instead of truncating when the catalog ceiling is exceeded', () => {
        const ids = Array.from(
            { length: SOXL_AI_MAX_EVIDENCE_CATALOG_SIZE + 1 },
            (_, index) => `canonical.${index}`,
        );

        expect(buildSoxlAiEvidenceReferenceCatalog(evidence(ids))).toEqual({
            ok: false,
            issue: 'evidence_catalog_too_large',
        });
    });

    it('has no clock, logging, network, or persistence side effects', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        catalogFor(evidence(['canonical.current']));

        expect(dateSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
        dateSpy.mockRestore();
        logSpy.mockRestore();
        warnSpy.mockRestore();
        fetchSpy.mockRestore();
    });
});
