/**
 * SIE file writer.
 *
 * Converts SIEParseResult -> valid SIE format text.
 * Inverse of parseSIE() -- round-trip: parseSIE(writeSIE(data)) ~ data.
 */
import type { SIEParseResult, SIETransaction } from './types';

export interface WriteSIEOptions {
  programName?: string;
  programVersion?: string;
  format?: string;
  includeFlag?: boolean;
}

function toSIEDate(date: string): string {
  return date.replace(/-/g, '');
}

function quoteSIE(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatAmount(amount: number): string {
  if (Object.is(amount, -0)) return '0';
  const str = amount.toFixed(2);
  return str.replace(/\.?0+$/, '') || '0';
}

/** Write SIEParseResult to valid SIE format text. */
export function writeSIE(
  data: SIEParseResult,
  options?: WriteSIEOptions,
): string {
  const {
    programName = 'ArcimSync',
    programVersion = '1.0',
    format = 'PCUTF8',
    includeFlag = true,
  } = options ?? {};

  const lines: string[] = [];

  if (includeFlag) {
    lines.push('#FLAGGA 0');
  }

  lines.push(`#PROGRAM ${quoteSIE(programName)} ${programVersion}`);
  lines.push(`#FORMAT ${format}`);

  if (data.metadata.generatedDate) {
    lines.push(`#GEN ${toSIEDate(data.metadata.generatedDate)}`);
  }

  if (data.metadata.sieType) {
    lines.push(`#SIETYP ${data.metadata.sieType}`);
  }

  lines.push(`#FNAMN ${quoteSIE(data.metadata.companyName)}`);

  if (data.metadata.orgNumber) {
    lines.push(`#ORGNR ${data.metadata.orgNumber}`);
  }

  lines.push(`#VALUTA ${data.metadata.currency}`);

  // Fiscal years (#RAR)
  const yearIndexes = new Set<number>();
  for (const b of data.balances) {
    yearIndexes.add(b.yearIndex);
  }

  if (data.metadata.fiscalYearStart && data.metadata.fiscalYearEnd) {
    lines.push(
      `#RAR 0 ${toSIEDate(data.metadata.fiscalYearStart)} ${toSIEDate(data.metadata.fiscalYearEnd)}`,
    );

    for (const yi of [...yearIndexes].sort((a, b) => b - a)) {
      if (yi < 0) {
        const startYear =
          parseInt(data.metadata.fiscalYearStart.slice(0, 4), 10) + yi;
        const endYear =
          parseInt(data.metadata.fiscalYearEnd.slice(0, 4), 10) + yi;
        const startSuffix = toSIEDate(data.metadata.fiscalYearStart).slice(4);
        const endSuffix = toSIEDate(data.metadata.fiscalYearEnd).slice(4);
        lines.push(`#RAR ${yi} ${startYear}${startSuffix} ${endYear}${endSuffix}`);
      }
    }
  }

  if (data.metadata.omfattnDate) {
    lines.push(`#OMFATTN ${toSIEDate(data.metadata.omfattnDate)}`);
  }

  // Accounts and SRU codes
  for (const account of data.accounts) {
    lines.push(`#KONTO ${account.accountNumber} ${quoteSIE(account.accountName)}`);
    if (account.taxCode) {
      lines.push(`#SRU ${account.accountNumber} ${account.taxCode}`);
    }
  }

  // Dimensions (#OBJEKT)
  for (const dim of data.dimensions) {
    lines.push(`#OBJEKT ${dim.dimensionType} ${dim.code} ${quoteSIE(dim.name)}`);
  }

  // Balances: IB, UB, RES
  const balanceTypeOrder = { IB: 0, UB: 1, RES: 2 } as const;
  const sortedBalances = [...data.balances].sort((a, b) => {
    const typeA = balanceTypeOrder[a.balanceType];
    const typeB = balanceTypeOrder[b.balanceType];
    if (typeA !== typeB) return typeA - typeB;
    if (a.yearIndex !== b.yearIndex) return b.yearIndex - a.yearIndex;
    return a.accountNumber.localeCompare(b.accountNumber);
  });

  for (const bal of sortedBalances) {
    const qty = bal.quantity != null ? ` ${formatAmount(bal.quantity)}` : ' 0';
    lines.push(
      `#${bal.balanceType} ${bal.yearIndex} ${bal.accountNumber} ${formatAmount(bal.amount)}${qty}`,
    );
  }

  // Transactions grouped into #VER blocks
  const verGroups = groupTransactions(data.transactions);

  for (const group of verGroups) {
    const first = group[0]!;
    const verDate = toSIEDate(first.verificationDate);
    const verText = quoteSIE(first.verificationText);
    const regDate = first.registrationDate
      ? ` ${toSIEDate(first.registrationDate)}`
      : '';

    lines.push(
      `#VER ${first.verificationSeries} ${first.verificationNumber} ${verDate} ${verText}${regDate}`,
    );
    lines.push('{');

    for (const tx of group) {
      const dims = buildDimensionString(tx);
      const qty = tx.quantity != null ? ` ${formatAmount(tx.quantity)}` : ' 0';
      const rowText = tx.rowText ? quoteSIE(tx.rowText) : '""';
      lines.push(
        `#TRANS ${tx.accountNumber} {${dims}} ${formatAmount(tx.amount)} "" ${rowText}${qty}`,
      );
    }

    lines.push('}');
  }

  return lines.join('\n') + '\n';
}

function groupTransactions(transactions: SIETransaction[]): SIETransaction[][] {
  const groups: SIETransaction[][] = [];
  const seen = new Map<string, number>();

  for (const tx of transactions) {
    const key = `${tx.verificationSeries}|${tx.verificationNumber}`;
    const idx = seen.get(key);
    if (idx != null) {
      groups[idx]!.push(tx);
    } else {
      seen.set(key, groups.length);
      groups.push([tx]);
    }
  }

  return groups;
}

function buildDimensionString(tx: SIETransaction): string {
  const parts: string[] = [];
  if (tx.costCenter) {
    parts.push(`1 ${tx.costCenter}`);
  }
  if (tx.project) {
    parts.push(`6 ${tx.project}`);
  }
  return parts.length > 0 ? ` ${parts.join(' ')} ` : '';
}
