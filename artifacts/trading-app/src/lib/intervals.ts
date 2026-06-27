export type IntervalUnit = "s" | "m" | "h" | "d" | "w" | "mo";

export type IntervalConfig = {
  value: number;
  unit: IntervalUnit;
  seconds: number;
  milliseconds: number;
  label: string;
};

export type IntervalGroupId =
  | "ticks"
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks"
  | "months";

const INTERVAL_PATTERN = /^([1-9][0-9]*)(s|m|h|d|w|mo)$/;
const UNIT_SECONDS: Record<IntervalUnit, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 7 * 86400,
  mo: 30 * 86400,
};

export function parseIntervalConfig(interval: string): IntervalConfig | null {
  const match = interval.trim().toLowerCase().match(INTERVAL_PATTERN);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  const unit = match[2] as IntervalUnit;
  const seconds = value * UNIT_SECONDS[unit];

  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 365 * 24 * 3600) {
    return null;
  }

  const label =
    unit === "w"
      ? `${value * 7}d`
      : unit === "mo"
        ? `${value * 30}d`
        : `${value}${unit}`;

  return {
    value,
    unit,
    seconds,
    milliseconds: seconds * 1000,
    label,
  };
}

export function normalizeInterval(interval: string): string | null {
  return parseIntervalConfig(interval)?.label ?? null;
}

export function normalizeIntervalKey(interval: string): string | null {
  const value = interval.trim().toLowerCase();
  if (/^[1-9][0-9]*t$/.test(value)) return value;
  return parseIntervalConfig(value) ? value : null;
}

export function intervalToChartInterval(interval: string): string | null {
  return normalizeInterval(interval);
}

export function intervalGroup(interval: string): IntervalGroupId | null {
  const value = interval.trim().toLowerCase();
  if (/^[1-9][0-9]*t$/.test(value)) return "ticks";

  const config = parseIntervalConfig(value);
  if (!config) return null;

  if (config.unit === "s") return "seconds";
  if (config.unit === "m") return "minutes";
  if (config.unit === "h") return "hours";
  if (config.unit === "w") return "weeks";
  if (config.unit === "mo") return "months";
  return "days";
}

export function formatIntervalButton(interval: string): string {
  const value = interval.trim().toLowerCase();
  const tickMatch = value.match(/^([1-9][0-9]*)t$/);
  if (tickMatch) return `${tickMatch[1]}T`;

  const match = value.match(/^([1-9][0-9]*)(s|m|h|d|w|mo)$/);
  if (!match) return interval;

  const amount = match[1];
  const unit = match[2] as IntervalUnit;
  if (unit === "w") return `${amount}W`;
  if (unit === "mo") return `${amount}M`;
  if (unit === "d") return `${amount}D`;
  return `${amount}${unit}`;
}

export function secondsUntilIntervalClose(nowMs: number, interval: string): number | null {
  const config = parseIntervalConfig(interval);
  if (!config) return null;

  const elapsed = nowMs % config.milliseconds;
  const remainingMs = elapsed === 0 ? config.milliseconds : config.milliseconds - elapsed;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const two = (value: number) => value.toString().padStart(2, "0");

  if (days > 0) return `${days}d ${two(hours)}:${two(minutes)}:${two(secs)}`;
  if (hours > 0) return `${hours}:${two(minutes)}:${two(secs)}`;
  return `${two(minutes)}:${two(secs)}`;
}

export function supportsSecondIntervals(symbol: string): boolean {
  return symbol.endsWith("/USDT") || symbol.endsWith("/USDC");
}

export function supportsTickIntervals(): boolean {
  return false;
}
