import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    buildSoxlSessionWindowPlan,
} from '@/lib/soxl-intelligence/analysis/soxl-session-windows';
import type {
    CandleInterval,
    CandleSeries,
    CandleSeriesErrorCode,
    CandleSymbol,
    MarketCandle,
    MarketSession,
} from '@/lib/soxl-intelligence/market-data/candle-types';
import type {
    SoxlMarketContextResult,
} from '@/lib/soxl-intelligence/market-data/soxl-market-context';

const SUMMER_FRI_2026_07_03_0930_ET = 1_783_085_400;
const SUMMER_FRI_2026_07_03_1015_ET = 1_783_088_100;
const SUMMER_MON_2026_07_06_0930_ET = 1_783_344_600;
const SUMMER_MON_2026_07_06_0955_ET = 1_783_346_100;
const SUMMER_MON_2026_07_06_1000_ET = 1_783_346_400;
const SUMMER_MON_2026_07_06_1015_ET = 1_783_347_300;
const SUMMER_MON_2026_07_06_1600_ET = 1_783_368_000;
const SUMMER_TUE_2026_07_07_0800_ET = 1_783_425_600;
const SUMMER_TUE_2026_07_07_0930_ET = 1_783_431_000;
const SUMMER_SAT_2026_07_11_1200_ET = 1_783_785_600;

const WINTER_WED_2025_12_31_1015_ET = 1_767_194_100;
const WINTER_FRI_2026_01_02_1015_ET = 1_767_366_900;
const WINTER_MON_2026_01_05_0930_ET = 1_767_623_400;
const WINTER_MON_2026_01_05_0955_ET = 1_767_624_900;
const WINTER_MON_2026_01_05_1000_ET = 1_767_625_200;
const WINTER_MON_2026_01_05_1015_ET = 1_767_626_100;
const WINTER_MON_2026_01_05_1600_ET = 1_767_646_800;
const WINTER_TUE_2026_01_06_0800_ET = 1_767_704_400;

const REGULAR_SESSION_SECONDS = 23_400;
const OPENING_RANGE_SECONDS = 1_800;

function createCandle(
    timestamp: number,
    overrides: Partial<MarketCandle> = {},
): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 1_000,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createSeries(
    candles: MarketCandle[],
    overrides: Partial<CandleSeries> = {},
): CandleSeries {
    return {
        symbol: 'SOXL',
        interval: '5m',
        candles,
        status: 'available',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        metadata: {
            requestedFrom: SUMMER_FRI_2026_07_03_0930_ET,
            requestedTo: SUMMER_MON_2026_07_06_1600_ET,
            providerLatency: 'unknown',
            entitlement: 'confirmed',
        },
        ...overrides,
    };
}

function createFailureSeries(
    errorCode: CandleSeriesErrorCode,
): CandleSeries & { rawProviderMessage: string } {
    return {
        symbol: 'SOXL',
        interval: '5m',
        candles: [],
        status: 'unavailable',
        provider: 'fixture-provider',
        fetchedAt: '2026-06-26T00:00:00.000Z',
        timezone: 'America/New_York',
        includesExtendedHours: false,
        errorCode,
        rawProviderMessage: 'raw provider message must not be exposed',
        metadata: {
            requestedFrom: SUMMER_FRI_2026_07_03_0930_ET,
            requestedTo: SUMMER_MON_2026_07_06_1600_ET,
            providerLatency: 'unknown',
            entitlement: 'unknown',
        },
    };
}

function createContext(
    candles: MarketCandle[],
    asOf = SUMMER_MON_2026_07_06_1015_ET,
    sourceOverrides: Partial<CandleSeries> = {},
): SoxlMarketContextResult {
    const soxl5m = createSeries(candles, sourceOverrides);
    const emptySeries = (
        symbol: CandleSymbol,
        interval: CandleInterval,
    ): CandleSeries => createSeries([], { symbol, interval });

    return {
        status: 'available',
        asOf,
        providerId: 'fixture-provider',
        series: {
            soxl5m,
            soxl1d: emptySeries('SOXL', '1d'),
            qqq5m: emptySeries('QQQ', '5m'),
            smh5m: emptySeries('SMH', '5m'),
        },
        availableSeries: ['soxl5m'],
        unavailableSeries: ['soxl1d', 'qqq5m', 'smh5m'],
    };
}

function createContextWithSoxlSource(
    soxl5m: CandleSeries,
    asOf = SUMMER_MON_2026_07_06_1015_ET,
): SoxlMarketContextResult {
    return createContext([], asOf, soxl5m);
}

describe('buildSoxlSessionWindowPlan source behavior', () => {
    it('returns unavailable for failed SOXL 5-minute source and preserves only the structured error code', () => {
        const plan = buildSoxlSessionWindowPlan(createContextWithSoxlSource(
            createFailureSeries('provider_error'),
        ));

        expect(plan).toMatchObject({
            status: 'unavailable',
            issue: 'source_unavailable',
            sourceErrorCode: 'provider_error',
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            latestTradingDate: null,
            previousTradingDate: null,
            latestRegularSession: null,
            previousRegularSession: null,
            latestOpeningRange30m: null,
        });
        expect(JSON.stringify(plan)).not.toContain('raw provider message');
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', SUMMER_MON_2026_07_06_1015_ET + 0.5],
        ['millisecond-looking', 1_783_347_300_000],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns unavailable for invalid asOf: %s', (_label, asOf) => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ], asOf));

        expect(plan).toMatchObject({
            status: 'unavailable',
            asOf,
            issue: 'invalid_as_of',
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
            latestRegularSession: null,
        });
    });

    it('does not inspect candles when asOf is invalid', () => {
        const context = {
            status: 'available',
            asOf: Number.NaN,
            providerId: 'fixture-provider',
            get series(): SoxlMarketContextResult['series'] {
                throw new Error('series must not be read');
            },
            availableSeries: [],
            unavailableSeries: [],
        } as unknown as SoxlMarketContextResult;

        expect(buildSoxlSessionWindowPlan(context)).toMatchObject({
            status: 'unavailable',
            issue: 'invalid_as_of',
        });
    });

    it('returns unavailable for an empty successful source', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([]));

        expect(plan).toMatchObject({
            status: 'unavailable',
            issue: 'no_completed_regular_candles',
            sourceCandleCount: 0,
            completedRegularCandleCount: 0,
        });
    });
});

describe('buildSoxlSessionWindowPlan session filtering', () => {
    it('counts source candles separately from eligible completed regular candles', () => {
        const candles = [
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_0930_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET, { isComplete: false }),
            createCandle(SUMMER_MON_2026_07_06_1015_ET, { session: 'premarket' }),
            createCandle(SUMMER_MON_2026_07_06_1015_ET, { session: 'after_hours' }),
            createCandle(SUMMER_TUE_2026_07_07_0930_ET),
        ];
        const plan = buildSoxlSessionWindowPlan(createContext(
            candles,
            SUMMER_MON_2026_07_06_1015_ET,
        ));

        expect(plan.sourceCandleCount).toBe(6);
        expect(plan.completedRegularCandleCount).toBe(2);
        expect(plan.latestTradingDate).toBe('2026-07-06');
        expect(plan.previousTradingDate).toBe('2026-07-03');
    });

    it.each([
        ['premarket', 'premarket'],
        ['after-hours', 'after_hours'],
        ['closed', 'closed'],
        ['unknown', 'unknown'],
    ] as const)('ignores completed %s candles', (_label, session: MarketSession) => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_MON_2026_07_06_1015_ET, { session }),
        ]));

        expect(plan).toMatchObject({
            status: 'unavailable',
            issue: 'no_completed_regular_candles',
            sourceCandleCount: 1,
            completedRegularCandleCount: 0,
        });
    });

    it('does not let a trailing incomplete candle on a newer exchange date move the latest represented date', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
            createCandle(SUMMER_TUE_2026_07_07_0930_ET, { isComplete: false }),
        ], SUMMER_TUE_2026_07_07_0800_ET));

        expect(plan.latestTradingDate).toBe('2026-07-06');
        expect(plan.previousTradingDate).toBe('2026-07-03');
        expect(plan.latestDateRelation).toBe('prior_exchange_date');
    });

    it('does not mutate or sort the input candles', () => {
        const context = createContext([
            createCandle(SUMMER_MON_2026_07_06_1015_ET, { close: 1 }),
            createCandle(SUMMER_FRI_2026_07_03_1015_ET, { close: 2 }),
        ]);
        const before = JSON.stringify(context);

        const plan = buildSoxlSessionWindowPlan(context);

        expect(plan.latestTradingDate).toBe('2026-07-03');
        expect(JSON.stringify(context)).toBe(before);
    });
});

describe('buildSoxlSessionWindowPlan latest and previous represented dates', () => {
    it('selects the final distinct represented date and closest earlier represented date', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_0930_ET),
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_0930_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));

        expect(plan).toMatchObject({
            status: 'available',
            latestTradingDate: '2026-07-06',
            previousTradingDate: '2026-07-03',
            issue: null,
        });
    });

    it('uses represented Friday as previous for Monday without weekday guessing', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));

        expect(plan.previousTradingDate).toBe('2026-07-03');
    });

    it('uses the earlier date actually present across a holiday-like multi-day gap', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(WINTER_WED_2025_12_31_1015_ET),
            createCandle(WINTER_MON_2026_01_05_1015_ET),
        ], WINTER_MON_2026_01_05_1015_ET));

        expect(plan).toMatchObject({
            status: 'available',
            latestTradingDate: '2026-01-05',
            previousTradingDate: '2025-12-31',
        });
    });

    it('returns partial when only one represented session exists', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));

        expect(plan).toMatchObject({
            status: 'partial',
            issue: 'previous_session_unavailable',
            latestTradingDate: '2026-07-06',
            previousTradingDate: null,
            previousRegularSession: null,
        });
        expect(plan.latestRegularSession).toEqual({
            start: SUMMER_MON_2026_07_06_0930_ET,
            end: SUMMER_MON_2026_07_06_1600_ET,
        });
    });
});

describe('buildSoxlSessionWindowPlan DST-safe boundaries', () => {
    it('builds exact summer EDT session and opening-range windows from a later anchor candle', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));

        expect(plan.latestRegularSession).toEqual({
            start: SUMMER_MON_2026_07_06_0930_ET,
            end: SUMMER_MON_2026_07_06_1600_ET,
        });
        expect(plan.previousRegularSession).toEqual({
            start: SUMMER_FRI_2026_07_03_0930_ET,
            end: SUMMER_FRI_2026_07_03_0930_ET + REGULAR_SESSION_SECONDS,
        });
        expect(plan.latestOpeningRange30m).toEqual({
            start: SUMMER_MON_2026_07_06_0930_ET,
            end: SUMMER_MON_2026_07_06_1000_ET,
        });
    });

    it('builds exact winter EST session and opening-range windows', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(WINTER_FRI_2026_01_02_1015_ET),
            createCandle(WINTER_MON_2026_01_05_1015_ET),
        ], WINTER_MON_2026_01_05_1015_ET));

        expect(plan.latestRegularSession).toEqual({
            start: WINTER_MON_2026_01_05_0930_ET,
            end: WINTER_MON_2026_01_05_1600_ET,
        });
        expect(plan.latestOpeningRange30m).toEqual({
            start: WINTER_MON_2026_01_05_0930_ET,
            end: WINTER_MON_2026_01_05_1000_ET,
        });
    });

    it('does not apply one fixed UTC offset year-round', () => {
        const summer = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));
        const winter = buildSoxlSessionWindowPlan(createContext([
            createCandle(WINTER_FRI_2026_01_02_1015_ET),
            createCandle(WINTER_MON_2026_01_05_1015_ET),
        ], WINTER_MON_2026_01_05_1015_ET));

        expect(summer.latestRegularSession?.start).toBe(SUMMER_MON_2026_07_06_0930_ET);
        expect(winter.latestRegularSession?.start).toBe(WINTER_MON_2026_01_05_0930_ET);
        expect(SUMMER_MON_2026_07_06_0930_ET % 86_400).not.toBe(
            WINTER_MON_2026_01_05_0930_ET % 86_400,
        );
    });

    it('keeps regular and opening-range durations exact and [start, end)', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));
        const latestRegularSession = plan.latestRegularSession;
        const latestOpeningRange30m = plan.latestOpeningRange30m;

        expect(latestRegularSession).not.toBeNull();
        expect(latestOpeningRange30m).not.toBeNull();

        if (latestRegularSession === null || latestOpeningRange30m === null) {
            throw new Error('expected session windows');
        }

        expect(latestRegularSession.end - latestRegularSession.start).toBe(
            REGULAR_SESSION_SECONDS,
        );
        expect(latestOpeningRange30m.end - latestOpeningRange30m.start).toBe(
            OPENING_RANGE_SECONDS,
        );
        expect(latestOpeningRange30m.start).toBe(latestRegularSession.start);
        expect(latestOpeningRange30m.end).toBeLessThanOrEqual(latestRegularSession.end);
    });
});

describe('buildSoxlSessionWindowPlan completion flags', () => {
    it('marks opening range incomplete before 10:00 ET', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_0930_ET),
        ], SUMMER_MON_2026_07_06_0955_ET));

        expect(plan.latestOpeningRange30mCompleted).toBe(false);
        expect(plan.latestRegularSessionCompleted).toBe(false);
    });

    it('treats equality at 10:00 ET as opening-range complete', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_0930_ET),
        ], SUMMER_MON_2026_07_06_1000_ET));

        expect(plan.latestOpeningRange30mCompleted).toBe(true);
        expect(plan.latestRegularSessionCompleted).toBe(false);
    });

    it('marks the regular session complete exactly at 16:00 ET', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ], SUMMER_MON_2026_07_06_1600_ET));

        expect(plan.latestOpeningRange30mCompleted).toBe(true);
        expect(plan.latestRegularSessionCompleted).toBe(true);
    });

    it('uses winter timestamps for completion flags without fixed-offset assumptions', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(WINTER_FRI_2026_01_02_1015_ET),
            createCandle(WINTER_MON_2026_01_05_0930_ET),
        ], WINTER_MON_2026_01_05_0955_ET));

        expect(plan.latestOpeningRange30mCompleted).toBe(false);
        expect(plan.latestRegularSessionCompleted).toBe(false);
    });
});

describe('buildSoxlSessionWindowPlan latest-date relation', () => {
    it('reports same_exchange_date during the represented date', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ], SUMMER_MON_2026_07_06_1015_ET));

        expect(plan.latestDateRelation).toBe('same_exchange_date');
    });

    it('reports prior_exchange_date on the following local date before open', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ], SUMMER_TUE_2026_07_07_0800_ET));

        expect(plan.latestDateRelation).toBe('prior_exchange_date');
        expect(plan.latestTradingDate).toBe('2026-07-06');
    });

    it('reports prior_exchange_date on a weekend-like asOf without rejecting represented candles', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ], SUMMER_SAT_2026_07_11_1200_ET));

        expect(plan.latestDateRelation).toBe('prior_exchange_date');
        expect(plan.status).toBe('available');
    });

    it('does not infer whether the exchange should be open', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(WINTER_WED_2025_12_31_1015_ET),
            createCandle(WINTER_MON_2026_01_05_1015_ET),
        ], WINTER_TUE_2026_01_06_0800_ET));

        expect(plan).toMatchObject({
            status: 'available',
            latestTradingDate: '2026-01-05',
            previousTradingDate: '2025-12-31',
            latestDateRelation: 'prior_exchange_date',
        });
    });
});

describe('buildSoxlSessionWindowPlan determinism and isolation', () => {
    it('returns equivalent plans for equivalent inputs without using the system clock', () => {
        const context = createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]);
        const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('system clock must not be used');
        });

        try {
            expect(buildSoxlSessionWindowPlan(context)).toEqual(
                buildSoxlSessionWindowPlan(createContext([
                    createCandle(SUMMER_FRI_2026_07_03_1015_ET),
                    createCandle(SUMMER_MON_2026_07_06_1015_ET),
                ])),
            );
        } finally {
            dateNow.mockRestore();
        }
    });

    it('does not import page timezone helpers, providers, indicator implementations, or services', () => {
        const source = readFileSync(
            new URL('./soxl-session-windows.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toContain('time-format');
        expect(source).not.toMatch(/from ['"].*provider/u);
        expect(source).not.toMatch(/from ['"].*\/server\//u);
        expect(source).not.toMatch(/from ['"].*indicators['"]/u);
        expect(source).not.toMatch(/from ['"].*levels/u);
        expect(source).not.toContain('Date.now');
        expect(source).not.toMatch(/new Date\(\s*\)/u);
    });

    it('leaves context and candle arrays unchanged', () => {
        const context = createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]);
        const before = JSON.stringify(context);

        buildSoxlSessionWindowPlan(context);

        expect(JSON.stringify(context)).toBe(before);
    });

    it('generates finite positive integer Unix-second boundaries', () => {
        const plan = buildSoxlSessionWindowPlan(createContext([
            createCandle(SUMMER_FRI_2026_07_03_1015_ET),
            createCandle(SUMMER_MON_2026_07_06_1015_ET),
        ]));
        const boundaries = [
            plan.latestRegularSession?.start,
            plan.latestRegularSession?.end,
            plan.previousRegularSession?.start,
            plan.previousRegularSession?.end,
            plan.latestOpeningRange30m?.start,
            plan.latestOpeningRange30m?.end,
        ];

        expect(boundaries.every((boundary) => (
            typeof boundary === 'number'
            && Number.isFinite(boundary)
            && Number.isInteger(boundary)
            && boundary > 0
        ))).toBe(true);
    });
});
