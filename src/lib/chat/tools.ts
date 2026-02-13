import { tool } from 'ai';
import { z } from 'zod';
import { getSyncedResources, getSyncState } from '@/lib/sync/db';
import { getJournalKPIs } from '@/lib/sie/journal-kpis';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Strip the _raw field from each record to avoid leaking raw provider data.
 */
function stripRaw(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map(({ _raw, ...rest }) => rest);
}

/**
 * Build the set of agent tools scoped to a specific consent.
 * All database queries are constrained to `consentId` via closure.
 */
export function createChatTools(consentId: string) {
  return {
    queryResources: tool({
      description:
        'Query synced accounting resources (invoices, customers, suppliers, journals, accounts, etc.) with optional filters. Returns paginated results.',
      inputSchema: z.object({
        resourceType: z
          .enum([
            'salesinvoices',
            'supplierinvoices',
            'customers',
            'suppliers',
            'journals',
            'accountingaccounts',
            'companyinformation',
            'payments',
            'accountingperiods',
            'financialdimensions',
            'balancesheet',
            'incomestatement',
            'trialbalances',
            'attachments',
          ])
          .describe('The type of resource to query'),
        page: z.number().int().min(1).default(1).describe('Page number (1-based)'),
        pageSize: z.number().int().min(1).max(50).default(20).describe('Results per page (max 50)'),
        status: z.string().optional().describe('Filter by status (e.g. "paid", "overdue", "sent")'),
        dateFrom: z.string().optional().describe('Filter: document date >= this (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Filter: document date <= this (YYYY-MM-DD)'),
        counterpartyName: z.string().optional().describe('Filter by customer/supplier name (partial match)'),
        accountNumber: z.string().optional().describe('Filter by account number (exact match)'),
      }),
      execute: async ({ resourceType, page, pageSize, status, dateFrom, dateTo, counterpartyName, accountNumber }) => {
        const result = await getSyncedResources(consentId, resourceType, {
          page,
          pageSize,
          status,
          dateFrom,
          dateTo,
          counterpartyName,
          accountNumber,
        });
        return {
          ...result,
          data: stripRaw(result.data),
        };
      },
    }),

    aggregateResources: tool({
      description:
        'Run an aggregate query (COUNT, SUM, AVG, MIN, MAX) on synced resources, optionally grouped by a column. Use this for questions like "total sales by month" or "number of overdue invoices".',
      inputSchema: z.object({
        resourceType: z
          .enum([
            'salesinvoices',
            'supplierinvoices',
            'customers',
            'suppliers',
            'journals',
            'accountingaccounts',
            'payments',
          ])
          .describe('The resource type to aggregate'),
        aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('Aggregation function'),
        column: z
          .enum(['total_amount', 'document_date', 'due_date'])
          .optional()
          .describe('Column to aggregate on (required for sum/avg/min/max)'),
        groupBy: z
          .enum(['status', 'currency_code', 'counterparty_name', 'account_number', 'month'])
          .optional()
          .describe('Group results by this column. "month" groups by document_date truncated to month.'),
        dateFrom: z.string().optional().describe('Filter: document date >= this (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Filter: document date <= this (YYYY-MM-DD)'),
        status: z.string().optional().describe('Filter by status'),
      }),
      execute: async ({ resourceType, aggregation, column, groupBy, dateFrom, dateTo, status }) => {
        const supabase = await createServiceClient();

        // Build the select expression
        const aggColumn = column ?? 'id';
        const aggExpr =
          aggregation === 'count'
            ? 'count'
            : `${aggColumn}.${aggregation}()`;

        const groupByColumn = groupBy === 'month' ? "date_trunc('month', document_date)" : groupBy;
        const selectParts: string[] = [];
        if (groupByColumn) selectParts.push(groupByColumn);
        selectParts.push(aggExpr);

        // For month grouping we need raw SQL via rpc or a direct query.
        // Since Supabase JS client doesn't support date_trunc in select,
        // we fall back to a raw SQL query for all aggregation.
        const groupByClause = groupBy
          ? `GROUP BY ${groupBy === 'month' ? "date_trunc('month', document_date)" : groupBy}`
          : '';
        const groupBySelect = groupBy === 'month'
          ? "to_char(date_trunc('month', document_date), 'YYYY-MM') as month"
          : groupBy
            ? groupBy
            : null;

        const aggSql =
          aggregation === 'count'
            ? 'COUNT(*)::int as value'
            : `${aggregation.toUpperCase()}(${aggColumn}) as value`;

        const selectClause = groupBySelect
          ? `${groupBySelect}, ${aggSql}`
          : aggSql;

        const conditions: string[] = [
          `consent_id = '${consentId}'`,
          `resource_type = '${resourceType}'`,
        ];
        if (dateFrom) conditions.push(`document_date >= '${dateFrom}'`);
        if (dateTo) conditions.push(`document_date <= '${dateTo}'`);
        if (status) conditions.push(`status = '${status}'`);

        const whereClause = conditions.join(' AND ');
        const orderClause = groupBySelect
          ? `ORDER BY ${groupBy === 'month' ? 'month' : groupBy}`
          : '';

        const sql = `SELECT ${selectClause} FROM synced_resources WHERE ${whereClause} ${groupByClause} ${orderClause}`;

        const { data, error } = await supabase.rpc('exec_sql', { query: sql }).single();

        // Fallback: if the rpc doesn't exist, use a simpler approach
        if (error) {
          // Use direct SQL via the Supabase REST endpoint
          const { data: rawData, error: rawError } = await supabase
            .from('synced_resources')
            .select('total_amount, status, currency_code, counterparty_name, account_number, document_date')
            .eq('consent_id', consentId)
            .eq('resource_type', resourceType)
            .gte('document_date', dateFrom ?? '1900-01-01')
            .lte('document_date', dateTo ?? '2099-12-31');

          if (rawError) {
            return { error: `Query failed: ${rawError.message}` };
          }

          const rows = rawData ?? [];

          // Do aggregation in JS
          if (!groupBy) {
            let value: number;
            if (aggregation === 'count') {
              value = rows.length;
            } else {
              const nums = rows
                .map((r) => r[column as keyof typeof r] as number | null)
                .filter((v): v is number => v != null);
              if (nums.length === 0) return { value: null };
              switch (aggregation) {
                case 'sum': value = nums.reduce((a, b) => a + b, 0); break;
                case 'avg': value = nums.reduce((a, b) => a + b, 0) / nums.length; break;
                case 'min': value = Math.min(...nums); break;
                case 'max': value = Math.max(...nums); break;
                default: value = 0;
              }
            }
            if (status) {
              return { value, filters: { status } };
            }
            return { value };
          }

          // Group in JS
          const groups = new Map<string, number[]>();
          for (const row of rows) {
            let key: string;
            if (groupBy === 'month') {
              const d = row.document_date as string | null;
              key = d ? d.slice(0, 7) : 'unknown';
            } else {
              key = String((row as Record<string, unknown>)[groupBy] ?? 'unknown');
            }
            if (status && row.status !== status) continue;
            const arr = groups.get(key) ?? [];
            if (aggregation !== 'count' && column) {
              const v = (row as Record<string, unknown>)[column] as number | null;
              if (v != null) arr.push(v);
            } else {
              arr.push(1);
            }
            groups.set(key, arr);
          }

          const result: Record<string, number | null>[] = [];
          for (const [key, vals] of groups) {
            let value: number | null;
            if (aggregation === 'count') {
              value = vals.length;
            } else if (vals.length === 0) {
              value = null;
            } else {
              switch (aggregation) {
                case 'sum': value = vals.reduce((a, b) => a + b, 0); break;
                case 'avg': value = vals.reduce((a, b) => a + b, 0) / vals.length; break;
                case 'min': value = Math.min(...vals); break;
                case 'max': value = Math.max(...vals); break;
                default: value = 0;
              }
            }
            result.push({ [groupBy]: key as unknown as number, value } as Record<string, number | null>);
          }

          return { groups: result };
        }

        return data;
      },
    }),

    getKPIs: tool({
      description:
        'Get financial KPIs (margins, ratios, liquidity, profitability, etc.) computed from synced accounting data. Supports optional date range.',
      inputSchema: z.object({
        startDate: z.string().optional().describe('Start date for KPI period (YYYY-MM-DD). Defaults to 12 months ago.'),
        endDate: z.string().optional().describe('End date for KPI period (YYYY-MM-DD). Defaults to today.'),
      }),
      execute: async ({ startDate, endDate }) => {
        const result = await getJournalKPIs(consentId, { startDate, endDate });
        return result;
      },
    }),

    getCompanyInfo: tool({
      description: 'Get company information (name, org number, address, contact details) for this consent.',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getSyncedResources(consentId, 'companyinformation', {
          page: 1,
          pageSize: 1,
        });
        if (result.data.length === 0) {
          return { error: 'No company information synced for this consent.' };
        }
        const { _raw, ...info } = result.data[0]!;
        return info;
      },
    }),

    getSyncStatus: tool({
      description:
        'Check what resource types have been synced and how many records are available. Use this to understand what data you can query.',
      inputSchema: z.object({}),
      execute: async () => {
        const states = await getSyncState(consentId);
        return {
          resourceTypes: states.map((s) => ({
            type: s.resource_type,
            status: s.status,
            recordCount: s.records_synced ?? 0,
            lastSyncAt: s.last_sync_at,
          })),
        };
      },
    }),
  };
}
