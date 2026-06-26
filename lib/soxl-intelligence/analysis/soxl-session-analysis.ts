import type {
    CandleSeries,
    CandleSeriesErrorCode,
    MarketCandle,
} from '../market-data/candle-types';
import type {
    SoxlMarketContextResult,
} from '../market-data/soxl-market-context';
import * as indicators from '../indicators';
import type {
    PriceRangeLevel,
    VolumeIndicatorSeriesResult,
} from '../indicators';
import * as sessionWindows from './soxl-session-windows';
import type {
    SoxlSessionWindowPlan,
} from './soxl-session-windows';

export type SoxlSessionAnalysisStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type SoxlSessionAnalysisIssue =
    | 'source_unavailable'
    | 'session_windows_unavailable'
    | 'calculation_failed';

export type SoxlSessionCalculationKey =
    | 'vwap'
    | 'relativeVolume'
    | 'previousDayLevels'
    | 'openingRange30mLevels';

export type SoxlSessionCalculationStatus =
    | 'available'
    | 'unavailable'
    | 'not_run'
    | 'failed';

export type SoxlSessionCalculationIssue =
    | 'session_windows_unavailable'
    | 'previous_session_unavailable'
    | 'calculation_failed';

export interface SoxlSessionCalculationState {
    status: SoxlSessionCalculationStatus;
    issue: SoxlSessionCalculationIssue | null;
}

export type SoxlSessionCalculationStates = Record<
    SoxlSessionCalculationKey,
    SoxlSessionCalculationState
>;

export interface SoxlSessionAnalysisSnapshot {
    status: SoxlSessionAnalysisStatus;
    asOf: number;
    providerId: string;

    windowPlan: SoxlSessionWindowPlan;

    sourceStatus: CandleSeries['status'];
    sourceErrorCode: CandleSeriesErrorCode | null;

    sourceCandleCount: number;
    completedRegularCandleCount: number;
    latestCompletedTimestamp: number | null;
    latestCompletedClose: number | null;

    vwap: VolumeIndicatorSeriesResult | null;
    relativeVolume: VolumeIndicatorSeriesResult | null;
    previousDayLevels: PriceRangeLevel | null;
    openingRange30mLevels: PriceRangeLevel | null;

    calculationStates: SoxlSessionCalculationStates;
    issue: SoxlSessionAnalysisIssue | null;
}

export const SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS = 3;

const BASE_CALCULATION_STATES: SoxlSessionCalculationStates = {
    vwap: { status: 'not_run', issue: null },
    relativeVolume: { status: 'not_run', issue: null },
    previousDayLevels: { status: 'not_run', issue: null },
    openingRange30mLevels: { status: 'not_run', issue: null },
};

function cloneCalculationStates(
    overrides: Partial<SoxlSessionCalculationStates> = {},
): SoxlSessionCalculationStates {
    return {
        vwap: overrides.vwap ?? BASE_CALCULATION_STATES.vwap,
        relativeVolume: overrides.relativeVolume ?? BASE_CALCULATION_STATES.relativeVolume,
        previousDayLevels: overrides.previousDayLevels ?? BASE_CALCULATION_STATES.previousDayLevels,
        openingRange30mLevels: overrides.openingRange30mLevels
            ?? BASE_CALCULATION_STATES.openingRange30mLevels,
    };
}

function getSourceErrorCode(source: CandleSeries): CandleSeriesErrorCode | null {
    return source.errorCode ?? null;
}

function getLatestCompletedRegularCandle(
    source: CandleSeries,
    asOf: number,
): MarketCandle | null {
    const matchingCandles = source.candles.filter((candle) => (
        candle.isComplete === true
        && candle.session === 'regular'
        && candle.timestamp <= asOf
    ));

    return matchingCandles.at(-1) ?? null;
}

function getSourceMetadata(
    source: CandleSeries,
    asOf: number,
    windowPlan: SoxlSessionWindowPlan,
): Pick<
    SoxlSessionAnalysisSnapshot,
    | 'sourceCandleCount'
    | 'completedRegularCandleCount'
    | 'latestCompletedTimestamp'
    | 'latestCompletedClose'
> {
    if (source.status !== 'available') {
        return {
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
        };
    }

    const latestCompletedCandle = getLatestCompletedRegularCandle(source, asOf);

    return {
        sourceCandleCount: source.candles.length,
        completedRegularCandleCount: windowPlan.completedRegularCandleCount,
        latestCompletedTimestamp: latestCompletedCandle?.timestamp ?? null,
        latestCompletedClose: latestCompletedCandle?.close ?? null,
    };
}

function createBaseSnapshot(input: {
    context: SoxlMarketContextResult;
    windowPlan: SoxlSessionWindowPlan;
    calculationStates?: SoxlSessionCalculationStates;
    issue: SoxlSessionAnalysisIssue | null;
    status: SoxlSessionAnalysisStatus;
}): SoxlSessionAnalysisSnapshot {
    const source = input.context.series.soxl5m;

    return {
        status: input.status,
        asOf: input.context.asOf,
        providerId: input.context.providerId,
        windowPlan: input.windowPlan,
        sourceStatus: source.status,
        sourceErrorCode: getSourceErrorCode(source),
        ...getSourceMetadata(source, input.context.asOf, input.windowPlan),
        vwap: null,
        relativeVolume: null,
        previousDayLevels: null,
        openingRange30mLevels: null,
        calculationStates: input.calculationStates ?? cloneCalculationStates(),
        issue: input.issue,
    };
}

function getVolumeCalculationState(
    result: VolumeIndicatorSeriesResult | null,
    failed: boolean,
): SoxlSessionCalculationState {
    if (failed) {
        return { status: 'failed', issue: 'calculation_failed' };
    }

    if (result?.status === 'available') {
        return { status: 'available', issue: null };
    }

    return { status: 'unavailable', issue: null };
}

function getLevelCalculationState(
    result: PriceRangeLevel | null,
    failed: boolean,
): SoxlSessionCalculationState {
    if (failed) {
        return { status: 'failed', issue: 'calculation_failed' };
    }

    if (result?.status === 'available') {
        return { status: 'available', issue: null };
    }

    return { status: 'unavailable', issue: null };
}

function safeCalculateVolume(
    calculate: () => VolumeIndicatorSeriesResult,
): { result: VolumeIndicatorSeriesResult | null; failed: boolean } {
    try {
        return {
            result: calculate(),
            failed: false,
        };
    } catch {
        return {
            result: null,
            failed: true,
        };
    }
}

function safeCalculateLevel(
    calculate: () => PriceRangeLevel,
): { result: PriceRangeLevel | null; failed: boolean } {
    try {
        return {
            result: calculate(),
            failed: false,
        };
    } catch {
        return {
            result: null,
            failed: true,
        };
    }
}

function getAggregateStatus(input: {
    windowPlan: SoxlSessionWindowPlan;
    vwap: VolumeIndicatorSeriesResult | null;
    relativeVolume: VolumeIndicatorSeriesResult | null;
    previousDayLevels: PriceRangeLevel | null;
    openingRange30mLevels: PriceRangeLevel | null;
}): SoxlSessionAnalysisStatus {
    const resultStatuses = [
        input.vwap?.status,
        input.relativeVolume?.status,
        input.previousDayLevels?.status,
        input.openingRange30mLevels?.status,
    ];
    const availableCount = resultStatuses.filter((status) => status === 'available').length;

    if (
        input.windowPlan.status === 'available'
        && availableCount === resultStatuses.length
    ) {
        return 'available';
    }

    if (availableCount > 0) {
        return 'partial';
    }

    return 'unavailable';
}

function hasCalculationFailure(
    states: SoxlSessionCalculationStates,
): boolean {
    return Object.values(states).some((state) => state.status === 'failed');
}

export function buildSoxlSessionAnalysisSnapshot(
    context: SoxlMarketContextResult,
): SoxlSessionAnalysisSnapshot {
    const windowPlan = sessionWindows.buildSoxlSessionWindowPlan(context);
    const source = context.series.soxl5m;

    if (source.status !== 'available') {
        return createBaseSnapshot({
            context,
            windowPlan,
            status: 'unavailable',
            issue: 'source_unavailable',
        });
    }

    if (windowPlan.status === 'unavailable') {
        return createBaseSnapshot({
            context,
            windowPlan,
            status: 'unavailable',
            issue: 'session_windows_unavailable',
            calculationStates: cloneCalculationStates({
                vwap: { status: 'not_run', issue: 'session_windows_unavailable' },
                relativeVolume: { status: 'not_run', issue: 'session_windows_unavailable' },
                previousDayLevels: { status: 'not_run', issue: 'session_windows_unavailable' },
                openingRange30mLevels: { status: 'not_run', issue: 'session_windows_unavailable' },
            }),
        });
    }

    const vwap = windowPlan.latestRegularSession === null
        ? { result: null, failed: false }
        : safeCalculateVolume(() => indicators.calculateSessionVwapSeries({
            candles: source.candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: context.asOf,
            session: 'regular',
            sessionStart: windowPlan.latestRegularSession!.start,
            sessionEnd: windowPlan.latestRegularSession!.end,
        }));
    const relativeVolume = windowPlan.latestRegularSession === null
        ? { result: null, failed: false }
        : safeCalculateVolume(() => indicators.calculateRelativeVolumeSeries({
            candles: source.candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: context.asOf,
            session: 'regular',
            sessionStart: windowPlan.latestRegularSession!.start,
            sessionEnd: windowPlan.latestRegularSession!.end,
            lookbackBars: SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS,
        }));
    const previousDayLevels = windowPlan.previousRegularSession === null
        ? { result: null, failed: false }
        : safeCalculateLevel(() => indicators.calculatePreviousDayLevels({
            candles: source.candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: context.asOf,
            window: windowPlan.previousRegularSession!,
        }));
    const openingRange30mLevels = windowPlan.latestOpeningRange30m === null
        ? { result: null, failed: false }
        : safeCalculateLevel(() => indicators.calculateOpeningRangeLevels({
            candles: source.candles,
            expectedSymbol: 'SOXL',
            expectedInterval: '5m',
            asOf: context.asOf,
            window: windowPlan.latestOpeningRange30m!,
            openingRangeMinutes: 30,
        }));
    const calculationStates = cloneCalculationStates({
        vwap: getVolumeCalculationState(vwap.result, vwap.failed),
        relativeVolume: getVolumeCalculationState(
            relativeVolume.result,
            relativeVolume.failed,
        ),
        previousDayLevels: windowPlan.previousRegularSession === null
            ? { status: 'not_run', issue: 'previous_session_unavailable' }
            : getLevelCalculationState(previousDayLevels.result, previousDayLevels.failed),
        openingRange30mLevels: getLevelCalculationState(
            openingRange30mLevels.result,
            openingRange30mLevels.failed,
        ),
    });
    const status = getAggregateStatus({
        windowPlan,
        vwap: vwap.result,
        relativeVolume: relativeVolume.result,
        previousDayLevels: previousDayLevels.result,
        openingRange30mLevels: openingRange30mLevels.result,
    });

    return {
        ...createBaseSnapshot({
            context,
            windowPlan,
            status,
            issue: hasCalculationFailure(calculationStates) ? 'calculation_failed' : null,
            calculationStates,
        }),
        vwap: vwap.result,
        relativeVolume: relativeVolume.result,
        previousDayLevels: previousDayLevels.result,
        openingRange30mLevels: openingRange30mLevels.result,
    };
}
