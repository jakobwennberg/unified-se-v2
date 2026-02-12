/**
 * Deterministic blueprint expander.
 *
 * Takes an AI-generated "financial blueprint" (structured JSON) and expands
 * it into a full SIEParseResult with individual transactions, balanced
 * verifications, and correct opening/closing/result balances.
 *
 * No LLM calls — this is pure TypeScript math.
 */
import type {
  SIEParseResult,
  SIEMetadata,
  SIEAccount,
  SIEBalance,
  SIETransaction,
} from '@/lib/sie/types';
import { getAccountType } from '@/lib/sie/accounts';
import type { GenerateCompanyRequest, CompanyIndustry } from './types';
import { INDUSTRY_RULES } from './industry-rules';

// ---- Blueprint types (output from AI) ----

export interface CompanyBlueprint {
  profile: {
    companyName: string;
    orgNumber: string;
    industry: string;
    size: string;
    description: string;
  };
  accounts: BlueprintAccount[];
  openingBalances: BlueprintBalance[];
  transactionTemplates: BlueprintTransactionTemplate[];
  annualFinancials: {
    totalRevenue: number;
    totalCOGS: number;
    totalOperatingExpenses: number;
    totalPersonnelCosts: number;
    totalFinancialItems: number;
    taxAmount: number;
  };
  previousYearMultiplier?: number;
}

export interface BlueprintAccount {
  number: string;
  name: string;
}

export interface BlueprintBalance {
  accountNumber: string;
  amount: number;
}

export interface BlueprintTransactionTemplate {
  description: string;
  debitAccount: string;
  creditAccount: string;
  monthlyAmount: number;
  variance: number;
  months?: number[];
  monthlyCount?: number;
  datePattern?: 'first' | 'mid' | 'salary' | 'tax' | 'spread' | 'end';
  vatRate?: number;
  descriptionPattern?: string;
}

// ---- Verification series by transaction type ----

type VerSeries = 'A' | 'B' | 'C' | 'E' | 'D' | 'YE';

function getVerificationSeries(template: BlueprintTransactionTemplate): VerSeries {
  const debit = parseInt(template.debitAccount, 10);
  const credit = parseInt(template.creditAccount, 10);

  if (debit >= 7000 && debit < 7900 && debit !== 7830) return 'E';
  if (credit >= 3000 && credit < 4000) return 'B';
  if (debit >= 4000 && debit < 7000) return 'A';
  if (debit === 7830) return 'A';
  if (debit >= 8000 && debit < 9000) return 'A';
  return 'C';
}

// ---- Account group mapping ----

const ACCOUNT_GROUPS: Record<string, string> = {
  '1': '1 - Tillgångar',
  '2': '2 - Eget kapital och skulder',
  '3': '3 - Rörelsens inkomster och intäkter',
  '4': '4 - Utgifter och kostnader förädling',
  '5': '5 - Övriga externa rörelseutgifter och kostnader',
  '6': '6 - Övriga externa rörelseutgifter och kostnader',
  '7': '7 - Utgifter och kostnader för personal',
  '8': '8 - Finansiella och andra inkomster/utgifter',
};

const MONTH_NAMES = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

const VAT_OUTPUT_ACCOUNTS: Record<number, string> = {
  25: '2611',
  12: '2621',
  6: '2631',
};

const VAT_INPUT_ACCOUNT = '1650';

// ---- Helpers ----

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function varyAmount(base: number, variance: number, rand: () => number): number {
  const factor = 1 + (rand() * 2 - 1) * variance;
  return Math.round(base * factor * 100) / 100;
}

function formatDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

function avoidWeekend(year: number, month: number, day: number): number {
  const maxDay = lastDayOfMonth(year, month);
  day = Math.min(day, maxDay);
  const dow = dayOfWeek(year, month, day);
  if (dow === 0) return Math.min(day + 1, maxDay);
  if (dow === 6) return Math.max(day - 1, 1);
  return day;
}

function getTransactionDate(
  year: number,
  month: number,
  pattern: BlueprintTransactionTemplate['datePattern'],
  rand: () => number,
  index?: number,
  count?: number,
): string {
  const maxDay = lastDayOfMonth(year, month);
  let day: number;

  switch (pattern) {
    case 'first':
      day = avoidWeekend(year, month, 1);
      break;
    case 'salary':
      day = avoidWeekend(year, month, 25);
      break;
    case 'tax':
      day = avoidWeekend(year, month, 12);
      break;
    case 'end':
      day = avoidWeekend(year, month, Math.min(28 + Math.floor(rand() * 3), maxDay));
      break;
    case 'spread': {
      if (count && count > 1 && index != null) {
        const spacing = Math.max(1, Math.floor(25 / count));
        const baseDay = 2 + index * spacing + Math.floor(rand() * Math.max(1, spacing - 1));
        day = avoidWeekend(year, month, Math.min(baseDay, maxDay));
      } else {
        day = avoidWeekend(year, month, 1 + Math.floor(rand() * 27));
      }
      break;
    }
    case 'mid':
    default:
      day = avoidWeekend(year, month, 10 + Math.floor(rand() * 15));
      break;
  }

  return formatDate(year, month, day);
}

function generateDescription(
  template: BlueprintTransactionTemplate,
  month: number,
  index: number,
  verNumber: number,
): string {
  if (template.descriptionPattern) {
    return template.descriptionPattern
      .replace('{month}', MONTH_NAMES[month - 1]!)
      .replace('{n}', String(index + 1))
      .replace('{ver}', String(1000 + verNumber));
  }

  const debit = parseInt(template.debitAccount, 10);
  const credit = parseInt(template.creditAccount, 10);
  const monthName = MONTH_NAMES[month - 1]!;

  if (credit >= 3000 && credit < 4000) {
    const variants = [
      `Försäljning ${monthName}`,
      `Kundbetalning fakt ${1000 + verNumber}`,
      `Försäljning faktura ${1000 + verNumber}`,
      `Intäkt ${monthName}`,
    ];
    return variants[index % variants.length]!;
  }

  if (debit >= 4000 && debit < 5000) {
    const variants = [
      `Leverantörsfaktura ${monthName}`,
      `Inköp material`,
      `Varuinköp fakt ${2000 + verNumber}`,
      `Leverantörsbetalning`,
    ];
    return variants[index % variants.length]!;
  }

  if (debit >= 7200 && debit < 7300) return `Löneutbetalning ${monthName}`;
  if (debit >= 7500 && debit < 7600) return `Arbetsgivaravgifter ${monthName}`;
  if (debit >= 7400 && debit < 7500) return `Tjänstepension ${monthName}`;
  if (debit >= 5010 && debit <= 5010) return `Månadshyra ${monthName}`;
  if (debit === 7830) return `Avskrivning ${monthName}`;
  if (debit === 8910) return `Preliminärskatt ${monthName}`;

  if (debit >= 5000 && debit < 7000) {
    const variants = [template.description, `${template.description} ${monthName}`];
    return variants[month % variants.length]!;
  }

  return template.description;
}

function inferDatePattern(template: BlueprintTransactionTemplate): NonNullable<BlueprintTransactionTemplate['datePattern']> {
  if (template.datePattern) return template.datePattern;

  const debit = parseInt(template.debitAccount, 10);

  if (debit === 5010 || debit === 6310 || debit === 6250) return 'first';
  if (debit >= 7200 && debit < 7600) return 'salary';
  if (debit === 8910) return 'tax';
  if (parseInt(template.creditAccount, 10) >= 3000 && parseInt(template.creditAccount, 10) < 4000) return 'spread';
  if (debit >= 4000 && debit < 5000) return 'spread';
  if (debit === 7830) return 'end';
  return 'mid';
}

function inferMonthlyCount(template: BlueprintTransactionTemplate): number {
  if (template.monthlyCount && template.monthlyCount > 0) return template.monthlyCount;

  const debit = parseInt(template.debitAccount, 10);
  const credit = parseInt(template.creditAccount, 10);

  if (credit >= 3000 && credit < 4000) return 5 + Math.floor(template.monthlyAmount / 50000);
  if (debit >= 4000 && debit < 5000) return 3 + Math.floor(template.monthlyAmount / 80000);
  return 1;
}

// ---- Current ratio normalization ----

const MISSING_LIABILITY_ACCOUNTS: {
  account: string;
  name: string;
  compute: (fin: CompanyBlueprint['annualFinancials']) => number;
}[] = [
  {
    account: '2640',
    name: 'Utgående moms',
    compute: (fin) => Math.round((fin.totalRevenue / 12) * 0.25 / 1.25),
  },
  {
    account: '2710',
    name: 'Personalens källskatt',
    compute: (fin) => Math.round((fin.totalPersonnelCosts / 1.4 / 12) * 0.30),
  },
  {
    account: '2730',
    name: 'Lagstadgade sociala avgifter',
    compute: (fin) => Math.round((fin.totalPersonnelCosts / 1.4 / 12) * 0.3142),
  },
  {
    account: '2920',
    name: 'Upplupna semesterlöner',
    compute: (fin) => Math.round((fin.totalPersonnelCosts / 1.4) * 0.12),
  },
  {
    account: '2510',
    name: 'Skatteskulder',
    compute: (fin) => Math.round(fin.taxAmount / 6),
  },
];

function normalizeCurrentRatio(
  blueprint: CompanyBlueprint,
  ibMap: Map<string, number>,
  accounts: SIEAccount[],
): void {
  const MAX_RATIO = 3.0;
  const TARGET_RATIO = 1.8;

  let currentAssets = 0;
  let currentLiabilities = 0;
  for (const [accNum, amount] of ibMap) {
    const num = parseInt(accNum, 10);
    if (num >= 1400 && num <= 1999) currentAssets += amount;
    if (num >= 2400 && num <= 2999) currentLiabilities += Math.abs(amount);
  }

  if (currentLiabilities <= 0 || currentAssets / currentLiabilities <= MAX_RATIO) {
    return;
  }

  const targetCL = currentAssets / TARGET_RATIO;
  const deficit = targetCL - currentLiabilities;

  const additions: { account: string; name: string; amount: number }[] = [];
  let totalAdded = 0;

  for (const spec of MISSING_LIABILITY_ACCOUNTS) {
    const existing = ibMap.get(spec.account) ?? 0;
    if (Math.abs(existing) > 1000) continue;

    const idealAmount = spec.compute(blueprint.annualFinancials);
    if (idealAmount <= 0) continue;

    additions.push({ account: spec.account, name: spec.name, amount: idealAmount });
    totalAdded += idealAmount;
  }

  if (totalAdded === 0) return;

  const scale = Math.min(deficit / totalAdded, 1.5);
  let finalTotal = 0;

  for (const entry of additions) {
    const scaled = Math.round(entry.amount * scale);
    if (scaled <= 0) continue;

    const existing = ibMap.get(entry.account) ?? 0;
    ibMap.set(entry.account, existing - scaled);
    finalTotal += scaled;

    if (!accounts.some((a) => a.accountNumber === entry.account)) {
      accounts.push({
        accountNumber: entry.account,
        accountName: entry.name,
        accountGroup: ACCOUNT_GROUPS['2'] ?? '',
      });
    }
  }

  const existingRetained = ibMap.get('2091') ?? 0;
  ibMap.set('2091', existingRetained + finalTotal);
}

// ---- Ensure VAT accounts exist ----

function ensureVATAccounts(accounts: SIEAccount[], templates: BlueprintTransactionTemplate[]): void {
  const vatRatesUsed = new Set<number>();
  for (const t of templates) {
    if (t.vatRate && t.vatRate > 0) vatRatesUsed.add(t.vatRate);
  }

  if (vatRatesUsed.size > 0) {
    if (!accounts.some((a) => a.accountNumber === VAT_INPUT_ACCOUNT)) {
      accounts.push({
        accountNumber: VAT_INPUT_ACCOUNT,
        accountName: 'Ingående moms',
        accountGroup: ACCOUNT_GROUPS['1'] ?? '',
      });
    }
  }

  for (const rate of vatRatesUsed) {
    const acc = VAT_OUTPUT_ACCOUNTS[rate];
    if (acc && !accounts.some((a) => a.accountNumber === acc)) {
      accounts.push({
        accountNumber: acc,
        accountName: `Utgående moms ${rate}%`,
        accountGroup: ACCOUNT_GROUPS['2'] ?? '',
      });
    }
  }

  if (vatRatesUsed.size > 0 && !accounts.some((a) => a.accountNumber === '1630')) {
    accounts.push({
      accountNumber: '1630',
      accountName: 'Skattekonto',
      accountGroup: ACCOUNT_GROUPS['1'] ?? '',
    });
  }
}

// ---- Main expander ----

export function expandBlueprintToSIE(
  blueprint: CompanyBlueprint,
  request: GenerateCompanyRequest,
): SIEParseResult {
  const fiscalYear = request.fiscalYear ?? new Date().getFullYear() - 1;
  const includePreviousYear = request.includePreviousYear ?? true;
  const rand = seededRandom(hashString(blueprint.profile.companyName + fiscalYear));

  const industry = blueprint.profile.industry as CompanyIndustry;
  const rules = INDUSTRY_RULES[industry] ?? null;
  const seasonalMultipliers = rules?.seasonalMultipliers ?? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  const today = new Date();
  const metadata: SIEMetadata = {
    companyName: blueprint.profile.companyName,
    currency: 'SEK',
    generatedDate: formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    sieType: '4',
    fiscalYearStart: formatDate(fiscalYear, 1, 1),
    fiscalYearEnd: formatDate(fiscalYear, 12, 31),
    orgNumber: blueprint.profile.orgNumber,
    omfattnDate: formatDate(fiscalYear, 12, 31),
  };

  const accounts: SIEAccount[] = blueprint.accounts.map((a) => ({
    accountNumber: a.number,
    accountName: a.name,
    accountGroup: ACCOUNT_GROUPS[a.number[0]!] ?? '',
  }));

  ensureVATAccounts(accounts, blueprint.transactionTemplates);
  ensureBokslutAccounts(accounts);

  const { transactions, accountMovements, vatAccumulator } = generateTransactions(
    blueprint.transactionTemplates,
    fiscalYear,
    rand,
    seasonalMultipliers,
  );

  generateVATSettlements(vatAccumulator, fiscalYear, transactions, accountMovements);

  generateBokslutEntries(
    blueprint,
    fiscalYear,
    transactions,
    accountMovements,
    accounts,
  );

  const balances: SIEBalance[] = [];

  const ibMap = new Map<string, number>();
  for (const ob of blueprint.openingBalances) {
    ibMap.set(ob.accountNumber, ob.amount);
  }

  normalizeCurrentRatio(blueprint, ibMap, accounts);

  for (const [accountNumber, amount] of ibMap) {
    balances.push({
      accountNumber,
      balanceType: 'IB',
      yearIndex: 0,
      amount,
    });
  }

  const allAccountNumbers = new Set([
    ...ibMap.keys(),
    ...accountMovements.keys(),
  ]);

  for (const accNum of allAccountNumbers) {
    const type = getAccountType(accNum);
    const movement = accountMovements.get(accNum) ?? 0;

    if (type === 'INCOME_STATEMENT') {
      if (movement !== 0) {
        balances.push({
          accountNumber: accNum,
          balanceType: 'RES',
          yearIndex: 0,
          amount: movement,
        });
      }
    } else if (type === 'BALANCE_SHEET') {
      const ib = ibMap.get(accNum) ?? 0;
      balances.push({
        accountNumber: accNum,
        balanceType: 'UB',
        yearIndex: 0,
        amount: ib + movement,
      });
    }
  }

  // Previous year (optional)
  if (includePreviousYear && blueprint.previousYearMultiplier != null) {
    const prevYear = fiscalYear - 1;
    const multiplier = blueprint.previousYearMultiplier;
    const prevRand = seededRandom(hashString(blueprint.profile.companyName + prevYear));

    const prevTemplates = blueprint.transactionTemplates.map((t) => ({
      ...t,
      monthlyAmount: t.monthlyAmount * multiplier,
    }));

    const { accountMovements: prevMovements } = generateTransactions(
      prevTemplates,
      prevYear,
      prevRand,
      seasonalMultipliers,
    );

    for (const [accNum, amount] of ibMap) {
      const prevIB = amount * multiplier;
      balances.push({
        accountNumber: accNum,
        balanceType: 'IB',
        yearIndex: -1,
        amount: Math.round(prevIB * 100) / 100,
      });
    }

    const prevAllAccounts = new Set([...ibMap.keys(), ...prevMovements.keys()]);
    for (const accNum of prevAllAccounts) {
      const type = getAccountType(accNum);
      const movement = prevMovements.get(accNum) ?? 0;
      if (type === 'INCOME_STATEMENT') {
        if (movement !== 0) {
          balances.push({
            accountNumber: accNum,
            balanceType: 'RES',
            yearIndex: -1,
            amount: movement,
          });
        }
      } else if (type === 'BALANCE_SHEET') {
        const scaledIB = (ibMap.get(accNum) ?? 0) * multiplier;
        balances.push({
          accountNumber: accNum,
          balanceType: 'UB',
          yearIndex: -1,
          amount: Math.round((scaledIB + movement) * 100) / 100,
        });
      }
    }
  }

  transactions.sort((a, b) => a.verificationDate.localeCompare(b.verificationDate));

  return {
    metadata,
    accounts,
    dimensions: [],
    transactions,
    balances,
  };
}

// ---- VAT accumulator ----

interface VATAccumulator {
  outputVAT: Map<number, number[]>;
  inputVAT: number[];
}

// ---- Main transaction generator ----

function generateTransactions(
  templates: BlueprintTransactionTemplate[],
  year: number,
  rand: () => number,
  seasonalMultipliers: number[],
): {
  transactions: SIETransaction[];
  accountMovements: Map<string, number>;
  vatAccumulator: VATAccumulator;
} {
  const transactions: SIETransaction[] = [];
  const accountMovements = new Map<string, number>();

  const seriesCounters: Record<string, number> = {};
  const getNextVerNum = (series: string): string => {
    const current = seriesCounters[series] ?? 0;
    seriesCounters[series] = current + 1;
    return String(current + 1);
  };

  const vatAccumulator: VATAccumulator = {
    outputVAT: new Map(),
    inputVAT: [0, 0, 0, 0],
  };

  for (const template of templates) {
    const months = template.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const datePattern = inferDatePattern(template);
    const monthlyCount = inferMonthlyCount(template);
    const series = getVerificationSeries(template);
    const vatRate = template.vatRate ?? 0;

    const credit = parseInt(template.creditAccount, 10);
    const debit = parseInt(template.debitAccount, 10);
    const isRevenue = credit >= 3000 && credit < 4000;
    const isCOGS = debit >= 4000 && debit < 5000;
    const applySeasonal = isRevenue || isCOGS;

    const isSalary = debit >= 7200 && debit < 7300;

    for (const month of months) {
      const seasonal = applySeasonal ? (seasonalMultipliers[month - 1] ?? 1) : 1;
      const baseMonthAmount = template.monthlyAmount * seasonal;

      if (isSalary) {
        expandSalaryVerification(
          template,
          baseMonthAmount,
          year,
          month,
          rand,
          series,
          getNextVerNum,
          transactions,
          accountMovements,
        );
        continue;
      }

      const perTxAmount = baseMonthAmount / monthlyCount;

      for (let i = 0; i < monthlyCount; i++) {
        const amount = varyAmount(perTxAmount, template.variance, rand);
        if (amount === 0) continue;

        const date = getTransactionDate(year, month, datePattern, rand, i, monthlyCount);
        const verNum = getNextVerNum(series);
        const description = generateDescription(template, month, i, parseInt(verNum, 10));

        const quarter = Math.floor((month - 1) / 3);

        if (vatRate > 0 && isRevenue) {
          const net = amount;
          const vat = Math.round(net * vatRate / 100 * 100) / 100;
          const gross = Math.round((net + vat) * 100) / 100;

          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.debitAccount,
            amount: gross,
          });
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.creditAccount,
            amount: -net,
          });
          const vatAccount = VAT_OUTPUT_ACCOUNTS[vatRate] ?? '2611';
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: vatAccount,
            amount: -vat,
          });

          if (!vatAccumulator.outputVAT.has(vatRate)) {
            vatAccumulator.outputVAT.set(vatRate, [0, 0, 0, 0]);
          }
          const outputArr = vatAccumulator.outputVAT.get(vatRate)!;
          outputArr[quarter] = (outputArr[quarter] ?? 0) + vat;
        } else if (vatRate > 0 && !isRevenue) {
          const net = amount;
          const vat = Math.round(net * vatRate / 100 * 100) / 100;
          const gross = Math.round((net + vat) * 100) / 100;

          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.debitAccount,
            amount: net,
          });
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: VAT_INPUT_ACCOUNT,
            amount: vat,
          });
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.creditAccount,
            amount: -gross,
          });

          vatAccumulator.inputVAT[quarter] = (vatAccumulator.inputVAT[quarter] ?? 0) + vat;
        } else {
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.debitAccount,
            amount: amount,
          });
          pushTransaction(transactions, accountMovements, {
            series, verNum, date, description,
            accountNumber: template.creditAccount,
            amount: -amount,
          });
        }
      }
    }
  }

  return { transactions, accountMovements, vatAccumulator };
}

function pushTransaction(
  transactions: SIETransaction[],
  movements: Map<string, number>,
  opts: {
    series: string;
    verNum: string;
    date: string;
    description: string;
    accountNumber: string;
    amount: number;
  },
): void {
  transactions.push({
    verificationSeries: opts.series,
    verificationNumber: opts.verNum,
    verificationDate: opts.date,
    verificationText: opts.description,
    accountNumber: opts.accountNumber,
    amount: opts.amount,
    costCenter: '',
    project: '',
    rowText: opts.description,
  });

  movements.set(
    opts.accountNumber,
    (movements.get(opts.accountNumber) ?? 0) + opts.amount,
  );
}

// ---- Multi-leg salary verification ----

function expandSalaryVerification(
  template: BlueprintTransactionTemplate,
  monthlyGrossSalary: number,
  year: number,
  month: number,
  rand: () => number,
  series: string,
  getNextVerNum: (s: string) => string,
  transactions: SIETransaction[],
  movements: Map<string, number>,
): void {
  const gross = varyAmount(monthlyGrossSalary, template.variance, rand);
  if (gross === 0) return;

  const date = getTransactionDate(year, month, 'salary', rand);
  const verNum = getNextVerNum(series);
  const description = `Löneutbetalning ${MONTH_NAMES[month - 1]!}`;

  const paye = Math.round(gross * 0.30 * 100) / 100;
  const socialSecurity = Math.round(gross * 0.3142 * 100) / 100;
  const pension = Math.round(gross * 0.05 * 100) / 100;
  const netPay = Math.round((gross - paye) * 100) / 100;

  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '7210', amount: gross,
  });
  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '7510', amount: socialSecurity,
  });
  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '7411', amount: pension,
  });
  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '2710', amount: -paye,
  });
  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '2730', amount: -socialSecurity,
  });
  pushTransaction(transactions, movements, {
    series, verNum, date, description,
    accountNumber: '1930', amount: -(netPay + pension),
  });
}

// ---- Quarterly VAT settlement ----

function generateVATSettlements(
  vatAccumulator: VATAccumulator,
  year: number,
  transactions: SIETransaction[],
  movements: Map<string, number>,
): void {
  const quarterEndMonths = [3, 6, 9, 12];
  const quarterSettleDays = [12, 12, 12, 12];

  for (let q = 0; q < 4; q++) {
    const settleMonth = quarterEndMonths[q]! + 1;
    const settleYear = settleMonth > 12 ? year + 1 : year;
    const actualMonth = settleMonth > 12 ? settleMonth - 12 : settleMonth;
    const date = formatDate(settleYear, actualMonth, quarterSettleDays[q]!);

    if (settleYear > year) continue;

    let totalOutputVAT = 0;
    for (const [, quarterAmounts] of vatAccumulator.outputVAT) {
      totalOutputVAT += quarterAmounts[q] ?? 0;
    }
    const totalInputVAT = vatAccumulator.inputVAT[q] ?? 0;

    if (totalOutputVAT === 0 && totalInputVAT === 0) continue;

    const netVAT = Math.round((totalOutputVAT - totalInputVAT) * 100) / 100;
    const verNum = String(100 + q);
    const description = `Momsredovisning Q${q + 1}`;

    for (const [rate, quarterAmounts] of vatAccumulator.outputVAT) {
      const amount = quarterAmounts[q] ?? 0;
      if (amount === 0) continue;
      const vatAccount = VAT_OUTPUT_ACCOUNTS[rate] ?? '2611';
      pushTransaction(transactions, movements, {
        series: 'D', verNum, date, description,
        accountNumber: vatAccount, amount: amount,
      });
    }

    if (totalInputVAT > 0) {
      pushTransaction(transactions, movements, {
        series: 'D', verNum, date, description,
        accountNumber: VAT_INPUT_ACCOUNT, amount: -totalInputVAT,
      });
    }

    if (netVAT !== 0) {
      pushTransaction(transactions, movements, {
        series: 'D', verNum, date, description,
        accountNumber: '1630', amount: -netVAT,
      });
    }
  }
}

// ---- Year-end closing entries ----

function ensureBokslutAccounts(accounts: SIEAccount[]): void {
  const bokslutAccounts = [
    { number: '2510', name: 'Skatteskulder', group: '2' },
    { number: '2920', name: 'Upplupna semesterlöner', group: '2' },
    { number: '7090', name: 'Förändring semesterlöneskuld', group: '7' },
  ];

  for (const ba of bokslutAccounts) {
    if (!accounts.some((a) => a.accountNumber === ba.number)) {
      accounts.push({
        accountNumber: ba.number,
        accountName: ba.name,
        accountGroup: ACCOUNT_GROUPS[ba.group] ?? '',
      });
    }
  }
}

function generateBokslutEntries(
  blueprint: CompanyBlueprint,
  year: number,
  transactions: SIETransaction[],
  movements: Map<string, number>,
  accounts: SIEAccount[],
): void {
  const date = formatDate(year, 12, 31);
  let verNumber = 1;

  let netIncome = 0;
  for (const [accNum, amount] of movements) {
    const num = parseInt(accNum, 10);
    if (num >= 3000 && num <= 8999) {
      netIncome += amount;
    }
  }

  const existingTax = movements.get('8910') ?? 0;
  const profitBeforeTax = netIncome - existingTax;
  if (profitBeforeTax < 0) {
    const expectedTax = Math.round(Math.abs(profitBeforeTax) * 0.206 * 100) / 100;
    const taxAdjustment = Math.round((expectedTax - existingTax) * 100) / 100;

    if (taxAdjustment > 100) {
      const verNum = `YE${verNumber++}`;
      const description = 'Skatt på årets resultat (justering)';

      pushTransaction(transactions, movements, {
        series: 'YE', verNum, date, description,
        accountNumber: '8910', amount: taxAdjustment,
      });
      pushTransaction(transactions, movements, {
        series: 'YE', verNum, date, description,
        accountNumber: '2510', amount: -taxAdjustment,
      });

      if (!accounts.some((a) => a.accountNumber === '2510')) {
        accounts.push({
          accountNumber: '2510',
          accountName: 'Skatteskulder',
          accountGroup: ACCOUNT_GROUPS['2'] ?? '',
        });
      }
    }
  }

  {
    const verNum = `YE${verNumber++}`;
    const description = 'Semesterlöneskuld justering';
    const grossSalary = (blueprint.annualFinancials.totalPersonnelCosts / 1.4);
    const vacationLiability = Math.round(grossSalary * 0.12 * 100) / 100;
    const adjustment = Math.round(vacationLiability * 0.05 * 100) / 100;

    if (adjustment > 0) {
      pushTransaction(transactions, movements, {
        series: 'YE', verNum, date, description,
        accountNumber: '7090', amount: adjustment,
      });
      pushTransaction(transactions, movements, {
        series: 'YE', verNum, date, description,
        accountNumber: '2920', amount: -adjustment,
      });

      if (!accounts.some((a) => a.accountNumber === '7090')) {
        accounts.push({
          accountNumber: '7090',
          accountName: 'Förändring semesterlöneskuld',
          accountGroup: ACCOUNT_GROUPS['7'] ?? '',
        });
      }
      if (!accounts.some((a) => a.accountNumber === '2920')) {
        accounts.push({
          accountNumber: '2920',
          accountName: 'Upplupna semesterlöner',
          accountGroup: ACCOUNT_GROUPS['2'] ?? '',
        });
      }
    }
  }
}

// ---- Utilities ----

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
