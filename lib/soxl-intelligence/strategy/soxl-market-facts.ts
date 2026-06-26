import type {
    MarketFiveMinuteIndicatorSnapshot,
    SoxlCoreIndicatorSnapshot,
    SoxlCoreIndicatorStatus,
    SoxlDailyIndicatorSnapshot,
    SoxlFiveMinuteIndicatorSnapshot,
} from '../analysis/soxl-core-indicators';
import type {
    SoxlSessionAnalysisSnapshot,
    SoxlSessionAnalysisStatus,
} from '../analysis/soxl-session-analysis';
import type {
    SoxlSessionDateRelation,
} from '../analysis/soxl-session-windows';
import type {
    IndicatorSeriesResult,
    MacdSeriesResult,
    PriceRangeLevel,
    SwingPoint,
    VolumeIndicatorSeriesResult,
} from '../indicators';

export type SoxlMarketFactsStatus =
    | 'available'
    | 'partial'
    | 'unavailable';

export type NumericRelation =
    | 'above'
    | 'below'
    | 'equal'
    | 'unavailable';

export type NumericSign =
    | 'positive'
    | 'negative'
    | 'zero'
    | 'unavailable';

export type SoxlMarketFactsIssue =
    | 'snapshot_identity_mismatch'
    | 'snapshot_source_mismatch'
    | 'no_comparable_data';

export interface BuildSoxlMarketFactsInput {
    core: SoxlCoreIndicatorSnapshot;
    session: SoxlSessionAnalysisSnapshot;
}

export interface LatestCompletedFact {
    close: number | null;
    time: number | null;
}

export interface IndicatorLatestFact {
    value: number | null;
    time: number | null;
}

export interface MacdLatestFact {
    line: number | null;
    signal: number | null;
    histogram: number | null;
    time: number | null;
}

export interface SwingLatestFact {
    price: number | null;
    pivotTime: number | null;
    confirmedAtTime: number | null;
}

export interface SoxlFiveMinuteFacts {
    status: SoxlFiveMinuteIndicatorSnapshot['status'];
    latestCompleted: LatestCompletedFact;
    ema9: IndicatorLatestFact;
    ema20: IndicatorLatestFact;
    ema50: IndicatorLatestFact;
    rsi14: IndicatorLatestFact;
    atr14: IndicatorLatestFact;
    macd12269: MacdLatestFact;
    latestConfirmedSwingHigh: SwingLatestFact;
    latestConfirmedSwingLow: SwingLatestFact;
    closeVsEma9: NumericRelation;
    closeVsEma20: NumericRelation;
    closeVsEma50: NumericRelation;
    ema9VsEma20: NumericRelation;
    ema20VsEma50: NumericRelation;
    macdLineVsSignal: NumericRelation;
    macdHistogramSign: NumericSign;
    closeVsLatestConfirmedSwingHigh: NumericRelation;
    closeVsLatestConfirmedSwingLow: NumericRelation;
}

export interface SoxlDailyFacts {
    status: SoxlDailyIndicatorSnapshot['status'];
    latestCompleted: LatestCompletedFact;
    ema20: IndicatorLatestFact;
    ema50: IndicatorLatestFact;
    ema200: IndicatorLatestFact;
    rsi14: IndicatorLatestFact;
    atr14: IndicatorLatestFact;
    macd12269: MacdLatestFact;
    latestConfirmedSwingHigh: SwingLatestFact;
    latestConfirmedSwingLow: SwingLatestFact;
    closeVsEma20: NumericRelation;
    closeVsEma50: NumericRelation;
    closeVsEma200: NumericRelation;
    ema20VsEma50: NumericRelation;
    ema50VsEma200: NumericRelation;
    macdLineVsSignal: NumericRelation;
    macdHistogramSign: NumericSign;
    closeVsLatestConfirmedSwingHigh: NumericRelation;
    closeVsLatestConfirmedSwingLow: NumericRelation;
}

export interface MarketFiveMinuteFacts {
    status: MarketFiveMinuteIndicatorSnapshot['status'];
    symbol: 'QQQ' | 'SMH';
    latestCompleted: LatestCompletedFact;
    ema20: IndicatorLatestFact;
    ema50: IndicatorLatestFact;
    rsi14: IndicatorLatestFact;
    macd12269: MacdLatestFact;
    closeVsEma20: NumericRelation;
    closeVsEma50: NumericRelation;
    ema20VsEma50: NumericRelation;
    macdLineVsSignal: NumericRelation;
    macdHistogramSign: NumericSign;
}

export interface PriceLevelFacts {
    high: number | null;
    highTime: number | null;
    low: number | null;
    lowTime: number | null;
    status: PriceRangeLevel['status'] | 'unavailable';
    usedBars: number;
}

export interface RegularSessionFacts {
    status: SoxlSessionAnalysisStatus;
    latestCompleted: LatestCompletedFact;
    vwap: IndicatorLatestFact;
    rollingRelativeVolume: IndicatorLatestFact;
    previousRepresentedSession: PriceLevelFacts;
    openingRange30m: PriceLevelFacts;
    latestTradingDate: string | null;
    previousTradingDate: string | null;
    latestDateRelation: SoxlSessionDateRelation | null;
    latestRegularSessionCompleted: boolean;
    openingRange30mCompleted: boolean;
    closeVsVwap: NumericRelation;
    closeVsPreviousSessionHigh: NumericRelation;
    closeVsPreviousSessionLow: NumericRelation;
    closeVsOpeningRangeHigh: NumericRelation;
    closeVsOpeningRangeLow: NumericRelation;
}

export interface SoxlMarketFacts {
    status: SoxlMarketFactsStatus;
    issue: SoxlMarketFactsIssue | null;
    providerId: string | null;
    asOf: number | null;
    coreStatus: SoxlCoreIndicatorStatus;
    sessionStatus: SoxlSessionAnalysisStatus;
    soxl5m: SoxlFiveMinuteFacts;
    soxlDaily: SoxlDailyFacts;
    qqq5m: MarketFiveMinuteFacts;
    smh5m: MarketFiveMinuteFacts;
    regularSession: RegularSessionFacts;
}

export function compareNumbers(
    left: number | null,
    right: number | null,
): NumericRelation {
    if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
        return 'unavailable';
    }

    if (left > right) {
        return 'above';
    }

    if (left < right) {
        return 'below';
    }

    return 'equal';
}

export function getNumericSign(value: number | null): NumericSign {
    if (!isFiniteNumber(value)) {
        return 'unavailable';
    }

    if (value > 0) {
        return 'positive';
    }

    if (value < 0) {
        return 'negative';
    }

    return 'zero';
}

export function buildSoxlMarketFacts(
    input: BuildSoxlMarketFactsInput,
): SoxlMarketFacts {
    const { core, session } = input;

    if (
        core.asOf !== session.asOf
        || core.providerId !== session.providerId
    ) {
        return createUnavailableFacts({
            coreStatus: core.status,
            sessionStatus: session.status,
            issue: 'snapshot_identity_mismatch',
            providerId: null,
            asOf: null,
        });
    }

    if (hasSoxlSourceMismatch(core, session)) {
        return createUnavailableFacts({
            coreStatus: core.status,
            sessionStatus: session.status,
            issue: 'snapshot_source_mismatch',
            providerId: core.providerId,
            asOf: core.asOf,
        });
    }

    const facts: SoxlMarketFacts = {
        status: 'unavailable',
        issue: null,
        providerId: core.providerId,
        asOf: core.asOf,
        coreStatus: core.status,
        sessionStatus: session.status,
        soxl5m: buildSoxlFiveMinuteFacts(core.series.soxl5m),
        soxlDaily: buildSoxlDailyFacts(core.series.soxl1d),
        qqq5m: buildMarketFiveMinuteFacts(core.series.qqq5m),
        smh5m: buildMarketFiveMinuteFacts(core.series.smh5m),
        regularSession: buildRegularSessionFacts(session),
    };
    const hasComparableData = containsComparableData(facts);

    if (!hasComparableData) {
        return {
            ...facts,
            status: 'unavailable',
            issue: 'no_comparable_data',
        };
    }

    if (core.status === 'available' && session.status === 'available') {
        return {
            ...facts,
            status: 'available',
        };
    }

    if (core.status !== 'unavailable' || session.status !== 'unavailable') {
        return {
            ...facts,
            status: 'partial',
        };
    }

    return {
        ...facts,
        status: 'unavailable',
        issue: 'no_comparable_data',
    };
}

function hasSoxlSourceMismatch(
    core: SoxlCoreIndicatorSnapshot,
    session: SoxlSessionAnalysisSnapshot,
): boolean {
    const coreTime = core.series.soxl5m.latestCompletedTimestamp;
    const sessionTime = session.latestCompletedTimestamp;
    const coreClose = core.series.soxl5m.latestCompletedClose;
    const sessionClose = session.latestCompletedClose;

    if (
        coreTime === null
        || sessionTime === null
        || coreClose === null
        || sessionClose === null
    ) {
        return false;
    }

    return coreTime !== sessionTime || coreClose !== sessionClose;
}

function buildSoxlFiveMinuteFacts(
    series: SoxlFiveMinuteIndicatorSnapshot,
): SoxlFiveMinuteFacts {
    const close = series.latestCompletedClose;
    const ema9 = getIndicatorLatest(series.ema9);
    const ema20 = getIndicatorLatest(series.ema20);
    const ema50 = getIndicatorLatest(series.ema50);
    const macd = getMacdLatest(series.macd12269);
    const swingHigh = getSwingLatest(series.swings333?.latestHigh ?? null);
    const swingLow = getSwingLatest(series.swings333?.latestLow ?? null);

    return {
        status: series.status,
        latestCompleted: {
            close,
            time: series.latestCompletedTimestamp,
        },
        ema9,
        ema20,
        ema50,
        rsi14: getIndicatorLatest(series.rsi14),
        atr14: getIndicatorLatest(series.atr14),
        macd12269: macd,
        latestConfirmedSwingHigh: swingHigh,
        latestConfirmedSwingLow: swingLow,
        closeVsEma9: compareNumbers(close, ema9.value),
        closeVsEma20: compareNumbers(close, ema20.value),
        closeVsEma50: compareNumbers(close, ema50.value),
        ema9VsEma20: compareNumbers(ema9.value, ema20.value),
        ema20VsEma50: compareNumbers(ema20.value, ema50.value),
        macdLineVsSignal: compareNumbers(macd.line, macd.signal),
        macdHistogramSign: getNumericSign(macd.histogram),
        closeVsLatestConfirmedSwingHigh: compareNumbers(close, swingHigh.price),
        closeVsLatestConfirmedSwingLow: compareNumbers(close, swingLow.price),
    };
}

function buildSoxlDailyFacts(
    series: SoxlDailyIndicatorSnapshot,
): SoxlDailyFacts {
    const close = series.latestCompletedClose;
    const ema20 = getIndicatorLatest(series.ema20);
    const ema50 = getIndicatorLatest(series.ema50);
    const ema200 = getIndicatorLatest(series.ema200);
    const macd = getMacdLatest(series.macd12269);
    const swingHigh = getSwingLatest(series.swings333?.latestHigh ?? null);
    const swingLow = getSwingLatest(series.swings333?.latestLow ?? null);

    return {
        status: series.status,
        latestCompleted: {
            close,
            time: series.latestCompletedTimestamp,
        },
        ema20,
        ema50,
        ema200,
        rsi14: getIndicatorLatest(series.rsi14),
        atr14: getIndicatorLatest(series.atr14),
        macd12269: macd,
        latestConfirmedSwingHigh: swingHigh,
        latestConfirmedSwingLow: swingLow,
        closeVsEma20: compareNumbers(close, ema20.value),
        closeVsEma50: compareNumbers(close, ema50.value),
        closeVsEma200: compareNumbers(close, ema200.value),
        ema20VsEma50: compareNumbers(ema20.value, ema50.value),
        ema50VsEma200: compareNumbers(ema50.value, ema200.value),
        macdLineVsSignal: compareNumbers(macd.line, macd.signal),
        macdHistogramSign: getNumericSign(macd.histogram),
        closeVsLatestConfirmedSwingHigh: compareNumbers(close, swingHigh.price),
        closeVsLatestConfirmedSwingLow: compareNumbers(close, swingLow.price),
    };
}

function buildMarketFiveMinuteFacts(
    series: MarketFiveMinuteIndicatorSnapshot,
): MarketFiveMinuteFacts {
    const close = series.latestCompletedClose;
    const ema20 = getIndicatorLatest(series.ema20);
    const ema50 = getIndicatorLatest(series.ema50);
    const macd = getMacdLatest(series.macd12269);

    return {
        status: series.status,
        symbol: series.symbol,
        latestCompleted: {
            close,
            time: series.latestCompletedTimestamp,
        },
        ema20,
        ema50,
        rsi14: getIndicatorLatest(series.rsi14),
        macd12269: macd,
        closeVsEma20: compareNumbers(close, ema20.value),
        closeVsEma50: compareNumbers(close, ema50.value),
        ema20VsEma50: compareNumbers(ema20.value, ema50.value),
        macdLineVsSignal: compareNumbers(macd.line, macd.signal),
        macdHistogramSign: getNumericSign(macd.histogram),
    };
}

function buildRegularSessionFacts(
    session: SoxlSessionAnalysisSnapshot,
): RegularSessionFacts {
    const close = session.latestCompletedClose;
    const vwap = getVolumeLatest(session.vwap);
    const previousLevels = getPriceLevelFacts(session.previousDayLevels);
    const openingRange = getPriceLevelFacts(session.openingRange30mLevels);

    return {
        status: session.status,
        latestCompleted: {
            close,
            time: session.latestCompletedTimestamp,
        },
        vwap,
        rollingRelativeVolume: getVolumeLatest(session.relativeVolume),
        previousRepresentedSession: previousLevels,
        openingRange30m: openingRange,
        latestTradingDate: session.windowPlan.latestTradingDate,
        previousTradingDate: session.windowPlan.previousTradingDate,
        latestDateRelation: session.windowPlan.latestDateRelation,
        latestRegularSessionCompleted: session.windowPlan.latestRegularSessionCompleted,
        openingRange30mCompleted: session.windowPlan.latestOpeningRange30mCompleted,
        closeVsVwap: compareNumbers(close, vwap.value),
        closeVsPreviousSessionHigh: compareNumbers(close, previousLevels.high),
        closeVsPreviousSessionLow: compareNumbers(close, previousLevels.low),
        closeVsOpeningRangeHigh: compareNumbers(close, openingRange.high),
        closeVsOpeningRangeLow: compareNumbers(close, openingRange.low),
    };
}

function getIndicatorLatest(
    result: IndicatorSeriesResult | null,
): IndicatorLatestFact {
    return {
        value: getFiniteOrNull(result?.latest.value ?? null),
        time: result?.latest.timestamp ?? null,
    };
}

function getVolumeLatest(
    result: VolumeIndicatorSeriesResult | null,
): IndicatorLatestFact {
    return getIndicatorLatest(result);
}

function getMacdLatest(
    result: MacdSeriesResult | null,
): MacdLatestFact {
    return {
        line: getFiniteOrNull(result?.latest.macd ?? null),
        signal: getFiniteOrNull(result?.latest.signal ?? null),
        histogram: getFiniteOrNull(result?.latest.histogram ?? null),
        time: result?.latest.timestamp ?? null,
    };
}

function getSwingLatest(point: SwingPoint | null): SwingLatestFact {
    return {
        price: getFiniteOrNull(point?.price ?? null),
        pivotTime: point?.pivotTimestamp ?? null,
        confirmedAtTime: point?.confirmedAtTimestamp ?? null,
    };
}

function getPriceLevelFacts(level: PriceRangeLevel | null): PriceLevelFacts {
    return {
        high: getFiniteOrNull(level?.high ?? null),
        highTime: level?.highTimestamp ?? null,
        low: getFiniteOrNull(level?.low ?? null),
        lowTime: level?.lowTimestamp ?? null,
        status: level?.status ?? 'unavailable',
        usedBars: level?.usedBars ?? 0,
    };
}

function getFiniteOrNull(value: number | null): number | null {
    return isFiniteNumber(value) ? value : null;
}

function isFiniteNumber(value: number | null): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function containsComparableData(value: unknown): boolean {
    if (isFiniteNumberOrAvailableComparison(value)) {
        return true;
    }

    if (Array.isArray(value)) {
        return value.some((item) => containsComparableData(item));
    }

    if (value !== null && typeof value === 'object') {
        return Object.entries(value).some(([key, item]) => (
            key !== 'asOf'
            && key !== 'providerId'
            && key !== 'coreStatus'
            && key !== 'sessionStatus'
            && containsComparableData(item)
        ));
    }

    return false;
}

function isFiniteNumberOrAvailableComparison(value: unknown): boolean {
    return (
        (typeof value === 'number' && Number.isFinite(value))
        || value === 'above'
        || value === 'below'
        || value === 'equal'
        || value === 'positive'
        || value === 'negative'
        || value === 'zero'
    );
}

function createUnavailableFacts(input: {
    coreStatus: SoxlCoreIndicatorStatus;
    sessionStatus: SoxlSessionAnalysisStatus;
    issue: SoxlMarketFactsIssue;
    providerId: string | null;
    asOf: number | null;
}): SoxlMarketFacts {
    return {
        status: 'unavailable',
        issue: input.issue,
        providerId: input.providerId,
        asOf: input.asOf,
        coreStatus: input.coreStatus,
        sessionStatus: input.sessionStatus,
        soxl5m: createUnavailableSoxlFiveMinuteFacts(),
        soxlDaily: createUnavailableSoxlDailyFacts(),
        qqq5m: createUnavailableMarketFiveMinuteFacts('QQQ'),
        smh5m: createUnavailableMarketFiveMinuteFacts('SMH'),
        regularSession: createUnavailableRegularSessionFacts(),
    };
}

function createUnavailableSoxlFiveMinuteFacts(): SoxlFiveMinuteFacts {
    const latestCompleted = createLatestCompletedFact();
    const indicator = createIndicatorLatestFact();
    const macd = createMacdLatestFact();
    const swing = createSwingLatestFact();

    return {
        status: 'unavailable',
        latestCompleted,
        ema9: indicator,
        ema20: indicator,
        ema50: indicator,
        rsi14: indicator,
        atr14: indicator,
        macd12269: macd,
        latestConfirmedSwingHigh: swing,
        latestConfirmedSwingLow: swing,
        closeVsEma9: 'unavailable',
        closeVsEma20: 'unavailable',
        closeVsEma50: 'unavailable',
        ema9VsEma20: 'unavailable',
        ema20VsEma50: 'unavailable',
        macdLineVsSignal: 'unavailable',
        macdHistogramSign: 'unavailable',
        closeVsLatestConfirmedSwingHigh: 'unavailable',
        closeVsLatestConfirmedSwingLow: 'unavailable',
    };
}

function createUnavailableSoxlDailyFacts(): SoxlDailyFacts {
    const latestCompleted = createLatestCompletedFact();
    const indicator = createIndicatorLatestFact();
    const macd = createMacdLatestFact();
    const swing = createSwingLatestFact();

    return {
        status: 'unavailable',
        latestCompleted,
        ema20: indicator,
        ema50: indicator,
        ema200: indicator,
        rsi14: indicator,
        atr14: indicator,
        macd12269: macd,
        latestConfirmedSwingHigh: swing,
        latestConfirmedSwingLow: swing,
        closeVsEma20: 'unavailable',
        closeVsEma50: 'unavailable',
        closeVsEma200: 'unavailable',
        ema20VsEma50: 'unavailable',
        ema50VsEma200: 'unavailable',
        macdLineVsSignal: 'unavailable',
        macdHistogramSign: 'unavailable',
        closeVsLatestConfirmedSwingHigh: 'unavailable',
        closeVsLatestConfirmedSwingLow: 'unavailable',
    };
}

function createUnavailableMarketFiveMinuteFacts(
    symbol: 'QQQ' | 'SMH',
): MarketFiveMinuteFacts {
    const latestCompleted = createLatestCompletedFact();
    const indicator = createIndicatorLatestFact();
    const macd = createMacdLatestFact();

    return {
        status: 'unavailable',
        symbol,
        latestCompleted,
        ema20: indicator,
        ema50: indicator,
        rsi14: indicator,
        macd12269: macd,
        closeVsEma20: 'unavailable',
        closeVsEma50: 'unavailable',
        ema20VsEma50: 'unavailable',
        macdLineVsSignal: 'unavailable',
        macdHistogramSign: 'unavailable',
    };
}

function createUnavailableRegularSessionFacts(): RegularSessionFacts {
    const latestCompleted = createLatestCompletedFact();
    const indicator = createIndicatorLatestFact();
    const levels = createPriceLevelFacts();

    return {
        status: 'unavailable',
        latestCompleted,
        vwap: indicator,
        rollingRelativeVolume: indicator,
        previousRepresentedSession: levels,
        openingRange30m: levels,
        latestTradingDate: null,
        previousTradingDate: null,
        latestDateRelation: null,
        latestRegularSessionCompleted: false,
        openingRange30mCompleted: false,
        closeVsVwap: 'unavailable',
        closeVsPreviousSessionHigh: 'unavailable',
        closeVsPreviousSessionLow: 'unavailable',
        closeVsOpeningRangeHigh: 'unavailable',
        closeVsOpeningRangeLow: 'unavailable',
    };
}

function createLatestCompletedFact(): LatestCompletedFact {
    return {
        close: null,
        time: null,
    };
}

function createIndicatorLatestFact(): IndicatorLatestFact {
    return {
        value: null,
        time: null,
    };
}

function createMacdLatestFact(): MacdLatestFact {
    return {
        line: null,
        signal: null,
        histogram: null,
        time: null,
    };
}

function createSwingLatestFact(): SwingLatestFact {
    return {
        price: null,
        pivotTime: null,
        confirmedAtTime: null,
    };
}

function createPriceLevelFacts(): PriceLevelFacts {
    return {
        high: null,
        highTime: null,
        low: null,
        lowTime: null,
        status: 'unavailable',
        usedBars: 0,
    };
}
