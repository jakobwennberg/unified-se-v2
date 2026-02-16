import { Card, CardContent } from '@/components/ui/card';
import { FileCheck, CheckCircle, Zap } from 'lucide-react';

interface StatsCardsProps {
  totalConsents: number;
  activeConsents: number;
  plan: string;
}

export function StatsCards({ totalConsents, activeConsents, plan }: StatsCardsProps) {
  const stats = [
    {
      title: 'Total Consents',
      value: totalConsents,
      icon: FileCheck,
    },
    {
      title: 'Active',
      value: activeConsents,
      icon: CheckCircle,
    },
    {
      title: 'Plan',
      value: plan.charAt(0).toUpperCase() + plan.slice(1),
      icon: Zap,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </p>
                <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
              </div>
              <div className="rounded-lg p-2 bg-muted">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
