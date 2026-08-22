import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatRowProps {
  stats: { label: string; value: number }[];
}

export function StatRow({ stats }: StatRowProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="min-w-[140px] flex-1">
          <CardHeader>
            <CardTitle className="text-2xl">{stat.value}</CardTitle>
            <CardDescription>{stat.label}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
