/**
 * Monthly KPI calculation engine.
 *
 * Computes month-by-month KPI snapshots from transaction-level data.
 * Works alongside (not replacing) the existing annual KPI system.
 *
 * Two entry points:
 * - `calculateMonthlyKPIsFromSIE()` — for manual SIE file uploads
 * - `calculateMonthlyKPIsFromJournals()` — for synced provider data
 *
 * Both normalize their inputs into a common format and delegate to the
 * shared `computeMonthlyKPIs()` core function.
 */
import type {
  SIEParseResult,
  SIEKPIs,
  MonthlyKPIEntry,
  MonthlyKPISeries,
} from './types';
import type { JournalDto, AccountingAccountDto } from '@/lib/types/dto';
import {
  SWEDISH_ACCOUNTS,
  CORPORATE_TAX_RATE,
  EQUITY_PORTION_OF_UNTAXED_RESERVES,
  sumAccountsInRange,
  getAccountType,
  type AccountRange,
} from './accounts';

// ---------------------------------------------------------------------------
// Normalized transaction type used by the core engine
// ---------------------------------------------------------------------------

interface NormalizedTransaction {
  accountNumber: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all calendar months (YYYY-MM) between two dates (inclusive). */
function getMonthRange(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

/** Number of days in a given YYYY-MM month. */
function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
}

/** Sum amounts in an account range from a balance map. */
function sumRangeFromMap(
  balances: Map<string, number>,
  range: AccountRange,
): number {
  let total = 0;
  for (const [acct, amount] of balances) {
    const num = parseInt(acct, 10);
    if (!isNaN(num) && num >= range.min && num <= range.max) {
      total += amount;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Core monthly KPI computation
// ---------------------------------------------------------------------------

/**
 * Compute KPIs for each month in the fiscal year range.
 *
 * Balance sheet accounts (1000-2999): month-end = IB + cumulative transactions.
 * Income statement accounts (3000-8999): monthly P&L = that month's transactions only.
 */
export function computeMonthlyKPIs(
  openingBalances: Map<string, number>,
  transactions: NormalizedTransaction[],
  fiscalYearStart: string,
  fiscalYearEnd: string,
): MonthlyKPISeries {
  const months = getMonthRange(fiscalYearStart, fiscalYearEnd);

  // Group transactions by month
  const txByMonth = new Map<string, NormalizedTransaction[]>();
  for (const tx of transactions) {
    const ym = tx.date.slice(0, 7); // "YYYY-MM"
    const arr = txByMonth.get(ym);
    if (arr) {
      arr.push(tx);
    } else {
      txByMonth.set(ym, [tx]);
    }
  }

  // Track cumulative BS movements from IB
  const cumulativeBSMovement = new Map<string, number>();

  const entries: MonthlyKPIEntry[] = [];
  let prevMonthKpis: SIEKPIs | null = null;

  for (const ym of months) {
    const monthTxs = txByMonth.get(ym) ?? [];
    const days = daysInMonth(ym);

    // Accumulate BS movements for this month
    for (const tx of monthTxs) {
      if (getAccountType(tx.accountNumber) === 'BALANCE_SHEET') {
        cumulativeBSMovement.set(
          tx.accountNumber,
          (cumulativeBSMovement.get(tx.accountNumber) ?? 0) + tx.amount,
        );
      }
    }

    // Build month-end balance sheet balances: IB + cumulative movements
    const bsBalances = new Map<string, number>();
    // Start with all accounts from opening balances
    for (const [acct, ib] of openingBalances) {
      if (getAccountType(acct) === 'BALANCE_SHEET') {
        bsBalances.set(acct, ib + (cumulativeBSMovement.get(acct) ?? 0));
      }
    }
    // Also include any accounts that appear in transactions but not in IB
    for (const [acct, movement] of cumulativeBSMovement) {
      if (!bsBalances.has(acct) && getAccountType(acct) === 'BALANCE_SHEET') {
        bsBalances.set(acct, movement);
      }
    }

    // Build monthly P&L: only this month's transactions for IS accounts
    const plAmounts = new Map<string, number>();
    for (const tx of monthTxs) {
      if (getAccountType(tx.accountNumber) === 'INCOME_STATEMENT') {
        plAmounts.set(
          tx.accountNumber,
          (plAmounts.get(tx.accountNumber) ?? 0) + tx.amount,
        );
      }
    }

    const kpis = computeMonthKPIs(bsBalances, plAmounts, days, prevMonthKpis);
    entries.push({ month: ym, kpis });
    prevMonthKpis = kpis;
  }

  // Aggregate: sum all monthly P&L, use last month's balance sheet
  const aggregate = computeAggregateKPIs(entries, fiscalYearStart, fiscalYearEnd);

  return {
    months: entries,
    aggregate,
    metadata: {
      fiscalYearStart,
      fiscalYearEnd,
      monthCount: entries.length,
      source: 'sie-transactions',
    },
  };
}

/**
 * Compute KPIs for a single month given balance sheet and P&L data.
 */
function computeMonthKPIs(
  bsBalances: Map<string, number>,
  plAmounts: Map<string, number>,
  days: number,
  prevMonth: SIEKPIs | null,
): SIEKPIs {
  // ── Balance Sheet ──
  const fixedAssets = sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.FIXED_ASSETS.ALL);
  const currentAssets = sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_ASSETS.ALL);
  const inventory = sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_ASSETS.INVENTORY);
  const customerReceivables = sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_ASSETS.CUSTOMER_RECEIVABLES);
  const cashAndBank = sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_ASSETS.CASH_AND_BANK);
  const totalAssets = fixedAssets + currentAssets;

  const totalEquity = Math.abs(sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.EQUITY.ALL));
  const untaxedReserves = Math.abs(sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL));
  const ownerEquityAdjustment = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING),
  );

  // For monthly: no cumulative ytdResult adjustment — we use month-end BS as-is
  const adjustedEquity =
    totalEquity +
    untaxedReserves * EQUITY_PORTION_OF_UNTAXED_RESERVES +
    ownerEquityAdjustment;
  const deferredTaxLiability = untaxedReserves * CORPORATE_TAX_RATE;

  const provisions = Math.abs(sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.PROVISIONS.ALL));
  const longTermLiabilitiesRaw = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.ALL),
  );
  const longTermLiabilities = longTermLiabilitiesRaw - ownerEquityAdjustment;
  const currentLiabilities = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ALL),
  );
  const totalLiabilities =
    provisions + longTermLiabilities + currentLiabilities + deferredTaxLiability;

  const longTermDebt = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.INTEREST_BEARING),
  );
  const shortTermDebt = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.INTEREST_BEARING_SHORT),
  );
  const interestBearingDebt = longTermDebt + shortTermDebt;
  const netDebt = interestBearingDebt - cashAndBank;
  const accountsPayable = Math.abs(
    sumRangeFromMap(bsBalances, SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ACCOUNTS_PAYABLE),
  );

  // ── Income Statement (monthly, not annualized) ──
  const grossSales = Math.abs(sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.REVENUE.NET_SALES));
  const discounts = Math.abs(sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.REVENUE.DISCOUNTS));
  const netSales = grossSales - discounts;
  const totalOperatingIncome = Math.abs(sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.REVENUE.ALL));

  const costOfGoodsSold = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.COST_OF_GOODS_SOLD.ALL);
  const externalCosts = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.OPERATING_EXPENSES.ALL);
  const personnelCosts = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WAGES);
  const writeDowns = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WRITE_DOWNS);
  const depreciation = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.PERSONNEL_COSTS.DEPRECIATION);

  const grossProfit = netSales - costOfGoodsSold;
  const ebitda = totalOperatingIncome - costOfGoodsSold - externalCosts - personnelCosts;
  const ebit = ebitda - depreciation - writeDowns;

  const financialIncome = Math.abs(
    sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.FINANCIAL_INCOME),
  );
  const interestExpenses = Math.abs(
    sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.INTEREST_EXPENSES),
  );
  const otherFinancialExpenses = Math.abs(
    sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.OTHER_FINANCIAL_EXPENSES),
  );
  const financialNet = financialIncome - interestExpenses - otherFinancialExpenses;

  const resultBeforeTax = ebit + financialNet;
  const tax = sumRangeFromMap(plAmounts, SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.TAXES);
  const netIncome = resultBeforeTax - tax;

  // ── Margins (from this month's P&L ratios) ──
  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : null;
  const ebitdaMargin = netSales > 0 ? (ebitda / netSales) * 100 : null;
  const operatingMargin = netSales > 0 ? (ebit / netSales) * 100 : null;
  const profitMargin = netSales > 0 ? (resultBeforeTax / netSales) * 100 : null;
  const netMargin = netSales > 0 ? (netIncome / netSales) * 100 : null;

  // ── Returns (annualized: monthly * 12) ──
  const annualizedEbit = ebit * 12;
  const annualizedNetIncome = netIncome * 12;

  const roa = totalAssets > 0 ? (annualizedEbit / totalAssets) * 100 : null;
  const roe = adjustedEquity > 0 ? (annualizedNetIncome / adjustedEquity) * 100 : null;
  const capitalEmployed = adjustedEquity + interestBearingDebt;
  const roce = capitalEmployed > 0 ? (annualizedEbit / capitalEmployed) * 100 : null;

  // ── Capital Structure (month-end values) ──
  const equityRatio = totalAssets > 0 ? (adjustedEquity / totalAssets) * 100 : null;
  const debtToEquityRatio = adjustedEquity > 0 ? totalLiabilities / adjustedEquity : null;
  const deRatio = adjustedEquity > 0 ? interestBearingDebt / adjustedEquity : null;

  const annualizedEbitda = ebitda * 12;
  const netDebtToEbitda = annualizedEbitda > 0 ? netDebt / annualizedEbitda : null;

  const annualizedInterestExpenses = interestExpenses * 12;
  const interestCoverageRatio =
    annualizedInterestExpenses > 0 ? annualizedEbitda / annualizedInterestExpenses : null;

  // ── Liquidity (month-end values) ──
  const cashRatio = currentLiabilities > 0 ? cashAndBank / currentLiabilities : null;
  const quickRatio =
    currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : null;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const workingCapital = currentAssets - currentLiabilities;
  const annualizedNetSales = netSales * 12;
  const workingCapitalRatio =
    annualizedNetSales > 0 ? (workingCapital / annualizedNetSales) * 100 : null;

  // ── Efficiency (annualized denominators) ──
  const annualizedCogs = costOfGoodsSold * 12;
  const dio = annualizedCogs > 0 ? (inventory / annualizedCogs) * 365 : null;
  const dso = annualizedNetSales > 0 ? (customerReceivables / annualizedNetSales) * 365 : null;
  const dpo = annualizedCogs > 0 ? (accountsPayable / annualizedCogs) * 365 : null;
  const ccc = dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
  const assetTurnover = totalAssets > 0 ? annualizedNetSales / totalAssets : null;

  // ── Growth (month-over-month) ──
  const revenueGrowth =
    prevMonth && prevMonth.netSales > 0
      ? ((netSales - prevMonth.netSales) / prevMonth.netSales) * 100
      : null;
  const assetGrowth =
    prevMonth && prevMonth.totalAssets > 0
      ? ((totalAssets - prevMonth.totalAssets) / prevMonth.totalAssets) * 100
      : null;
  const equityGrowth =
    prevMonth && prevMonth.adjustedEquity > 0
      ? ((adjustedEquity - prevMonth.adjustedEquity) / prevMonth.adjustedEquity) * 100
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
    annualizationFactor: 12,
    daysInPeriod: days,
    isPartialYear: true,
  };
}

/**
 * Compute aggregate (full-period) KPIs from monthly entries.
 * P&L = sum of all months, Balance sheet = last month's snapshot.
 */
function computeAggregateKPIs(
  entries: MonthlyKPIEntry[],
  fiscalYearStart: string,
  fiscalYearEnd: string,
): SIEKPIs {
  if (entries.length === 0) {
    // Return zeroed KPIs
    return entries[0]?.kpis ?? createZeroKPIs();
  }

  const last = entries[entries.length - 1]!.kpis;
  const first = entries[0]!.kpis;

  // Sum P&L items across all months
  const netSales = entries.reduce((s, e) => s + e.kpis.netSales, 0);
  const totalOperatingIncome = entries.reduce((s, e) => s + e.kpis.totalOperatingIncome, 0);
  const costOfGoodsSold = entries.reduce((s, e) => s + e.kpis.costOfGoodsSold, 0);
  const externalCosts = entries.reduce((s, e) => s + e.kpis.externalCosts, 0);
  const personnelCosts = entries.reduce((s, e) => s + e.kpis.personnelCosts, 0);
  const writeDowns = entries.reduce((s, e) => s + e.kpis.writeDowns, 0);
  const depreciation = entries.reduce((s, e) => s + e.kpis.depreciation, 0);
  const financialIncome = entries.reduce((s, e) => s + e.kpis.financialIncome, 0);
  const interestExpenses = entries.reduce((s, e) => s + e.kpis.interestExpenses, 0);
  const tax = entries.reduce((s, e) => s + e.kpis.tax, 0);

  const grossProfit = netSales - costOfGoodsSold;
  const ebitda = totalOperatingIncome - costOfGoodsSold - externalCosts - personnelCosts;
  const ebit = ebitda - depreciation - writeDowns;
  const financialNet = entries.reduce((s, e) => s + e.kpis.financialNet, 0);
  const resultBeforeTax = ebit + financialNet;
  const netIncome = resultBeforeTax - tax;

  // Annualization
  const startD = new Date(fiscalYearStart);
  const endD = new Date(fiscalYearEnd);
  const totalDays = Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1;
  const isPartial = totalDays < 350 || totalDays > 380;
  const annFactor = isPartial ? 365 / totalDays : 1.0;

  // Use last month BS for snapshots, average first/last for averages
  const totalAssets = last.totalAssets;
  const adjustedEquity = last.adjustedEquity;
  const interestBearingDebt = last.interestBearingDebt;

  const avgTotalAssets = (first.totalAssets + last.totalAssets) / 2 || totalAssets;
  const avgAdjustedEquity = (first.adjustedEquity + last.adjustedEquity) / 2 || adjustedEquity;
  const avgCapitalEmployed =
    avgAdjustedEquity +
    ((first.interestBearingDebt + last.interestBearingDebt) / 2 || interestBearingDebt);

  const annualizedEbit = ebit * annFactor;
  const annualizedNetIncome = netIncome * annFactor;
  const annualizedEbitda = ebitda * annFactor;
  const annualizedNetSales = netSales * annFactor;
  const annualizedCogs = costOfGoodsSold * annFactor;
  const annualizedInterestExpenses = interestExpenses * annFactor;

  // Margins
  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : null;
  const ebitdaMargin = netSales > 0 ? (ebitda / netSales) * 100 : null;
  const operatingMargin = netSales > 0 ? (ebit / netSales) * 100 : null;
  const profitMargin = netSales > 0 ? (resultBeforeTax / netSales) * 100 : null;
  const netMarginVal = netSales > 0 ? (netIncome / netSales) * 100 : null;

  // Returns
  const roa = avgTotalAssets > 0 ? (annualizedEbit / avgTotalAssets) * 100 : null;
  const roe = avgAdjustedEquity > 0 ? (annualizedNetIncome / avgAdjustedEquity) * 100 : null;
  const roce = avgCapitalEmployed > 0 ? (annualizedEbit / avgCapitalEmployed) * 100 : null;

  // Capital structure
  const equityRatio = totalAssets > 0 ? (adjustedEquity / totalAssets) * 100 : null;
  const debtToEquityRatio = adjustedEquity > 0 ? last.totalLiabilities / adjustedEquity : null;
  const deRatio = adjustedEquity > 0 ? interestBearingDebt / adjustedEquity : null;
  const netDebtToEbitda = annualizedEbitda > 0 ? last.netDebt / annualizedEbitda : null;
  const interestCoverageRatio =
    annualizedInterestExpenses > 0 ? annualizedEbitda / annualizedInterestExpenses : null;

  // Liquidity
  const cashRatio =
    last.currentLiabilities > 0 ? last.cashAndBank / last.currentLiabilities : null;
  const quickRatio =
    last.currentLiabilities > 0
      ? (last.currentAssets - last.inventory) / last.currentLiabilities
      : null;
  const currentRatio =
    last.currentLiabilities > 0 ? last.currentAssets / last.currentLiabilities : null;
  const workingCapital = last.currentAssets - last.currentLiabilities;
  const workingCapitalRatio =
    annualizedNetSales > 0 ? (workingCapital / annualizedNetSales) * 100 : null;

  // Efficiency
  const avgInventory = (first.inventory + last.inventory) / 2 || last.inventory;
  const avgReceivables =
    (first.customerReceivables + last.customerReceivables) / 2 || last.customerReceivables;
  const avgPayables =
    (first.accountsPayable + last.accountsPayable) / 2 || last.accountsPayable;
  const dio = annualizedCogs > 0 ? (avgInventory / annualizedCogs) * 365 : null;
  const dso = annualizedNetSales > 0 ? (avgReceivables / annualizedNetSales) * 365 : null;
  const dpo = annualizedCogs > 0 ? (avgPayables / annualizedCogs) * 365 : null;
  const ccc = dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
  const assetTurnover = totalAssets > 0 ? annualizedNetSales / totalAssets : null;

  return {
    totalAssets: last.totalAssets,
    fixedAssets: last.fixedAssets,
    currentAssets: last.currentAssets,
    inventory: last.inventory,
    customerReceivables: last.customerReceivables,
    cashAndBank: last.cashAndBank,
    totalEquity: last.totalEquity,
    untaxedReserves: last.untaxedReserves,
    adjustedEquity: last.adjustedEquity,
    ownerEquityAdjustment: last.ownerEquityAdjustment,
    deferredTaxLiability: last.deferredTaxLiability,
    provisions: last.provisions,
    longTermLiabilities: last.longTermLiabilities,
    currentLiabilities: last.currentLiabilities,
    totalLiabilities: last.totalLiabilities,
    interestBearingDebt: last.interestBearingDebt,
    netDebt: last.netDebt,
    accountsPayable: last.accountsPayable,
    netSales,
    totalOperatingIncome,
    costOfGoodsSold,
    grossProfit,
    externalCosts,
    personnelCosts,
    writeDowns,
    depreciation,
    ebitda,
    ebit,
    financialIncome,
    interestExpenses,
    financialNet,
    resultBeforeTax,
    tax,
    netIncome,
    grossMargin,
    ebitdaMargin,
    operatingMargin,
    profitMargin,
    netMargin: netMarginVal,
    roa,
    roe,
    roce,
    equityRatio,
    debtToEquityRatio,
    deRatio,
    netDebtToEbitda,
    interestCoverageRatio,
    cashRatio,
    quickRatio,
    currentRatio,
    workingCapital,
    workingCapitalRatio,
    dio,
    dso,
    dpo,
    ccc,
    assetTurnover,
    revenueGrowth: null, // No previous year data for aggregate
    assetGrowth: null,
    equityGrowth: null,
    annualizationFactor: annFactor,
    daysInPeriod: totalDays,
    isPartialYear: isPartial,
  };
}

function createZeroKPIs(): SIEKPIs {
  return {
    totalAssets: 0, fixedAssets: 0, currentAssets: 0, inventory: 0,
    customerReceivables: 0, cashAndBank: 0, totalEquity: 0, untaxedReserves: 0,
    adjustedEquity: 0, ownerEquityAdjustment: 0, deferredTaxLiability: 0,
    provisions: 0, longTermLiabilities: 0, currentLiabilities: 0, totalLiabilities: 0,
    interestBearingDebt: 0, netDebt: 0, accountsPayable: 0,
    netSales: 0, totalOperatingIncome: 0, costOfGoodsSold: 0, grossProfit: 0,
    externalCosts: 0, personnelCosts: 0, writeDowns: 0, depreciation: 0,
    ebitda: 0, ebit: 0, financialIncome: 0, interestExpenses: 0, financialNet: 0,
    resultBeforeTax: 0, tax: 0, netIncome: 0,
    grossMargin: null, ebitdaMargin: null, operatingMargin: null,
    profitMargin: null, netMargin: null,
    roa: null, roe: null, roce: null,
    equityRatio: null, debtToEquityRatio: null, deRatio: null,
    netDebtToEbitda: null, interestCoverageRatio: null,
    cashRatio: null, quickRatio: null, currentRatio: null,
    workingCapital: 0, workingCapitalRatio: null,
    dio: null, dso: null, dpo: null, ccc: null, assetTurnover: null,
    revenueGrowth: null, assetGrowth: null, equityGrowth: null,
    annualizationFactor: 1, daysInPeriod: 0, isPartialYear: true,
  };
}

// ---------------------------------------------------------------------------
// Entry point: Manual SIE files
// ---------------------------------------------------------------------------

export function calculateMonthlyKPIsFromSIE(data: SIEParseResult): MonthlyKPISeries {
  const fiscalYearStart = data.metadata.fiscalYearStart;
  const fiscalYearEnd = data.metadata.fiscalYearEnd;

  if (!fiscalYearStart || !fiscalYearEnd) {
    throw new Error('Fiscal year dates are required for monthly KPI calculation');
  }

  if (data.transactions.length === 0) {
    throw new Error('No transaction data available for monthly KPI calculation');
  }

  // Extract opening balances from IB entries for current year
  const openingBalances = new Map<string, number>();
  for (const b of data.balances) {
    if (b.balanceType === 'IB' && b.yearIndex === 0) {
      openingBalances.set(
        b.accountNumber,
        (openingBalances.get(b.accountNumber) ?? 0) + b.amount,
      );
    }
  }

  // Normalize SIE transactions
  const transactions: NormalizedTransaction[] = data.transactions.map((tx) => ({
    accountNumber: tx.accountNumber,
    amount: tx.amount,
    date: tx.verificationDate,
  }));

  const result = computeMonthlyKPIs(openingBalances, transactions, fiscalYearStart, fiscalYearEnd);
  result.metadata.source = 'sie-transactions';
  return result;
}

// ---------------------------------------------------------------------------
// Entry point: Synced provider journals
// ---------------------------------------------------------------------------

export function calculateMonthlyKPIsFromJournals(
  journals: JournalDto[],
  accounts: AccountingAccountDto[],
  fiscalYearStart: string,
  fiscalYearEnd: string,
): MonthlyKPISeries {
  // Extract opening balances from accounts' balanceCarriedForward for BS accounts
  // (This is the same pattern as journal-kpis.ts:162-166)
  const openingBalances = new Map<string, number>();
  for (const acct of accounts) {
    if (acct.balanceCarriedForward != null && getAccountType(acct.accountNumber) === 'BALANCE_SHEET') {
      openingBalances.set(acct.accountNumber, acct.balanceCarriedForward);
    }
  }

  // Normalize journal entries to flat transactions
  const transactions: NormalizedTransaction[] = [];
  for (const journal of journals) {
    for (const entry of journal.entries) {
      const amount = entry.debit - entry.credit;
      const date = entry.transactionDate ?? journal.registrationDate;
      transactions.push({
        accountNumber: entry.accountNumber,
        amount,
        date,
      });
    }
  }

  const result = computeMonthlyKPIs(openingBalances, transactions, fiscalYearStart, fiscalYearEnd);
  result.metadata.source = 'journals';
  return result;
}
