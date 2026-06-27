import type {
    SoxlAssessmentSection,
    SoxlConditionAssessment,
    SoxlMarketAssessment,
    SoxlScenarioAssessment,
} from '../strategy/soxl-market-assessment';
import type {
    IndicatorLatestFact,
    MacdLatestFact,
    PriceLevelFacts,
    SoxlMarketFacts,
    SwingLatestFact,
} from '../strategy/soxl-market-facts';
import type {
    SoxlTradePlan,
    SoxlTradePlanAssessmentContext,
    SoxlTradePlanCalculation,
    SoxlTradeTarget,
} from '../planning/soxl-trade-plan';
import type {
    SoxlConditionComparison,
    SoxlConditionComparisonCounts,
    SoxlLiveTradeMonitor,
    SoxlScenarioComparison,
    SoxlSectionComparison,
    SoxlTargetMonitoring,
} from '../monitoring/soxl-live-trade-monitor';

export type SoxlAiEvidencePackageStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlAiEvidenceAvailability =
    | 'available'
    | 'unknown'
    | 'unavailable';

export type SoxlAiEvidenceTrustClass =
    | 'deterministic_market_fact'
    | 'deterministic_assessment'
    | 'user_supplied_plan_assumption'
    | 'deterministic_plan_calculation'
    | 'user_supplied_execution_assumption'
    | 'deterministic_monitoring_calculation'
    | 'availability_marker';

export type SoxlAiSnapshotRole =
    | 'current'
    | 'plan_context'
    | 'monitoring_baseline'
    | 'monitoring_current';

export type SoxlAiEvidenceSource =
    | 'market_facts'
    | 'market_assessment'
    | 'trade_plan'
    | 'live_trade_monitor';

export type SoxlAiEvidenceIssue =
    | 'current_snapshot_identity_mismatch'
    | 'plan_context_unavailable'
    | 'monitor_context_unavailable'
    | 'monitor_current_snapshot_mismatch'
    | 'no_current_market_evidence';

export type SoxlAiEvidenceValue =
    | string
    | number
    | boolean
    | null;

export interface SoxlAiEvidenceItem {
    readonly id: string;
    readonly source: SoxlAiEvidenceSource;
    readonly snapshotRole: SoxlAiSnapshotRole;
    readonly sourcePath: string;
    readonly label: string;
    readonly trustClass: SoxlAiEvidenceTrustClass;
    readonly availability: SoxlAiEvidenceAvailability;
    readonly value: SoxlAiEvidenceValue;
    readonly unit: string | null;
}

export interface SoxlAiEvidenceGroups {
    readonly currentMarketFacts: readonly string[];
    readonly currentAssessment: readonly string[];
    readonly planAssumptions: readonly string[];
    readonly planCalculations: readonly string[];
    readonly executionAssumptions: readonly string[];
    readonly monitoringCalculations: readonly string[];
    readonly missingEvidence: readonly string[];
}

export interface SoxlAiSnapshotIdentity {
    readonly role: SoxlAiSnapshotRole;
    readonly providerId: string | null;
    readonly asOf: number | null;
    readonly factsStatus: SoxlAiEvidenceValue;
    readonly assessmentStatus: SoxlAiEvidenceValue;
    readonly coreStatus: SoxlAiEvidenceValue;
    readonly sessionStatus: SoxlAiEvidenceValue;
    readonly openingRangeComplete: boolean | null;
    readonly regularSessionComplete: boolean | null;
}

export interface BuildSoxlAiEvidenceInput {
    readonly facts: SoxlMarketFacts;
    readonly assessment: SoxlMarketAssessment;
    readonly plan: SoxlTradePlan | null;
    readonly monitor: SoxlLiveTradeMonitor | null;
}

export interface SoxlAiEvidencePackage {
    readonly status: SoxlAiEvidencePackageStatus;
    readonly issues: readonly SoxlAiEvidenceIssue[];
    readonly snapshotIdentities: readonly SoxlAiSnapshotIdentity[];
    readonly items: readonly SoxlAiEvidenceItem[];
    readonly groups: SoxlAiEvidenceGroups;
}

interface EvidenceAccumulator {
    readonly items: SoxlAiEvidenceItem[];
    readonly groups: {
        readonly currentMarketFacts: string[];
        readonly currentAssessment: string[];
        readonly planAssumptions: string[];
        readonly planCalculations: string[];
        readonly executionAssumptions: string[];
        readonly monitoringCalculations: string[];
        readonly missingEvidence: string[];
    };
    readonly ids: Set<string>;
}

type GroupKey = Exclude<keyof SoxlAiEvidenceGroups, 'missingEvidence'>;

interface AddEvidenceInput {
    readonly group: GroupKey;
    readonly id: string;
    readonly source: SoxlAiEvidenceSource;
    readonly snapshotRole: SoxlAiSnapshotRole;
    readonly sourcePath: string;
    readonly label: string;
    readonly trustClass: SoxlAiEvidenceTrustClass;
    readonly value: SoxlAiEvidenceValue;
    readonly unit?: string | null;
    readonly availability?: SoxlAiEvidenceAvailability;
}

function createAccumulator(): EvidenceAccumulator {
    return {
        items: [],
        groups: {
            currentMarketFacts: [],
            currentAssessment: [],
            planAssumptions: [],
            planCalculations: [],
            executionAssumptions: [],
            monitoringCalculations: [],
            missingEvidence: [],
        },
        ids: new Set<string>(),
    };
}

function isUnavailableLiteral(value: SoxlAiEvidenceValue): boolean {
    return value === 'unavailable';
}

function availabilityForValue(value: SoxlAiEvidenceValue): SoxlAiEvidenceAvailability {
    if (value === null || isUnavailableLiteral(value)) {
        return 'unavailable';
    }

    if (value === 'unknown') {
        return 'unknown';
    }

    return 'available';
}

function availabilityForStatus(value: SoxlAiEvidenceValue): SoxlAiEvidenceAvailability {
    return value === 'available' ? 'available' : 'unavailable';
}

function availabilityForIssue(value: SoxlAiEvidenceValue): SoxlAiEvidenceAvailability {
    return value === null ? 'available' : 'unavailable';
}

function addIssue(
    issues: SoxlAiEvidenceIssue[],
    issue: SoxlAiEvidenceIssue,
): void {
    if (!issues.includes(issue)) {
        issues.push(issue);
    }
}

function addEvidence(accumulator: EvidenceAccumulator, input: AddEvidenceInput): void {
    if (accumulator.ids.has(input.id)) {
        throw new Error(`Duplicate SOXL AI evidence id: ${input.id}`);
    }

    const availability = input.availability ?? availabilityForValue(input.value);
    const item: SoxlAiEvidenceItem = {
        id: input.id,
        source: input.source,
        snapshotRole: input.snapshotRole,
        sourcePath: input.sourcePath,
        label: input.label,
        trustClass: input.trustClass,
        availability,
        value: input.value,
        unit: input.unit ?? null,
    };

    accumulator.ids.add(input.id);
    accumulator.items.push(item);
    accumulator.groups[input.group].push(input.id);

    if (availability !== 'available' && !accumulator.groups.missingEvidence.includes(input.id)) {
        accumulator.groups.missingEvidence.push(input.id);
    }
}

function addMarketFact(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    unit: string | null = null,
    availability?: SoxlAiEvidenceAvailability,
): void {
    addEvidence(accumulator, {
        group: 'currentMarketFacts',
        id: `current.market_facts.${key}`,
        source: 'market_facts',
        snapshotRole: 'current',
        sourcePath,
        label,
        trustClass: 'deterministic_market_fact',
        value,
        unit,
        availability,
    });
}

function addAssessmentEvidence(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    availability?: SoxlAiEvidenceAvailability,
): void {
    addEvidence(accumulator, {
        group: 'currentAssessment',
        id: `current.assessment.${key}`,
        source: 'market_assessment',
        snapshotRole: 'current',
        sourcePath,
        label,
        trustClass: 'deterministic_assessment',
        value,
        availability,
    });
}

function addPlanAssumption(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    unit: string | null = null,
): void {
    addEvidence(accumulator, {
        group: 'planAssumptions',
        id: `plan.assumptions.${key}`,
        source: 'trade_plan',
        snapshotRole: 'plan_context',
        sourcePath,
        label,
        trustClass: 'user_supplied_plan_assumption',
        value,
        unit,
    });
}

function addPlanCalculation(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    unit: string | null = null,
    availability?: SoxlAiEvidenceAvailability,
): void {
    addEvidence(accumulator, {
        group: 'planCalculations',
        id: `plan.calculations.${key}`,
        source: 'trade_plan',
        snapshotRole: 'plan_context',
        sourcePath,
        label,
        trustClass: 'deterministic_plan_calculation',
        value,
        unit,
        availability,
    });
}

function addExecutionAssumption(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    unit: string | null = null,
): void {
    addEvidence(accumulator, {
        group: 'executionAssumptions',
        id: `monitor.execution.${key}`,
        source: 'live_trade_monitor',
        snapshotRole: 'monitoring_current',
        sourcePath,
        label,
        trustClass: 'user_supplied_execution_assumption',
        value,
        unit,
    });
}

function addMonitoringCalculation(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    label: string,
    value: SoxlAiEvidenceValue,
    unit: string | null = null,
    availability?: SoxlAiEvidenceAvailability,
    snapshotRole: SoxlAiSnapshotRole = 'monitoring_current',
): void {
    addEvidence(accumulator, {
        group: 'monitoringCalculations',
        id: `monitor.calculations.${key}`,
        source: 'live_trade_monitor',
        snapshotRole,
        sourcePath,
        label,
        trustClass: 'deterministic_monitoring_calculation',
        value,
        unit,
        availability,
    });
}

function addIndicator(
    accumulator: EvidenceAccumulator,
    prefix: string,
    sourcePath: string,
    label: string,
    indicator: IndicatorLatestFact,
    unit: string | null,
): void {
    addMarketFact(accumulator, `${prefix}.value`, `${sourcePath}.value`, `${label} value`, indicator.value, unit);
    addMarketFact(accumulator, `${prefix}.time`, `${sourcePath}.time`, `${label} timestamp`, indicator.time, 'epoch_ms');
}

function addMacd(
    accumulator: EvidenceAccumulator,
    prefix: string,
    sourcePath: string,
    macd: MacdLatestFact,
): void {
    addMarketFact(accumulator, `${prefix}.line`, `${sourcePath}.line`, 'MACD line', macd.line);
    addMarketFact(accumulator, `${prefix}.signal`, `${sourcePath}.signal`, 'MACD signal line', macd.signal);
    addMarketFact(accumulator, `${prefix}.histogram`, `${sourcePath}.histogram`, 'MACD histogram', macd.histogram);
    addMarketFact(accumulator, `${prefix}.time`, `${sourcePath}.time`, 'MACD timestamp', macd.time, 'epoch_ms');
}

function addSwing(
    accumulator: EvidenceAccumulator,
    prefix: string,
    sourcePath: string,
    label: string,
    swing: SwingLatestFact,
): void {
    addMarketFact(accumulator, `${prefix}.price`, `${sourcePath}.price`, `${label} price`, swing.price, 'usd');
    addMarketFact(accumulator, `${prefix}.pivot_time`, `${sourcePath}.pivotTime`, `${label} pivot timestamp`, swing.pivotTime, 'epoch_ms');
    addMarketFact(accumulator, `${prefix}.confirmed_at_time`, `${sourcePath}.confirmedAtTime`, `${label} confirmed timestamp`, swing.confirmedAtTime, 'epoch_ms');
}

function addLevel(
    accumulator: EvidenceAccumulator,
    prefix: string,
    sourcePath: string,
    label: string,
    level: PriceLevelFacts,
): void {
    addMarketFact(accumulator, `${prefix}.high`, `${sourcePath}.high`, `${label} high`, level.high, 'usd');
    addMarketFact(accumulator, `${prefix}.high_time`, `${sourcePath}.highTime`, `${label} high timestamp`, level.highTime, 'epoch_ms');
    addMarketFact(accumulator, `${prefix}.low`, `${sourcePath}.low`, `${label} low`, level.low, 'usd');
    addMarketFact(accumulator, `${prefix}.low_time`, `${sourcePath}.lowTime`, `${label} low timestamp`, level.lowTime, 'epoch_ms');
    addMarketFact(accumulator, `${prefix}.used_bars`, `${sourcePath}.usedBars`, `${label} used bars`, level.usedBars, 'bars');
    addMarketFact(accumulator, `${prefix}.status`, `${sourcePath}.status`, `${label} status`, level.status, null, availabilityForStatus(level.status));
}

function addCurrentMarketFacts(accumulator: EvidenceAccumulator, facts: SoxlMarketFacts): void {
    addMarketFact(accumulator, 'status', 'facts.status', 'Market facts status', facts.status, null, availabilityForStatus(facts.status));
    addMarketFact(accumulator, 'issue', 'facts.issue', 'Market facts structured issue', facts.issue, null, availabilityForIssue(facts.issue));
    addMarketFact(accumulator, 'provider_id', 'facts.providerId', 'Provider ID', facts.providerId);
    addMarketFact(accumulator, 'as_of', 'facts.asOf', 'Snapshot timestamp', facts.asOf, 'epoch_ms');
    addMarketFact(accumulator, 'core_status', 'facts.coreStatus', 'Core indicator status', facts.coreStatus, null, availabilityForStatus(facts.coreStatus));
    addMarketFact(accumulator, 'session_status', 'facts.sessionStatus', 'Regular session status', facts.sessionStatus, null, availabilityForStatus(facts.sessionStatus));

    addSeriesFacts(accumulator, 'soxl_5m', 'facts.soxl5m', facts.soxl5m, true, true);
    addDailyFacts(accumulator, facts);
    addSeriesFacts(accumulator, 'qqq_5m', 'facts.qqq5m', facts.qqq5m, false, false);
    addSeriesFacts(accumulator, 'smh_5m', 'facts.smh5m', facts.smh5m, false, false);
    addRegularSessionFacts(accumulator, facts);
}

function addSeriesFacts(
    accumulator: EvidenceAccumulator,
    key: 'soxl_5m' | 'qqq_5m' | 'smh_5m',
    sourcePath: 'facts.soxl5m' | 'facts.qqq5m' | 'facts.smh5m',
    facts: SoxlMarketFacts['soxl5m'] | SoxlMarketFacts['qqq5m'],
    includeEma9: boolean,
    includeSwings: boolean,
): void {
    addMarketFact(accumulator, `${key}.status`, `${sourcePath}.status`, `${key} status`, facts.status, null, availabilityForStatus(facts.status));
    if ('symbol' in facts) {
        addMarketFact(accumulator, `${key}.symbol`, `${sourcePath}.symbol`, `${key} symbol`, facts.symbol);
    }

    addMarketFact(accumulator, `${key}.latest_completed.close`, `${sourcePath}.latestCompleted.close`, `${key} latest completed close`, facts.latestCompleted.close, 'usd');
    addMarketFact(accumulator, `${key}.latest_completed.time`, `${sourcePath}.latestCompleted.time`, `${key} latest completed timestamp`, facts.latestCompleted.time, 'epoch_ms');

    if (includeEma9 && 'ema9' in facts && 'closeVsEma9' in facts && 'ema9VsEma20' in facts) {
        addIndicator(accumulator, `${key}.ema9`, `${sourcePath}.ema9`, `${key} EMA 9`, facts.ema9, 'usd');
        addMarketFact(accumulator, `${key}.close_vs_ema9`, `${sourcePath}.closeVsEma9`, `${key} close compared with EMA 9`, facts.closeVsEma9);
        addMarketFact(accumulator, `${key}.ema9_vs_ema20`, `${sourcePath}.ema9VsEma20`, `${key} EMA 9 compared with EMA 20`, facts.ema9VsEma20);
    }

    addIndicator(accumulator, `${key}.ema20`, `${sourcePath}.ema20`, `${key} EMA 20`, facts.ema20, 'usd');
    addIndicator(accumulator, `${key}.ema50`, `${sourcePath}.ema50`, `${key} EMA 50`, facts.ema50, 'usd');
    addIndicator(accumulator, `${key}.rsi14`, `${sourcePath}.rsi14`, `${key} RSI 14`, facts.rsi14, null);
    addMacd(accumulator, `${key}.macd12269`, `${sourcePath}.macd12269`, facts.macd12269);
    addMarketFact(accumulator, `${key}.close_vs_ema20`, `${sourcePath}.closeVsEma20`, `${key} close compared with EMA 20`, facts.closeVsEma20);
    addMarketFact(accumulator, `${key}.close_vs_ema50`, `${sourcePath}.closeVsEma50`, `${key} close compared with EMA 50`, facts.closeVsEma50);
    addMarketFact(accumulator, `${key}.ema20_vs_ema50`, `${sourcePath}.ema20VsEma50`, `${key} EMA 20 compared with EMA 50`, facts.ema20VsEma50);
    addMarketFact(accumulator, `${key}.macd_line_vs_signal`, `${sourcePath}.macdLineVsSignal`, `${key} MACD line compared with signal line`, facts.macdLineVsSignal);
    addMarketFact(accumulator, `${key}.macd_histogram_sign`, `${sourcePath}.macdHistogramSign`, `${key} MACD histogram sign`, facts.macdHistogramSign);

    if (includeSwings && 'atr14' in facts && 'latestConfirmedSwingHigh' in facts) {
        addIndicator(accumulator, `${key}.atr14`, `${sourcePath}.atr14`, `${key} ATR 14`, facts.atr14, 'usd');
        addSwing(accumulator, `${key}.latest_confirmed_swing_high`, `${sourcePath}.latestConfirmedSwingHigh`, `${key} latest confirmed swing high`, facts.latestConfirmedSwingHigh);
        addSwing(accumulator, `${key}.latest_confirmed_swing_low`, `${sourcePath}.latestConfirmedSwingLow`, `${key} latest confirmed swing low`, facts.latestConfirmedSwingLow);
        addMarketFact(accumulator, `${key}.close_vs_latest_confirmed_swing_high`, `${sourcePath}.closeVsLatestConfirmedSwingHigh`, `${key} close compared with latest confirmed swing high`, facts.closeVsLatestConfirmedSwingHigh);
        addMarketFact(accumulator, `${key}.close_vs_latest_confirmed_swing_low`, `${sourcePath}.closeVsLatestConfirmedSwingLow`, `${key} close compared with latest confirmed swing low`, facts.closeVsLatestConfirmedSwingLow);
    }
}

function addDailyFacts(accumulator: EvidenceAccumulator, facts: SoxlMarketFacts): void {
    const daily = facts.soxlDaily;
    const sourcePath = 'facts.soxlDaily';

    addMarketFact(accumulator, 'soxl_daily.status', `${sourcePath}.status`, 'SOXL daily status', daily.status, null, availabilityForStatus(daily.status));
    addMarketFact(accumulator, 'soxl_daily.latest_completed.close', `${sourcePath}.latestCompleted.close`, 'SOXL daily latest completed close', daily.latestCompleted.close, 'usd');
    addMarketFact(accumulator, 'soxl_daily.latest_completed.time', `${sourcePath}.latestCompleted.time`, 'SOXL daily latest completed timestamp', daily.latestCompleted.time, 'epoch_ms');
    addIndicator(accumulator, 'soxl_daily.ema20', `${sourcePath}.ema20`, 'SOXL daily EMA 20', daily.ema20, 'usd');
    addIndicator(accumulator, 'soxl_daily.ema50', `${sourcePath}.ema50`, 'SOXL daily EMA 50', daily.ema50, 'usd');
    addIndicator(accumulator, 'soxl_daily.ema200', `${sourcePath}.ema200`, 'SOXL daily EMA 200', daily.ema200, 'usd');
    addIndicator(accumulator, 'soxl_daily.rsi14', `${sourcePath}.rsi14`, 'SOXL daily RSI 14', daily.rsi14, null);
    addIndicator(accumulator, 'soxl_daily.atr14', `${sourcePath}.atr14`, 'SOXL daily ATR 14', daily.atr14, 'usd');
    addMacd(accumulator, 'soxl_daily.macd12269', `${sourcePath}.macd12269`, daily.macd12269);
    addSwing(accumulator, 'soxl_daily.latest_confirmed_swing_high', `${sourcePath}.latestConfirmedSwingHigh`, 'SOXL daily latest confirmed swing high', daily.latestConfirmedSwingHigh);
    addSwing(accumulator, 'soxl_daily.latest_confirmed_swing_low', `${sourcePath}.latestConfirmedSwingLow`, 'SOXL daily latest confirmed swing low', daily.latestConfirmedSwingLow);
    addMarketFact(accumulator, 'soxl_daily.close_vs_ema20', `${sourcePath}.closeVsEma20`, 'SOXL daily close compared with EMA 20', daily.closeVsEma20);
    addMarketFact(accumulator, 'soxl_daily.close_vs_ema50', `${sourcePath}.closeVsEma50`, 'SOXL daily close compared with EMA 50', daily.closeVsEma50);
    addMarketFact(accumulator, 'soxl_daily.close_vs_ema200', `${sourcePath}.closeVsEma200`, 'SOXL daily close compared with EMA 200', daily.closeVsEma200);
    addMarketFact(accumulator, 'soxl_daily.ema20_vs_ema50', `${sourcePath}.ema20VsEma50`, 'SOXL daily EMA 20 compared with EMA 50', daily.ema20VsEma50);
    addMarketFact(accumulator, 'soxl_daily.ema50_vs_ema200', `${sourcePath}.ema50VsEma200`, 'SOXL daily EMA 50 compared with EMA 200', daily.ema50VsEma200);
    addMarketFact(accumulator, 'soxl_daily.macd_line_vs_signal', `${sourcePath}.macdLineVsSignal`, 'SOXL daily MACD line compared with signal line', daily.macdLineVsSignal);
    addMarketFact(accumulator, 'soxl_daily.macd_histogram_sign', `${sourcePath}.macdHistogramSign`, 'SOXL daily MACD histogram sign', daily.macdHistogramSign);
    addMarketFact(accumulator, 'soxl_daily.close_vs_latest_confirmed_swing_high', `${sourcePath}.closeVsLatestConfirmedSwingHigh`, 'SOXL daily close compared with latest confirmed swing high', daily.closeVsLatestConfirmedSwingHigh);
    addMarketFact(accumulator, 'soxl_daily.close_vs_latest_confirmed_swing_low', `${sourcePath}.closeVsLatestConfirmedSwingLow`, 'SOXL daily close compared with latest confirmed swing low', daily.closeVsLatestConfirmedSwingLow);
}

function addRegularSessionFacts(accumulator: EvidenceAccumulator, facts: SoxlMarketFacts): void {
    const session = facts.regularSession;
    const sourcePath = 'facts.regularSession';

    addMarketFact(accumulator, 'regular_session.status', `${sourcePath}.status`, 'Regular session status', session.status, null, availabilityForStatus(session.status));
    addMarketFact(accumulator, 'regular_session.latest_completed.close', `${sourcePath}.latestCompleted.close`, 'Regular session latest completed close', session.latestCompleted.close, 'usd');
    addMarketFact(accumulator, 'regular_session.latest_completed.time', `${sourcePath}.latestCompleted.time`, 'Regular session latest completed timestamp', session.latestCompleted.time, 'epoch_ms');
    addIndicator(accumulator, 'regular_session.vwap', `${sourcePath}.vwap`, 'Regular session VWAP', session.vwap, 'usd');
    addIndicator(accumulator, 'regular_session.rolling_relative_volume', `${sourcePath}.rollingRelativeVolume`, 'Rolling relative volume', session.rollingRelativeVolume, 'ratio');
    addLevel(accumulator, 'regular_session.previous_represented_session', `${sourcePath}.previousRepresentedSession`, 'Previous represented session', session.previousRepresentedSession);
    addLevel(accumulator, 'regular_session.opening_range_30m', `${sourcePath}.openingRange30m`, 'Opening range 30 minute', session.openingRange30m);
    addMarketFact(accumulator, 'regular_session.latest_trading_date', `${sourcePath}.latestTradingDate`, 'Latest represented trading date', session.latestTradingDate);
    addMarketFact(accumulator, 'regular_session.previous_trading_date', `${sourcePath}.previousTradingDate`, 'Previous represented trading date', session.previousTradingDate);
    addMarketFact(accumulator, 'regular_session.latest_date_relation', `${sourcePath}.latestDateRelation`, 'Latest-date relation', session.latestDateRelation);
    addMarketFact(accumulator, 'regular_session.latest_regular_session_completed', `${sourcePath}.latestRegularSessionCompleted`, 'Regular-session completion flag', session.latestRegularSessionCompleted);
    addMarketFact(accumulator, 'regular_session.opening_range_30m_completed', `${sourcePath}.openingRange30mCompleted`, 'Opening-range completion flag', session.openingRange30mCompleted);
    addMarketFact(accumulator, 'regular_session.close_vs_vwap', `${sourcePath}.closeVsVwap`, 'Close compared with VWAP', session.closeVsVwap);
    addMarketFact(accumulator, 'regular_session.close_vs_previous_session_high', `${sourcePath}.closeVsPreviousSessionHigh`, 'Close compared with previous-session high', session.closeVsPreviousSessionHigh);
    addMarketFact(accumulator, 'regular_session.close_vs_previous_session_low', `${sourcePath}.closeVsPreviousSessionLow`, 'Close compared with previous-session low', session.closeVsPreviousSessionLow);
    addMarketFact(accumulator, 'regular_session.close_vs_opening_range_high', `${sourcePath}.closeVsOpeningRangeHigh`, 'Close compared with opening-range high', session.closeVsOpeningRangeHigh);
    addMarketFact(accumulator, 'regular_session.close_vs_opening_range_low', `${sourcePath}.closeVsOpeningRangeLow`, 'Close compared with opening-range low', session.closeVsOpeningRangeLow);
}

function addCurrentAssessment(accumulator: EvidenceAccumulator, assessment: SoxlMarketAssessment): void {
    addAssessmentEvidence(accumulator, 'status', 'assessment.status', 'Assessment status', assessment.status, availabilityForStatus(assessment.status));
    addAssessmentEvidence(accumulator, 'issue', 'assessment.issue', 'Assessment structured issue', assessment.issue, availabilityForIssue(assessment.issue));
    addAssessmentEvidence(accumulator, 'provider_id', 'assessment.providerId', 'Assessment provider ID', assessment.providerId);
    addAssessmentEvidence(accumulator, 'as_of', 'assessment.asOf', 'Assessment snapshot timestamp', assessment.asOf);
    addAssessmentEvidence(accumulator, 'facts_status', 'assessment.factsStatus', 'Assessment facts status', assessment.factsStatus, availabilityForStatus(assessment.factsStatus));
    addAssessmentEvidence(accumulator, 'core_status', 'assessment.coreStatus', 'Assessment core status', assessment.coreStatus, availabilityForStatus(assessment.coreStatus));
    addAssessmentEvidence(accumulator, 'session_status', 'assessment.sessionStatus', 'Assessment session status', assessment.sessionStatus, availabilityForStatus(assessment.sessionStatus));
    addAssessmentEvidence(accumulator, 'opening_range_complete', 'assessment.openingRangeComplete', 'Assessment opening-range completion flag', assessment.openingRangeComplete);
    addAssessmentEvidence(accumulator, 'regular_session_complete', 'assessment.regularSessionComplete', 'Assessment regular-session completion flag', assessment.regularSessionComplete);
    addScenario(accumulator, assessment.upwardAlignment, 'assessment.upwardAlignment');
    addScenario(accumulator, assessment.downwardAlignment, 'assessment.downwardAlignment');
}

function addScenario(
    accumulator: EvidenceAccumulator,
    scenario: SoxlScenarioAssessment,
    sourcePath: string,
): void {
    const key = scenario.id;
    addAssessmentEvidence(accumulator, `${key}.met_count`, `${sourcePath}.metCount`, `${key} met count`, scenario.metCount);
    addAssessmentEvidence(accumulator, `${key}.not_met_count`, `${sourcePath}.notMetCount`, `${key} not-met count`, scenario.notMetCount);
    addAssessmentEvidence(accumulator, `${key}.unknown_count`, `${sourcePath}.unknownCount`, `${key} unknown count`, scenario.unknownCount);
    addAssessmentEvidence(accumulator, `${key}.known_count`, `${sourcePath}.knownCount`, `${key} known count`, scenario.knownCount);
    addAssessmentEvidence(accumulator, `${key}.total_count`, `${sourcePath}.totalCount`, `${key} total count`, scenario.totalCount);

    scenario.sections.forEach((section) => {
        addSection(accumulator, scenario, section, `${sourcePath}.sections[id=${section.id}]`);
    });
}

function addSection(
    accumulator: EvidenceAccumulator,
    scenario: SoxlScenarioAssessment,
    section: SoxlAssessmentSection,
    sourcePath: string,
): void {
    const prefix = `${scenario.id}.${section.id}`;
    addAssessmentEvidence(accumulator, `${prefix}.met_count`, `${sourcePath}.metCount`, `${prefix} met count`, section.metCount);
    addAssessmentEvidence(accumulator, `${prefix}.not_met_count`, `${sourcePath}.notMetCount`, `${prefix} not-met count`, section.notMetCount);
    addAssessmentEvidence(accumulator, `${prefix}.unknown_count`, `${sourcePath}.unknownCount`, `${prefix} unknown count`, section.unknownCount);
    addAssessmentEvidence(accumulator, `${prefix}.known_count`, `${sourcePath}.knownCount`, `${prefix} known count`, section.knownCount);
    addAssessmentEvidence(accumulator, `${prefix}.total_count`, `${sourcePath}.totalCount`, `${prefix} total count`, section.totalCount);

    section.conditions.forEach((condition) => {
        addCondition(accumulator, scenario, section, condition, `${sourcePath}.conditions[id=${condition.id}]`);
    });
}

function addCondition(
    accumulator: EvidenceAccumulator,
    scenario: SoxlScenarioAssessment,
    section: SoxlAssessmentSection,
    condition: SoxlConditionAssessment,
    sourcePath: string,
): void {
    const prefix = `${scenario.id}.${section.id}.${condition.id}`;
    addAssessmentEvidence(accumulator, `${prefix}.condition_id`, `${sourcePath}.id`, `${condition.id} ID`, condition.id);
    addAssessmentEvidence(accumulator, `${prefix}.expected`, `${sourcePath}.expected`, `${condition.id} expected value`, condition.expected);
    addAssessmentEvidence(accumulator, `${prefix}.actual`, `${sourcePath}.actual`, `${condition.id} actual value`, condition.actual);
    addAssessmentEvidence(accumulator, `${prefix}.state`, `${sourcePath}.state`, `${condition.id} state`, condition.state);
}

function addPlanContextIdentityEvidence(
    accumulator: EvidenceAccumulator,
    context: SoxlTradePlanAssessmentContext,
): void {
    addPlanCalculation(accumulator, 'assessment_context.provider_id', 'plan.assessmentContext.providerId', 'Plan assessment-context provider ID', context.providerId);
    addPlanCalculation(accumulator, 'assessment_context.as_of', 'plan.assessmentContext.asOf', 'Plan assessment-context timestamp', context.asOf, 'epoch_ms');
    addPlanCalculation(accumulator, 'assessment_context.status', 'plan.assessmentContext.status', 'Plan assessment-context status', context.status, null, availabilityForStatus(context.status));
    addPlanCalculation(accumulator, 'assessment_context.facts_status', 'plan.assessmentContext.factsStatus', 'Plan assessment-context facts status', context.factsStatus, null, availabilityForStatus(context.factsStatus));
    addPlanCalculation(accumulator, 'assessment_context.core_status', 'plan.assessmentContext.coreStatus', 'Plan assessment-context core status', context.coreStatus, null, availabilityForStatus(context.coreStatus));
    addPlanCalculation(accumulator, 'assessment_context.session_status', 'plan.assessmentContext.sessionStatus', 'Plan assessment-context session status', context.sessionStatus, null, availabilityForStatus(context.sessionStatus));
    addPlanCalculation(accumulator, 'assessment_context.issue', 'plan.assessmentContext.issue', 'Plan assessment-context issue', context.issue, null, availabilityForIssue(context.issue));
    addPlanCalculation(accumulator, 'assessment_context.opening_range_complete', 'plan.assessmentContext.openingRangeComplete', 'Plan assessment-context opening-range completion flag', context.openingRangeComplete);
    addPlanCalculation(accumulator, 'assessment_context.regular_session_complete', 'plan.assessmentContext.regularSessionComplete', 'Plan assessment-context regular-session completion flag', context.regularSessionComplete);
    addPlanScenarioCounts(accumulator, 'assessment_context.upward_alignment', 'plan.assessmentContext.upwardAlignment', context.upwardAlignment);
    addPlanScenarioCounts(accumulator, 'assessment_context.downward_alignment', 'plan.assessmentContext.downwardAlignment', context.downwardAlignment);
}

function addPlanScenarioCounts(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    counts: SoxlTradePlanAssessmentContext['upwardAlignment'],
): void {
    addPlanCalculation(accumulator, `${key}.met_count`, `${sourcePath}.metCount`, `${key} met count`, counts.metCount);
    addPlanCalculation(accumulator, `${key}.not_met_count`, `${sourcePath}.notMetCount`, `${key} not-met count`, counts.notMetCount);
    addPlanCalculation(accumulator, `${key}.unknown_count`, `${sourcePath}.unknownCount`, `${key} unknown count`, counts.unknownCount);
    addPlanCalculation(accumulator, `${key}.known_count`, `${sourcePath}.knownCount`, `${key} known count`, counts.knownCount);
    addPlanCalculation(accumulator, `${key}.total_count`, `${sourcePath}.totalCount`, `${key} total count`, counts.totalCount);
}

function addPlanEvidence(
    accumulator: EvidenceAccumulator,
    plan: SoxlTradePlan,
    issues: SoxlAiEvidenceIssue[],
): void {
    addPlanAssumption(accumulator, 'side', 'plan.side', 'User-supplied side', plan.side);
    addPlanAssumption(accumulator, 'proposed_entry_price', 'plan.entryPrice', 'User-supplied proposed entry price', plan.entryPrice, 'usd');
    addPlanAssumption(accumulator, 'proposed_invalidation_price', 'plan.invalidationPrice', 'User-supplied proposed invalidation price', plan.invalidationPrice, 'usd');
    addPlanAssumption(accumulator, 'maximum_acceptable_loss', 'plan.maximumLossAmount', 'User-supplied maximum acceptable loss', plan.maximumLossAmount, 'usd');
    addPlanAssumption(accumulator, 'estimated_entry_fee', 'plan.estimatedEntryFee', 'User-supplied estimated entry fee', plan.estimatedEntryFee, 'usd');
    addPlanAssumption(accumulator, 'estimated_invalidation_exit_fee', 'plan.estimatedInvalidationExitFee', 'User-supplied estimated invalidation-exit fee', plan.estimatedInvalidationExitFee, 'usd');
    addPlanAssumption(accumulator, 'quantity_increment', 'plan.quantityIncrement', 'User-supplied quantity increment', plan.quantityIncrement, 'shares');
    addPlanAssumption(accumulator, 'maximum_position_value', 'plan.maximumPositionValue', 'User-supplied maximum position value', plan.maximumPositionValue, 'usd');

    addPlanCalculation(accumulator, 'status', 'plan.status', 'Plan status', plan.status, null, availabilityForStatus(plan.status));
    addPlanCalculation(accumulator, 'issue', 'plan.issue', 'Plan structured issue', plan.issue, null, availabilityForIssue(plan.issue));
    addPlanContextIdentityEvidence(accumulator, plan.assessmentContext);
    addPlanCalculationFields(accumulator, plan.calculation);

    plan.targets.forEach((target) => addPlanTargetEvidence(accumulator, target));

    if (plan.status === 'unavailable' || plan.calculation === null) {
        addIssue(issues, 'plan_context_unavailable');
    }
}

function addPlanCalculationFields(
    accumulator: EvidenceAccumulator,
    calculation: SoxlTradePlanCalculation | null,
): void {
    const values: readonly [string, keyof SoxlTradePlanCalculation, string, string | null][] = [
        ['risk_per_unit', 'riskPerUnit', 'Risk per unit', 'usd'],
        ['estimated_invalidation_fees', 'estimatedInvalidationFees', 'Estimated invalidation fees', 'usd'],
        ['risk_budget_after_fees', 'riskBudgetAfterFees', 'Risk budget after fees', 'usd'],
        ['raw_risk_limited_quantity', 'rawRiskLimitedQuantity', 'Raw risk-limited quantity', 'shares'],
        ['raw_position_value_limited_quantity', 'rawPositionValueLimitedQuantity', 'Raw position-value-limited quantity', 'shares'],
        ['raw_maximum_quantity', 'rawMaximumQuantity', 'Raw maximum quantity', 'shares'],
        ['maximum_quantity', 'maximumQuantity', 'Calculated maximum quantity', 'shares'],
        ['quantity_increment', 'quantityIncrement', 'Quantity increment used by calculation', 'shares'],
        ['binding_limit', 'bindingLimit', 'Binding limit', null],
        ['entry_notional', 'entryNotional', 'Entry notional', 'usd'],
        ['gross_loss_at_invalidation', 'grossLossAtInvalidation', 'Gross loss at invalidation', 'usd'],
        ['estimated_loss_at_invalidation', 'estimatedLossAtInvalidation', 'Estimated loss at invalidation', 'usd'],
        ['unused_loss_budget', 'unusedLossBudget', 'Unused loss budget', 'usd'],
    ];

    values.forEach(([key, field, label, unit]) => {
        addPlanCalculation(
            accumulator,
            key,
            `plan.calculation.${field}`,
            label,
            calculation?.[field] ?? null,
            unit,
        );
    });
}

function targetEvidenceKey(target: SoxlTradeTarget): string {
    return target.id.trim().length > 0 ? target.id : 'missing_target_id';
}

function targetPath(target: SoxlTradeTarget): string {
    return `plan.targets[id=${targetEvidenceKey(target)}]`;
}

function addPlanTargetEvidence(
    accumulator: EvidenceAccumulator,
    target: SoxlTradeTarget,
): void {
    const key = `targets.${targetEvidenceKey(target)}`;
    const path = targetPath(target);
    addPlanAssumption(accumulator, `${key}.id`, `${path}.id`, 'User-supplied target ID', target.id);
    addPlanAssumption(accumulator, `${key}.price`, `${path}.price`, 'User-supplied target price', target.price, 'usd');
    addPlanAssumption(accumulator, `${key}.estimated_exit_fee`, `${path}.estimatedExitFee`, 'User-supplied target exit fee', target.estimatedExitFee, 'usd');
    addPlanCalculation(accumulator, `${key}.status`, `${path}.status`, 'Target status', target.status, null, availabilityForStatus(target.status));
    addPlanCalculation(accumulator, `${key}.issue`, `${path}.issue`, 'Target structured issue', target.issue, null, availabilityForIssue(target.issue));
    addPlanCalculation(accumulator, `${key}.reward_per_unit`, `${path}.rewardPerUnit`, 'Target reward per unit', target.rewardPerUnit, 'usd');
    addPlanCalculation(accumulator, `${key}.gross_hypothetical_profit_at_maximum_quantity`, `${path}.grossProfitAtMaximumQuantity`, 'Target gross hypothetical profit at maximum quantity', target.grossProfitAtMaximumQuantity, 'usd');
    addPlanCalculation(accumulator, `${key}.estimated_hypothetical_net_profit_at_maximum_quantity`, `${path}.estimatedNetProfitAtMaximumQuantity`, 'Target estimated hypothetical net profit at maximum quantity', target.estimatedNetProfitAtMaximumQuantity, 'usd');
    addPlanCalculation(accumulator, `${key}.price_reward_to_risk_multiple`, `${path}.priceRewardToRiskMultiple`, 'Target price reward-to-risk multiple', target.priceRewardToRiskMultiple, 'ratio');
}

function addMonitoringEvidence(
    accumulator: EvidenceAccumulator,
    monitor: SoxlLiveTradeMonitor,
    facts: SoxlMarketFacts,
    assessment: SoxlMarketAssessment,
    issues: SoxlAiEvidenceIssue[],
): void {
    addExecutionAssumption(accumulator, 'actual_execution_price', 'monitor.executionPrice', 'User-supplied actual execution price', monitor.executionPrice, 'usd');
    addExecutionAssumption(accumulator, 'executed_quantity', 'monitor.executedQuantity', 'User-supplied executed quantity', monitor.executedQuantity, 'shares');
    addExecutionAssumption(accumulator, 'actual_entry_fee', 'monitor.actualEntryFee', 'User-supplied actual entry fee', monitor.actualEntryFee, 'usd');
    addExecutionAssumption(accumulator, 'estimated_current_exit_fee', 'monitor.estimatedCurrentExitFee', 'User-supplied estimated current exit fee', monitor.estimatedCurrentExitFee, 'usd');

    addMonitoringCalculation(accumulator, 'status', 'monitor.status', 'Monitor status', monitor.status, null, availabilityForStatus(monitor.status));
    addMonitoringCalculation(accumulator, 'issues', 'monitor.issues', 'Monitor structured issues', monitor.issues.join('|') || null, null, monitor.issues.length === 0 ? 'available' : 'unavailable');
    addMonitoringCalculation(accumulator, 'provider_id', 'monitor.providerId', 'Monitor provider ID', monitor.providerId, null, undefined, 'monitoring_baseline');
    addMonitoringCalculation(accumulator, 'baseline_as_of', 'monitor.baselineAsOf', 'Monitor baseline timestamp', monitor.baselineAsOf, 'epoch_ms', undefined, 'monitoring_baseline');
    addMonitoringCalculation(accumulator, 'current_as_of', 'monitor.currentAsOf', 'Monitor current timestamp', monitor.currentAsOf, 'epoch_ms');
    addMonitoringCalculation(accumulator, 'current_facts_status', 'monitor.currentFactsStatus', 'Monitor current facts status', monitor.currentFactsStatus, null, availabilityForStatus(monitor.currentFactsStatus));
    addMonitoringCalculation(accumulator, 'current_assessment_status', 'monitor.currentAssessmentStatus', 'Monitor current assessment status', monitor.currentAssessmentStatus, null, availabilityForStatus(monitor.currentAssessmentStatus));
    addMonitoringCalculation(accumulator, 'side', 'monitor.side', 'Monitor side', monitor.side);
    addPriceMonitoringEvidence(accumulator, monitor);
    addQuantityMonitoringEvidence(accumulator, monitor);
    monitor.targets.forEach((target) => addTargetMonitoringEvidence(accumulator, target));
    addAssessmentComparisonEvidence(accumulator, monitor.assessmentComparison.scenarios);

    if (monitor.status === 'unavailable') {
        addIssue(issues, 'monitor_context_unavailable');
    }

    if (
        monitor.currentAsOf !== facts.asOf
        || monitor.currentFactsStatus !== facts.status
        || monitor.currentAssessmentStatus !== assessment.status
    ) {
        addIssue(issues, 'monitor_current_snapshot_mismatch');
    }
}

function addPriceMonitoringEvidence(
    accumulator: EvidenceAccumulator,
    monitor: SoxlLiveTradeMonitor,
): void {
    const price = monitor.priceMonitoring;
    addMonitoringCalculation(accumulator, 'price.status', 'monitor.priceMonitoring.status', 'Price monitoring status', price.status, null, availabilityForStatus(price.status));
    addMonitoringCalculation(accumulator, 'price.source', 'monitor.priceMonitoring.source', 'Price monitoring source', price.source);
    addMonitoringCalculation(accumulator, 'price.current_completed_5m_price', 'monitor.priceMonitoring.currentPrice', 'Current completed five-minute price', price.currentPrice, 'usd');
    addMonitoringCalculation(accumulator, 'price.completed_candle_timestamp', 'monitor.priceMonitoring.currentPriceTimestamp', 'Current completed five-minute candle timestamp', price.currentPriceTimestamp, 'epoch_ms');
    addMonitoringCalculation(accumulator, 'price.entry_notional', 'monitor.priceMonitoring.entryNotional', 'Entry notional', price.entryNotional, 'usd');
    addMonitoringCalculation(accumulator, 'price.current_notional', 'monitor.priceMonitoring.currentNotional', 'Current notional', price.currentNotional, 'usd');
    addMonitoringCalculation(accumulator, 'price.price_move_per_unit', 'monitor.priceMonitoring.priceMovePerUnit', 'Price movement per unit', price.priceMovePerUnit, 'usd');
    addMonitoringCalculation(accumulator, 'price.gross_unrealized_pnl', 'monitor.priceMonitoring.grossUnrealizedPnl', 'Gross unrealized P&L', price.grossUnrealizedPnl, 'usd');
    addMonitoringCalculation(accumulator, 'price.estimated_net_unrealized_pnl', 'monitor.priceMonitoring.estimatedNetUnrealizedPnl', 'Estimated net unrealized P&L', price.estimatedNetUnrealizedPnl, 'usd');
    addMonitoringCalculation(accumulator, 'price.estimated_net_return_on_entry_notional', 'monitor.priceMonitoring.estimatedNetReturnOnEntryNotional', 'Estimated net return on entry notional', price.estimatedNetReturnOnEntryNotional, 'ratio');
    addMonitoringCalculation(accumulator, 'price.initial_risk_per_unit', 'monitor.priceMonitoring.initialRiskPerUnit', 'Initial risk per unit', price.initialRiskPerUnit, 'usd');
    addMonitoringCalculation(accumulator, 'price.move_in_initial_risk_units', 'monitor.priceMonitoring.priceMoveInInitialRiskUnits', 'Movement in initial-risk units', price.priceMoveInInitialRiskUnits, 'ratio');
    addMonitoringCalculation(accumulator, 'price.invalidation_level', 'monitor.priceMonitoring.invalidationPrice', 'Invalidation level', price.invalidationPrice, 'usd');
    addMonitoringCalculation(accumulator, 'price.invalidation_state', 'monitor.priceMonitoring.invalidationState', 'Invalidation state', price.invalidationState);
    addMonitoringCalculation(accumulator, 'price.remaining_invalidation_distance', 'monitor.priceMonitoring.remainingDistanceToInvalidationPerUnit', 'Remaining invalidation distance per unit', price.remainingDistanceToInvalidationPerUnit, 'usd');
}

function addQuantityMonitoringEvidence(
    accumulator: EvidenceAccumulator,
    monitor: SoxlLiveTradeMonitor,
): void {
    const quantity = monitor.quantityComparison;
    addMonitoringCalculation(accumulator, 'quantity.executed_quantity', 'monitor.quantityComparison.executedQuantity', 'Executed quantity', quantity.executedQuantity, 'shares');
    addMonitoringCalculation(accumulator, 'quantity.calculated_maximum_quantity', 'monitor.quantityComparison.calculatedMaximumQuantity', 'Calculated maximum quantity', quantity.calculatedMaximumQuantity, 'shares');
    addMonitoringCalculation(accumulator, 'quantity.usage_state', 'monitor.quantityComparison.quantityUsageState', 'Quantity usage state', quantity.quantityUsageState);
    addMonitoringCalculation(accumulator, 'quantity.difference', 'monitor.quantityComparison.quantityDifference', 'Quantity difference', quantity.quantityDifference, 'shares');
}

function addTargetMonitoringEvidence(
    accumulator: EvidenceAccumulator,
    target: SoxlTargetMonitoring,
): void {
    const key = `targets.${target.id}`;
    const path = `monitor.targets[id=${target.id}]`;
    addMonitoringCalculation(accumulator, `${key}.plan_status`, `${path}.planStatus`, 'Monitor target plan status', target.planStatus, null, availabilityForStatus(target.planStatus));
    addMonitoringCalculation(accumulator, `${key}.plan_issue`, `${path}.planIssue`, 'Monitor target plan issue', target.planIssue, null, availabilityForIssue(target.planIssue));
    addMonitoringCalculation(accumulator, `${key}.price`, `${path}.price`, 'Monitor target price', target.price, 'usd');
    addMonitoringCalculation(accumulator, `${key}.estimated_exit_fee`, `${path}.estimatedExitFee`, 'Monitor target estimated exit fee', target.estimatedExitFee, 'usd');
    addMonitoringCalculation(accumulator, `${key}.reward_per_unit`, `${path}.rewardPerUnit`, 'Monitor target reward per unit', target.rewardPerUnit, 'usd');
    addMonitoringCalculation(accumulator, `${key}.gross_hypothetical_profit_at_maximum_quantity`, `${path}.grossProfitAtMaximumQuantity`, 'Monitor target gross hypothetical profit at maximum quantity', target.grossProfitAtMaximumQuantity, 'usd');
    addMonitoringCalculation(accumulator, `${key}.estimated_hypothetical_net_profit_at_maximum_quantity`, `${path}.estimatedNetProfitAtMaximumQuantity`, 'Monitor target estimated hypothetical net profit at maximum quantity', target.estimatedNetProfitAtMaximumQuantity, 'usd');
    addMonitoringCalculation(accumulator, `${key}.price_reward_to_risk_multiple`, `${path}.priceRewardToRiskMultiple`, 'Monitor target price reward-to-risk multiple', target.priceRewardToRiskMultiple, 'ratio');
    addMonitoringCalculation(accumulator, `${key}.monitoring_status`, `${path}.monitoringStatus`, 'Monitor target monitoring status', target.monitoringStatus, null, availabilityForStatus(target.monitoringStatus));
    addMonitoringCalculation(accumulator, `${key}.target_state`, `${path}.targetState`, 'Monitor target state', target.targetState);
    addMonitoringCalculation(accumulator, `${key}.remaining_distance`, `${path}.remainingDistanceToTargetPerUnit`, 'Monitor target remaining distance per unit', target.remainingDistanceToTargetPerUnit, 'usd');
}

function addAssessmentComparisonEvidence(
    accumulator: EvidenceAccumulator,
    scenarios: readonly SoxlScenarioComparison[],
): void {
    scenarios.forEach((scenario) => {
        const sourcePath = `monitor.assessmentComparison.scenarios[id=${scenario.id}]`;
        addComparisonCounts(accumulator, `assessment.${scenario.id}`, sourcePath, scenario);
        scenario.sections.forEach((section) => addSectionComparisonEvidence(accumulator, scenario, section, `${sourcePath}.sections[id=${section.id}]`));
    });
}

function addSectionComparisonEvidence(
    accumulator: EvidenceAccumulator,
    scenario: SoxlScenarioComparison,
    section: SoxlSectionComparison,
    sourcePath: string,
): void {
    addComparisonCounts(accumulator, `assessment.${scenario.id}.${section.id}`, sourcePath, section);
    section.conditions.forEach((condition) => addConditionComparisonEvidence(accumulator, condition, `${sourcePath}.conditions[id=${condition.conditionId}]`));
}

function addConditionComparisonEvidence(
    accumulator: EvidenceAccumulator,
    condition: SoxlConditionComparison,
    sourcePath: string,
): void {
    const key = `assessment.${condition.scenarioId}.${condition.sectionId}.${condition.conditionId}`;
    addMonitoringCalculation(accumulator, `${key}.expected`, `${sourcePath}.expected`, 'Monitor condition expected value', condition.expected);
    addMonitoringCalculation(accumulator, `${key}.baseline_actual`, `${sourcePath}.baselineActual`, 'Monitor condition baseline actual value', condition.baselineActual, null, undefined, 'monitoring_baseline');
    addMonitoringCalculation(accumulator, `${key}.baseline_state`, `${sourcePath}.baselineState`, 'Monitor condition baseline state', condition.baselineState, null, undefined, 'monitoring_baseline');
    addMonitoringCalculation(accumulator, `${key}.current_actual`, `${sourcePath}.currentActual`, 'Monitor condition current actual value', condition.currentActual);
    addMonitoringCalculation(accumulator, `${key}.current_state`, `${sourcePath}.currentState`, 'Monitor condition current state', condition.currentState);
    addMonitoringCalculation(accumulator, `${key}.change_state`, `${sourcePath}.changeState`, 'Monitor condition change state', condition.changeState);
}

function addComparisonCounts(
    accumulator: EvidenceAccumulator,
    key: string,
    sourcePath: string,
    counts: SoxlConditionComparisonCounts,
): void {
    addMonitoringCalculation(accumulator, `${key}.unchanged_met_count`, `${sourcePath}.unchangedMetCount`, `${key} unchanged-met count`, counts.unchangedMetCount);
    addMonitoringCalculation(accumulator, `${key}.unchanged_not_met_count`, `${sourcePath}.unchangedNotMetCount`, `${key} unchanged-not-met count`, counts.unchangedNotMetCount);
    addMonitoringCalculation(accumulator, `${key}.unchanged_unknown_count`, `${sourcePath}.unchangedUnknownCount`, `${key} unchanged-unknown count`, counts.unchangedUnknownCount);
    addMonitoringCalculation(accumulator, `${key}.became_met_count`, `${sourcePath}.becameMetCount`, `${key} became-met count`, counts.becameMetCount);
    addMonitoringCalculation(accumulator, `${key}.became_not_met_count`, `${sourcePath}.becameNotMetCount`, `${key} became-not-met count`, counts.becameNotMetCount);
    addMonitoringCalculation(accumulator, `${key}.became_unknown_count`, `${sourcePath}.becameUnknownCount`, `${key} became-unknown count`, counts.becameUnknownCount);
    addMonitoringCalculation(accumulator, `${key}.changed_count`, `${sourcePath}.changedCount`, `${key} changed count`, counts.changedCount);
    addMonitoringCalculation(accumulator, `${key}.total_count`, `${sourcePath}.totalCount`, `${key} total count`, counts.totalCount);
}

function currentIdentity(facts: SoxlMarketFacts, assessment: SoxlMarketAssessment): SoxlAiSnapshotIdentity {
    return {
        role: 'current',
        providerId: facts.providerId,
        asOf: facts.asOf,
        factsStatus: facts.status,
        assessmentStatus: assessment.status,
        coreStatus: facts.coreStatus,
        sessionStatus: facts.sessionStatus,
        openingRangeComplete: assessment.openingRangeComplete,
        regularSessionComplete: assessment.regularSessionComplete,
    };
}

function planIdentity(plan: SoxlTradePlan): SoxlAiSnapshotIdentity {
    return {
        role: 'plan_context',
        providerId: plan.assessmentContext.providerId,
        asOf: plan.assessmentContext.asOf,
        factsStatus: plan.assessmentContext.factsStatus,
        assessmentStatus: plan.assessmentContext.status,
        coreStatus: plan.assessmentContext.coreStatus,
        sessionStatus: plan.assessmentContext.sessionStatus,
        openingRangeComplete: plan.assessmentContext.openingRangeComplete,
        regularSessionComplete: plan.assessmentContext.regularSessionComplete,
    };
}

function monitorBaselineIdentity(monitor: SoxlLiveTradeMonitor): SoxlAiSnapshotIdentity {
    return {
        role: 'monitoring_baseline',
        providerId: monitor.providerId,
        asOf: monitor.baselineAsOf,
        factsStatus: null,
        assessmentStatus: null,
        coreStatus: null,
        sessionStatus: null,
        openingRangeComplete: null,
        regularSessionComplete: null,
    };
}

function monitorCurrentIdentity(monitor: SoxlLiveTradeMonitor): SoxlAiSnapshotIdentity {
    return {
        role: 'monitoring_current',
        providerId: null,
        asOf: monitor.currentAsOf,
        factsStatus: monitor.currentFactsStatus,
        assessmentStatus: monitor.currentAssessmentStatus,
        coreStatus: null,
        sessionStatus: null,
        openingRangeComplete: null,
        regularSessionComplete: null,
    };
}

function currentIdentityMatches(input: BuildSoxlAiEvidenceInput): boolean {
    return input.facts.providerId === input.assessment.providerId
        && input.facts.asOf === input.assessment.asOf;
}

function hasUsableCurrentEvidence(input: BuildSoxlAiEvidenceInput): boolean {
    return input.facts.status !== 'unavailable'
        || input.assessment.status !== 'unavailable';
}

function packageStatus(
    issues: readonly SoxlAiEvidenceIssue[],
    accumulator: EvidenceAccumulator,
    input: BuildSoxlAiEvidenceInput,
): SoxlAiEvidencePackageStatus {
    if (
        issues.includes('current_snapshot_identity_mismatch')
        || issues.includes('no_current_market_evidence')
    ) {
        return 'unavailable';
    }

    if (
        input.facts.status !== 'available'
        || input.assessment.status !== 'available'
        || accumulator.groups.missingEvidence.length > 0
        || issues.length > 0
    ) {
        return 'partial';
    }

    return 'available';
}

export function buildSoxlAiEvidencePackage(
    input: BuildSoxlAiEvidenceInput,
): SoxlAiEvidencePackage {
    const accumulator = createAccumulator();
    const issues: SoxlAiEvidenceIssue[] = [];
    const snapshotIdentities: SoxlAiSnapshotIdentity[] = [currentIdentity(input.facts, input.assessment)];
    const hasCurrentIdentity = currentIdentityMatches(input);

    if (input.plan !== null) {
        snapshotIdentities.push(planIdentity(input.plan));
    }

    if (input.monitor !== null) {
        snapshotIdentities.push(monitorBaselineIdentity(input.monitor), monitorCurrentIdentity(input.monitor));
    }

    if (!hasCurrentIdentity) {
        addIssue(issues, 'current_snapshot_identity_mismatch');
        addMarketFact(accumulator, 'status', 'facts.status', 'Market facts status', input.facts.status, null, availabilityForStatus(input.facts.status));
        addMarketFact(accumulator, 'provider_id', 'facts.providerId', 'Provider ID', input.facts.providerId);
        addMarketFact(accumulator, 'as_of', 'facts.asOf', 'Snapshot timestamp', input.facts.asOf, 'epoch_ms');
        addAssessmentEvidence(accumulator, 'status', 'assessment.status', 'Assessment status', input.assessment.status, availabilityForStatus(input.assessment.status));
        addAssessmentEvidence(accumulator, 'provider_id', 'assessment.providerId', 'Assessment provider ID', input.assessment.providerId);
        addAssessmentEvidence(accumulator, 'as_of', 'assessment.asOf', 'Assessment snapshot timestamp', input.assessment.asOf);
    } else {
        if (!hasUsableCurrentEvidence(input)) {
            addIssue(issues, 'no_current_market_evidence');
        }

        addCurrentMarketFacts(accumulator, input.facts);
        addCurrentAssessment(accumulator, input.assessment);
    }

    if (input.plan !== null && hasCurrentIdentity) {
        addPlanEvidence(accumulator, input.plan, issues);
    }

    if (input.monitor !== null && hasCurrentIdentity) {
        addMonitoringEvidence(accumulator, input.monitor, input.facts, input.assessment, issues);
    }

    return {
        status: packageStatus(issues, accumulator, input),
        issues,
        snapshotIdentities,
        items: accumulator.items,
        groups: accumulator.groups,
    };
}
