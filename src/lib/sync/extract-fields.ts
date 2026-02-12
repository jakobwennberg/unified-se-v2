import { ResourceType } from '@/lib/types/dto';
import type {
  SalesInvoiceDto,
  SupplierInvoiceDto,
  CustomerDto,
  SupplierDto,
  JournalDto,
  AccountingAccountDto,
  CompanyInformationDto,
  PaymentDto,
  AccountingPeriodDto,
  FinancialDimensionDto,
} from '@/lib/types/dto';
import type { ExtractedFields } from './types';

/** Normalize empty/whitespace-only strings to null (Postgres DATE rejects ''). */
function dateOrNull(value: string | undefined | null): string | null {
  return value && value.trim() !== '' ? value : null;
}

/** Normalize empty strings to null for text columns. */
function textOrNull(value: string | undefined | null): string | null {
  return value && value.trim() !== '' ? value : null;
}

/**
 * Extract indexed column values from a canonical DTO based on resource type.
 * These fields are stored as columns for efficient querying/filtering.
 */
export function extractFields(resourceType: ResourceType, dto: Record<string, unknown>): ExtractedFields {
  switch (resourceType) {
    case ResourceType.SalesInvoices: {
      const inv = dto as unknown as SalesInvoiceDto;
      return {
        external_id: inv.id,
        document_date: dateOrNull(inv.issueDate),
        due_date: dateOrNull(inv.dueDate),
        currency_code: textOrNull(inv.currencyCode),
        total_amount: inv.legalMonetaryTotal?.payableAmount?.value ?? null,
        status: textOrNull(inv.status),
        counterparty_name: textOrNull(inv.customer?.name),
        account_number: null,
      };
    }

    case ResourceType.SupplierInvoices: {
      const inv = dto as unknown as SupplierInvoiceDto;
      return {
        external_id: inv.id,
        document_date: dateOrNull(inv.issueDate),
        due_date: dateOrNull(inv.dueDate),
        currency_code: textOrNull(inv.currencyCode),
        total_amount: inv.legalMonetaryTotal?.payableAmount?.value ?? null,
        status: textOrNull(inv.status),
        counterparty_name: textOrNull(inv.supplier?.name),
        account_number: null,
      };
    }

    case ResourceType.Customers: {
      const cust = dto as unknown as CustomerDto;
      return {
        external_id: cust.id,
        document_date: null,
        due_date: null,
        currency_code: null,
        total_amount: null,
        status: cust.active ? 'active' : 'inactive',
        counterparty_name: textOrNull(cust.party?.name),
        account_number: null,
      };
    }

    case ResourceType.Suppliers: {
      const sup = dto as unknown as SupplierDto;
      return {
        external_id: sup.id,
        document_date: null,
        due_date: null,
        currency_code: null,
        total_amount: null,
        status: sup.active ? 'active' : 'inactive',
        counterparty_name: textOrNull(sup.party?.name),
        account_number: null,
      };
    }

    case ResourceType.Journals: {
      const j = dto as unknown as JournalDto;
      return {
        external_id: j.id,
        document_date: dateOrNull(j.registrationDate),
        due_date: null,
        currency_code: null,
        total_amount: j.totalDebit?.value ?? null,
        status: null,
        counterparty_name: null,
        account_number: null,
      };
    }

    case ResourceType.AccountingAccounts: {
      const acc = dto as unknown as AccountingAccountDto;
      return {
        external_id: acc.accountNumber,
        document_date: null,
        due_date: null,
        currency_code: null,
        total_amount: acc.balanceCarriedForward ?? null,
        status: acc.active ? 'active' : 'inactive',
        counterparty_name: null,
        account_number: textOrNull(acc.accountNumber),
      };
    }

    case ResourceType.CompanyInformation: {
      const co = dto as unknown as CompanyInformationDto;
      return {
        external_id: 'company',
        document_date: null,
        due_date: null,
        currency_code: textOrNull(co.baseCurrency),
        total_amount: null,
        status: null,
        counterparty_name: textOrNull(co.companyName),
        account_number: null,
      };
    }

    case ResourceType.Payments: {
      const p = dto as unknown as PaymentDto;
      return {
        external_id: p.id,
        document_date: dateOrNull(p.paymentDate),
        due_date: null,
        currency_code: textOrNull(p.amount?.currencyCode),
        total_amount: p.amount?.value ?? null,
        status: null,
        counterparty_name: null,
        account_number: null,
      };
    }

    case ResourceType.AccountingPeriods: {
      const period = dto as unknown as AccountingPeriodDto;
      return {
        external_id: period.id,
        document_date: dateOrNull(period.fromDate),
        due_date: dateOrNull(period.toDate),
        currency_code: null,
        total_amount: null,
        status: textOrNull(period.status),
        counterparty_name: null,
        account_number: null,
      };
    }

    case ResourceType.FinancialDimensions: {
      const dim = dto as unknown as FinancialDimensionDto;
      return {
        external_id: dim.id,
        document_date: null,
        due_date: null,
        currency_code: null,
        total_amount: null,
        status: null,
        counterparty_name: textOrNull(dim.name),
        account_number: null,
      };
    }

    default: {
      // Fallback for report types or any new resource types
      const id = (dto as Record<string, unknown>)['id'] ?? (dto as Record<string, unknown>)['accountNumber'] ?? 'unknown';
      return {
        external_id: String(id),
        document_date: null,
        due_date: null,
        currency_code: null,
        total_amount: null,
        status: null,
        counterparty_name: null,
        account_number: null,
      };
    }
  }
}
