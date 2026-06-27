import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    SoxlAiEvidenceItem,
    SoxlAiEvidencePackage,
} from './soxl-ai-evidence';
import {
    buildSoxlAiCurrentSnapshotToken,
} from './soxl-ai-current-snapshot-token.server';

function item(
    id: string,
    source: SoxlAiEvidenceItem['source'],
    sourcePath: string,
    value: SoxlAiEvidenceItem['value'],
    overrides: Partial<SoxlAiEvidenceItem> = {},
): SoxlAiEvidenceItem {
    return {
        id,
        source,
        snapshotRole: 'current',
        sourcePath,
        label: `Label for ${id}`,
        trustClass: source === 'market_facts'
            ? 'deterministic_market_fact'
            : 'deterministic_assessment',
        availability: value === null ? 'unavailable' : 'available',
        value,
        unit: null,
        ...overrides,
    };
}

const currentMarketFacts = [
    item('current.market_facts.provider_id', 'market_facts', 'facts.providerId', 'twelve-data'),
    item('current.market_facts.as_of', 'market_facts', 'facts.asOf', 1_787_654_321, { unit: 'epoch_ms' }),
    item('current.market_facts.soxl_5m.latest_completed.time', 'market_facts', 'facts.soxl5m.latestCompleted.time', 1_787_654_000, { unit: 'epoch_ms' }),
    item('current.market_facts.soxl_5m.latest_completed.close', 'market_facts', 'facts.soxl5m.latestCompleted.close', 27.15, { unit: 'usd' }),
    item('current.market_facts.soxl_daily.latest_completed.time', 'market_facts', 'facts.soxlDaily.latestCompleted.time', 1_787_568_000, { unit: 'epoch_ms' }),
    item('current.market_facts.qqq_5m.latest_completed.time', 'market_facts', 'facts.qqq5m.latestCompleted.time', 1_787_654_000, { unit: 'epoch_ms' }),
    item('current.market_facts.smh_5m.latest_completed.time', 'market_facts', 'facts.smh5m.latestCompleted.time', 1_787_654_000, { unit: 'epoch_ms' }),
    item('current.market_facts.regular_session.latest_trading_date', 'market_facts', 'facts.regularSession.latestTradingDate', '2026-06-27'),
    item('current.market_facts.regular_session.previous_trading_date', 'market_facts', 'facts.regularSession.previousTradingDate', '2026-06-26'),
    item('current.market_facts.regular_session.latest_regular_session_completed', 'market_facts', 'facts.regularSession.latestRegularSessionCompleted', false),
    item('current.market_facts.regular_session.opening_range_30m_completed', 'market_facts', 'facts.regularSession.openingRange30mCompleted', true),
    item('current.market_facts.soxl_5m.close_vs_ema20', 'market_facts', 'facts.soxl5m.closeVsEma20', 'above'),
    item('current.market_facts.soxl_5m.ema20.value', 'market_facts', 'facts.soxl5m.ema20.value', 26.8, { unit: 'usd' }),
    item('current.market_facts.optional_missing', 'market_facts', 'facts.optionalMissing', null),
] as const;

const currentAssessment = [
    item('current.assessment.provider_id', 'market_assessment', 'assessment.providerId', 'twelve-data'),
    item('current.assessment.as_of', 'market_assessment', 'assessment.asOf', 1_787_654_321, { unit: 'epoch_ms' }),
    item('current.assessment.upward.soxl_5m.condition.condition_id', 'market_assessment', 'assessment.upwardAlignment.sections.0.conditions.0.id', 'soxl_5m_price_above_ema20'),
    item('current.assessment.upward.soxl_5m.condition.expected', 'market_assessment', 'assessment.upwardAlignment.sections.0.conditions.0.expected', 'above'),
    item('current.assessment.upward.soxl_5m.condition.actual', 'market_assessment', 'assessment.upwardAlignment.sections.0.conditions.0.actual', 'above'),
    item('current.assessment.upward.soxl_5m.condition.state', 'market_assessment', 'assessment.upwardAlignment.sections.0.conditions.0.state', 'met'),
    item('current.assessment.upward.soxl_5m.met_count', 'market_assessment', 'assessment.upwardAlignment.sections.0.metCount', 1),
    item('current.assessment.upward.total_count', 'market_assessment', 'assessment.upwardAlignment.totalCount', 1),
] as const;

function evidence(): SoxlAiEvidencePackage {
    const facts = currentMarketFacts.map((entry) => ({ ...entry }));
    const assessment = currentAssessment.map((entry) => ({ ...entry }));

    return {
        status: 'available',
        issues: [],
        snapshotIdentities: [],
        items: [...facts, ...assessment],
        groups: {
            currentMarketFacts: facts.map(({ id }) => id),
            currentAssessment: assessment.map(({ id }) => id),
            planAssumptions: [],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [],
            missingEvidence: [facts[facts.length - 1].id],
        },
    };
}

function changeItem(
    source: SoxlAiEvidencePackage,
    id: string,
    changes: Partial<SoxlAiEvidenceItem>,
): SoxlAiEvidencePackage {
    return {
        ...source,
        items: source.items.map((entry) => (
            entry.id === id ? { ...entry, ...changes } : entry
        )),
    };
}

function withOptionalPlan(source: SoxlAiEvidencePackage): SoxlAiEvidencePackage {
    const planItem = item('plan.assumptions.side', 'trade_plan', 'plan.side', 'long', {
        snapshotRole: 'plan_context',
        trustClass: 'user_supplied_plan_assumption',
    });

    return {
        ...source,
        items: [...source.items, planItem],
        groups: {
            ...source.groups,
            planAssumptions: [planItem.id],
        },
    };
}

function withOptionalMonitor(source: SoxlAiEvidencePackage): SoxlAiEvidencePackage {
    const monitorItem = item('monitor.calculations.price', 'live_trade_monitor', 'monitor.price', 27, {
        snapshotRole: 'monitoring_current',
        trustClass: 'deterministic_monitoring_calculation',
    });

    return {
        ...source,
        items: [...source.items, monitorItem],
        groups: {
            ...source.groups,
            monitoringCalculations: [monitorItem.id],
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('buildSoxlAiCurrentSnapshotToken', () => {
    it('returns the versioned lowercase SHA-256 format', () => {
        expect(buildSoxlAiCurrentSnapshotToken(evidence())).toMatch(
            /^soxl-current-v1:[a-f0-9]{64}$/,
        );
    });

    it('is deterministic for equivalent evidence', () => {
        expect(buildSoxlAiCurrentSnapshotToken(evidence())).toBe(
            buildSoxlAiCurrentSnapshotToken(evidence()),
        );
    });

    it.each([
        ['facts request-time asOf', 'current.market_facts.as_of'],
        ['assessment request-time asOf', 'current.assessment.as_of'],
    ])('ignores a changed %s', (_label, id) => {
        const source = evidence();
        const changed = changeItem(source, id, { value: 1_999_999_999 });

        expect(buildSoxlAiCurrentSnapshotToken(changed)).toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it.each([
        ['provider identity', 'current.market_facts.provider_id', 'other-provider'],
        ['SOXL completed timestamp', 'current.market_facts.soxl_5m.latest_completed.time', 1_787_654_300],
        ['SOXL completed close', 'current.market_facts.soxl_5m.latest_completed.close', 28.25],
        ['daily represented date', 'current.market_facts.soxl_daily.latest_completed.time', 1_787_654_400],
        ['QQQ timestamp', 'current.market_facts.qqq_5m.latest_completed.time', 1_787_654_300],
        ['SMH timestamp', 'current.market_facts.smh_5m.latest_completed.time', 1_787_654_300],
        ['session date', 'current.market_facts.regular_session.latest_trading_date', '2026-06-30'],
        ['regular-session completion flag', 'current.market_facts.regular_session.latest_regular_session_completed', true],
        ['opening-range completion flag', 'current.market_facts.regular_session.opening_range_30m_completed', false],
        ['market relation', 'current.market_facts.soxl_5m.close_vs_ema20', 'below'],
        ['indicator value', 'current.market_facts.soxl_5m.ema20.value', 27.1],
        ['assessment expected value', 'current.assessment.upward.soxl_5m.condition.expected', 'below'],
        ['assessment actual value', 'current.assessment.upward.soxl_5m.condition.actual', 'below'],
        ['assessment state', 'current.assessment.upward.soxl_5m.condition.state', 'not_met'],
        ['section count', 'current.assessment.upward.soxl_5m.met_count', 0],
        ['scenario count', 'current.assessment.upward.total_count', 2],
    ])('changes when %s changes', (_label, id, value) => {
        const source = evidence();

        expect(buildSoxlAiCurrentSnapshotToken(changeItem(source, id, { value }))).not.toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('changes when evidence availability changes', () => {
        const source = evidence();
        const changed = changeItem(source, 'current.market_facts.optional_missing', {
            availability: 'available',
        });

        expect(buildSoxlAiCurrentSnapshotToken(changed)).not.toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('ignores human-readable label changes', () => {
        const source = evidence();
        const changed = changeItem(source, 'current.market_facts.provider_id', {
            label: 'A different display label',
        });

        expect(buildSoxlAiCurrentSnapshotToken(changed)).toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('ignores optional plan groups', () => {
        const source = evidence();

        expect(buildSoxlAiCurrentSnapshotToken(withOptionalPlan(source))).toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('ignores optional monitor groups', () => {
        const source = evidence();

        expect(buildSoxlAiCurrentSnapshotToken(withOptionalMonitor(source))).toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('keeps completed timestamps in the canonical token', () => {
        const source = evidence();
        const changed = changeItem(
            source,
            'current.market_facts.soxl_5m.latest_completed.time',
            { value: 1_787_654_301 },
        );

        expect(buildSoxlAiCurrentSnapshotToken(changed)).not.toBe(
            buildSoxlAiCurrentSnapshotToken(source),
        );
    });

    it('does not mutate its evidence input', () => {
        const source = evidence();
        const before = JSON.stringify(source);

        buildSoxlAiCurrentSnapshotToken(source);

        expect(JSON.stringify(source)).toBe(before);
    });

    it('does not use clocks, logging, persistence, or network behavior', () => {
        const dateNowSpy = vi.spyOn(Date, 'now');
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        buildSoxlAiCurrentSnapshotToken(evidence());

        expect(dateNowSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
