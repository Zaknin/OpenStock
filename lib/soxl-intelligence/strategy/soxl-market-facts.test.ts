import { describe, expect, it } from 'vitest';
import type {
    MarketFiveMinuteIndicatorSnapshot,
    SoxlCoreIndicatorSnapshot,
    SoxlDailyIndicatorSnapshot,
    SoxlFiveMinuteIndicatorSnapshot,
} from '../analysis/soxl-core-indicators';
import type {
    SoxlSessionAnalysisSnapshot,
} from '../analysis/soxl-session-analysis';
import type {
    SoxlSessionWindowPlan,
} from '../analysis/soxl-session-windows';
import type {
    IndicatorSeriesResult,
    MacdSeriesResult,
    PriceRangeLevel,
    SwingDetectionResult,
    SwingPoint,
    VolumeIndicatorSeriesResult,
} from '../indicators';
import {
    buildSoxlMarketFacts,
    compareNumbers,
    getNumericSign,
} from './soxl-market-facts';

const asOf = 1_782_400_000;
const providerId = 'manual-provider';
const soxl5mTime = 1_782_399_700;
const soxl5mClose = 100.123456789;

function indicator(
    value: number | null,
    time = soxl5mTime,
): IndicatorSeriesResult {
    return {
        status: value === null ? 'insufficient_history' : 'available',
        latest: {
            value,
            timestamp: value === null ? null : time,
            status: value === null ? 'insufficient_history' : 'available',
            requiredBars: 1,
            usedBars: value === null ? 0 : 1,
        },
        values: value === null ? [] : [{ value, timestamp: time }],
        requiredBars: 1,
        usedBars: value === null ? 0 : 1,
        validationIssues: [],
    };
}

function macd(
    line: number | null,
    signal: number | null,
    histogram: number | null,
    time = soxl5mTime,
): MacdSeriesResult {
    return {
        status: line === null ? 'insufficient_history' : 'available',
        latest: {
            macd: line,
            signal,
            histogram,
            timestamp: line === null ? null : time,
            status: line === null ? 'insufficient_history' : 'available',
            requiredBars: 1,
            usedBars: line === null ? 0 : 1,
        },
        values: line === null || signal === null || histogram === null
            ? []
            : [{ macd: line, signal, histogram, timestamp: time }],
        requiredBars: 1,
        usedBars: line === null ? 0 : 1,
        validationIssues: [],
    };
}

function swingPoint(
    type: 'high' | 'low',
    price: number,
    pivotTime: number,
): SwingPoint {
    return {
        type,
        price,
        pivotTimestamp: pivotTime,
        confirmedAtTimestamp: pivotTime + 900,
        pivotIndex: 1,
        confirmedAtIndex: 4,
    };
}

function swings(
    latestHigh: SwingPoint | null,
    latestLow: SwingPoint | null,
): SwingDetectionResult {
    return {
        status: latestHigh === null && latestLow === null ? 'insufficient_history' : 'available',
        swings: [latestHigh, latestLow].filter((point): point is SwingPoint => point !== null),
        latestHigh,
        latestLow,
        requiredBars: 7,
        usedBars: latestHigh === null && latestLow === null ? 0 : 20,
        validationIssues: [],
    };
}

function volume(
    value: number | null,
    time = soxl5mTime,
): VolumeIndicatorSeriesResult {
    return {
        ...indicator(value, time),
    };
}

function levels(
    high: number | null,
    low: number | null,
): PriceRangeLevel {
    return {
        high,
        low,
        highTimestamp: high === null ? null : soxl5mTime - 3_600,
        lowTimestamp: low === null ? null : soxl5mTime - 1_800,
        status: high === null || low === null ? 'insufficient_history' : 'available',
        usedBars: high === null || low === null ? 0 : 6,
        window: { start: soxl5mTime - 3_900, end: soxl5mTime },
        validationIssues: [],
    };
}

function windowPlan(overrides: Partial<SoxlSessionWindowPlan> = {}): SoxlSessionWindowPlan {
    return {
        status: 'available',
        asOf,
        exchangeTimeZone: 'America/New_York',
        latestTradingDate: '2026-06-26',
        previousTradingDate: '2026-06-25',
        latestDateRelation: 'same_exchange_date',
        latestRegularSession: { start: soxl5mTime - 10_000, end: soxl5mTime + 500 },
        previousRegularSession: { start: soxl5mTime - 90_000, end: soxl5mTime - 80_000 },
        latestOpeningRange30m: { start: soxl5mTime - 10_000, end: soxl5mTime - 8_200 },
        latestRegularSessionCompleted: false,
        latestOpeningRange30mCompleted: true,
        sourceCandleCount: 100,
        completedRegularCandleCount: 70,
        sourceErrorCode: null,
        issue: null,
        ...overrides,
    };
}

function soxl5m(
    overrides: Partial<SoxlFiveMinuteIndicatorSnapshot> = {},
): SoxlFiveMinuteIndicatorSnapshot {
    return {
        key: 'soxl5m',
        symbol: 'SOXL',
        interval: '5m',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 100,
        completedCandleCount: 70,
        latestCompletedTimestamp: soxl5mTime,
        latestCompletedClose: soxl5mClose,
        ema9: indicator(99),
        ema20: indicator(101),
        ema50: indicator(98),
        rsi14: indicator(54.123456789),
        atr14: indicator(2.987654321),
        macd12269: macd(1.5, 1.25, 0.25),
        swings333: swings(
            swingPoint('high', 105, soxl5mTime - 2_000),
            swingPoint('low', 95, soxl5mTime - 1_000),
        ),
        ...overrides,
    };
}

function soxlDaily(
    overrides: Partial<SoxlDailyIndicatorSnapshot> = {},
): SoxlDailyIndicatorSnapshot {
    return {
        key: 'soxl1d',
        symbol: 'SOXL',
        interval: '1d',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 300,
        completedCandleCount: 300,
        latestCompletedTimestamp: 1_782_259_200,
        latestCompletedClose: 250.555555555,
        ema20: indicator(240, 1_782_259_200),
        ema50: indicator(260, 1_782_259_200),
        ema200: indicator(200, 1_782_259_200),
        rsi14: indicator(49.987654321, 1_782_259_200),
        atr14: indicator(33.333333333, 1_782_259_200),
        macd12269: macd(-2, -1, -1, 1_782_259_200),
        swings333: swings(
            swingPoint('high', 300, 1_782_000_000),
            swingPoint('low', 150, 1_781_000_000),
        ),
        ...overrides,
    };
}

function market5m(
    symbol: 'QQQ' | 'SMH',
    close: number,
    overrides: Partial<MarketFiveMinuteIndicatorSnapshot> = {},
): MarketFiveMinuteIndicatorSnapshot {
    return {
        key: symbol === 'QQQ' ? 'qqq5m' : 'smh5m',
        symbol,
        interval: '5m',
        status: 'available',
        sourceStatus: 'available',
        sourceErrorCode: null,
        issue: null,
        sourceCandleCount: 100,
        completedCandleCount: 70,
        latestCompletedTimestamp: soxl5mTime,
        latestCompletedClose: close,
        ema20: indicator(close - 1),
        ema50: indicator(close + 1),
        rsi14: indicator(45.5),
        macd12269: macd(-0.5, -0.75, 0.25),
        ...overrides,
    };
}

function coreSnapshot(
    overrides: Partial<SoxlCoreIndicatorSnapshot> = {},
): SoxlCoreIndicatorSnapshot {
    const series = {
        soxl5m: soxl5m(),
        soxl1d: soxlDaily(),
        qqq5m: market5m('QQQ', 700),
        smh5m: market5m('SMH', 600),
        ...overrides.series,
    };

    return {
        status: 'available',
        asOf,
        providerId,
        series,
        availableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        partialSeries: [],
        unavailableSeries: [],
        ...overrides,
    };
}

function sessionSnapshot(
    overrides: Partial<SoxlSessionAnalysisSnapshot> = {},
): SoxlSessionAnalysisSnapshot {
    return {
        status: 'available',
        asOf,
        providerId,
        windowPlan: windowPlan(),
        sourceStatus: 'available',
        sourceErrorCode: null,
        sourceCandleCount: 100,
        completedRegularCandleCount: 70,
        latestCompletedTimestamp: soxl5mTime,
        latestCompletedClose: soxl5mClose,
        vwap: volume(99.5),
        relativeVolume: volume(1.23456789),
        previousDayLevels: levels(110, 90),
        openingRange30mLevels: levels(102, 97),
        calculationStates: {
            vwap: { status: 'available', issue: null },
            relativeVolume: { status: 'available', issue: null },
            previousDayLevels: { status: 'available', issue: null },
            openingRange30mLevels: { status: 'available', issue: null },
        },
        issue: null,
        ...overrides,
    };
}

describe('comparison helpers', () => {
    it('compares above, below, exact equality, null, and NaN operands', () => {
        expect(compareNumbers(2, 1)).toBe('above');
        expect(compareNumbers(1, 2)).toBe('below');
        expect(compareNumbers(2, 2)).toBe('equal');
        expect(compareNumbers(null, 2)).toBe('unavailable');
        expect(compareNumbers(Number.NaN, 2)).toBe('unavailable');
    });

    it('gets positive, negative, zero, and non-finite signs', () => {
        expect(getNumericSign(1)).toBe('positive');
        expect(getNumericSign(-1)).toBe('negative');
        expect(getNumericSign(0)).toBe('zero');
        expect(getNumericSign(Number.POSITIVE_INFINITY)).toBe('unavailable');
    });
});

describe('identity and source consistency', () => {
    it('proceeds when provider, asOf, and source metadata match', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        });

        expect(facts.status).toBe('available');
        expect(facts.issue).toBeNull();
    });

    it('returns snapshot_identity_mismatch for different providers or asOf values', () => {
        expect(buildSoxlMarketFacts({
            core: coreSnapshot({ providerId: 'other-provider' }),
            session: sessionSnapshot(),
        })).toMatchObject({
            status: 'unavailable',
            issue: 'snapshot_identity_mismatch',
            soxl5m: { latestCompleted: { close: null } },
        });

        expect(buildSoxlMarketFacts({
            core: coreSnapshot({ asOf: asOf + 1 }),
            session: sessionSnapshot(),
        }).issue).toBe('snapshot_identity_mismatch');
    });

    it('returns snapshot_source_mismatch for different SOXL latest time or close', () => {
        expect(buildSoxlMarketFacts({
            core: coreSnapshot({
                series: {
                    ...coreSnapshot().series,
                    soxl5m: soxl5m({ latestCompletedTimestamp: soxl5mTime - 300 }),
                },
            }),
            session: sessionSnapshot(),
        }).issue).toBe('snapshot_source_mismatch');

        expect(buildSoxlMarketFacts({
            core: coreSnapshot({
                series: {
                    ...coreSnapshot().series,
                    soxl5m: soxl5m({ latestCompletedClose: soxl5mClose + 1 }),
                },
            }),
            session: sessionSnapshot(),
        }).issue).toBe('snapshot_source_mismatch');
    });

    it('does not create a false mismatch when source metadata is null', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot({
                series: {
                    ...coreSnapshot().series,
                    soxl5m: soxl5m({
                        latestCompletedTimestamp: null,
                        latestCompletedClose: null,
                    }),
                },
            }),
            session: sessionSnapshot(),
        });

        expect(facts.issue).toBeNull();
        expect(facts.status).toBe('available');
    });
});

describe('SOXL intraday facts', () => {
    it('preserves raw values and derives only direct SOXL 5-minute relations', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        }).soxl5m;

        expect(facts.latestCompleted).toEqual({ close: soxl5mClose, time: soxl5mTime });
        expect(facts.ema9.value).toBe(99);
        expect(facts.ema20.value).toBe(101);
        expect(facts.ema50.value).toBe(98);
        expect(facts.rsi14.value).toBe(54.123456789);
        expect(facts.atr14.value).toBe(2.987654321);
        expect(facts.macd12269).toMatchObject({ line: 1.5, signal: 1.25, histogram: 0.25 });
        expect(facts.latestConfirmedSwingHigh.price).toBe(105);
        expect(facts.latestConfirmedSwingLow.price).toBe(95);
        expect(facts.closeVsEma9).toBe('above');
        expect(facts.closeVsEma20).toBe('below');
        expect(facts.closeVsEma50).toBe('above');
        expect(facts.ema9VsEma20).toBe('below');
        expect(facts.ema20VsEma50).toBe('above');
        expect(facts.macdLineVsSignal).toBe('above');
        expect(facts.macdHistogramSign).toBe('positive');
        expect(facts.closeVsLatestConfirmedSwingHigh).toBe('below');
        expect(facts.closeVsLatestConfirmedSwingLow).toBe('above');
    });

    it('returns unavailable swing comparisons when swings are missing', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot({
                series: {
                    ...coreSnapshot().series,
                    soxl5m: soxl5m({ swings333: swings(null, null) }),
                },
            }),
            session: sessionSnapshot(),
        }).soxl5m;

        expect(facts.latestConfirmedSwingHigh.price).toBeNull();
        expect(facts.latestConfirmedSwingLow.price).toBeNull();
        expect(facts.closeVsLatestConfirmedSwingHigh).toBe('unavailable');
        expect(facts.closeVsLatestConfirmedSwingLow).toBe('unavailable');
    });
});

describe('SOXL daily facts', () => {
    it('preserves raw daily values and direct relations without classifying RSI or ATR', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        }).soxlDaily;

        expect(facts.latestCompleted.close).toBe(250.555555555);
        expect(facts.ema20.value).toBe(240);
        expect(facts.ema50.value).toBe(260);
        expect(facts.ema200.value).toBe(200);
        expect(facts.rsi14).toEqual({ value: 49.987654321, time: 1_782_259_200 });
        expect(facts.atr14).toEqual({ value: 33.333333333, time: 1_782_259_200 });
        expect(facts.closeVsEma20).toBe('above');
        expect(facts.closeVsEma50).toBe('below');
        expect(facts.closeVsEma200).toBe('above');
        expect(facts.ema20VsEma50).toBe('below');
        expect(facts.ema50VsEma200).toBe('above');
        expect(facts.macdLineVsSignal).toBe('below');
        expect(facts.macdHistogramSign).toBe('negative');
        expect(facts.closeVsLatestConfirmedSwingHigh).toBe('below');
        expect(facts.closeVsLatestConfirmedSwingLow).toBe('above');
        expect(Object.keys(facts.rsi14)).toEqual(['value', 'time']);
        expect(Object.keys(facts.atr14)).toEqual(['value', 'time']);
    });
});

describe('QQQ and SMH facts', () => {
    it('preserves raw market values and direct relations without directional labels', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        });

        expect(facts.qqq5m).toMatchObject({
            symbol: 'QQQ',
            latestCompleted: { close: 700, time: soxl5mTime },
            ema20: { value: 699 },
            ema50: { value: 701 },
            rsi14: { value: 45.5 },
            macd12269: { line: -0.5, signal: -0.75, histogram: 0.25 },
            closeVsEma20: 'above',
            closeVsEma50: 'below',
            ema20VsEma50: 'below',
            macdLineVsSignal: 'above',
            macdHistogramSign: 'positive',
        });
        expect(facts.smh5m).toMatchObject({
            symbol: 'SMH',
            latestCompleted: { close: 600, time: soxl5mTime },
            closeVsEma20: 'above',
            closeVsEma50: 'below',
        });
    });
});

describe('regular-session facts', () => {
    it('preserves session facts and derives direct comparisons only', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        }).regularSession;

        expect(facts.latestCompleted).toEqual({ close: soxl5mClose, time: soxl5mTime });
        expect(facts.vwap).toEqual({ value: 99.5, time: soxl5mTime });
        expect(facts.rollingRelativeVolume).toEqual({ value: 1.23456789, time: soxl5mTime });
        expect(facts.previousRepresentedSession).toMatchObject({ high: 110, low: 90, usedBars: 6 });
        expect(facts.openingRange30m).toMatchObject({ high: 102, low: 97, usedBars: 6 });
        expect(facts.latestTradingDate).toBe('2026-06-26');
        expect(facts.previousTradingDate).toBe('2026-06-25');
        expect(facts.latestDateRelation).toBe('same_exchange_date');
        expect(facts.latestRegularSessionCompleted).toBe(false);
        expect(facts.openingRange30mCompleted).toBe(true);
        expect(facts.closeVsVwap).toBe('above');
        expect(facts.closeVsPreviousSessionHigh).toBe('below');
        expect(facts.closeVsPreviousSessionLow).toBe('above');
        expect(facts.closeVsOpeningRangeHigh).toBe('below');
        expect(facts.closeVsOpeningRangeLow).toBe('above');
    });

    it('returns unavailable comparisons for missing session levels', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot({
                previousDayLevels: levels(null, null),
                openingRange30mLevels: null,
            }),
        }).regularSession;

        expect(facts.closeVsPreviousSessionHigh).toBe('unavailable');
        expect(facts.closeVsPreviousSessionLow).toBe('unavailable');
        expect(facts.closeVsOpeningRangeHigh).toBe('unavailable');
        expect(facts.closeVsOpeningRangeLow).toBe('unavailable');
    });
});

describe('status behavior', () => {
    it('sets available, partial, and unavailable statuses from snapshot status and usable values', () => {
        expect(buildSoxlMarketFacts({
            core: coreSnapshot({ status: 'available' }),
            session: sessionSnapshot({ status: 'available' }),
        }).status).toBe('available');

        expect(buildSoxlMarketFacts({
            core: coreSnapshot({ status: 'available' }),
            session: sessionSnapshot({ status: 'partial' }),
        }).status).toBe('partial');

        expect(buildSoxlMarketFacts({
            core: coreSnapshot({ status: 'partial' }),
            session: sessionSnapshot({ status: 'unavailable' }),
        }).status).toBe('partial');
    });

    it('sets no_comparable_data for two unavailable snapshots or no finite values', () => {
        const unavailableCore = coreSnapshot({
            status: 'unavailable',
            series: {
                soxl5m: soxl5m({
                    status: 'unavailable',
                    latestCompletedTimestamp: null,
                    latestCompletedClose: null,
                    ema9: indicator(null),
                    ema20: indicator(null),
                    ema50: indicator(null),
                    rsi14: indicator(null),
                    atr14: indicator(null),
                    macd12269: macd(null, null, null),
                    swings333: swings(null, null),
                }),
                soxl1d: soxlDaily({
                    status: 'unavailable',
                    latestCompletedTimestamp: null,
                    latestCompletedClose: null,
                    ema20: indicator(null),
                    ema50: indicator(null),
                    ema200: indicator(null),
                    rsi14: indicator(null),
                    atr14: indicator(null),
                    macd12269: macd(null, null, null),
                    swings333: swings(null, null),
                }),
                qqq5m: market5m('QQQ', Number.NaN, {
                    status: 'unavailable',
                    latestCompletedTimestamp: null,
                    latestCompletedClose: null,
                    ema20: indicator(null),
                    ema50: indicator(null),
                    rsi14: indicator(null),
                    macd12269: macd(null, null, null),
                }),
                smh5m: market5m('SMH', Number.NaN, {
                    status: 'unavailable',
                    latestCompletedTimestamp: null,
                    latestCompletedClose: null,
                    ema20: indicator(null),
                    ema50: indicator(null),
                    rsi14: indicator(null),
                    macd12269: macd(null, null, null),
                }),
            },
            availableSeries: [],
            partialSeries: [],
            unavailableSeries: ['soxl5m', 'soxl1d', 'qqq5m', 'smh5m'],
        });
        const unavailableSession = sessionSnapshot({
            status: 'unavailable',
            latestCompletedTimestamp: null,
            latestCompletedClose: null,
            vwap: volume(null),
            relativeVolume: volume(null),
            previousDayLevels: levels(null, null),
            openingRange30mLevels: null,
        });
        const facts = buildSoxlMarketFacts({
            core: unavailableCore,
            session: unavailableSession,
        });

        expect(facts).toMatchObject({
            status: 'unavailable',
            issue: 'no_comparable_data',
        });
    });
});

describe('determinism and safety', () => {
    it('is deterministic, preserves precision, and does not mutate inputs', () => {
        const core = coreSnapshot();
        const session = sessionSnapshot();
        const before = JSON.stringify({ core, session });
        const first = buildSoxlMarketFacts({ core, session });
        const second = buildSoxlMarketFacts({ core, session });

        expect(second).toEqual(first);
        expect(JSON.stringify({ core, session })).toBe(before);
        expect(first.soxl5m.latestCompleted.close).toBe(100.123456789);
        expect(first.regularSession.rollingRelativeVolume.value).toBe(1.23456789);
    });

    it('does not copy raw provider messages or expose prohibited strategy terms', () => {
        const facts = buildSoxlMarketFacts({
            core: coreSnapshot(),
            session: sessionSnapshot(),
        });
        const serialized = JSON.stringify(facts).toLowerCase();
        const prohibited = [
            'bullish',
            'bearish',
            'buy',
            'sell',
            'long',
            'short',
            'entry',
            'exit',
            'stop',
            'target',
            'score',
            'recommendation',
            'overbought',
            'oversold',
            'strong',
            'weak',
            'breakout',
            'breakdown',
            'risk-on',
            'risk-off',
            'provider exception',
            'stacktrace',
        ];

        prohibited.forEach((term) => {
            expect(serialized).not.toContain(term);
        });
    });
});
