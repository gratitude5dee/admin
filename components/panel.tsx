import type { ReactNode } from "react";

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-mono text-xs text-foreground">{title}</h2>
      {note ? (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {note}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const ACCENTS = {
  green: "text-emerald-400",
  blue: "text-sky-400",
  purple: "text-violet-400",
  orange: "text-orange-400",
  pink: "text-pink-400",
  none: "text-foreground",
} as const;

export type StatAccent = keyof typeof ACCENTS;

export function Stat({
  label,
  value,
  sub,
  accent = "none",
}: {
  label: string;
  value: string;
  /** Small caption under the value, e.g. "2.3 GB / 7.6 GB". */
  sub?: string;
  accent?: StatAccent;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 font-mono tabular-nums ${
          sub ? "text-xl" : "text-sm"
        } ${ACCENTS[accent]}`}
      >
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

export function LoadError({ error }: { error: string }) {
  return (
    <p className="font-mono text-[11px] text-red-400">
      Failed to load: {error}
    </p>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (ReactNode | null)[][];
}) {
  if (rows.length === 0) {
    return (
      <p className="font-mono text-[11px] text-muted-foreground">No data.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border-b border-border pb-1 pr-4 font-mono text-[10px] font-normal text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-border/50 py-1.5 pr-4 font-mono text-[11px] text-foreground tabular-nums"
                >
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
