import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SIEParseResult } from '@/lib/sie/types';

const ACCOUNT_CLASS_LABELS: Record<string, string> = {
  '1': 'Assets',
  '2': 'Equity & Liabilities',
  '3': 'Revenue',
  '4': 'Cost of Goods',
  '5': 'External Costs',
  '6': 'External Costs (cont.)',
  '7': 'Personnel Costs',
  '8': 'Financial Items',
};

interface DataOverviewProps {
  sieData: SIEParseResult;
}

export function DataOverview({ sieData }: DataOverviewProps) {
  const { metadata, accounts, transactions, balances } = sieData;

  // Unique verifications
  const verificationCount = new Set(
    transactions.map((t) => `${t.verificationSeries}-${t.verificationNumber}`),
  ).size;

  // Account distribution by class
  const classCounts: Record<string, number> = {};
  for (const acc of accounts) {
    const cls = acc.accountNumber.charAt(0);
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }
  const sortedClasses = Object.entries(classCounts).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Summary Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <Row label="Transactions" value={transactions.length.toLocaleString()} />
              <Row label="Verifications" value={verificationCount.toLocaleString()} />
              <Row label="Unique Accounts" value={accounts.length.toLocaleString()} />
              <Row label="Balance Entries" value={balances.length.toLocaleString()} />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Period Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Period</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <Row
                label="Fiscal Year"
                value={
                  metadata.fiscalYearStart && metadata.fiscalYearEnd
                    ? `${metadata.fiscalYearStart} — ${metadata.fiscalYearEnd}`
                    : '—'
                }
              />
              <Row label="Currency" value={metadata.currency || '—'} />
              <Row label="SIE Type" value={metadata.sieType || '—'} />
              {metadata.generatedDate && (
                <Row label="Generated" value={metadata.generatedDate} />
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Account Distribution */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Account Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {sortedClasses.map(([cls, count]) => (
                <Row
                  key={cls}
                  label={`Class ${cls}: ${ACCOUNT_CLASS_LABELS[cls] || 'Other'}`}
                  value={`${count} accounts`}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 text-muted-foreground">{label}</td>
      <td className="py-1.5 text-right font-mono">{value}</td>
    </tr>
  );
}
