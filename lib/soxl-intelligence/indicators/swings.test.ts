import { describe, expect, it } from 'vitest';
import { detectConfirmedSwings } from '@/lib/soxl-intelligence/indicators/swings';
import type { SwingDetectionInput, SwingPoint } from '@/lib/soxl-intelligence/indicators/types';
import type { MarketCandle } from '@/lib/soxl-intelligence/market-data/candle-types';

const baseTimestamp = 1_782_415_800;
const fiveMinutes = 300;
const asOf = baseTimestamp + 100_000;

function createCandle(index: number, high: number, low: number, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        symbol: 'SOXL',
        interval: '5m',
        timestamp: baseTimestamp + index * fiveMinutes,
        open: (high + low) / 2,
        high,
        low,
        close: (high + low) / 2,
        volume: 100,
        isComplete: true,
        session: 'regular',
        ...overrides,
    };
}

function createSeries(levels: readonly [number, number][]): MarketCandle[] {
    return levels.map(([high, low], index) => createCandle(index, high, low));
}

function createInput(overrides: Partial<SwingDetectionInput> = {}): SwingDetectionInput {
    return {
        candles: createSeries([
            [10, 7],
            [12, 6],
            [15, 8],
            [11, 5],
            [13, 7],
            [9, 4],
            [8, 5],
            [14, 6],
            [10, 7],
        ]),
        expectedSymbol: 'SOXL',
        expectedInterval: '5m',
        asOf,
        leftBars: 2,
        rightBars: 2,
        ...overrides,
    };
}

function expectSwing(actual: SwingPoint, expected: SwingPoint): void {
    expect(actual).toEqual(expected);
}

describe('detectConfirmedSwings basic high and low detection', () => {
    it('detects a known confirmed swing high', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.status).toBe('available');
        expect(result.swings).toContainEqual({
            type: 'high',
            price: 15,
            pivotTimestamp: baseTimestamp + 2 * fiveMinutes,
            confirmedAtTimestamp: baseTimestamp + 4 * fiveMinutes,
            pivotIndex: 2,
            confirmedAtIndex: 4,
        });
    });

    it('detects a known confirmed swing low', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.swings).toContainEqual({
            type: 'low',
            price: 4,
            pivotTimestamp: baseTimestamp + 5 * fiveMinutes,
            confirmedAtTimestamp: baseTimestamp + 7 * fiveMinutes,
            pivotIndex: 5,
            confirmedAtIndex: 7,
        });
    });

    it('records the correct pivot price', () => {
        const result = detectConfirmedSwings(createInput());
        const swingHigh = result.swings.find((swing) => swing.type === 'high');
        const swingLow = result.swings.find((swing) => swing.type === 'low');

        expect(swingHigh?.price).toBe(15);
        expect(swingLow?.price).toBe(4);
    });

    it('records the correct pivot timestamp', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.latestHigh?.pivotTimestamp).toBe(baseTimestamp + 2 * fiveMinutes);
        expect(result.latestLow?.pivotTimestamp).toBe(baseTimestamp + 5 * fiveMinutes);
    });

    it('records the correct confirmation timestamp', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.latestHigh?.confirmedAtTimestamp).toBe(baseTimestamp + 4 * fiveMinutes);
        expect(result.latestLow?.confirmedAtTimestamp).toBe(baseTimestamp + 7 * fiveMinutes);
    });

    it('records the correct pivot and confirmation indexes', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.latestHigh).toMatchObject({
            pivotIndex: 2,
            confirmedAtIndex: 4,
        });
        expect(result.latestLow).toMatchObject({
            pivotIndex: 5,
            confirmedAtIndex: 7,
        });
    });

    it('selects latest high and latest low by pivot timestamp', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
                [13, 7],
                [9, 4],
                [8, 5],
                [16, 6],
                [10, 7],
                [9, 6],
            ]),
        }));

        expect(result.latestHigh).toMatchObject({
            type: 'high',
            price: 16,
            pivotIndex: 7,
        });
        expect(result.latestLow).toMatchObject({
            type: 'low',
            price: 4,
            pivotIndex: 5,
        });
    });

    it('orders swings by pivot timestamp', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.swings.map((swing) => swing.pivotTimestamp)).toEqual([
            baseTimestamp + 2 * fiveMinutes,
            baseTimestamp + 5 * fiveMinutes,
        ]);
    });

    it('returns available with no swings when enough candles exist', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 10],
                [11, 9],
                [12, 8],
                [13, 7],
                [14, 6],
            ]),
        }));

        expect(result).toMatchObject({
            status: 'available',
            swings: [],
            latestHigh: null,
            latestLow: null,
            requiredBars: 5,
            usedBars: 5,
        });
    });
});

describe('detectConfirmedSwings confirmation and anti-repainting', () => {
    it('does not emit a candidate before all rightBars candles exist', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
            ]),
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_confirmation_history',
            swings: [],
            usedBars: 4,
        });
    });

    it('emits a candidate once the final confirmation candle exists', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
                [13, 7],
            ]),
        }));

        expect(result.status).toBe('available');
        expect(result.swings).toEqual([{
            type: 'high',
            price: 15,
            pivotTimestamp: baseTimestamp + 2 * fiveMinutes,
            confirmedAtTimestamp: baseTimestamp + 4 * fiveMinutes,
            pivotIndex: 2,
            confirmedAtIndex: 4,
        }]);
    });

    it('does not allow an incomplete confirmation candle to confirm a pivot', () => {
        const result = detectConfirmedSwings(createInput({
            candles: [
                ...createSeries([
                    [10, 7],
                    [12, 6],
                    [15, 8],
                    [11, 5],
                ]),
                createCandle(4, 13, 7, { isComplete: false }),
            ],
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_confirmation_history',
            swings: [],
            usedBars: 4,
        });
    });

    it('returns invalid_input for a future confirmation candle rather than confirming', () => {
        const result = detectConfirmedSwings(createInput({
            asOf: baseTimestamp + 3 * fiveMinutes,
            candles: [
                ...createSeries([
                    [10, 7],
                    [12, 6],
                    [15, 8],
                    [11, 5],
                ]),
                createCandle(4, 13, 7),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.swings).toEqual([]);
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'future_timestamp' }));
    });

    it('does not remove or change an already confirmed swing when later candles are added', () => {
        const prefixResult = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
                [13, 7],
            ]),
        }));
        const extendedResult = detectConfirmedSwings(createInput());

        expectSwing(extendedResult.swings[0], prefixResult.swings[0]);
    });

    it('does not let a candle beyond the right-side window affect an earlier confirmed pivot', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
                [13, 7],
                [100, 6],
            ]),
        }));

        expect(result.swings[0]).toEqual({
            type: 'high',
            price: 15,
            pivotTimestamp: baseTimestamp + 2 * fiveMinutes,
            confirmedAtTimestamp: baseTimestamp + 4 * fiveMinutes,
            pivotIndex: 2,
            confirmedAtIndex: 4,
        });
    });

    it('sets confirmedAtTimestamp later than pivotTimestamp', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.swings.every((swing) => (
            swing.confirmedAtTimestamp > swing.pivotTimestamp
        ))).toBe(true);
    });
});

describe('detectConfirmedSwings tie behavior', () => {
    it('selects the earliest qualifying candle in an equal high plateau', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [10, 7],
                [15, 8],
                [15, 9],
                [11, 6],
            ]),
        }));

        expect(result.latestHigh).toMatchObject({
            type: 'high',
            price: 15,
            pivotIndex: 1,
        });
    });

    it('selects the earliest qualifying candle in an equal low plateau', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [10, 7],
                [11, 5],
                [12, 5],
                [13, 8],
            ]),
        }));

        expect(result.latestLow).toMatchObject({
            type: 'low',
            price: 5,
            pivotIndex: 1,
        });
    });

    it('does not mark a candidate equal to a left-side high as a swing high', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [15, 7],
                [15, 8],
                [11, 6],
            ]),
        }));

        expect(result.latestHigh).toBeNull();
    });

    it('does not mark a candidate equal to a left-side low as a swing low', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [10, 5],
                [11, 5],
                [12, 8],
            ]),
        }));

        expect(result.latestLow).toBeNull();
    });

    it('does not reject an earlier candidate for equal values on the right side', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 2,
            candles: createSeries([
                [10, 7],
                [15, 8],
                [15, 9],
                [13, 6],
            ]),
        }));

        expect(result.latestHigh).toMatchObject({
            type: 'high',
            price: 15,
            pivotIndex: 1,
            confirmedAtIndex: 3,
        });
    });
});

describe('detectConfirmedSwings window configuration', () => {
    it('supports custom leftBars 1 and rightBars 1', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [10, 7],
                [15, 8],
                [11, 6],
            ]),
        }));

        expect(result).toMatchObject({
            status: 'available',
            requiredBars: 3,
            usedBars: 3,
        });
        expect(result.swings).toEqual([{
            type: 'high',
            price: 15,
            pivotTimestamp: baseTimestamp + fiveMinutes,
            confirmedAtTimestamp: baseTimestamp + 2 * fiveMinutes,
            pivotIndex: 1,
            confirmedAtIndex: 2,
        }]);
    });

    it('supports custom asymmetric windows', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 3,
            rightBars: 2,
            candles: createSeries([
                [10, 8],
                [11, 7],
                [12, 6],
                [16, 9],
                [13, 7],
                [14, 8],
            ]),
        }));

        expect(result).toMatchObject({
            status: 'available',
            requiredBars: 6,
            usedBars: 6,
        });
        expect(result.latestHigh).toMatchObject({
            type: 'high',
            price: 16,
            pivotIndex: 3,
            confirmedAtIndex: 5,
        });
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_left_bars for %s leftBars', (_label, leftBars) => {
        const result = detectConfirmedSwings(createInput({ leftBars }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_left_bars',
            swings: [],
            latestHigh: null,
            latestLow: null,
            requiredBars: 0,
            usedBars: 0,
        });
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
    ])('returns invalid_right_bars for %s rightBars', (_label, rightBars) => {
        const result = detectConfirmedSwings(createInput({ rightBars }));

        expect(result).toMatchObject({
            status: 'invalid_input',
            issue: 'invalid_right_bars',
            swings: [],
            latestHigh: null,
            latestLow: null,
            requiredBars: 0,
            usedBars: 0,
        });
    });

    it('returns insufficient_confirmation_history for too few completed candles', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
            ]),
        }));

        expect(result).toMatchObject({
            status: 'insufficient_history',
            issue: 'insufficient_confirmation_history',
            requiredBars: 5,
            usedBars: 4,
            swings: [],
        });
    });

    it('can produce a result with exactly leftBars + 1 + rightBars candles', () => {
        const result = detectConfirmedSwings(createInput({
            candles: createSeries([
                [10, 7],
                [12, 6],
                [15, 8],
                [11, 5],
                [13, 7],
            ]),
        }));

        expect(result.status).toBe('available');
        expect(result.requiredBars).toBe(5);
        expect(result.usedBars).toBe(5);
        expect(result.swings).toHaveLength(1);
    });
});

describe('detectConfirmedSwings shared validation', () => {
    it('propagates validation issues for invalid OHLC input', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: [
                createCandle(0, 10, 7),
                createCandle(1, 9, 11),
                createCandle(2, 12, 8),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.swings).toEqual([]);
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_ohlc_relationship' }));
    });

    it('returns invalid_input for unsorted candles', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: [
                createCandle(1, 10, 7),
                createCandle(0, 12, 6),
                createCandle(2, 11, 8),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'unsorted_timestamp' }));
    });

    it('returns invalid_input for duplicate timestamps', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: [
                createCandle(0, 10, 7),
                createCandle(1, 12, 6),
                createCandle(2, 11, 8, { timestamp: baseTimestamp + fiveMinutes }),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'duplicate_timestamp' }));
    });

    it('returns invalid_input for symbol mismatch', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: [
                createCandle(0, 10, 7),
                createCandle(1, 12, 6, { symbol: 'QQQ' }),
                createCandle(2, 11, 8),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'symbol_mismatch' }));
    });

    it('returns invalid_input for interval mismatch', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: [
                createCandle(0, 10, 7),
                createCandle(1, 12, 6, { interval: '15m' }),
                createCandle(2, 11, 8),
            ],
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'interval_mismatch' }));
    });

    it('returns invalid_input for invalid asOf', () => {
        const result = detectConfirmedSwings(createInput({
            asOf: Number.NaN,
        }));

        expect(result.status).toBe('invalid_input');
        expect(result.validationIssues).toContainEqual(expect.objectContaining({ code: 'invalid_as_of' }));
    });

    it('does not mutate input candles', () => {
        const candles = createSeries([
            [10, 7],
            [12, 6],
            [15, 8],
            [11, 5],
            [13, 7],
        ]);
        const before = candles.map((candle) => ({ ...candle }));

        detectConfirmedSwings(createInput({ candles }));

        expect(candles).toEqual(before);
    });

    it('keeps null and zero volume valid', () => {
        const result = detectConfirmedSwings(createInput({
            candles: [
                createCandle(0, 10, 7, { volume: null }),
                createCandle(1, 12, 6, { volume: 0 }),
                createCandle(2, 15, 8),
                createCandle(3, 11, 5),
                createCandle(4, 13, 7),
            ],
        }));

        expect(result.status).toBe('available');
        expect(result.latestHigh).toMatchObject({
            price: 15,
            pivotIndex: 2,
        });
    });

    it('emits only finite prices and timestamps', () => {
        const result = detectConfirmedSwings(createInput());

        expect(result.swings.every((swing) => (
            Number.isFinite(swing.price)
            && Number.isFinite(swing.pivotTimestamp)
            && Number.isFinite(swing.confirmedAtTimestamp)
        ))).toBe(true);
    });

    it('does not round prices', () => {
        const result = detectConfirmedSwings(createInput({
            leftBars: 1,
            rightBars: 1,
            candles: createSeries([
                [10.1, 7],
                [12.123456789, 6],
                [11.2, 8],
            ]),
        }));

        expect(result.latestHigh?.price).toBe(12.123456789);
    });
});
