/**
 * SIE type definitions.
 *
 * Re-exports core SIE types from the manual-sie parser and adds
 * the SIEKPIs interface for KPI calculation results.
 */
export type {
  SIEMetadata,
  SIEAccount,
  SIEDimension,
  SIETransaction,
  SIEBalance,
  SIEParseResult,
} from '@/lib/providers/manual-sie/parser';

/** Comprehensive financial KPIs computed from SIE data. */
export interface SIEKPIs {
  // Balance sheet
  totalAssets: number;
  fixedAssets: number;
  currentAssets: number;
  inventory: number;
  customerReceivables: number;
  cashAndBank: number;
  totalEquity: number;
  untaxedReserves: number;
  adjustedEquity: number;
  ownerEquityAdjustment: number;
  deferredTaxLiability: number;
  provisions: number;
  longTermLiabilities: number;
  currentLiabilities: number;
  totalLiabilities: number;
  interestBearingDebt: number;
  netDebt: number;
  accountsPayable: number;

  // Income statement
  netSales: number;
  totalOperatingIncome: number;
  costOfGoodsSold: number;
  grossProfit: number;
  externalCosts: number;
  personnelCosts: number;
  writeDowns: number;
  depreciation: number;
  ebitda: number;
  ebit: number;
  financialIncome: number;
  interestExpenses: number;
  financialNet: number;
  resultBeforeTax: number;
  tax: number;
  netIncome: number;

  // Margins (percentages)
  grossMargin: number | null;
  ebitdaMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  netMargin: number | null;

  // Returns (percentages)
  roa: number | null;
  roe: number | null;
  roce: number | null;

  // Capital structure
  equityRatio: number | null;
  debtToEquityRatio: number | null;
  deRatio: number | null;
  netDebtToEbitda: number | null;
  interestCoverageRatio: number | null;

  // Liquidity
  cashRatio: number | null;
  quickRatio: number | null;
  currentRatio: number | null;
  workingCapital: number;
  workingCapitalRatio: number | null;

  // Efficiency
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  ccc: number | null;
  assetTurnover: number | null;

  // Growth (YoY percentages)
  revenueGrowth: number | null;
  assetGrowth: number | null;
  equityGrowth: number | null;

  // Metadata
  annualizationFactor: number;
  daysInPeriod: number;
  isPartialYear: boolean;
}
