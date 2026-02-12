'use client';

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';

const RESOURCE_TYPES = [
  { value: 'salesinvoices', label: 'Sales Invoices' },
  { value: 'supplierinvoices', label: 'Supplier Invoices' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'journals', label: 'Journals' },
  { value: 'accountingaccounts', label: 'Accounts' },
  { value: 'companyinformation', label: 'Company Info' },
];

const MANUAL_SIE_RESOURCE_TYPES = [
  { value: 'accountingaccounts', label: 'Accounts' },
  { value: 'journals', label: 'Journals' },
  { value: 'companyinformation', label: 'Company Info' },
];

interface ApiClient {
  get<T>(path: string): Promise<T>;
}

export interface ResourceBrowserProps {
  api: ApiClient;
  consentId: string;
  provider?: string;
}

// --- Structured renderers for manual-sie ---

interface AccountingAccount {
  accountNumber: string;
  name: string;
  type?: string;
  sruCode?: string;
  balanceCarriedForward?: number;
}

function AccountsTable({ data }: { data: AccountingAccount[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Account No.</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-[100px]">Type</TableHead>
          <TableHead className="w-[100px]">SRU Code</TableHead>
          <TableHead className="w-[140px] text-right">Opening Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((account) => (
          <TableRow key={account.accountNumber}>
            <TableCell className="font-mono">{account.accountNumber}</TableCell>
            <TableCell>{account.name}</TableCell>
            <TableCell>
              {account.type && (
                <Badge variant="secondary" className="capitalize">
                  {account.type}
                </Badge>
              )}
            </TableCell>
            <TableCell className="font-mono">{account.sruCode ?? '—'}</TableCell>
            <TableCell className="text-right font-mono">
              {account.balanceCarriedForward != null
                ? account.balanceCarriedForward.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface JournalEntry {
  accountNumber: string;
  accountName?: string;
  debit: number;
  credit: number;
  description?: string;
}

interface Journal {
  id: string;
  journalNumber: string;
  description?: string;
  registrationDate: string;
  entries: JournalEntry[];
  totalDebit?: { value: number; currencyCode: string };
  totalCredit?: { value: number; currencyCode: string };
}

function JournalCard({ journal }: { journal: Journal }) {
  const [expanded, setExpanded] = useState(false);

  const entries = journal.entries ?? [];
  const totalDebit = journal.totalDebit?.value ?? entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = journal.totalCredit?.value ?? entries.reduce((sum, e) => sum + e.credit, 0);
  const currency = journal.totalDebit?.currencyCode ?? 'SEK';

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-mono text-muted-foreground w-[60px] shrink-0">#{journal.journalNumber}</span>
        <span className="text-muted-foreground w-[90px] shrink-0">{journal.registrationDate}</span>
        <span className="flex-1 truncate">{journal.description || '—'}</span>
        <span className="font-mono text-right w-[100px] shrink-0 text-green-600">
          {totalDebit.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="font-mono text-right w-[100px] shrink-0 text-red-600">
          {totalCredit.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-xs text-muted-foreground w-[40px] shrink-0">{currency}</span>
      </button>
      {expanded && (
        <div className="border-t px-4 py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Account</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px] text-right">Debit</TableHead>
                <TableHead className="w-[120px] text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{entry.accountNumber}</TableCell>
                  <TableCell>{entry.accountName ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.description ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.debit > 0 ? entry.debit.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {entry.credit > 0 ? entry.credit.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function JournalsList({ data }: { data: Journal[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span className="w-4" />
        <span className="w-[60px]">No.</span>
        <span className="w-[90px]">Date</span>
        <span className="flex-1">Description</span>
        <span className="w-[100px] text-right">Debit</span>
        <span className="w-[100px] text-right">Credit</span>
        <span className="w-[40px]" />
      </div>
      {data.map((journal, i) => (
        <JournalCard key={`${journal.id}-${i}`} journal={journal} />
      ))}
    </div>
  );
}

interface CompanyInfo {
  companyName: string;
  organizationNumber?: string;
  baseCurrency?: string;
  fiscalYearStart?: string;
  vatNumber?: string;
  address?: {
    streetName?: string;
    cityName?: string;
    postalZone?: string;
    countryCode?: string;
  };
  contact?: {
    name?: string;
    telephone?: string;
    email?: string;
    website?: string;
  };
}

function CompanyInfoCard({ data }: { data: CompanyInfo[] }) {
  const info = data[0];
  if (!info) return <p className="text-sm text-muted-foreground">No company information available.</p>;

  const fields: { label: string; value: string | undefined }[] = [
    { label: 'Company Name', value: info.companyName },
    { label: 'Organization Number', value: info.organizationNumber },
    { label: 'Base Currency', value: info.baseCurrency },
    { label: 'Fiscal Year Start', value: info.fiscalYearStart },
    { label: 'VAT Number', value: info.vatNumber },
  ];

  if (info.address) {
    const addr = [info.address.streetName, info.address.postalZone, info.address.cityName, info.address.countryCode]
      .filter(Boolean)
      .join(', ');
    if (addr) fields.push({ label: 'Address', value: addr });
  }

  if (info.contact) {
    if (info.contact.name) fields.push({ label: 'Contact', value: info.contact.name });
    if (info.contact.email) fields.push({ label: 'Email', value: info.contact.email });
    if (info.contact.telephone) fields.push({ label: 'Phone', value: info.contact.telephone });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{info.companyName}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd>{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// --- Main component ---

export function ResourceBrowser({ api, consentId, provider }: ResourceBrowserProps) {
  const isManualSie = provider === 'manual-sie';
  const resourceTypes = isManualSie ? MANUAL_SIE_RESOURCE_TYPES : RESOURCE_TYPES;
  const defaultType = isManualSie ? 'accountingaccounts' : 'salesinvoices';

  const [resourceType, setResourceType] = useState(defaultType);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: unknown[]; totalCount: number; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (rt: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Record<string, unknown>>(
        `/api/v1/consents/${consentId}/${rt}?page=${p}&pageSize=20`,
      );
      // Normalize: singleton endpoints return { data: object } instead of { data: array, totalCount, ... }
      const rawData = result.data;
      if (rawData && !Array.isArray(rawData)) {
        setData({ data: [rawData as unknown], totalCount: 1, hasMore: false });
      } else {
        setData(result as unknown as { data: unknown[]; totalCount: number; hasMore: boolean });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and when resource type or page changes
  useState(() => { fetchData(resourceType, page); });

  const handleResourceChange = (value: string) => {
    setResourceType(value);
    setPage(1);
    fetchData(value, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData(resourceType, newPage);
  };

  const SINGLETON_TYPES = new Set(['companyinformation']);
  const isSingleton = SINGLETON_TYPES.has(resourceType);

  const renderData = () => {
    if (!data) return null;

    if (isManualSie) {
      switch (resourceType) {
        case 'accountingaccounts':
          return <AccountsTable data={data.data as AccountingAccount[]} />;
        case 'journals':
          return <JournalsList data={data.data as Journal[]} />;
        case 'companyinformation':
          return <CompanyInfoCard data={data.data as CompanyInfo[]} />;
      }
    }

    return (
      <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-4 text-xs">
        {JSON.stringify(data.data, null, 2)}
      </pre>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={resourceType}
          onChange={(e) => handleResourceChange(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {resourceTypes.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {rt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {data && (
        <>
          {isSingleton ? null : (
            <p className="text-xs text-muted-foreground">
              {data.totalCount} results | Page {page}
            </p>
          )}
          {renderData()}
          {isSingleton ? null : (
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={!data.hasMore}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
