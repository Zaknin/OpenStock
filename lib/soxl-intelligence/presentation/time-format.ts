export const SOXL_DISPLAY_TIME_ZONE = 'Asia/Baku';

const NULL_TIMESTAMP_LABEL = '\u2014';

const displayDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: SOXL_DISPLAY_TIME_ZONE,
    timeZoneName: 'shortOffset',
});

const utcTradingDateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
});

function formatDisplayDateTime(date: Date): string {
    if (Number.isNaN(date.getTime())) {
        return NULL_TIMESTAMP_LABEL;
    }

    return displayDateTimeFormatter.format(date);
}

export function formatSoxlDisplayTimestamp(timestamp: number | null): string {
    if (timestamp === null) {
        return NULL_TIMESTAMP_LABEL;
    }

    return formatDisplayDateTime(new Date(timestamp * 1000));
}

export function formatSoxlDisplayIsoTimestamp(timestamp: string | null): string {
    if (timestamp === null) {
        return NULL_TIMESTAMP_LABEL;
    }

    return formatDisplayDateTime(new Date(timestamp));
}

export function formatSoxlDailyTradingDate(timestamp: number | null): string {
    if (timestamp === null) {
        return NULL_TIMESTAMP_LABEL;
    }

    const date = new Date(timestamp * 1000);

    if (Number.isNaN(date.getTime())) {
        return NULL_TIMESTAMP_LABEL;
    }

    return `${utcTradingDateFormatter.format(date)} \u00b7 trading date`;
}
