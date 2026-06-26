import { describe, expect, it } from 'vitest';
import {
    calculateLatestRelativeVolume,
    calculateRelativeVolumeSeries,
} from '@/lib/soxl-intelligence/indicators/relative-volume';
import type { RelativeVolumeInput } from '@/lib/soxl-intelligence/indicators/types';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';

const baseTimestamp = 1_782_415_800;
const sessionStart = baseTimestamp;
const sessionEnd = baseTimestamp + 10 * 300;
const asOf = baseTimestamp + 100_000;

function createCandle(index: number, volume: number | null, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * 300,
        open: 10,
        high: 12,
        low: 8,
        close: 10,
        volume,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createInput(overrides: Partial<RelativeVolumeInput> = {}): RelativeVolumeInput {
    return {
        candles: [
            createCandle(0, 100),
            createCandle(1, 200),
            createCandle(2, 300),
            createCandle(3, 600),
            createCandle(4, 300),
        ],
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        session: 'regular',
        sessionStart,
        sessionEnd,
        lookbackBars: 3,
        ...overrides,
    };
}

describe('calculateRelativeVolumeSeries', () => {
    it('calculates a known rolling relative-volume fixture', () => {
        const result = calculateRelativeVolumeSeries(createInput());

        expect(result.status).toBe('available');
        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 900, value: 3 },
            { timestamp: baseTimestamp + 1_200, value: 300 / (1_100 / 3) },
        ]);
        expect(result.latest).toMatchObject({
            value: 300 / (1_100 / 3),
            timestamp: baseTimestamp + 1_200,
            status: 'available',
            requiredBars: 4,
            usedBars: 5,
        });
    });

    it('emits the first output at index lookbackBars', () => {
        const result = calculateRelativeVolumeSeries(createInput());

        expect(result.values[0].timestamp).toBe(baseTimestamp + 900);
        expect(result.values[0].value).toBe(3);
    });

    it('uses the current candle timestamp for output', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
                createCandle(2, 600),
            ],
            lookbackBars: 2,
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 600, value: 4 },
        ]);
    });

    it('returns latest relative volume from the final series point', () => {
        const input = createInput();
        const series = calculateRelativeVolumeSeries(input);
        const latest = calculateLatestRelativeVolume(input);

        expect(latest).toEqual(series.latest);
        expect(latest.value).toBe(series.values[series.values.length - 1].value);
    });

    it('uses exactly the preceding bars as the baseline', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 1_000),
                createCandle(2, 100),
                createCandle(3, 300),
            ],
            lookbackBars: 2,
        }));

        expect(result.latest.value).toBe(6 / 11);
    });

    it('allows current zero volume when baseline average is positive', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
                createCandle(2, 0),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'available',
            latest: {
                value: 0,
                timestamp: baseTimestamp + 600,
            },
        });
    });

    it('returns missing_current_volume when final current volume is null', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
                createCandle(2, null),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'missing_current_volume',
            values: [],
            latest: {
                value: null,
                timestamp: null,
                status: 'insufficient_history',
            },
        });
    });

    it('returns missing_baseline_volume when a final baseline candle has null volume', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, null),
                createCandle(2, 300),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'missing_baseline_volume',
            values: [],
        });
    });

    it('returns zero_average_volume when final baseline average is zero', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 0),
                createCandle(1, 0),
                createCandle(2, 300),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'zero_average_volume',
            values: [],
        });
    });

    it('returns insufficient_usable_volume when matching candles are below requiredBars', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_usable_volume',
            requiredBars: 3,
            usedBars: 2,
            values: [],
        });
    });

    it('supports a custom lookback', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 10),
                createCandle(1, 30),
                createCandle(2, 20),
            ],
            lookbackBars: 2,
        }));

        expect(result.latest.value).toBe(1);
        expect(result.requiredBars).toBe(3);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_lookback for %s lookback', (_label, lookbackBars) => {
        const result = calculateRelativeVolumeSeries(createInput({ lookbackBars }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_lookback',
            requiredBars: 0,
            usedBars: 0,
            values: [],
        });
    });

    it('excludes different sessions', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 1_000, { session: 'premarket' }),
                createCandle(1, 100),
                createCandle(2, 200),
                createCandle(3, 600),
            ],
            lookbackBars: 2,
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 900, value: 4 },
        ]);
        expect(result.usedBars).toBe(3);
    });

    it('excludes outside-window candles', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            sessionStart: baseTimestamp + 300,
            sessionEnd: baseTimestamp + 1_200,
            candles: [
                createCandle(0, 1_000),
                createCandle(1, 100),
                createCandle(2, 200),
                createCandle(3, 600),
                createCandle(4, 1_000),
            ],
            lookbackBars: 2,
        }));

        expect(result.values).toEqual([
            { timestamp: baseTimestamp + 900, value: 4 },
        ]);
        expect(result.usedBars).toBe(3);
    });

    it('excludes an incomplete final candle', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
                createCandle(2, 600),
                createCandle(3, null, { isComplete: false }),
            ],
            lookbackBars: 2,
        }));

        expect(result).toMatchObject({
            status: 'available',
            usedBars: 3,
            latest: {
                value: 4,
                timestamp: baseTimestamp + 600,
            },
        });
    });

    it('returns invalid_input for a future candle', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            asOf: baseTimestamp,
            candles: [createCandle(1, 100)],
            lookbackBars: 1,
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('returns unsupported_daily_interval for daily interval', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            expectedInterval: '1d',
            candles: [createCandle(0, 100, { interval: '1d' })],
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'unsupported_daily_interval',
            requiredBars: 4,
            values: [],
        });
    });

    it('returns invalid_input for an invalid session window', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            sessionStart: sessionEnd,
            sessionEnd,
        }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_session_window',
            usedBars: 0,
            values: [],
        });
    });

    it('propagates validation issues for invalid OHLC input', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [createCandle(0, 100, { high: 9, low: 11, close: 10 })],
            lookbackBars: 1,
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_ohlc_relationship' }));
    });

    it('does not mutate input candles', () => {
        const candles = [
            createCandle(0, 100),
            createCandle(1, 200),
            createCandle(2, 600),
        ];
        const before = candles.map((candle) => ({ ...candle }));

        calculateRelativeVolumeSeries(createInput({ candles, lookbackBars: 2 }));

        expect(candles).toEqual(before);
    });

    it('emits output timestamps in ascending order', () => {
        const result = calculateRelativeVolumeSeries(createInput());
        const timestamps = result.values.map((point) => point.timestamp);

        expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
    });

    it('emits only finite values', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 100),
                createCandle(1, 200),
                createCandle(2, 300),
                createCandle(3, 400),
                createCandle(4, 500),
            ],
        }));

        expect(result.values.every((point) => Number.isFinite(point.value))).toBe(true);
    });

    it('does not round relative-volume values', () => {
        const result = calculateRelativeVolumeSeries(createInput({
            candles: [
                createCandle(0, 1),
                createCandle(1, 2),
                createCandle(2, 2),
            ],
            lookbackBars: 2,
        }));

        expect(result.latest.value).toBe(4 / 3);
    });
});
