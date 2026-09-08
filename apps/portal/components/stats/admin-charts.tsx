"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/common/empty-state";
import { Shield, Grid3x3, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeeklyGrowthPoint } from "@/components/stats/growth-bucket";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ChartCardHeader({
  icon: Icon,
  accent,
  title,
  description,
}: {
  icon: LucideIcon;
  accent: string;
  title: string;
  description: string;
}) {
  return (
    <CardHeader className="flex-row items-center gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklch, ${accent} 16%, transparent)` }}
      >
        <Icon className="size-4" style={{ color: accent }} aria-hidden />
      </div>
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
    </CardHeader>
  );
}

export interface RoleDistributionDatum {
  role: string;
  employees: number;
}

interface RoleDistributionChartProps {
  data: RoleDistributionDatum[];
  className?: string;
}

// Client Component: ChartContainer/recharts need the browser. The page
// fetches and shapes the data server-side, this just renders it.
export function RoleDistributionChart({ data, className }: RoleDistributionChartProps) {
  const occupied = data.filter((d) => d.employees > 0);
  const total = occupied.reduce((sum, d) => sum + d.employees, 0);

  const config = occupied.reduce((acc, entry, index) => {
    acc[entry.role] = { label: entry.role, color: PALETTE[index % PALETTE.length] };
    return acc;
  }, {} as ChartConfig) satisfies ChartConfig;

  const chartData = occupied.map((entry, index) => ({
    ...entry,
    fill: PALETTE[index % PALETTE.length],
  }));

  return (
    <Card className={className}>
      <ChartCardHeader
        icon={Shield}
        accent="var(--chart-2)"
        title="Employees by role"
        description="How the Access Matrix's rows are actually staffed."
      />
      <CardContent>
        {occupied.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No employees assigned yet"
            description="Add an employee and give them a role to see the split here."
          />
        ) : (
          <div className="relative">
            <ChartContainer config={config} className="aspect-auto h-56 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="role" />} />
                <Pie
                  data={chartData}
                  dataKey="employees"
                  nameKey="role"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={2}
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <ChartLegend content={<ChartLegendContent nameKey="role" />} />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-2xl leading-none font-semibold tabular-nums">{total}</p>
              <p className="mt-1 text-xs text-muted-foreground">staffed</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface ApplicationGrantsDatum {
  application: string;
  grants: number;
}

interface AccessByApplicationChartProps {
  data: ApplicationGrantsDatum[];
  className?: string;
}

const grantsChartConfig = {
  grants: { label: "Roles granted", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function AccessByApplicationChart({ data, className }: AccessByApplicationChartProps) {
  return (
    <Card className={cn(className)}>
      <ChartCardHeader
        icon={Grid3x3}
        accent="var(--chart-1)"
        title="Access grants by application"
        description="How many roles can currently open each application."
      />
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            icon={Grid3x3}
            title="No applications yet"
            description="The application catalog belongs to Super Admin — once one exists, grant it to a role here."
          />
        ) : (
          <ChartContainer config={grantsChartConfig} className="aspect-auto h-56 w-full">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="application" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="grants"
                fill="var(--color-grants)"
                radius={[6, 6, 0, 0]}
                maxBarSize={56}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface EmployeeGrowthChartProps {
  data: WeeklyGrowthPoint[];
  className?: string;
}

const growthChartConfig = {
  count: { label: "New employees", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function EmployeeGrowthChart({ data, className }: EmployeeGrowthChartProps) {
  const total = data.reduce((sum, point) => sum + point.count, 0);

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "color-mix(in oklch, var(--chart-3) 16%, transparent)" }}
          >
            <TrendingUp className="size-4" style={{ color: "var(--chart-3)" }} aria-hidden />
          </div>
          <div>
            <CardTitle>Employee growth</CardTitle>
            <CardDescription>New employees per week, last {data.length} weeks.</CardDescription>
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {total} added
        </span>
      </div>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No new employees this window"
            description="Add an employee and this fills in with a real trend line."
          />
        ) : (
          <ChartContainer config={growthChartConfig} className="aspect-auto h-56 w-full">
            <AreaChart data={data} margin={{ left: -20 }}>
              <defs>
                <linearGradient id="fillGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="weekLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Area
                dataKey="count"
                type="monotone"
                fill="url(#fillGrowth)"
                stroke="var(--color-count)"
                strokeWidth={2}
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
