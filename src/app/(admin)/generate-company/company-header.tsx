import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CompanyHeaderProps {
  companyName: string;
  description: string;
  orgNumber: string;
  industry: string;
  size: string;
  fiscalYear: string;
}

export function CompanyHeader({
  companyName,
  description,
  orgNumber,
  industry,
  size,
  fiscalYear,
}: CompanyHeaderProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">{companyName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <p className="font-mono text-sm text-muted-foreground">{orgNumber}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">
              {industry.replace('_', ' ')}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {size}
            </Badge>
            <Badge variant="outline">FY {fiscalYear}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
