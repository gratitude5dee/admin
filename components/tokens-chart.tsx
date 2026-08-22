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

export function TokensChart({
  data,
}: {
  data: { user: string; prompt: number; completion: number }[];
}) {
  if (data.length === 0) return null;
  return (
    <BarChart data={data} config={config} className="h-56 w-full">
      <Grid />
      <Bar dataKey="prompt" />
      <Bar dataKey="completion" />
      <XAxis dataKey="user" />
      <YAxis />
      <Legend />
      <Tooltip labelKey="user" />
    </BarChart>
  );
}
