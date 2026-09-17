"use client";

import {
  Bar,
  BarChart,
  type ChartConfig,
  Grid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/dither-kit";

const config: ChartConfig = {
  prompt: { color: "blue", label: "prompt" },
  completion: { color: "green", label: "completion" },
};

/**
 * Prompt-vs-completion bars keyed by a per-row label — a user on the Tokens
 * user view, a model / provider / stage / … key on the group tabs.
 */
export function TokensChart({
  data,
}: {
  data: { label: string; prompt: number; completion: number }[];
}) {
  if (data.length === 0) return null;
  return (
    <BarChart data={data} config={config} className="h-56 w-full">
      <Grid />
      <Bar dataKey="prompt" />
      <Bar dataKey="completion" />
      <XAxis dataKey="label" />
      <YAxis />
      <Legend />
      <Tooltip labelKey="label" />
    </BarChart>
  );
}
