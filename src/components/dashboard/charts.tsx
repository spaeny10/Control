"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import type {
  MonthPoint,
  MovementPoint,
  LeadsPoint,
} from "@/lib/kpi";

// Palette per the data-viz method (validated): categorical slots 1-2 for the
// leads chart; diverging blue/red + neutral gray for MRR movement (roll-off is
// deliberately neutral — it is expected, not churn). Identity never rides on
// color alone: legends + tooltips name every series.
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const RED = "#d03b3b";
const GRAY = "#898781";
const GRID = "#e1e0d9";
const MUTED = "#898781";

const fmtMoney = (v: number) =>
  `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v}`;

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: `1px solid ${GRID}`,
};

export function MrrTrendChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: MUTED }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: MUTED }}
          tickFormatter={fmtMoney}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [
            `$${Number(value).toLocaleString()}`,
            "MRR",
          ]}
        />
        <Area
          type="monotone"
          dataKey="mrr"
          stroke={BLUE}
          strokeWidth={2}
          fill={BLUE}
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MrrMovementChart({ data }: { data: MovementPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        stackOffset="sign"
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: MUTED }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: MUTED }}
          tickFormatter={fmtMoney}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            `$${Math.abs(Number(value)).toLocaleString()}`,
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={MUTED} />
        <Bar
          dataKey="newMrr"
          name="New MRR"
          stackId="mrr"
          fill={BLUE}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="rollOff"
          name="Project roll-off (expected)"
          stackId="mrr"
          fill={GRAY}
          maxBarSize={28}
        />
        <Bar
          dataKey="churn"
          name="True churn"
          stackId="mrr"
          fill={RED}
          radius={[0, 0, 4, 4]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadsChart({ data }: { data: LeadsPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: MUTED }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: MUTED }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="newCompany"
          name="New company"
          stackId="leads"
          fill={BLUE}
          maxBarSize={28}
        />
        <Bar
          dataKey="newProject"
          name="New project (existing customer)"
          stackId="leads"
          fill={ORANGE}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
