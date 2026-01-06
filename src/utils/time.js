const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

const UNITS = [
  { unit: "year", seconds: 60 * 60 * 24 * 365 },
  { unit: "month", seconds: 60 * 60 * 24 * 30 },
  { unit: "day", seconds: 60 * 60 * 24 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

export function formatRelativeTime(isoDate, now = new Date()) {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  const match = UNITS.find((unit) => absSeconds >= unit.seconds) || UNITS[UNITS.length - 1];
  const value = Math.round(diffSeconds / match.seconds);

  if (rtf) {
    return rtf.format(value, match.unit);
  }

  const label = Math.abs(value) === 1 ? match.unit : `${match.unit}s`;
  return value < 0 ? `${Math.abs(value)} ${label} ago` : `in ${value} ${label}`;
}
