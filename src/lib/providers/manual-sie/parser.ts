// SIE (Swedish accounting file format) parser
// Adapted from dev_docs/SIE_PARSER.md
import * as iconv from 'iconv-lite';

export interface SIEMetadata {
  companyName: string;
  currency: string;
  generatedDate: string | null;
  sieType: string | null;
  fiscalYearStart: string | null;
  fiscalYearEnd: string | null;
  orgNumber?: string;
  omfattnDate?: string;
}

export interface SIEAccount {
  accountNumber: string;
  accountName: string;
  accountGroup: string;
  taxCode?: string;
}

export interface SIEDimension {
  dimensionType: number;
  code: string;
  name: string;
}

export interface SIETransaction {
  verificationSeries: string;
  verificationNumber: string;
  verificationDate: string;
  verificationText: string;
  accountNumber: string;
  amount: number;
  costCenter: string;
  project: string;
  rowText: string;
  quantity?: number;
  registrationDate?: string;
}

export interface SIEBalance {
  accountNumber: string;
  balanceType: 'IB' | 'UB' | 'RES';
  yearIndex: number;
  amount: number;
  quantity?: number;
}

export interface SIEParseResult {
  metadata: SIEMetadata;
  accounts: SIEAccount[];
  dimensions: SIEDimension[];
  transactions: SIETransaction[];
  balances: SIEBalance[];
}

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

function parseAmount(value: string): number {
  if (!value || value === '') return 0;
  const num = parseFloat(value);
  return Object.is(num, -0) ? 0 : num;
}

function parseLine(line: string): { label: string; parts: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#')) return null;

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inBraces = false;
  let braceContent = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === '{' && !inQuotes) {
      inBraces = true;
      braceContent = '';
      continue;
    }

    if (char === '}' && !inQuotes && inBraces) {
      inBraces = false;
      parts.push(braceContent.trim());
      continue;
    }

    if (inBraces) {
      braceContent += char;
      continue;
    }

    if (char === '"') {
      if (inQuotes && i + 1 < trimmed.length && trimmed[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  if (parts.length === 0) return null;

  const label = parts[0]!.substring(1).toUpperCase();
  return { label, parts: parts.slice(1) };
}

function parseVerificationBlock(
  lines: string[],
  startIndex: number,
  defaultText: string,
  defaultDate: string,
  verSeries: string,
  verNumber: string,
  registrationDate?: string,
): { endIndex: number; transactions: SIETransaction[] } {
  const transactions: SIETransaction[] = [];
  let i = startIndex;

  if (lines[i + 1]?.trim() === '{') {
    i += 2;
    while (i < lines.length && lines[i]!.trim() !== '}') {
      const parsed = parseLine(lines[i]!);

      if (parsed && (parsed.label === 'BTRANS' || parsed.label === 'RTRANS')) {
        i++;
        continue;
      }

      if (parsed && parsed.label === 'TRANS') {
        const account = parsed.parts[0] || '';
        const dimString = parsed.parts[1] || '';
        const amount = parseAmount(parsed.parts[2] ?? '');

        let costCenter = '';
        let project = '';
        if (dimString) {
          const dimParts = dimString.split(' ').filter(Boolean);
          for (let d = 0; d < dimParts.length - 1; d += 2) {
            const dimType = dimParts[d]!;
            const dimValue = dimParts[d + 1]!;
            if (dimType === '1') costCenter = dimValue;
            if (dimType === '6') project = dimValue;
          }
        }

        let dateStr = defaultDate;
        let textStr = defaultText;

        const remainingParts = parsed.parts.slice(3);
        const meaningfulParts = remainingParts.filter((p) => {
          if (!p || p === '') return false;
          if (/^\d+$/.test(p) && parseInt(p, 10) <= 100) return false;
          return true;
        });

        if (meaningfulParts.length > 0) {
          const firstPart = meaningfulParts[0]!;
          if (/^\d{8}$/.test(firstPart)) {
            dateStr = firstPart;
            if (meaningfulParts.length > 1) {
              textStr = meaningfulParts[1]!;
            }
          } else {
            textStr = firstPart;
          }
        }

        const quantity = parsed.parts[5] ? parseAmount(parsed.parts[5]) : undefined;

        transactions.push({
          verificationSeries: verSeries,
          verificationNumber: verNumber,
          verificationDate: dateStr,
          verificationText: textStr,
          accountNumber: account,
          amount,
          costCenter,
          project,
          rowText: textStr,
          quantity: quantity !== 0 ? quantity : undefined,
          registrationDate: registrationDate || undefined,
        });
      }
      i++;
    }
  }

  return { endIndex: i, transactions };
}

export function parseSIE(content: string): SIEParseResult {
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');

  const metadata: SIEMetadata = {
    companyName: 'Okänd',
    currency: 'SEK',
    generatedDate: null,
    sieType: null,
    fiscalYearStart: null,
    fiscalYearEnd: null,
  };

  const accounts: SIEAccount[] = [];
  const accountTaxCodes: Map<string, string> = new Map();
  const dimensions: SIEDimension[] = [];
  const transactions: SIETransaction[] = [];
  const balances: SIEBalance[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i]!);
    if (!parsed) continue;

    const { label, parts } = parsed;

    switch (label) {
      case 'SIETYP':
        metadata.sieType = parts[0] || null;
        break;

      case 'FNAMN':
        metadata.companyName = parts[0] || 'Okänd';
        break;

      case 'VALUTA':
        metadata.currency = parts[0] || 'SEK';
        break;

      case 'GEN':
        if (parts[0]) {
          const d = parts[0];
          metadata.generatedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        }
        break;

      case 'ORGNR':
        metadata.orgNumber = parts[0] || undefined;
        break;

      case 'RAR':
        if (parts[0] === '0' && parts[1] && parts[2]) {
          const start = parts[1];
          const end = parts[2];
          metadata.fiscalYearStart = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
          metadata.fiscalYearEnd = `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`;
        }
        break;

      case 'OMFATTN':
        if (parts[0]) {
          const d = parts[0];
          metadata.omfattnDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        }
        break;

      case 'KONTO':
        if (parts[0] && parts[1]) {
          const accountNumber = parts[0]!;
          accounts.push({
            accountNumber,
            accountName: parts[1]!,
            accountGroup: ACCOUNT_GROUPS[accountNumber[0]!] || '',
            taxCode: accountTaxCodes.get(accountNumber),
          });
        }
        break;

      case 'SRU':
        if (parts[0] && parts[1]) {
          accountTaxCodes.set(parts[0], parts[1]);
        }
        break;

      case 'IB':
        if (parts[0] && parts[1] && parts[2]) {
          balances.push({
            accountNumber: parts[1],
            balanceType: 'IB',
            yearIndex: parseInt(parts[0], 10),
            amount: parseAmount(parts[2]),
            quantity: parts[3] ? parseAmount(parts[3]) : undefined,
          });
        }
        break;

      case 'UB':
        if (parts[0] && parts[1] && parts[2]) {
          balances.push({
            accountNumber: parts[1],
            balanceType: 'UB',
            yearIndex: parseInt(parts[0], 10),
            amount: parseAmount(parts[2]),
            quantity: parts[3] ? parseAmount(parts[3]) : undefined,
          });
        }
        break;

      case 'RES':
        if (parts[0] && parts[1] && parts[2]) {
          balances.push({
            accountNumber: parts[1],
            balanceType: 'RES',
            yearIndex: parseInt(parts[0], 10),
            amount: parseAmount(parts[2]),
            quantity: parts[3] ? parseAmount(parts[3]) : undefined,
          });
        }
        break;

      case 'DIM':
        break;

      case 'OBJEKT':
        if (parts[0] && parts[1]) {
          dimensions.push({
            dimensionType: parseInt(parts[0], 10),
            code: parts[1],
            name: parts[2] || parts[1],
          });
        }
        break;

      case 'VER': {
        const verSeries = parts[0] || '';
        const verNumber = parts[1] || '';
        const verDate = parts[2] || '';
        const verText = parts[3] || '';
        const verRegistrationDate = parts[4] || undefined;

        const { endIndex, transactions: verTrans } = parseVerificationBlock(
          lines, i, verText, verDate, verSeries, verNumber, verRegistrationDate,
        );

        transactions.push(...verTrans);
        i = endIndex;
        break;
      }
    }
  }

  // Update accounts with SRU codes parsed after KONTO lines
  accounts.forEach((account) => {
    if (!account.taxCode && accountTaxCodes.has(account.accountNumber)) {
      account.taxCode = accountTaxCodes.get(account.accountNumber);
    }
  });

  return { metadata, accounts, dimensions, transactions, balances };
}

/**
 * Decode SIE file buffer with proper encoding detection.
 * Handles CP437 (DOS/Fortnox), Latin-1, and UTF-8.
 */
export function decodeSIEBuffer(buffer: Buffer): string {
  // UTF-8 BOM detection
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8').slice(1);
  }

  // Check for #KSUMMA or #FLAGGA to detect encoding hints in raw bytes
  // Look for high bytes that indicate CP437 vs Latin-1
  // CP437 Swedish: å=0x86, ä=0x84, ö=0x94
  // Latin-1 Swedish: å=0xE5, ä=0xE4, ö=0xF6
  let hasHighCp437 = false;
  let hasHighLatin1 = false;
  const checkLen = Math.min(buffer.length, 4096);
  for (let i = 0; i < checkLen; i++) {
    const b = buffer[i];
    if (b === 0x84 || b === 0x86 || b === 0x94) hasHighCp437 = true;
    if (b === 0xE4 || b === 0xE5 || b === 0xF6) hasHighLatin1 = true;
  }

  if (hasHighLatin1 && !hasHighCp437) {
    return iconv.decode(buffer, 'iso-8859-1');
  }

  // Default to CP437 (most common for SIE files from Fortnox etc.)
  return iconv.decode(buffer, 'cp437');
}
