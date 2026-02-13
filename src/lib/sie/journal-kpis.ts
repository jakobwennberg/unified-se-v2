/**
 * KPI computation from synced provider data.
 *
 * Priority order:
 * 1. Account balances (IB/UB from accounting accounts) → construct SIEParseResult → calculateKPIs()
 * 2. Journal entries with reconciliation gate (fallback, less accurate)
 *
 * The account-balance path uses the provider's own IB (balanceBroughtForward) and
 * UB (balanceCarriedForward) — these are authoritative aggregate values from the
 * accounting system, not reconstructed from individual journal entries.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { calculateKPIs } from './kpi';
import type { SIEBalance, SIEParseResult, SIEKPIs } from './types';
import type { JournalDto, AccountingAccountDto } from '@/lib/types/dto';
import {
  SWEDISH_ACCOUNTS,
  CORPORATE_TAX_RATE,
  EQUITY_PORTION_OF_UNTAXED_RESERVES,
  getAccountType,
  type AccountRange,
} from './accounts';

// ---------------------------------------------------------------------------
// Data loading (paginated — Supabase defaults to 1000 rows)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

async function loadAllRows(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  consentId: string,
  resourceType: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('synced_resources')
      .select('data')
      .eq('consent_id', consentId)
      .eq('resource_type', resourceType)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      const msg = typeof error.message === 'string' && error.message.startsWith('<')
        ? `Supabase returned an error (${error.code ?? 'unknown'})`
        : error.message;
      throw new Error(`Failed to load ${resourceType}: ${msg}`);
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Account-balance path: construct trial balance from synced accounts
// ---------------------------------------------------------------------------

/**
 * Build SIEParseResult from accounting accounts that have both IB and UB.
 *
 * Mapping per account:
 *   IB  = balanceBroughtForward  (opening balance, start of fiscal year)
 *   UB  = balanceCarriedForward  (closing balance, end of period)
 *   RES = UB - IB               (period movement = income statement result)
 */
function accountsToSIE(accounts: AccountingAccountDto[]): SIEParseResult {
  const balances: SIEBalance[] = [];

  for (const acct of accounts) {
    const ib = acct.balanceBroughtForward ?? 0;
    const ub = acct.balanceCarriedForward ?? 0;

    balances.push({
      accountNumber: acct.accountNumber,
      balanceType: 'IB',
      yearIndex: 0,
      amount: ib,
    });
    balances.push({
      accountNumber: acct.accountNumber,
      balanceType: 'UB',
      yearIndex: 0,
      amount: ub,
    });
    balances.push({
      accountNumber: acct.accountNumber,
      balanceType: 'RES',
      yearIndex: 0,
      amount: ub - ib,
    });
  }

  return {
    metadata: {
      companyName: '',
      currency: 'SEK',
      generatedDate: null,
      sieType: null,
      fiscalYearStart: null,
      fiscalYearEnd: null,
    },
    accounts: [],
    dimensions: [],
    transactions: [],
    balances,
  };
}

/**
 * Check if accounts have authoritative balance data (both IB and UB).
 * Returns true if at least some accounts have both fields set.
 */
function hasAuthoritativeBalances(accounts: AccountingAccountDto[]): boolean {
  return accounts.some(
    (a) => a.balanceBroughtForward != null && a.balanceCarriedForward != null,
  );
}

// ---------------------------------------------------------------------------
// Journal-based fallback with reconciliation gate
// ---------------------------------------------------------------------------

interface AccountBucket {
  openingBalance: number;
  prePrev: number;
  prev: number;
  current: number;
}

function buildAccountBuckets(
  journals: JournalDto[],
  accounts: AccountingAccountDto[],
  startDate: string,
  endDate: string,
): Map<string, AccountBucket> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodMs - 86_400_000);
  const prevStartStr = prevStart.toISOString().slice(0, 10);

  const buckets = new Map<string, AccountBucket>();

  function getOrCreate(accountNumber: string): AccountBucket {
    let b = buckets.get(accountNumber);
    if (!b) {
      b = { openingBalance: 0, prePrev: 0, prev: 0, current: 0 };
      buckets.set(accountNumber, b);
    }
    return b;
  }

  for (const acct of accounts) {
    if (acct.balanceCarriedForward != null && getAccountType(acct.accountNumber) === 'BALANCE_SHEET') {
      const bucket = getOrCreate(acct.accountNumber);
      bucket.openingBalance = acct.balanceCarriedForward;
    }
  }

  for (const journal of journals) {
    for (const entry of journal.entries) {
      const amount = entry.debit - entry.credit;
      const date = entry.transactionDate ?? journal.registrationDate;
      const bucket = getOrCreate(entry.accountNumber);

      if (date >= startDate && date <= endDate) {
        bucket.current += amount;
      } else if (date >= prevStartStr && date < startDate) {
        bucket.prev += amount;
      } else if (date < prevStartStr) {
        bucket.prePrev += amount;
      }
    }
  }

  return buckets;
}

/** Reconciliation check: total debits must equal total credits across all entries. */
function checkReconciliation(journals: JournalDto[]): { balanced: boolean; drift: number } {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const j of journals) {
    for (const e of j.entries) {
      totalDebit += e.debit;
      totalCredit += e.credit;
    }
  }
  const drift = Math.abs(totalDebit - totalCredit);
  // Allow tiny floating-point drift (< 1 öre)
  return { balanced: drift < 0.01, drift };
}

function sumRange(
  buckets: Map<string, AccountBucket>,
  range: AccountRange,
  field: keyof AccountBucket,
): number {
  let total = 0;
  for (const [acct, b] of buckets) {
    const num = parseInt(acct, 10);
    if (!isNaN(num) && num >= range.min && num <= range.max) {
      total += b[field];
    }
  }
  return total;
}

function sumRangeMulti(
  buckets: Map<string, AccountBucket>,
  range: AccountRange,
  fields: (keyof AccountBucket)[],
): number {
  let total = 0;
  for (const [acct, b] of buckets) {
    const num = parseInt(acct, 10);
    if (!isNaN(num) && num >= range.min && num <= range.max) {
      for (const f of fields) {
        total += b[f];
      }
    }
  }
  return total;
}

function computeKPIsFromJournals(
  journals: JournalDto[],
  accounts: AccountingAccountDto[],
  startDate: string,
  endDate: string,
): SIEKPIs {
  const buckets = buildAccountBuckets(journals, accounts, startDate, endDate);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const isPartial = days < 350 || days > 380;
  const annFactor = isPartial ? 365 / days : 1.0;

  const hasOpeningBalances = accounts.length > 0;

  const bsClosing = (range: AccountRange) =>
    hasOpeningBalances
      ? sumRangeMulti(buckets, range, ['openingBalance', 'current'])
      : sumRangeMulti(buckets, range, ['prePrev', 'prev', 'current']);
  const bsOpening = (range: AccountRange) =>
    hasOpeningBalances
      ? sumRange(buckets, range, 'openingBalance')
      : sumRangeMulti(buckets, range, ['prePrev', 'prev']);

  const isCurrent = (range: AccountRange) =>
    sumRange(buckets, range, 'current');
  const isPrev = (range: AccountRange) =>
    sumRange(buckets, range, 'prev');

  const fixedAssets = bsClosing(SWEDISH_ACCOUNTS.FIXED_ASSETS.ALL);
  const currentAssets = bsClosing(SWEDISH_ACCOUNTS.CURRENT_ASSETS.ALL);
  const inventory = bsClosing(SWEDISH_ACCOUNTS.CURRENT_ASSETS.INVENTORY);
  const customerReceivables = bsClosing(SWEDISH_ACCOUNTS.CURRENT_ASSETS.CUSTOMER_RECEIVABLES);
  const cashAndBank = bsClosing(SWEDISH_ACCOUNTS.CURRENT_ASSETS.CASH_AND_BANK);
  const totalAssets = fixedAssets + currentAssets;

  const totalEquity = Math.abs(bsClosing(SWEDISH_ACCOUNTS.EQUITY.ALL));
  const untaxedReserves = Math.abs(bsClosing(SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL));
  const ytdResult = -isCurrent({ min: 3000, max: 8999 });
  const ownerEquityAdjustment = Math.abs(bsClosing(SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING));
  const adjustedEquity =
    totalEquity +
    untaxedReserves * EQUITY_PORTION_OF_UNTAXED_RESERVES +
    ownerEquityAdjustment +
    ytdResult;
  const deferredTaxLiability = untaxedReserves * CORPORATE_TAX_RATE;

  const provisions = Math.abs(bsClosing(SWEDISH_ACCOUNTS.PROVISIONS.ALL));
  const longTermLiabilitiesRaw = Math.abs(bsClosing(SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.ALL));
  const longTermLiabilities = longTermLiabilitiesRaw - ownerEquityAdjustment;
  const currentLiabilities = Math.abs(bsClosing(SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ALL));
  const totalLiabilities =
    provisions + longTermLiabilities + currentLiabilities + deferredTaxLiability;

  const longTermDebt = Math.abs(bsClosing(SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.INTEREST_BEARING));
  const shortTermDebt = Math.abs(bsClosing(SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.INTEREST_BEARING_SHORT));
  const interestBearingDebt = longTermDebt + shortTermDebt;
  const netDebt = interestBearingDebt - cashAndBank;
  const accountsPayable = Math.abs(bsClosing(SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ACCOUNTS_PAYABLE));

  const openingTotalAssets =
    bsOpening(SWEDISH_ACCOUNTS.FIXED_ASSETS.ALL) +
    bsOpening(SWEDISH_ACCOUNTS.CURRENT_ASSETS.ALL);
  const openingEquity = Math.abs(bsOpening(SWEDISH_ACCOUNTS.EQUITY.ALL));
  const openingReserves = Math.abs(bsOpening(SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL));
  const openingOwnerDebt = Math.abs(bsOpening(SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING));
  const openingAdjustedEquity =
    openingEquity + openingReserves * EQUITY_PORTION_OF_UNTAXED_RESERVES + openingOwnerDebt;
  const openingLongTermDebt = Math.abs(bsOpening(SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.INTEREST_BEARING));
  const openingShortTermDebt = Math.abs(bsOpening(SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.INTEREST_BEARING_SHORT));
  const openingInterestBearingDebt = openingLongTermDebt + openingShortTermDebt;

  const avgTotalAssets = (openingTotalAssets + totalAssets) / 2 || totalAssets;
  const avgAdjustedEquity = (openingAdjustedEquity + adjustedEquity) / 2 || adjustedEquity;
  const avgInterestBearingDebt = (openingInterestBearingDebt + interestBearingDebt) / 2;
  const avgCapitalEmployed = avgAdjustedEquity + avgInterestBearingDebt;

  const avgInventory =
    (bsOpening(SWEDISH_ACCOUNTS.CURRENT_ASSETS.INVENTORY) + inventory) / 2 || inventory;
  const avgReceivables =
    (bsOpening(SWEDISH_ACCOUNTS.CURRENT_ASSETS.CUSTOMER_RECEIVABLES) + customerReceivables) / 2 || customerReceivables;
  const avgPayables =
    (Math.abs(bsOpening(SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ACCOUNTS_PAYABLE)) + accountsPayable) / 2 || accountsPayable;

  const grossSales = Math.abs(isCurrent(SWEDISH_ACCOUNTS.REVENUE.NET_SALES));
  const discounts = Math.abs(isCurrent(SWEDISH_ACCOUNTS.REVENUE.DISCOUNTS));
  const netSales = grossSales - discounts;
  const totalOperatingIncome = Math.abs(isCurrent(SWEDISH_ACCOUNTS.REVENUE.ALL));

  const costOfGoodsSold = isCurrent(SWEDISH_ACCOUNTS.COST_OF_GOODS_SOLD.ALL);
  const externalCosts = isCurrent(SWEDISH_ACCOUNTS.OPERATING_EXPENSES.ALL);
  const personnelCosts = isCurrent(SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WAGES);
  const writeDowns = isCurrent(SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WRITE_DOWNS);
  const depreciation = isCurrent(SWEDISH_ACCOUNTS.PERSONNEL_COSTS.DEPRECIATION);

  const grossProfit = netSales - costOfGoodsSold;
  const ebitda = totalOperatingIncome - costOfGoodsSold - externalCosts - personnelCosts;
  const ebit = ebitda - depreciation - writeDowns;

  const financialIncome = Math.abs(isCurrent(SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.FINANCIAL_INCOME));
  const interestExpenses = Math.abs(isCurrent(SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.INTEREST_EXPENSES));
  const otherFinancialExpenses = Math.abs(isCurrent(SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.OTHER_FINANCIAL_EXPENSES));
  const financialNet = financialIncome - interestExpenses - otherFinancialExpenses;

  const resultBeforeTax = ebit + financialNet;
  const tax = isCurrent(SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.TAXES);
  const netIncome = resultBeforeTax - tax;

  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : null;
  const ebitdaMargin = netSales > 0 ? (ebitda / netSales) * 100 : null;
  const operatingMargin = netSales > 0 ? (ebit / netSales) * 100 : null;
  const profitMargin = netSales > 0 ? (resultBeforeTax / netSales) * 100 : null;
  const netMargin = netSales > 0 ? (netIncome / netSales) * 100 : null;

  const annualizedEbit = ebit * annFactor;
  const annualizedNetIncome = netIncome * annFactor;

  const roa = avgTotalAssets > 0 ? (annualizedEbit / avgTotalAssets) * 100 : null;
  const roe = avgAdjustedEquity > 0 ? (annualizedNetIncome / avgAdjustedEquity) * 100 : null;
  const roce = avgCapitalEmployed > 0 ? (annualizedEbit / avgCapitalEmployed) * 100 : null;

  const equityRatio = totalAssets > 0 ? (adjustedEquity / totalAssets) * 100 : null;
  const debtToEquityRatio = adjustedEquity > 0 ? totalLiabilities / adjustedEquity : null;
  const deRatio = adjustedEquity > 0 ? interestBearingDebt / adjustedEquity : null;

  const annualizedEbitda = ebitda * annFactor;
  const netDebtToEbitda = annualizedEbitda > 0 ? netDebt / annualizedEbitda : null;

  const annualizedInterestExpenses = interestExpenses * annFactor;
  const interestCoverageRatio =
    annualizedInterestExpenses > 0 ? annualizedEbitda / annualizedInterestExpenses : null;

  const cashRatio = currentLiabilities > 0 ? cashAndBank / currentLiabilities : null;
  const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : null;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const workingCapital = currentAssets - currentLiabilities;
  const annualizedNetSales = netSales * annFactor;
  const workingCapitalRatio =
    annualizedNetSales > 0 ? (workingCapital / annualizedNetSales) * 100 : null;

  const annualizedCogs = costOfGoodsSold * annFactor;

  const dio = annualizedCogs > 0 ? (avgInventory / annualizedCogs) * 365 : null;
  const dso = annualizedNetSales > 0 ? (avgReceivables / annualizedNetSales) * 365 : null;
  const dpo = annualizedCogs > 0 ? (avgPayables / annualizedCogs) * 365 : null;
  const ccc = dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
  const assetTurnover = totalAssets > 0 ? annualizedNetSales / totalAssets : null;

  const prevTotalOperatingIncome = Math.abs(isPrev(SWEDISH_ACCOUNTS.REVENUE.ALL));
  const prevTotalAssets =
    bsOpening(SWEDISH_ACCOUNTS.FIXED_ASSETS.ALL) +
    bsOpening(SWEDISH_ACCOUNTS.CURRENT_ASSETS.ALL);

  const revenueGrowth =
    prevTotalOperatingIncome > 0
      ? ((totalOperatingIncome - prevTotalOperatingIncome) / prevTotalOperatingIncome) * 100
      : null;
  const assetGrowth =
    prevTotalAssets > 0
      ? ((totalAssets - prevTotalAssets) / prevTotalAssets) * 100
      : null;
  const equityGrowth =
    openingAdjustedEquity > 0
      ? ((adjustedEquity - openingAdjustedEquity) / openingAdjustedEquity) * 100
      : null;

  return {
    totalAssets, fixedAssets, currentAssets, inventory, customerReceivables, cashAndBank,
    totalEquity, untaxedReserves, adjustedEquity, ownerEquityAdjustment, deferredTaxLiability,
    provisions, longTermLiabilities, currentLiabilities, totalLiabilities,
    interestBearingDebt, netDebt, accountsPayable,
    netSales, totalOperatingIncome, costOfGoodsSold, grossProfit,
    externalCosts, personnelCosts, writeDowns, depreciation,
    ebitda, ebit, financialIncome, interestExpenses, financialNet,
    resultBeforeTax, tax, netIncome,
    grossMargin, ebitdaMargin, operatingMargin, profitMargin, netMargin,
    roa, roe, roce,
    equityRatio, debtToEquityRatio, deRatio, netDebtToEbitda, interestCoverageRatio,
    cashRatio, quickRatio, currentRatio, workingCapital, workingCapitalRatio,
    dio, dso, dpo, ccc, assetTurnover,
    revenueGrowth, assetGrowth, equityGrowth,
    annualizationFactor: annFactor, daysInPeriod: days, isPartialYear: isPartial,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface JournalKPIOptions {
  startDate?: string;
  endDate?: string;
}

export interface JournalKPIResult {
  kpis: SIEKPIs;
  metadata: {
    source: 'account-balances' | 'journals';
    startDate: string;
    endDate: string;
    accountCount: number;
    journalCount?: number;
    entryCount?: number;
    reconciled?: boolean;
    reconciliationDrift?: number;
  };
}

export async function getJournalKPIs(
  consentId: string,
  options?: JournalKPIOptions,
): Promise<JournalKPIResult> {
  const endDate = options?.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    options?.startDate ??
    new Date(new Date(endDate).getTime() - 365 * 86_400_000).toISOString().slice(0, 10);

  const supabase = await createServiceClient();

  // -----------------------------------------------------------------------
  // Load accounting accounts (needed by both paths)
  // -----------------------------------------------------------------------
  let accounts: AccountingAccountDto[] = [];
  try {
    const accountRows = await loadAllRows(supabase, consentId, 'accountingaccounts');
    accounts = accountRows.map((row) => row.data as unknown as AccountingAccountDto);
  } catch (err) {
    console.warn('[journal-kpis] Could not load accounting accounts:', err instanceof Error ? err.message : err);
  }

  // -----------------------------------------------------------------------
  // Preferred path: account balances (IB + UB from provider)
  // -----------------------------------------------------------------------
  if (accounts.length > 0 && hasAuthoritativeBalances(accounts)) {
    const sieData = accountsToSIE(accounts);
    const kpis = calculateKPIs(sieData);

    return {
      kpis,
      metadata: {
        source: 'account-balances',
        startDate,
        endDate,
        accountCount: accounts.length,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Fallback: journal entries with reconciliation gate
  // -----------------------------------------------------------------------
  const journalRows = await loadAllRows(supabase, consentId, 'journals');
  const journals = journalRows.map((row) => row.data as unknown as JournalDto);

  // Reconciliation check: debits must equal credits
  const { balanced, drift } = checkReconciliation(journals);
  if (!balanced) {
    console.warn(`[journal-kpis] Reconciliation failed: debit/credit drift = ${drift.toFixed(2)}. Sync may be incomplete.`);
  }

  if (accounts.length === 0) {
    console.warn('[journal-kpis] No accounting accounts found — balance sheet opening balances will be missing.');
  }

  const kpis = computeKPIsFromJournals(journals, accounts, startDate, endDate);
  const entryCount = journals.reduce((sum, j) => sum + j.entries.length, 0);

  return {
    kpis,
    metadata: {
      source: 'journals',
      startDate,
      endDate,
      accountCount: accounts.length,
      journalCount: journals.length,
      entryCount,
      reconciled: balanced,
      reconciliationDrift: drift,
    },
  };
}
