/**
 * SIE-based Financial KPI Calculator
 *
 * Calculates comprehensive financial KPIs from SIE account balances.
 * Uses Swedish BAS (Baskontoplan) account classification.
 */
import type {
  SIEParseResult,
  SIEBalance,
  SIEMetadata,
  SIEKPIs,
} from './types';
import {
  SWEDISH_ACCOUNTS,
  CORPORATE_TAX_RATE,
  EQUITY_PORTION_OF_UNTAXED_RESERVES,
  sumAccountsInRange,
  type AccountRange,
} from './accounts';

/** Calculate annualization factor for partial-year data. */
function calculateAnnualizationFactor(metadata?: Partial<SIEMetadata>): {
  factor: number;
  days: number;
  isPartial: boolean;
} {
  if (!metadata?.fiscalYearStart) {
    return { factor: 1.0, days: 365, isPartial: false };
  }

  const startDate = new Date(metadata.fiscalYearStart);
  const endDate = metadata.omfattnDate
    ? new Date(metadata.omfattnDate)
    : metadata.fiscalYearEnd
      ? new Date(metadata.fiscalYearEnd)
      : null;

  if (!endDate) {
    return { factor: 1.0, days: 365, isPartial: false };
  }

  const days =
    Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

  const isPartial = days < 350 || days > 380;
  const factor = isPartial ? 365 / days : 1.0;

  return { factor, days, isPartial };
}

/** Calculate average of IB and UB for a balance sheet item. */
function calculateAverage(
  balances: SIEBalance[],
  range: AccountRange,
  yearIndex: number = 0,
): number {
  const ibBalances = balances.filter(
    (b) => b.balanceType === 'IB' && b.yearIndex === yearIndex,
  );
  const ubBalances = balances.filter(
    (b) => b.balanceType === 'UB' && b.yearIndex === yearIndex,
  );

  const ib = sumAccountsInRange(ibBalances, range);
  const ub = sumAccountsInRange(ubBalances, range);

  if (ibBalances.length > 0 && ubBalances.length > 0) {
    return (ib + ub) / 2;
  }

  if (ubBalances.length > 0) return ub;
  return ib;
}

/** Calculate adjusted equity for a specific year.
 *
 * Includes reclassification of non-interest-bearing long-term liabilities
 * (2360-2399: debts to owners/group/associated companies) as quasi-equity.
 * In Swedish SMEs these accounts commonly hold retained earnings or permanent
 * owner capital rather than genuine external debt.
 */
function calculateAdjustedEquityValue(
  balances: SIEBalance[],
  balanceType: 'IB' | 'UB' | 'AVG',
  yearIndex: number = 0,
): number {
  let ytdResult = 0;
  if (yearIndex === 0 && balanceType !== 'IB') {
    const resBalances = balances.filter(
      (b) => b.balanceType === 'RES' && b.yearIndex === 0,
    );
    ytdResult = -sumAccountsInRange(resBalances, { min: 3000, max: 8999 });
  }

  if (balanceType === 'AVG') {
    const avgEquity = Math.abs(
      calculateAverage(balances, SWEDISH_ACCOUNTS.EQUITY.ALL, yearIndex),
    );
    const avgReserves = Math.abs(
      calculateAverage(
        balances,
        SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL,
        yearIndex,
      ),
    );
    const avgOwnerDebt = Math.abs(
      calculateAverage(
        balances,
        SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING,
        yearIndex,
      ),
    );
    return (
      avgEquity +
      avgReserves * EQUITY_PORTION_OF_UNTAXED_RESERVES +
      avgOwnerDebt +
      ytdResult / 2
    );
  }

  const filteredBalances = balances.filter(
    (b) => b.balanceType === balanceType && b.yearIndex === yearIndex,
  );
  const equity = Math.abs(
    sumAccountsInRange(filteredBalances, SWEDISH_ACCOUNTS.EQUITY.ALL),
  );
  const reserves = Math.abs(
    sumAccountsInRange(
      filteredBalances,
      SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL,
    ),
  );
  const ownerDebt = Math.abs(
    sumAccountsInRange(
      filteredBalances,
      SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING,
    ),
  );
  return equity + reserves * EQUITY_PORTION_OF_UNTAXED_RESERVES + ownerDebt + ytdResult;
}

/** Calculate comprehensive financial KPIs from parsed SIE data. */
export function calculateKPIs(
  data: SIEParseResult,
  yearIndex = 0,
): SIEKPIs {
  const allBalances = data.balances;
  const currentYear = allBalances.filter((b) => b.yearIndex === yearIndex);

  const balanceSheet = currentYear.filter((b) => b.balanceType === 'UB');
  const incomeStatement = currentYear.filter((b) => b.balanceType === 'RES');

  const { factor: annFactor, days, isPartial } = calculateAnnualizationFactor(
    data.metadata,
  );

  // ============================================
  // BALANCE SHEET AGGREGATIONS
  // ============================================

  const fixedAssets = sumAccountsInRange(
    balanceSheet,
    SWEDISH_ACCOUNTS.FIXED_ASSETS.ALL,
  );
  const currentAssets = sumAccountsInRange(
    balanceSheet,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.ALL,
  );
  const inventory = sumAccountsInRange(
    balanceSheet,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.INVENTORY,
  );
  const customerReceivables = sumAccountsInRange(
    balanceSheet,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.CUSTOMER_RECEIVABLES,
  );
  const cashAndBank = sumAccountsInRange(
    balanceSheet,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.CASH_AND_BANK,
  );
  const totalAssets = fixedAssets + currentAssets;

  const totalEquity = Math.abs(
    sumAccountsInRange(balanceSheet, SWEDISH_ACCOUNTS.EQUITY.ALL),
  );

  const untaxedReserves = Math.abs(
    sumAccountsInRange(balanceSheet, SWEDISH_ACCOUNTS.UNTAXED_RESERVES.ALL),
  );

  const ytdResult = -sumAccountsInRange(incomeStatement, {
    min: 3000,
    max: 8999,
  });

  // Owner equity adjustment: non-interest-bearing long-term liabilities
  // (2360-2399) in Swedish SMEs often function as retained earnings or
  // permanent owner capital rather than genuine external debt.
  const ownerEquityAdjustment = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.NON_INTEREST_BEARING,
    ),
  );

  const adjustedEquity =
    totalEquity +
    untaxedReserves * EQUITY_PORTION_OF_UNTAXED_RESERVES +
    ownerEquityAdjustment +
    ytdResult;
  const deferredTaxLiability = untaxedReserves * CORPORATE_TAX_RATE;

  const provisions = Math.abs(
    sumAccountsInRange(balanceSheet, SWEDISH_ACCOUNTS.PROVISIONS.ALL),
  );

  const longTermLiabilitiesRaw = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.ALL,
    ),
  );
  const longTermLiabilities = longTermLiabilitiesRaw - ownerEquityAdjustment;
  const currentLiabilities = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ALL,
    ),
  );
  const totalLiabilities =
    provisions +
    longTermLiabilities +
    currentLiabilities +
    deferredTaxLiability;

  const longTermDebt = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.INTEREST_BEARING,
    ),
  );
  const shortTermDebt = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.INTEREST_BEARING_SHORT,
    ),
  );
  const interestBearingDebt = longTermDebt + shortTermDebt;
  const netDebt = interestBearingDebt - cashAndBank;

  const accountsPayable = Math.abs(
    sumAccountsInRange(
      balanceSheet,
      SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ACCOUNTS_PAYABLE,
    ),
  );

  // ============================================
  // INCOME STATEMENT AGGREGATIONS
  // ============================================

  const grossSales = Math.abs(
    sumAccountsInRange(incomeStatement, SWEDISH_ACCOUNTS.REVENUE.NET_SALES),
  );
  const discounts = Math.abs(
    sumAccountsInRange(incomeStatement, SWEDISH_ACCOUNTS.REVENUE.DISCOUNTS),
  );
  const netSales = grossSales - discounts;
  const totalOperatingIncome = Math.abs(
    sumAccountsInRange(incomeStatement, SWEDISH_ACCOUNTS.REVENUE.ALL),
  );

  const costOfGoodsSold = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.COST_OF_GOODS_SOLD.ALL,
  );
  const externalCosts = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.OPERATING_EXPENSES.ALL,
  );
  const personnelCosts = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WAGES,
  );
  const writeDowns = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.PERSONNEL_COSTS.WRITE_DOWNS,
  );
  const depreciation = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.PERSONNEL_COSTS.DEPRECIATION,
  );

  const grossProfit = netSales - costOfGoodsSold;
  const ebitda =
    totalOperatingIncome - costOfGoodsSold - externalCosts - personnelCosts;
  const ebit = ebitda - depreciation - writeDowns;

  const financialIncome = Math.abs(
    sumAccountsInRange(
      incomeStatement,
      SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.FINANCIAL_INCOME,
    ),
  );
  const interestExpenses = Math.abs(
    sumAccountsInRange(
      incomeStatement,
      SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.INTEREST_EXPENSES,
    ),
  );
  const otherFinancialExpenses = Math.abs(
    sumAccountsInRange(
      incomeStatement,
      SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.OTHER_FINANCIAL_EXPENSES,
    ),
  );
  const financialNet =
    financialIncome - interestExpenses - otherFinancialExpenses;

  const resultBeforeTax = ebit + financialNet;
  const tax = sumAccountsInRange(
    incomeStatement,
    SWEDISH_ACCOUNTS.FINANCIAL_ITEMS.TAXES,
  );
  const netIncome = resultBeforeTax - tax;

  // ============================================
  // MARGIN KPIs
  // ============================================

  const grossMargin =
    netSales > 0 ? (grossProfit / netSales) * 100 : null;
  const ebitdaMargin = netSales > 0 ? (ebitda / netSales) * 100 : null;
  const operatingMargin = netSales > 0 ? (ebit / netSales) * 100 : null;
  const profitMargin =
    netSales > 0 ? (resultBeforeTax / netSales) * 100 : null;
  const netMargin = netSales > 0 ? (netIncome / netSales) * 100 : null;

  // ============================================
  // RETURN KPIs (using averages, annualized)
  // ============================================

  const avgTotalAssets = calculateAverage(allBalances, {
    min: 1000,
    max: 1999,
  });
  const avgAdjustedEquity = calculateAdjustedEquityValue(
    allBalances,
    'AVG',
  );
  const avgInterestBearingDebt =
    Math.abs(
      calculateAverage(
        allBalances,
        SWEDISH_ACCOUNTS.LONG_TERM_LIABILITIES.INTEREST_BEARING,
      ),
    ) +
    Math.abs(
      calculateAverage(
        allBalances,
        SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.INTEREST_BEARING_SHORT,
      ),
    );
  const avgCapitalEmployed = avgAdjustedEquity + avgInterestBearingDebt;

  const annualizedEbit = ebit * annFactor;
  const annualizedNetIncome = netIncome * annFactor;

  const roa =
    avgTotalAssets > 0 ? (annualizedEbit / avgTotalAssets) * 100 : null;
  const roe =
    avgAdjustedEquity > 0
      ? (annualizedNetIncome / avgAdjustedEquity) * 100
      : null;
  const roce =
    avgCapitalEmployed > 0
      ? (annualizedEbit / avgCapitalEmployed) * 100
      : null;

  // ============================================
  // CAPITAL STRUCTURE KPIs
  // ============================================

  const equityRatio =
    totalAssets > 0 ? (adjustedEquity / totalAssets) * 100 : null;
  const debtToEquityRatio =
    adjustedEquity > 0 ? totalLiabilities / adjustedEquity : null;
  const deRatio =
    adjustedEquity > 0 ? interestBearingDebt / adjustedEquity : null;

  const annualizedEbitda = ebitda * annFactor;
  const netDebtToEbitda =
    annualizedEbitda > 0 ? netDebt / annualizedEbitda : null;

  const annualizedInterestExpenses = interestExpenses * annFactor;
  const interestCoverageRatio =
    annualizedInterestExpenses > 0
      ? annualizedEbitda / annualizedInterestExpenses
      : null;

  // ============================================
  // LIQUIDITY KPIs
  // ============================================

  const cashRatio =
    currentLiabilities > 0 ? cashAndBank / currentLiabilities : null;
  const quickRatio =
    currentLiabilities > 0
      ? (currentAssets - inventory) / currentLiabilities
      : null;
  const currentRatio =
    currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const workingCapital = currentAssets - currentLiabilities;
  const annualizedNetSales = netSales * annFactor;
  const workingCapitalRatio =
    annualizedNetSales > 0
      ? (workingCapital / annualizedNetSales) * 100
      : null;

  // ============================================
  // EFFICIENCY KPIs (annualized)
  // ============================================

  const annualizedCogs = costOfGoodsSold * annFactor;

  const avgInventory = calculateAverage(
    allBalances,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.INVENTORY,
  );
  const avgReceivables = calculateAverage(
    allBalances,
    SWEDISH_ACCOUNTS.CURRENT_ASSETS.CUSTOMER_RECEIVABLES,
  );
  const avgPayables = Math.abs(
    calculateAverage(
      allBalances,
      SWEDISH_ACCOUNTS.CURRENT_LIABILITIES.ACCOUNTS_PAYABLE,
    ),
  );

  const dio =
    annualizedCogs > 0 ? (avgInventory / annualizedCogs) * 365 : null;
  const dso =
    annualizedNetSales > 0
      ? (avgReceivables / annualizedNetSales) * 365
      : null;
  const dpo =
    annualizedCogs > 0 ? (avgPayables / annualizedCogs) * 365 : null;
  const ccc =
    dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
  const assetTurnover =
    totalAssets > 0 ? annualizedNetSales / totalAssets : null;

  // ============================================
  // GROWTH KPIs (year-over-year)
  // ============================================

  const prevYearRevenue = Math.abs(
    sumAccountsInRange(
      allBalances.filter(
        (b) => b.balanceType === 'RES' && b.yearIndex === -1,
      ),
      SWEDISH_ACCOUNTS.REVENUE.ALL,
    ),
  );
  const prevYearAssets = sumAccountsInRange(
    allBalances.filter(
      (b) => b.balanceType === 'UB' && b.yearIndex === -1,
    ),
    { min: 1000, max: 1999 },
  );
  const prevYearAdjustedEquity = calculateAdjustedEquityValue(
    allBalances,
    'UB',
    -1,
  );

  const revenueGrowth =
    prevYearRevenue > 0
      ? ((totalOperatingIncome - prevYearRevenue) / prevYearRevenue) * 100
      : null;
  const assetGrowth =
    prevYearAssets > 0
      ? ((totalAssets - prevYearAssets) / prevYearAssets) * 100
      : null;
  const equityGrowth =
    prevYearAdjustedEquity > 0
      ? ((adjustedEquity - prevYearAdjustedEquity) / prevYearAdjustedEquity) *
        100
      : null;

  return {
    totalAssets,
    fixedAssets,
    currentAssets,
    inventory,
    customerReceivables,
    cashAndBank,
    totalEquity,
    untaxedReserves,
    adjustedEquity,
    ownerEquityAdjustment,
    deferredTaxLiability,
    provisions,
    longTermLiabilities,
    currentLiabilities,
    totalLiabilities,
    interestBearingDebt,
    netDebt,
    accountsPayable,
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
    netMargin,
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
    revenueGrowth,
    assetGrowth,
    equityGrowth,
    annualizationFactor: annFactor,
    daysInPeriod: days,
    isPartialYear: isPartial,
  };
}
