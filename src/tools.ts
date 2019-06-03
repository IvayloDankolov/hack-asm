import moment = require("moment");

export type Dict<T> = {
    [key: string]: T;
}

export function getTiming(start: moment.Moment, end: moment.Moment) {
    const duration = moment.duration(end.diff(start));
    return `${duration.seconds()}.${duration.milliseconds().toString().padStart(3, '0')}s`;
}