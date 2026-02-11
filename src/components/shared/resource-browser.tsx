'use client';

import { useState } from 'react';

const RESOURCE_TYPES = [
  { value: 'salesinvoices', label: 'Sales Invoices' },
  { value: 'supplierinvoices', label: 'Supplier Invoices' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'journals', label: 'Journals' },
  { value: 'accountingaccounts', label: 'Accounts' },
  { value: 'companyinformation', label: 'Company Info' },
];

interface ApiClient {
  get<T>(path: string): Promise<T>;
}

export interface ResourceBrowserProps {
  api: ApiClient;
  consentId: string;
}

export function ResourceBrowser({ api, consentId }: ResourceBrowserProps) {
  const [resourceType, setResourceType] = useState('salesinvoices');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: unknown[]; totalCount: number; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (rt: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ data: unknown[]; totalCount: number; hasMore: boolean }>(
        `/api/v1/consents/${consentId}/${rt}?page=${p}&pageSize=20`,
      );
      setData(result);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={resourceType}
          onChange={(e) => handleResourceChange(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {RESOURCE_TYPES.map((rt) => (
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
          <p className="text-xs text-muted-foreground">
            {data.totalCount} results | Page {page}
          </p>
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-4 text-xs">
            {JSON.stringify(data.data, null, 2)}
          </pre>
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
        </>
      )}
    </div>
  );
}
