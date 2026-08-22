"use client";

import {
  Bar,
  BarChart,
  type ChartConfig,
  type DitherColor,
  Grid,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/dither-kit";

const COLORS: DitherColor[] = [
  "green",
  "blue",
  "purple",
  "pink",
  "orange",
  "red",
  "grey",
];

function colorAt(index: number): DitherColor {
  return COLORS[index % COLORS.length];
}

/** Single-series dither bar chart keyed by a per-row label. */
export function LabeledBarChart({
  data,
  valueLabel,
  color = "blue",
}: {
  data: { label: string; value: number }[];
  valueLabel: string;
  color?: DitherColor;
}) {
  if (data.length === 0) return null;
  const config: ChartConfig = { value: { color, label: valueLabel } };
  return (
    <BarChart data={data} config={config} className="h-56 w-full">
      <Grid />
      <Bar dataKey="value" />
      <XAxis dataKey="label" />
      <YAxis />
      <Tooltip labelKey="label" />
    </BarChart>
  );
}

/** Dither donut of category counts (e.g. box states, connector statuses). */
export function BreakdownPieChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const slices = data.filter((slice) => slice.value > 0);
  if (slices.length === 0) return null;
  const config: ChartConfig = Object.fromEntries(
    slices.map((slice, index) => [
      slice.label,
      { color: colorAt(index), label: slice.label },
    ])
  );
  return (
    <PieChart
      data={slices}
      config={config}
      dataKey="value"
      nameKey="label"
      innerRadius={0.55}
      className="h-56 w-full"
    >
      <Pie />
      <Legend />
      <Tooltip labelKey="label" />
    </PieChart>
  );
}
