import type {
    CandleSeriesErrorCode,
} from '../market-data/candle-types';
import type {
    IndicatorStatus,
    PriceLevelIssue,
    PriceLevelStatus,
    PriceRangeLevel,
    VolumeIndicatorIssue,
    VolumeIndicatorSeriesResult,
} from '../indicators';
import type {
    SoxlSessionAnalysisIssue,
    SoxlSessionAnalysisSnapshot,
    SoxlSessionAnalysisStatus,
    SoxlSessionCalculationStates,
} from './soxl-session-analysis';
import type {
    SoxlSessionDateRelation,
    SoxlSessionWindowIssue,
    SoxlSessionWindowStatus,
    UnixSecondWindow,
} from './soxl-session-windows';

export interface SoxlSessionWindowView {
    start: number;
    end: number;
}

export interface SoxlSessionWindowPlanView {
    status: SoxlSessionWindowStatus;
    issue: SoxlSessionWindowIssue | null;
    exchangeTimeZone: string;
    latestTradingDate: string | null;
    previousTradingDate: string | null;
    latestDateRelation: SoxlSessionDateRelation | null;
    latestRegularSession: SoxlSessionWindowView | null;
    previousRegularSession: SoxlSessionWindowView | null;
    latestOpeningRange30m: SoxlSessionWindowView | null;
    latestRegularSessionCompleted: boolean;
    latestOpeningRange30mCompleted: boolean;
}

export interface SoxlSessionSeriesValueView {
    status: IndicatorStatus | null;
    issue: VolumeIndicatorIssue | null;
    value: number | null;
    timestamp: number | null;
    requiredBars: number | null;
    usedBars: number | null;
    lookbackBars: number | null;
}

export interface SoxlSessionLevelView {
    status: PriceLevelStatus | null;
    issue: PriceLevelIssue | null;
    high: number | null;
    highTimestamp: number | null;
    low: number | null;
    lowTimestamp: number | null;
    usedBars: number | null;
}

export interface SoxlSessionAnalysisView {
    status: SoxlSessionAnalysisStatus;
    providerId: string;
    asOf: number;
    sourceStatus: SoxlSessionAnalysisSnapshot['sourceStatus'];
    sourceErrorCode: CandleSeriesErrorCode | null;
    sourceCandleCount: number;
    completedRegularCandleCount: number;
    latestCompletedTimestamp: number | null;
    latestCompletedClose: number | null;
    windowPlan: SoxlSessionWindowPlanView;
    calculationStates: SoxlSessionCalculationStates;
    vwap: SoxlSessionSeriesValueView;
    relativeVolume: SoxlSessionSeriesValueView;
    previousDayLevels: SoxlSessionLevelView;
    openingRange30mLevels: SoxlSessionLevelView;
    issue: SoxlSessionAnalysisIssue | null;
}

function copyWindow(window: UnixSecondWindow | null): SoxlSessionWindowView | null {
    if (window === null) {
        return null;
    }

    return {
        start: window.start,
        end: window.end,
    };
}

function getLatestSeriesValue(
    result: VolumeIndicatorSeriesResult | null,
    includeLookback: boolean,
): SoxlSessionSeriesValueView {
    if (result === null) {
        return {
            status: null,
            issue: null,
            value: null,
            timestamp: null,
            requiredBars: null,
            usedBars: null,
            lookbackBars: null,
        };
    }

    const latestPoint = result.status === 'available'
        ? result.values.at(-1) ?? null
        : null;
    const lookbackBars = includeLookback && result.requiredBars > 0
        ? result.requiredBars - 1
        : null;

    return {
        status: result.status,
        issue: result.issue ?? null,
        value: latestPoint?.value ?? null,
        timestamp: latestPoint?.timestamp ?? null,
        requiredBars: result.requiredBars,
        usedBars: result.usedBars,
        lookbackBars,
    };
}

function getLevelView(level: PriceRangeLevel | null): SoxlSessionLevelView {
    if (level === null) {
        return {
            status: null,
            issue: null,
            high: null,
            highTimestamp: null,
            low: null,
            lowTimestamp: null,
            usedBars: null,
        };
    }

    if (level.status !== 'available') {
        return {
            status: level.status,
            issue: level.issue ?? null,
            high: null,
            highTimestamp: null,
            low: null,
            lowTimestamp: null,
            usedBars: level.usedBars,
        };
    }

    return {
        status: level.status,
        issue: level.issue ?? null,
        high: level.high,
        highTimestamp: level.highTimestamp,
        low: level.low,
        lowTimestamp: level.lowTimestamp,
        usedBars: level.usedBars,
    };
}

export function buildSoxlSessionAnalysisView(
    snapshot: SoxlSessionAnalysisSnapshot,
): SoxlSessionAnalysisView {
    return {
        status: snapshot.status,
        providerId: snapshot.providerId,
        asOf: snapshot.asOf,
        sourceStatus: snapshot.sourceStatus,
        sourceErrorCode: snapshot.sourceErrorCode,
        sourceCandleCount: snapshot.sourceCandleCount,
        completedRegularCandleCount: snapshot.completedRegularCandleCount,
        latestCompletedTimestamp: snapshot.latestCompletedTimestamp,
        latestCompletedClose: snapshot.latestCompletedClose,
        windowPlan: {
            status: snapshot.windowPlan.status,
            issue: snapshot.windowPlan.issue,
            exchangeTimeZone: snapshot.windowPlan.exchangeTimeZone,
            latestTradingDate: snapshot.windowPlan.latestTradingDate,
            previousTradingDate: snapshot.windowPlan.previousTradingDate,
            latestDateRelation: snapshot.windowPlan.latestDateRelation,
            latestRegularSession: copyWindow(snapshot.windowPlan.latestRegularSession),
            previousRegularSession: copyWindow(snapshot.windowPlan.previousRegularSession),
            latestOpeningRange30m: copyWindow(snapshot.windowPlan.latestOpeningRange30m),
            latestRegularSessionCompleted: snapshot.windowPlan.latestRegularSessionCompleted,
            latestOpeningRange30mCompleted: snapshot.windowPlan.latestOpeningRange30mCompleted,
        },
        calculationStates: {
            vwap: { ...snapshot.calculationStates.vwap },
            relativeVolume: { ...snapshot.calculationStates.relativeVolume },
            previousDayLevels: { ...snapshot.calculationStates.previousDayLevels },
            openingRange30mLevels: { ...snapshot.calculationStates.openingRange30mLevels },
        },
        vwap: getLatestSeriesValue(snapshot.vwap, false),
        relativeVolume: getLatestSeriesValue(snapshot.relativeVolume, true),
        previousDayLevels: getLevelView(snapshot.previousDayLevels),
        openingRange30mLevels: getLevelView(snapshot.openingRange30mLevels),
        issue: snapshot.issue,
    };
}
