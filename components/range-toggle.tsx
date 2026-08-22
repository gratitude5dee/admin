import Link from "next/link";

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "1w" },
  { days: 30, label: "1m" },
] as const;

/** 24h / 1w / 1m window switcher (server-rendered links on `?days=`). */
export function RangeToggle({
  days,
  basePath,
}: {
  days: number;
  basePath: string;
}) {
  return (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <Link
          key={range.days}
          href={`${basePath}?days=${range.days}`}
          className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
            days === range.days
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {range.label}
        </Link>
      ))}
    </div>
  );
}

export function rangeDays(raw: string | undefined): number {
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 7;
}
