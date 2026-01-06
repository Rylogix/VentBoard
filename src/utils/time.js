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
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds <= 30) {
    return "just now";
  }

  if (diffSeconds < 0 && absSeconds <= 120) {
    return "just now";
  }

  const match = UNITS.find((unit) => absSeconds >= unit.seconds) || UNITS[UNITS.length - 1];
  const value = Math.round(absSeconds / match.seconds);

  if (rtf) {
    return diffSeconds >= 0 ? rtf.format(-value, match.unit) : rtf.format(value, match.unit);
  }

  const label = value === 1 ? match.unit : `${match.unit}s`;
  return diffSeconds >= 0 ? `${value} ${label} ago` : `in ${value} ${label}`;
}
