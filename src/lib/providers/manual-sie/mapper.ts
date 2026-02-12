// Maps SIEParseResult → platform DTOs
import type { SIEParseResult, SIEAccount, SIETransaction } from './parser';
import type {
  AccountingAccountDto,
  AccountType,
  JournalDto,
  AccountingEntryDto,
  CompanyInformationDto,
} from '@/lib/types/dto';

/**
 * Derive account type from Swedish BAS plan account number ranges.
 */
function deriveAccountType(accountNumber: string): AccountType {
  const first = accountNumber[0];
  switch (first) {
    case '1': return 'asset';
    case '2': {
      const prefix = parseInt(accountNumber.slice(0, 2), 10);
      return prefix >= 20 && prefix <= 20 ? 'equity' : 'liability';
    }
    case '3': return 'revenue';
    case '4':
    case '5':
    case '6':
    case '7':
    case '8': return 'expense';
    default: return 'other';
  }
}

/**
 * Maps SIE accounts (#KONTO + #SRU + #IB) → AccountingAccountDto[]
 */
export function mapSieAccounts(result: SIEParseResult): AccountingAccountDto[] {
  // Build opening balance lookup (year index 0 = current year)
  const ibMap = new Map<string, number>();
  for (const b of result.balances) {
    if (b.balanceType === 'IB' && b.yearIndex === 0) {
      ibMap.set(b.accountNumber, b.amount);
    }
  }

  return result.accounts.map((acc: SIEAccount): AccountingAccountDto => ({
    accountNumber: acc.accountNumber,
    name: acc.accountName,
    description: acc.accountGroup || undefined,
    type: deriveAccountType(acc.accountNumber),
    active: true,
    balanceCarriedForward: ibMap.get(acc.accountNumber) ?? undefined,
    sruCode: acc.taxCode,
  }));
}

/**
 * Maps SIE transactions (#VER/#TRANS) → JournalDto[]
 * Groups transactions by series + number.
 */
export function mapSieJournals(result: SIEParseResult): JournalDto[] {
  // Build account name lookup
  const accountNames = new Map<string, string>();
  for (const acc of result.accounts) {
    accountNames.set(acc.accountNumber, acc.accountName);
  }

  // Group transactions by series + number
  const grouped = new Map<string, SIETransaction[]>();
  for (const tx of result.transactions) {
    const key = `${tx.verificationSeries}:${tx.verificationNumber}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tx);
  }

  const journals: JournalDto[] = [];
  for (const [key, txs] of grouped) {
    const [series = '', number = ''] = key.split(':');
    const first = txs[0]!;

    const entries: AccountingEntryDto[] = txs.map((tx) => ({
      accountNumber: tx.accountNumber,
      accountName: accountNames.get(tx.accountNumber),
      debit: tx.amount > 0 ? tx.amount : 0,
      credit: tx.amount < 0 ? Math.abs(tx.amount) : 0,
      transactionDate: formatSieDate(tx.verificationDate),
      description: tx.rowText || undefined,
      financialDimensions: buildDimensions(tx),
    }));

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    const currency = result.metadata.currency || 'SEK';

    journals.push({
      id: `${series}-${number}`,
      journalNumber: number,
      series: { id: series, description: `Series ${series}` },
      description: first.verificationText || undefined,
      registrationDate: formatSieDate(first.verificationDate),
      entries,
      totalDebit: { value: round2(totalDebit), currencyCode: currency },
      totalCredit: { value: round2(totalCredit), currencyCode: currency },
    });
  }

  return journals;
}

/**
 * Maps SIE metadata → CompanyInformationDto
 */
export function mapSieCompanyInfo(result: SIEParseResult): CompanyInformationDto {
  return {
    companyName: result.metadata.companyName,
    organizationNumber: result.metadata.orgNumber,
    fiscalYearStart: result.metadata.fiscalYearStart ?? undefined,
    baseCurrency: result.metadata.currency,
  };
}

// --- Helpers ---

function formatSieDate(dateStr: string): string {
  if (!dateStr) return '';
  // Already formatted as YYYY-MM-DD
  if (dateStr.includes('-')) return dateStr;
  // YYYYMMDD → YYYY-MM-DD
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildDimensions(tx: SIETransaction) {
  const dims = [];
  if (tx.costCenter) {
    dims.push({ dimensionId: '1', dimensionValueId: tx.costCenter, name: 'Cost Center' });
  }
  if (tx.project) {
    dims.push({ dimensionId: '6', dimensionValueId: tx.project, name: 'Project' });
  }
  return dims.length > 0 ? dims : undefined;
}
