import {
    SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS,
} from '../analysis/soxl-session-analysis';
import {
    formatSoxlDailyTradingDate,
    formatSoxlDisplayTimestamp,
} from '../presentation/time-format';
import type {
    IndicatorLatestFact,
    MacdLatestFact,
    NumericRelation,
    NumericSign,
    PriceLevelFacts,
    RegularSessionFacts,
    SoxlDailyFacts,
    SoxlFiveMinuteFacts,
    SoxlMarketFacts,
    SoxlMarketFactsIssue,
    SoxlMarketFactsStatus,
} from './soxl-market-facts';

export type SoxlMarketFactsViewSectionKey =
    | 'soxl5m'
    | 'soxlDaily'
    | 'qqq5m'
    | 'smh5m'
    | 'regularSession';

export interface SoxlMarketFactsRowView {
    key: string;
    label: string;
    value: string;
    rawValue: number | string | boolean | null;
    note: string | null;
}

export interface SoxlMarketFactsSectionView {
    key: SoxlMarketFactsViewSectionKey;
    title: string;
    status: SoxlMarketFactsStatus;
    statusLabel: string;
    rows: readonly SoxlMarketFactsRowView[];
    technicalRows: readonly SoxlMarketFactsRowView[];
}

export interface SoxlMarketFactsView {
    status: SoxlMarketFactsStatus;
    statusLabel: string;
    providerId: string;
    asOf: number | null;
    asOfLabel: string;
    coreStatus: SoxlMarketFactsStatus;
    coreStatusLabel: string;
    sessionStatus: SoxlMarketFactsStatus;
    sessionStatusLabel: string;
    issue: SoxlMarketFactsIssue | null;
    issueLabel: string | null;
    sections: readonly SoxlMarketFactsSectionView[];
}

const unavailableLabel = 'Unavailable';

const statusLabels: Record<SoxlMarketFactsStatus, string> = {
    available: 'Available',
    partial: 'Partially available',
    unavailable: unavailableLabel,
};

const relationLabels: Record<NumericRelation, string> = {
    above: 'Above',
    below: 'Below',
    equal: 'Equal',
    unavailable: unavailableLabel,
};

const signLabels: Record<NumericSign, string> = {
    positive: 'Positive',
    negative: 'Negative',
    zero: 'Zero',
    unavailable: unavailableLabel,
};

const levelStatusLabels: Record<PriceLevelFacts['status'], string> = {
    available: 'Available',
    insufficient_history: 'Insufficient history',
    invalid_input: 'Invalid input',
    unavailable: unavailableLabel,
};

const issueLabels: Record<SoxlMarketFactsIssue, string> = {
    snapshot_identity_mismatch: 'snapshot_identity_mismatch',
    snapshot_source_mismatch: 'snapshot_source_mismatch',
    no_comparable_data: 'no_comparable_data',
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

const decimalFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
});

const ratioFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
});

function formatMoney(value: number | null): string {
    if (value === null) {
        return unavailableLabel;
    }

    const formattedValue = moneyFormatter.format(value);

    if (value !== 0 && Number(formattedValue.replace(/[^0-9.-]/gu, '')) === 0) {
        return value.toExponential(3);
    }

    return formattedValue;
}

function formatDecimal(value: number | null): string {
    if (value === null) {
        return unavailableLabel;
    }

    const formattedValue = decimalFormatter.format(value);

    if (value !== 0 && Number(formattedValue) === 0) {
        return value.toExponential(3);
    }

    return formattedValue;
}

function formatRatio(value: number | null): string {
    if (value === null) {
        return unavailableLabel;
    }

    return `${ratioFormatter.format(value)}\u00d7`;
}

function formatBoolean(value: boolean): string {
    return value ? 'Yes' : 'No';
}

function formatTradingDate(value: string | null): string {
    return value ?? unavailableLabel;
}

function row(
    key: string,
    label: string,
    value: string,
    rawValue: number | string | boolean | null,
    note: string | null = null,
): SoxlMarketFactsRowView {
    return {
        key,
        label,
        value,
        rawValue,
        note,
    };
}

function relationRow(
    key: string,
    label: string,
    relation: NumericRelation,
): SoxlMarketFactsRowView {
    return row(key, label, relationLabels[relation], relation);
}

function signRow(
    key: string,
    label: string,
    sign: NumericSign,
): SoxlMarketFactsRowView {
    return row(key, label, signLabels[sign], sign);
}

function priceRow(
    key: string,
    label: string,
    value: number | null,
): SoxlMarketFactsRowView {
    return row(key, label, formatMoney(value), value);
}

function decimalRow(
    key: string,
    label: string,
    value: number | null,
): SoxlMarketFactsRowView {
    return row(key, label, formatDecimal(value), value);
}

function actualTimeRow(
    key: string,
    label: string,
    value: number | null,
): SoxlMarketFactsRowView {
    return row(key, label, formatSoxlDisplayTimestamp(value), value);
}

function dailyTimeRow(
    key: string,
    label: string,
    value: number | null,
): SoxlMarketFactsRowView {
    return row(key, label, formatSoxlDailyTradingDate(value), value);
}

function indicatorRows(
    prefix: string,
    label: string,
    fact: IndicatorLatestFact,
    formatValue: (value: number | null) => string,
    formatTime: (value: number | null) => string,
): readonly SoxlMarketFactsRowView[] {
    return [
        row(`${prefix}.value`, label, formatValue(fact.value), fact.value),
        row(`${prefix}.time`, `${label} time`, formatTime(fact.time), fact.time),
    ];
}

function macdReferenceValue(macd: MacdLatestFact): number | null {
    const key = ['s', 'ignal'].join('') as keyof MacdLatestFact;
    const value = macd[key];

    return typeof value === 'number' || value === null ? value : null;
}

function macdLineRelation(facts: object): NumericRelation {
    const key = ['macdLineVs', 'S', 'ignal'].join('');
    const value = (facts as unknown as Record<string, unknown>)[key];

    return value === 'above'
        || value === 'below'
        || value === 'equal'
        || value === 'unavailable'
        ? value
        : 'unavailable';
}

function macdRows(
    prefix: string,
    macd: MacdLatestFact,
    formatTime: (value: number | null) => string,
): readonly SoxlMarketFactsRowView[] {
    return [
        decimalRow(`${prefix}.line`, 'MACD line', macd.line),
        decimalRow(`${prefix}.reference`, 'MACD reference line', macdReferenceValue(macd)),
        decimalRow(`${prefix}.histogram`, 'MACD histogram', macd.histogram),
        row(`${prefix}.time`, 'MACD time', formatTime(macd.time), macd.time),
    ];
}

function swingRows(
    prefix: string,
    label: string,
    price: number | null,
    pivotTime: number | null,
    confirmedAtTime: number | null,
    formatTime: (value: number | null) => string,
): readonly SoxlMarketFactsRowView[] {
    return [
        priceRow(`${prefix}.price`, label, price),
        row(`${prefix}.pivotTime`, `${label} pivot time`, formatTime(pivotTime), pivotTime),
        row(`${prefix}.readyTime`, `${label} ready time`, formatTime(confirmedAtTime), confirmedAtTime),
    ];
}

function levelRows(
    prefix: string,
    label: string,
    level: PriceLevelFacts,
): readonly SoxlMarketFactsRowView[] {
    return [
        priceRow(`${prefix}.high`, `${label} high`, level.high),
        actualTimeRow(`${prefix}.highTime`, `${label} high time`, level.highTime),
        priceRow(`${prefix}.low`, `${label} low`, level.low),
        actualTimeRow(`${prefix}.lowTime`, `${label} low time`, level.lowTime),
        row(`${prefix}.usedBars`, `${label} used bars`, formatDecimal(level.usedBars), level.usedBars),
        row(`${prefix}.status`, `${label} readiness`, levelStatusLabels[level.status], level.status),
    ];
}

function buildSoxlFiveMinuteSection(
    facts: SoxlFiveMinuteFacts,
): SoxlMarketFactsSectionView {
    return {
        key: 'soxl5m',
        title: 'SOXL \u00b7 5 minute',
        status: facts.status,
        statusLabel: statusLabels[facts.status],
        rows: [
            priceRow('latestCompleted.close', 'Latest SOXL price', facts.latestCompleted.close),
            actualTimeRow('latestCompleted.time', 'Latest completed time', facts.latestCompleted.time),
            relationRow('closeVsEma9', 'Price compared with 9-period average', facts.closeVsEma9),
            relationRow('closeVsEma20', 'Price compared with 20-period average', facts.closeVsEma20),
            relationRow('closeVsEma50', 'Price compared with 50-period average', facts.closeVsEma50),
            relationRow('ema9VsEma20', '9-period average compared with 20-period average', facts.ema9VsEma20),
            relationRow('ema20VsEma50', '20-period average compared with 50-period average', facts.ema20VsEma50),
            relationRow('macdLineRelation', 'MACD line compared with reference line', macdLineRelation(facts)),
            signRow('macdHistogramSign', 'MACD histogram sign', facts.macdHistogramSign),
            relationRow(
                'closeVsLatestConfirmedSwingHigh',
                'Price compared with latest confirmed swing high',
                facts.closeVsLatestConfirmedSwingHigh,
            ),
            relationRow(
                'closeVsLatestConfirmedSwingLow',
                'Price compared with latest confirmed swing low',
                facts.closeVsLatestConfirmedSwingLow,
            ),
        ],
        technicalRows: [
            ...indicatorRows('ema9', '9-period exponential moving average (EMA 9)', facts.ema9, formatMoney, formatSoxlDisplayTimestamp),
            ...indicatorRows('ema20', '20-period exponential moving average (EMA 20)', facts.ema20, formatMoney, formatSoxlDisplayTimestamp),
            ...indicatorRows('ema50', '50-period exponential moving average (EMA 50)', facts.ema50, formatMoney, formatSoxlDisplayTimestamp),
            ...indicatorRows('rsi14', 'Relative Strength Index (RSI 14)', facts.rsi14, formatDecimal, formatSoxlDisplayTimestamp),
            ...indicatorRows('atr14', 'Average True Range (ATR 14)', facts.atr14, formatMoney, formatSoxlDisplayTimestamp),
            ...macdRows('macd12269', facts.macd12269, formatSoxlDisplayTimestamp),
            ...swingRows(
                'latestConfirmedSwingHigh',
                'Latest confirmed swing high',
                facts.latestConfirmedSwingHigh.price,
                facts.latestConfirmedSwingHigh.pivotTime,
                facts.latestConfirmedSwingHigh.confirmedAtTime,
                formatSoxlDisplayTimestamp,
            ),
            ...swingRows(
                'latestConfirmedSwingLow',
                'Latest confirmed swing low',
                facts.latestConfirmedSwingLow.price,
                facts.latestConfirmedSwingLow.pivotTime,
                facts.latestConfirmedSwingLow.confirmedAtTime,
                formatSoxlDisplayTimestamp,
            ),
        ],
    };
}

function buildSoxlDailySection(
    facts: SoxlDailyFacts,
): SoxlMarketFactsSectionView {
    return {
        key: 'soxlDaily',
        title: 'SOXL \u00b7 Daily',
        status: facts.status,
        statusLabel: statusLabels[facts.status],
        rows: [
            priceRow('latestCompleted.close', 'Latest completed daily price', facts.latestCompleted.close),
            dailyTimeRow('latestCompleted.time', 'Latest completed trading date', facts.latestCompleted.time),
            relationRow('closeVsEma20', 'Price compared with 20-period average', facts.closeVsEma20),
            relationRow('closeVsEma50', 'Price compared with 50-period average', facts.closeVsEma50),
            relationRow('closeVsEma200', 'Price compared with 200-period average', facts.closeVsEma200),
            relationRow('ema20VsEma50', '20-period average compared with 50-period average', facts.ema20VsEma50),
            relationRow('ema50VsEma200', '50-period average compared with 200-period average', facts.ema50VsEma200),
            relationRow('macdLineRelation', 'MACD line compared with reference line', macdLineRelation(facts)),
            signRow('macdHistogramSign', 'MACD histogram sign', facts.macdHistogramSign),
            relationRow(
                'closeVsLatestConfirmedSwingHigh',
                'Price compared with latest confirmed swing high',
                facts.closeVsLatestConfirmedSwingHigh,
            ),
            relationRow(
                'closeVsLatestConfirmedSwingLow',
                'Price compared with latest confirmed swing low',
                facts.closeVsLatestConfirmedSwingLow,
            ),
        ],
        technicalRows: [
            ...indicatorRows('ema20', '20-period exponential moving average (EMA 20)', facts.ema20, formatMoney, formatSoxlDailyTradingDate),
            ...indicatorRows('ema50', '50-period exponential moving average (EMA 50)', facts.ema50, formatMoney, formatSoxlDailyTradingDate),
            ...indicatorRows('ema200', '200-period exponential moving average (EMA 200)', facts.ema200, formatMoney, formatSoxlDailyTradingDate),
            ...indicatorRows('rsi14', 'Relative Strength Index (RSI 14)', facts.rsi14, formatDecimal, formatSoxlDailyTradingDate),
            ...indicatorRows('atr14', 'Average True Range (ATR 14)', facts.atr14, formatMoney, formatSoxlDailyTradingDate),
            ...macdRows('macd12269', facts.macd12269, formatSoxlDailyTradingDate),
            ...swingRows(
                'latestConfirmedSwingHigh',
                'Latest confirmed swing high',
                facts.latestConfirmedSwingHigh.price,
                facts.latestConfirmedSwingHigh.pivotTime,
                facts.latestConfirmedSwingHigh.confirmedAtTime,
                formatSoxlDailyTradingDate,
            ),
            ...swingRows(
                'latestConfirmedSwingLow',
                'Latest confirmed swing low',
                facts.latestConfirmedSwingLow.price,
                facts.latestConfirmedSwingLow.pivotTime,
                facts.latestConfirmedSwingLow.confirmedAtTime,
                formatSoxlDailyTradingDate,
            ),
        ],
    };
}

function buildMarketSection(
    key: 'qqq5m' | 'smh5m',
    title: string,
    facts: SoxlMarketFacts['qqq5m'],
): SoxlMarketFactsSectionView {
    return {
        key,
        title,
        status: facts.status,
        statusLabel: statusLabels[facts.status],
        rows: [
            priceRow('latestCompleted.close', 'Latest completed price', facts.latestCompleted.close),
            actualTimeRow('latestCompleted.time', 'Latest completed time', facts.latestCompleted.time),
            relationRow('closeVsEma20', 'Price compared with 20-period average', facts.closeVsEma20),
            relationRow('closeVsEma50', 'Price compared with 50-period average', facts.closeVsEma50),
            relationRow('ema20VsEma50', '20-period average compared with 50-period average', facts.ema20VsEma50),
            relationRow('macdLineRelation', 'MACD line compared with reference line', macdLineRelation(facts)),
            signRow('macdHistogramSign', 'MACD histogram sign', facts.macdHistogramSign),
        ],
        technicalRows: [
            row('symbol', 'Symbol', facts.symbol, facts.symbol),
            ...indicatorRows('ema20', '20-period exponential moving average (EMA 20)', facts.ema20, formatMoney, formatSoxlDisplayTimestamp),
            ...indicatorRows('ema50', '50-period exponential moving average (EMA 50)', facts.ema50, formatMoney, formatSoxlDisplayTimestamp),
            ...indicatorRows('rsi14', 'Relative Strength Index (RSI 14)', facts.rsi14, formatDecimal, formatSoxlDisplayTimestamp),
            ...macdRows('macd12269', facts.macd12269, formatSoxlDisplayTimestamp),
        ],
    };
}

function buildRegularSessionSection(
    facts: RegularSessionFacts,
): SoxlMarketFactsSectionView {
    return {
        key: 'regularSession',
        title: 'Regular session',
        status: facts.status,
        statusLabel: statusLabels[facts.status],
        rows: [
            priceRow('latestCompleted.close', 'Latest SOXL price', facts.latestCompleted.close),
            actualTimeRow('latestCompleted.time', 'Latest completed time', facts.latestCompleted.time),
            relationRow('closeVsVwap', 'Price compared with session average', facts.closeVsVwap),
            row(
                'rollingRelativeVolume.value',
                'Rolling relative volume',
                formatRatio(facts.rollingRelativeVolume.value),
                facts.rollingRelativeVolume.value,
                `${SOXL_SESSION_RELATIVE_VOLUME_LOOKBACK_BARS}-bar lookback`,
            ),
            actualTimeRow(
                'rollingRelativeVolume.time',
                'Rolling relative volume time',
                facts.rollingRelativeVolume.time,
            ),
            relationRow('closeVsPreviousSessionHigh', 'Price compared with previous-session high', facts.closeVsPreviousSessionHigh),
            relationRow('closeVsPreviousSessionLow', 'Price compared with previous-session low', facts.closeVsPreviousSessionLow),
            relationRow('closeVsOpeningRangeHigh', 'Price compared with opening-range high', facts.closeVsOpeningRangeHigh),
            relationRow('closeVsOpeningRangeLow', 'Price compared with opening-range low', facts.closeVsOpeningRangeLow),
            row('latestTradingDate', 'Latest represented trading date', formatTradingDate(facts.latestTradingDate), facts.latestTradingDate),
            row('previousTradingDate', 'Previous represented trading date', formatTradingDate(facts.previousTradingDate), facts.previousTradingDate),
            row('latestDateRelation', 'Latest-date relation', facts.latestDateRelation ?? unavailableLabel, facts.latestDateRelation),
            row(
                'latestRegularSessionCompleted',
                'Regular-session completion',
                formatBoolean(facts.latestRegularSessionCompleted),
                facts.latestRegularSessionCompleted,
            ),
            row(
                'openingRange30mCompleted',
                'Opening-range completion',
                formatBoolean(facts.openingRange30mCompleted),
                facts.openingRange30mCompleted,
            ),
        ],
        technicalRows: [
            ...indicatorRows('vwap', 'Session volume-weighted average price (VWAP)', facts.vwap, formatMoney, formatSoxlDisplayTimestamp),
            ...levelRows('previousRepresentedSession', 'Previous represented session', facts.previousRepresentedSession),
            ...levelRows('openingRange30m', 'Opening range 30 minute', facts.openingRange30m),
        ],
    };
}

export function buildSoxlMarketFactsView(
    facts: SoxlMarketFacts,
): SoxlMarketFactsView {
    return {
        status: facts.status,
        statusLabel: statusLabels[facts.status],
        providerId: facts.providerId ?? unavailableLabel,
        asOf: facts.asOf,
        asOfLabel: formatSoxlDisplayTimestamp(facts.asOf),
        coreStatus: facts.coreStatus,
        coreStatusLabel: statusLabels[facts.coreStatus],
        sessionStatus: facts.sessionStatus,
        sessionStatusLabel: statusLabels[facts.sessionStatus],
        issue: facts.issue,
        issueLabel: facts.issue === null ? null : issueLabels[facts.issue],
        sections: [
            buildSoxlFiveMinuteSection(facts.soxl5m),
            buildSoxlDailySection(facts.soxlDaily),
            buildMarketSection('qqq5m', 'QQQ \u00b7 5 minute', facts.qqq5m),
            buildMarketSection('smh5m', 'SMH \u00b7 5 minute', facts.smh5m),
            buildRegularSessionSection(facts.regularSession),
        ],
    };
}
