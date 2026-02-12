# Generate Company SIE — Complete Package Reference

> This document describes everything needed to extract the "Generate Company" feature into a standalone npm package that exposes a single `generateCompanySIE()` function.

---

## 1. What It Does

Generates **realistic fictional Swedish companies** with full double-entry bookkeeping in SIE4 format. Uses a **two-phase architecture**:

1. **AI phase** — One LLM call (Claude via AWS Bedrock) produces a structured "financial blueprint" (company profile, chart of accounts, opening balances, transaction templates, annual financial targets)
2. **Deterministic expansion** — Pure TypeScript math expands that blueprint into hundreds of balanced transactions with VAT handling, multi-leg salary breakdowns, quarterly VAT settlements, and year-end closing entries

The output is a valid `.se` file importable into any Swedish accounting system, plus ~50 computed financial KPIs.

---

## 2. Desired Public API

```typescript
import { generateCompanySIE } from '@arcim/generate-company';

const result = await generateCompanySIE({
  // Required — AWS Bedrock credentials
  awsAccessKeyId: 'AKIA...',
  awsSecretAccessKey: '...',
  awsRegion: 'eu-west-1',                              // optional, default 'eu-west-1'
  bedrockModelId: 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0', // optional

  // Generation parameters
  industry: 'consulting',      // optional — AI picks if omitted
  size: 'small',               // optional, default 'small'
  fiscalYear: 2024,            // optional, default: current year - 1
  includePreviousYear: true,   // optional, default: true
});

result.profile;   // { companyName, orgNumber, industry, size, description }
result.sieText;   // Full SIE4 file content (string)
result.sieData;   // Parsed SIE structure (SIEParseResult)
result.kpis;      // ~50 financial KPIs (SIEKPIs)
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `awsAccessKeyId` | `string` | Yes | — | AWS IAM access key with Bedrock invoke permissions |
| `awsSecretAccessKey` | `string` | Yes | — | AWS IAM secret key |
| `awsRegion` | `string` | No | `'eu-west-1'` | AWS region where Bedrock model is available |
| `bedrockModelId` | `string` | No | `'eu.anthropic.claude-sonnet-4-5-20250929-v1:0'` | Bedrock model ID |
| `bedrockMaxTokens` | `number` | No | `8192` | Max tokens for LLM response |
| `industry` | `CompanyIndustry` | No | AI picks | One of 9 industries (see below) |
| `size` | `CompanySize` | No | `'small'` | `'micro'` \| `'small'` \| `'medium'` |
| `fiscalYear` | `number` | No | Current year - 1 | 2000-2099 |
| `includePreviousYear` | `boolean` | No | `true` | Generate YoY comparison data |

### Return Type (`GenerateCompanyResult`)

```typescript
interface GenerateCompanyResult {
  profile: CompanyProfile;
  sieData: SIEParseResult;
  sieText: string;
  kpis: SIEKPIs;
}
```

---

## 3. Architecture Diagram

```
generateCompanySIE(options)
  |
  |-- 1. Build AI config from options (awsAccessKeyId, etc.)
  |
  |-- 2. CompanyGenerator.generate(request)
  |     |
  |     |-- buildPrompt(request)
  |     |     Injects industry rules, Swedish accounting rules, few-shot example
  |     |
  |     |-- LLM call: ChatBedrockConverse + withStructuredOutput(CompanyBlueprintSchema)
  |     |     Returns: CompanyBlueprint (Zod-validated JSON)
  |     |
  |     |-- validateAndFixBlueprint(blueprint)
  |     |     Auto-corrects: balance sheet sum, required accounts, duplicate templates
  |     |
  |     |-- expandBlueprintToSIE(blueprint, request)    ← Pure TypeScript, no LLM
  |     |     Generates all transactions, balances, VAT settlements, year-end entries
  |     |
  |     |-- writeSIE(sieData)                           ← SIEParseResult → SIE text
  |     |
  |     |-- calculateKPIs(sieData)                      ← ~50 financial KPIs
  |
  v
  { profile, sieData, sieText, kpis }
```

---

## 4. Source Files to Include in Package

### Core Generation Logic (from `packages/server/src/`)

| File | What It Does | Exports |
|------|-------------|---------|
| `services/company-generator.ts` | Orchestrator — builds prompt, calls LLM, validates, expands | `CompanyGenerator` class |
| `services/blueprint-expander.ts` | Deterministic expander — blueprint → full SIE data (~1135 lines) | `expandBlueprintToSIE()`, `CompanyBlueprint` type |
| `services/industry-rules.ts` | Per-industry financial rules, seasonal multipliers, expense categories | `INDUSTRY_RULES`, `IndustryRules`, `formatIndustryRulesForPrompt()` |
| `ai/config.ts` | AI configuration schema (Zod) | `AIConfig`, `getAIConfig()`, `hasAWSCredentials()` |

### SIE Library (from `packages/core/src/sie/`)

| File | What It Does | Exports |
|------|-------------|---------|
| `writer.ts` | Converts `SIEParseResult` → valid SIE4 text | `writeSIE()`, `WriteSIEOptions` |
| `kpi.ts` | Computes ~50 financial KPIs from SIE balances | `calculateKPIs()`, `validateSIEBalances()` |
| `accounts.ts` | Swedish BAS account ranges + utilities | `SWEDISH_ACCOUNTS`, `CORPORATE_TAX_RATE`, `EQUITY_PORTION_OF_UNTAXED_RESERVES`, `isInRange()`, `sumAccountsInRange()`, `classifyAccount()`, `getAccountType()`, `getAccountsInRange()`, `calculateAdjustedEquity()`, `calculateTotalLiabilities()`, `calculateInterestBearingDebt()`, `calculateNetSales()`, `AccountRange` |
| `parser.ts` | SIE file parser (for round-trip or import) | `parseSIE()` |
| `encoding.ts` | SIE encoding detection (CP437, ISO-8859-1, UTF-8, Windows-1252) | `decodeSIEBuffer()`, `decodeSIEBufferWithEncoding()`, `detectSIEEncoding()`, `SIEEncoding` |
| `index.ts` | Barrel export for all SIE functionality | Re-exports everything above |

### Type Definitions (from `packages/core/src/types/`)

| File | What It Does | Key Types |
|------|-------------|-----------|
| `sie.ts` | All SIE type definitions | `SIEParseResult`, `SIEMetadata`, `SIEAccount`, `SIEDimension`, `SIEBalance`, `SIETransaction`, `SIEKPIs`, `SIEType`, `SIEBalanceType`, `SIEUpload`, `SIEFullData` |
| `generate.ts` | Generation request/response types | `CompanyIndustry`, `CompanySize`, `GenerateCompanyRequest`, `CompanyProfile`, `GenerateCompanyResult` |

### npm Dependencies

```json
{
  "dependencies": {
    "@langchain/aws": "^0.1.x",
    "@langchain/core": "^0.3.x",
    "zod": "^3.x",
    "iconv-lite": "^0.6.x"
  }
}
```

`iconv-lite` is only needed if you include the SIE parser/encoding (for round-trip or file import). The generator + writer + KPI calculator don't need it.

---

## 5. AI Configuration Details

### Config Schema (`ai/config.ts`)

```typescript
const AIConfigSchema = z.object({
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsRegion: z.string().default('eu-west-1'),
  bedrockModelId: z.string().default('eu.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  bedrockMaxTokens: z.number().default(8192),
  langchainTracingV2: z.boolean().default(false),
  langchainApiKey: z.string().optional(),
  langchainProject: z.string().default('arcim-ai-workflows'),
  generateCompanyTimeout: z.number().default(90_000),
  maxRetries: z.number().default(3),
  initialBackoffMs: z.number().default(1000),
});
```

### LLM Invocation (`company-generator.ts`)

```typescript
const llm = new ChatBedrockConverse({
  model: config.bedrockModelId,
  region: config.awsRegion,
  credentials: {
    accessKeyId: config.awsAccessKeyId!,
    secretAccessKey: config.awsSecretAccessKey!,
  },
  maxTokens: config.bedrockMaxTokens,
  temperature: 0.7,
});

const structuredLlm = llm.withStructuredOutput(CompanyBlueprintSchema, {
  name: 'CompanyBlueprint',
});

const blueprint = await structuredLlm.invoke(prompt);
```

The LLM is forced to return JSON matching the `CompanyBlueprintSchema` Zod schema. This schema defines:

```typescript
CompanyBlueprintSchema = z.object({
  profile: z.object({
    companyName: z.string(),
    orgNumber: z.string(),       // "XXXXXX-XXXX"
    industry: z.string(),
    size: z.string(),
    description: z.string(),     // Swedish, one sentence
  }),
  accounts: z.array(z.object({
    number: z.string(),          // 4-digit BAS account number
    name: z.string(),            // Swedish account name
  })),
  openingBalances: z.array(z.object({
    accountNumber: z.string(),
    amount: z.number(),          // Assets positive, liabilities/equity NEGATIVE
  })),
  transactionTemplates: z.array(z.object({
    description: z.string(),
    debitAccount: z.string(),
    creditAccount: z.string(),
    monthlyAmount: z.number().positive(),
    variance: z.number().min(0).max(0.5),
    months: z.array(z.number().min(1).max(12)).optional(),
    monthlyCount: z.number().min(1).max(30).optional(),
    datePattern: z.enum(['first', 'mid', 'salary', 'tax', 'spread', 'end']).optional(),
    vatRate: z.number().optional(),
    descriptionPattern: z.string().optional(),
  })),
  annualFinancials: z.object({
    totalRevenue: z.number(),
    totalCOGS: z.number(),
    totalOperatingExpenses: z.number(),
    totalPersonnelCosts: z.number(),
    totalFinancialItems: z.number(),
    taxAmount: z.number(),
  }),
  previousYearMultiplier: z.number().optional(),
});
```

---

## 6. The Prompt (Full Specification)

The prompt (`buildPrompt()`) is ~330 lines. Here is the complete rule set injected into it:

### 6.1 Industry Rules Block

If an industry is specified, `formatIndustryRulesForPrompt(industry)` injects:

```
INDUSTRY: Consulting / Professional Services
- COGS should be 0-15% of revenue
- Gross margin target: 85-100%
- Operating margin target: 15-35%
- Net margin target: 10-25%
- Personnel costs: 40-60% of revenue
- Rent: 1-3% of revenue
- Inventory: No inventory accounts needed
- Sales model: B2B → AR (1510) should be 8-15% of annual revenue
- Primary VAT rate: 25%
- Typical expense accounts to include:
  * 5010 Lokalhyra (office rent)
  * 6110 Kontorsmateriel (office supplies)
  * 6210 Telefon & internet
  * 6250 IT-tjänster / licensavgifter (SaaS tools)
  * 6310 Företagsförsäkringar (insurance)
  * 6530 Redovisningstjänster (accounting services)
  * 6570 Bankkostnader (bank fees)
  ...
```

If no industry is specified, the prompt tells the AI to pick a random one.

### 6.2 Company Size Rules

```
Company size: {size}
- micro: 1-3 employees, <3M SEK annual revenue
- small: 4-15 employees, 3-20M SEK annual revenue
- medium: 16-50 employees, 20-100M SEK annual revenue
```

### 6.3 Financial Rules (7 sections)

**1. Revenue & Margins**
- Total revenue, COGS, personnel, and operating expenses must hit industry targets
- `annualFinancials.totalRevenue` must fall within the size range
- Sum of (monthly template amounts x active months) must roughly match annualFinancials

**2. Swedish Accounting Fundamentals**
- Share capital (2081): micro 25,000, small 50,000, medium 100,000 SEK (NEGATIVE in opening balance)
- Retained earnings (2091): accumulated prior-year profits (NEGATIVE)
- Corporate tax: 20.6% of profit before tax
- Salary ranges: micro CEO 25k-40k, small 30k-55k, medium 30k-65k per month
- Only ONE salary template (7210→1930) — expander auto-generates social security, pension, PAYE
- VAT: industry rate for sales, 25% for most expenses, 0 for salary/depreciation/tax/insurance/bank

**3. Balance Sheet — Opening Balances (class 1-2)**
- Opening balance sheet MUST sum to zero (assets positive + equity/liabilities negative = 0)
- Bank (1930) is the PLUG figure: `bank = -(sum of all other IB amounts)`
- Accounts receivable (1510): B2B 8-15%, B2C 0-2% of revenue
- Inventory (1400s): only if industry has inventory, 10-30% of annual COGS
- Fixed assets: acquisition value (e.g. 1220) + accumulated depreciation (1229, NEGATIVE)
- MANDATORY current liabilities (all NEGATIVE):
  - Accounts payable (2440): 5-20% of annual COGS
  - VAT liability (2611): ~1 month of net output VAT
  - PAYE withholding (2710): ~30% of one month's gross salaries
  - Social security liability (2730): ~31.42% of one month's gross salaries
  - Accrued vacation pay (2920): ~12% of annual gross salary cost
  - Tax liability (2510): ~2 months of corporate tax
- Current ratio check: current assets (1400-1999) / current liabilities (2400-2999) must be 1.2-2.5

**4. Expense Categories — Concrete SEK Ranges**
| Category | Micro/month | Small/month | Medium/month |
|----------|-------------|-------------|--------------|
| Rent (5010) | 2k-8k | 5k-20k | 15k-50k |
| Accounting (6530) | 2k-8k | 2k-8k | 2k-8k |
| Insurance (6310) | 500-3k | 500-3k | 500-3k |
| IT/Software (6250) | 500-5k | 500-5k | 500-5k |
| Bank fees (6570) | 200-3.5k | 200-3.5k | 200-3.5k |
| Telecom (6210) | 500-2k | 500-2k | 500-2k |
| Office supplies (6110) | 200-2k | 200-2k | 200-2k |

**5. Depreciation**
- Equipment: 20% per year (5-year straight-line)
- Template: debit 7830, credit 1229
- Monthly amount = annual depreciation / 12

**6. Account Numbering (BAS Kontoplan)**
- Class 1 (1000-1999): Assets — POSITIVE opening balances
- Class 2 (2000-2999): Equity & Liabilities — NEGATIVE opening balances
- Class 3 (3000-3999): Revenue (credited in transactions)
- Class 4 (4000-4999): Cost of goods sold
- Class 5-6 (5000-6999): Operating expenses
- Class 7 (7000-7999): Personnel costs + depreciation
- Class 8 (8000-8999): Financial items + tax
- Required accounts: 1930, 2081, 2091, 2440, 2611, 2710, 2730, 2920, main revenue (3010-3051)

**7. Transaction Template Rules**
- ALL templates must flow through bank (1930)
- Do NOT use 1510 (AR) or 2440 (AP) in templates — those are static opening balance items
- Revenue: debit 1930, credit 3xxx, vatRate = industry rate, monthlyCount 5-15, datePattern "spread"
- COGS: debit 4xxx, credit 1930, vatRate 25, monthlyCount 3-8, datePattern "spread"
- Salary: debit 7210, credit 1930, datePattern "salary", no vatRate
- Rent: datePattern "first", vatRate 25
- Insurance: datePattern "first", no VAT
- IT/subscriptions: datePattern "first", vatRate 25
- Bank fees: datePattern "end", no VAT
- Accounting: datePattern "mid", vatRate 25
- Tax: debit 8910, credit 1930, amount = taxAmount/12, datePattern "tax", no VAT
- Depreciation: debit 7830, credit 1229, datePattern "end", no VAT, variance 0

### 6.4 Few-Shot Example

A complete JSON example for a small consulting company is included in the prompt (accounts, opening balances, transaction templates, annual financials, previousYearMultiplier).

---

## 7. Blueprint Validation & Auto-Correction

After the LLM returns the blueprint, `validateAndFixBlueprint()` runs:

1. **Filter invalid accounts** — Must be 4-digit, 1000-8999
2. **Remove income statement accounts from opening balances** — Only class 1-2 allowed (balance sheet)
3. **Force balance sheet to sum to zero** — Bank (1930) recalculated as plug: `bank = -(sum of all other IB amounts)`
4. **Ensure required accounts exist** — 1930 (bank), 2081 (share capital), 2091 (retained earnings)
5. **Remove duplicate salary-related templates** — If AI added separate social security (7510) or pension (7411) templates, they're removed because the expander generates these from the salary template automatically

---

## 8. Deterministic Blueprint Expansion (Full Detail)

`expandBlueprintToSIE()` in `blueprint-expander.ts` (~1135 lines). No LLM calls.

### 8.1 Transaction Generation

For each template, for each active month:

1. Apply **seasonal multiplier** (if revenue/COGS) from industry rules
2. Split into `monthlyCount` individual transactions
3. Apply **variance** per transaction: `amount * (1 + random * 2 * variance - variance)`
4. Compute **date** based on pattern:
   - `first`: 1st of month (avoid weekends)
   - `salary`: 25th (avoid weekends)
   - `tax`: 12th (avoid weekends)
   - `spread`: evenly distributed across month with jitter
   - `mid`: random day between 10th-24th
   - `end`: random day between 28th-31st
5. Generate **varied descriptions** from account type + Swedish month name + invoice numbers
6. Assign to **verification series** (A/B/C/D/E/YE) based on account types

### 8.2 Verification Series Assignment

```typescript
function getVerificationSeries(template): VerSeries {
  // Salary (7xxx personnel cost, not depreciation) → 'E'
  // Revenue (credit 3xxx) → 'B'
  // Supplier/expense (debit 4xxx-6xxx) → 'A'
  // Depreciation (7830) → 'A'
  // Tax (8xxx) → 'A'
  // Default → 'C' (bank)
}
```

| Series | Type |
|--------|------|
| A | Supplier invoices, depreciation, tax |
| B | Revenue/sales |
| C | Bank transactions (default) |
| D | VAT settlements |
| E | Salary/personnel |
| YE | Year-end closing entries |

### 8.3 Multi-Leg Salary Expansion

A single salary template (e.g. "7210→1930, 130,000/month") auto-expands into a **6-line verification**:

```
#VER E 1 20240125 "Löneutbetalning januari"
{
  #TRANS 7210 {}  130000.00  "" "Löneutbetalning januari"    ← Gross salary expense
  #TRANS 7510 {}   40846.00  "" "Löneutbetalning januari"    ← Social security 31.42%
  #TRANS 7411 {}    6500.00  "" "Löneutbetalning januari"    ← Pension 5%
  #TRANS 2710 {}  -39000.00  "" "Löneutbetalning januari"    ← PAYE withholding ~30%
  #TRANS 2730 {}  -40846.00  "" "Löneutbetalning januari"    ← Social security liability
  #TRANS 1930 {} -97500.00   "" "Löneutbetalning januari"    ← Net pay + pension from bank
}
```

Derived amounts:
- PAYE = gross * 0.30
- Social security = gross * 0.3142
- Pension = gross * 0.05
- Net pay = gross - PAYE
- Bank outflow = net pay + pension

### 8.4 VAT on Transactions

**Revenue with VAT (3-line):**
```
Bank (1930)     debit  gross (net + VAT)
Revenue (3xxx)  credit net
Output VAT (2611/2621/2631) credit VAT amount
```

**Expense with VAT (3-line):**
```
Expense (5xxx/6xxx)  debit  net
Input VAT (1650)     debit  VAT amount
Bank (1930)          credit gross
```

**No VAT (2-line):** Simple debit/credit.

VAT rates: 25% (standard), 12% (food/restaurant), 6% (books/culture), 0% (salary, depreciation, insurance, bank fees, tax).

### 8.5 Quarterly VAT Settlement

Runs for Q1-Q3 (Q4 settlement falls into next fiscal year). Series `D`:

```
Settlement date: 12th of month after quarter end (April 12, July 12, October 12)

1. Debit output VAT accounts (2611, 2621, 2631) to clear them
2. Credit input VAT (1650) to clear it
3. Net difference to tax account (1630)
```

### 8.6 Year-End Closing Entries (Bokslut)

On Dec 31st, series `YE`:

**Tax adjustment:**
- Compute actual profit before tax from all income statement movements
- Expected tax = |profit before tax| * 0.206
- If difference from pre-paid tax (8910) > 100 SEK, create adjustment entry (8910 debit, 2510 credit)

**Vacation accrual adjustment:**
- Vacation liability = annual gross salary * 12%
- Adjustment = liability * 5% (small annual change)
- Entry: 7090 debit (expense), 2920 credit (liability)

The income statement is intentionally **left open** (not closed to 8999/2099) so KPIs reflect the actual year's result.

### 8.7 Current Ratio Normalization

After computing opening balances, if current ratio > 3.0 (target 1.8):

Adds missing current liability accounts (from retained earnings 2091 to keep balance):

| Account | Name | Computation |
|---------|------|-------------|
| 2640 | Utgående moms | ~1 month net output VAT: `(revenue/12) * 0.25 / 1.25` |
| 2710 | Personalens källskatt | ~30% of one month's gross: `(personnel/1.4/12) * 0.30` |
| 2730 | Lagstadgade sociala avgifter | ~31.42% of one month's gross: `(personnel/1.4/12) * 0.3142` |
| 2920 | Upplupna semesterlöner | ~12% of annual gross: `(personnel/1.4) * 0.12` |
| 2510 | Skatteskulder | ~2 months corporate tax: `taxAmount / 6` |

### 8.8 Balance Computation

- **IB** (Ingående Balans): Opening balances for balance sheet accounts (class 1-2) from blueprint
- **UB** (Utgående Balans): `IB + net movements` for balance sheet accounts (class 1-2)
- **RES** (Resultat): Sum of all movements for income statement accounts (class 3-8)

### 8.9 Previous Year Generation

If `includePreviousYear` is true and `previousYearMultiplier` is set:
- All transaction templates are scaled by the multiplier (e.g. 0.85 = company grew ~18%)
- A separate PRNG (seeded from company name + previous year) generates transactions
- Separate IB/UB/RES balances at yearIndex -1
- Previous year IB = current year IB * multiplier

### 8.10 Seeded Randomness

Uses a Linear Congruential Generator (LCG) PRNG seeded from `hash(companyName + fiscalYear)`:

```typescript
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
```

Same company name + year = same output every time.

---

## 9. Industry Rules (Complete Reference)

### `IndustryRules` Interface

```typescript
interface IndustryRules {
  name: string;
  cogsPercentOfRevenue: [min: number, max: number];
  grossMarginTarget: [min: number, max: number];
  operatingMarginTarget: [min: number, max: number];
  netMarginTarget: [min: number, max: number];
  personnelCostPercentOfRevenue: [min: number, max: number];
  rentPercentOfRevenue: [min: number, max: number];
  hasInventory: boolean;
  salesModel: 'b2b' | 'b2c' | 'mixed';
  vatRate: 25 | 12 | 6;
  seasonalMultipliers: [number x 12];  // Jan–Dec, average ~1.0
  typicalExpenseCategories: string[];
  notes: string;
}
```

### All 9 Industries

| Industry | COGS% | Gross Margin | Op. Margin | Net Margin | Personnel% | Rent% | Inventory | Sales | VAT |
|----------|-------|-------------|------------|-----------|------------|-------|-----------|-------|-----|
| `consulting` | 0-15% | 85-100% | 15-35% | 10-25% | 40-60% | 1-3% | No | B2B | 25% |
| `retail` | 55-75% | 25-45% | 3-12% | 2-8% | 10-25% | 3-8% | Yes | B2C | 25% |
| `manufacturing` | 40-60% | 40-60% | 8-20% | 5-15% | 20-35% | 2-5% | Yes | B2B | 25% |
| `restaurant` | 25-40% | 60-75% | 3-12% | 1-8% | 30-45% | 5-10% | Yes | B2C | 12% |
| `construction` | 50-70% | 30-50% | 5-15% | 3-10% | 20-35% | 1-3% | No | B2B | 25% |
| `saas` | 5-20% | 80-95% | 5-30% | 3-25% | 35-55% | 1-3% | No | Mixed | 25% |
| `healthcare` | 10-30% | 70-90% | 8-25% | 5-20% | 45-65% | 3-8% | No | Mixed | 25% |
| `transport` | 40-60% | 40-60% | 5-15% | 3-10% | 25-40% | 1-3% | No | B2B | 25% |
| `real_estate` | 5-20% | 80-95% | 30-60% | 15-40% | 5-15% | 0-2% | No | B2B | 25% |

### Seasonal Multipliers (Jan–Dec)

```
consulting:    [0.95, 0.95, 1.05, 1.05, 1.10, 1.00, 0.30, 0.85, 1.05, 1.10, 1.20, 1.40]
retail:        [0.75, 0.85, 0.90, 0.95, 1.00, 0.95, 0.85, 0.90, 0.95, 1.05, 1.35, 1.50]
manufacturing: [0.85, 0.90, 1.00, 1.10, 1.10, 1.10, 0.60, 0.85, 1.05, 1.10, 1.15, 1.20]
restaurant:    [0.75, 0.75, 0.85, 0.95, 1.05, 1.20, 1.25, 1.15, 1.00, 0.95, 0.95, 1.15]
construction:  [0.50, 0.60, 0.80, 1.10, 1.25, 1.30, 1.20, 1.20, 1.10, 1.00, 0.55, 0.40]
saas:          [0.90, 0.90, 1.00, 1.00, 1.05, 1.00, 0.80, 0.90, 1.05, 1.10, 1.15, 1.15]
healthcare:    [0.95, 0.90, 0.95, 1.00, 1.00, 1.05, 0.85, 0.90, 1.05, 1.10, 1.10, 1.15]
transport:     [0.85, 0.85, 0.95, 1.05, 1.10, 1.15, 0.90, 1.00, 1.05, 1.10, 1.05, 0.95]
real_estate:   [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00]
```

### Typical Expense Categories Per Industry

**Consulting:** 5010 Lokalhyra, 5410 Förbrukningsinventarier, 5910 Annonsering, 6110 Kontorsmateriel, 6210 Telefon & internet, 6250 IT-tjänster/licenser, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader, 6970 Facklitteratur

**Retail:** 4010 Inköp varor, 5010 Lokalhyra (shop), 5020 El & uppvärmning, 5410 Förbrukningsinventarier, 5910 Annonsering, 6110 Kontorsmateriel, 6210 Telefon, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader, 6590 Övriga externa

**Manufacturing:** 4010 Råmaterial, 5010 Lokalhyra (factory), 5020 El, 5410 Inventarier & verktyg, 5610 Reparation & underhåll, 6110 Kontorsmateriel, 6210 Telefon, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader, 7830 Avskrivningar

**Restaurant:** 4010 Livsmedel, 4020 Drycker, 5010 Lokalhyra, 5020 El, 5060 Städning, 5410 Inventarier, 6110 Kontorsmateriel, 6210 Telefon, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader

**Construction:** 4010 Material, 4050 Underentreprenörer, 5010 Lokalhyra, 5060 Arbetsplatskostnader, 5410 Verktyg, 5610 Reparation fordon, 6210 Telefon, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader

**SaaS:** 4010 Serverdrift/hosting, 5010 Lokalhyra, 5410 Hardware, 5910 Annonsering, 6110 Kontorsmateriel, 6210 Telefon, 6250 IT-licenser, 6310 Försäkringar, 6530 Redovisning, 6570 Bankkostnader

**Healthcare:** 4010 Material & förbrukningsvaror, 5010 Lokalhyra (klinik), 5020 El, 5410 Medicinska inventarier, 6110 Kontorsmateriel, 6210 Telefon, 6250 IT/journalsystem, 6310 Försäkringar (inkl. patient), 6530 Redovisning, 6570 Bankkostnader

**Transport:** 4010 Drivmedel, 4020 Fordonskostnader, 5010 Lokalhyra (depå), 5060 Vägavgifter & tullar, 5610 Reparation fordon, 5620 Leasing fordon, 6310 Flotteförsäkring, 6530 Redovisning, 6570 Bankkostnader, 7830 Avskrivningar fordon

**Real Estate:** 5010 Fastighetsskötsel, 5020 El & uppvärmning, 5060 Vatten & avlopp, 5070 Reparation fastigheter, 6310 Fastighetsförsäkring, 6530 Redovisning, 6570 Bankkostnader, 8310 Räntekostnader (lån), 7830 Avskrivningar byggnader

### Industry Notes

- **Consulting:** Very low or zero COGS. Revenue from consulting hours. Sub-contractors (4010) may appear as COGS.
- **Retail:** High COGS from goods. Inventory 10-30% of annual COGS. B2C = minimal AR. Seasonal variance.
- **Manufacturing:** Significant fixed assets (machinery). Material depreciation. Inventory: raw (1410), WIP (1440), finished (1460). B2B 30-60 day terms.
- **Restaurant:** Food VAT is 12%. High personnel (kitchen + waitstaff). Perishable inventory. Very low AR — mostly cash/card B2C.
- **Construction:** COGS = materials + subcontractors. Project-based, no finished goods. Large AR — B2B 30-day terms. Vehicle costs common.
- **SaaS:** COGS = server/cloud costs. Very high gross margin. Personnel dominant. Mixed B2B/B2C. Marketing can be high.
- **Healthcare:** VAT-exempt for medical services, but many private clinics charge 25%. Very high personnel. Clinical rent significant.
- **Transport:** Fuel + vehicle costs dominate. Significant fixed assets (vehicles) with depreciation. Fleet insurance major.
- **Real Estate:** Revenue = rental income (3010). Very low personnel. Significant property assets + depreciation. High financial costs (mortgage 8310). Stable revenue.

---

## 10. SIE Writer (Complete Reference)

### `writeSIE(data: SIEParseResult, options?: WriteSIEOptions): string`

Converts `SIEParseResult` → valid SIE4 format text.

### WriteSIEOptions

| Option | Default | Description |
|--------|---------|-------------|
| `programName` | `'ArcimSync'` | `#PROGRAM` line value |
| `programVersion` | `'1.0'` | `#PROGRAM` version |
| `format` | `'PCUTF8'` | `#FORMAT` encoding tag |
| `includeFlag` | `true` | Include `#FLAGGA 0` line |

### Output Order

```
#FLAGGA 0
#PROGRAM "ArcimSync" 1.0
#FORMAT PCUTF8
#GEN 20240215
#SIETYP 4
#FNAMN "Nordström Konsult AB"
#ORGNR 559312-4567
#VALUTA SEK
#RAR 0 20240101 20241231
#RAR -1 20230101 20231231
#OMFATTN 20241231
#KONTO 1220 "Inventarier och verktyg"
#KONTO 1930 "Företagskonto"
...
#IB 0 1930 685000 0
#UB 0 1930 1200000 0
#RES 0 3010 -5200000 0
...
#VER B 1 20240105 "Försäljning januari"
{
  #TRANS 1930 {} 54125 "" "Försäljning faktura 1001" 0
  #TRANS 3010 {} -43300 "" "Försäljning faktura 1001" 0
  #TRANS 2611 {} -10825 "" "Försäljning faktura 1001" 0
}
```

### Internal Helpers

- `toSIEDate("2024-01-15")` → `"20240115"` — Dates stored as YYYY-MM-DD, SIE uses YYYYMMDD
- `quoteSIE("Nordström AB")` → `"Nordström AB"` — Wraps in quotes, escapes inner quotes
- `formatAmount(1234.50)` → `"1234.5"` — Dot decimal, strips trailing zeros
- `groupTransactions(txs)` → Groups by `(verificationSeries, verificationNumber)`
- `buildDimensionString(tx)` → `"1 100 6 42"` for cost center 100, project 42

---

## 11. Swedish BAS Account Ranges (Complete Reference)

### `accounts.ts` Constants

```typescript
const CORPORATE_TAX_RATE = 0.206;                      // 20.6% bolagsskatt
const EQUITY_PORTION_OF_UNTAXED_RESERVES = 0.794;      // 79.4%
```

### `SWEDISH_ACCOUNTS` — Full Structure

```
FIXED_ASSETS
  ALL:                    1000-1399
  INTANGIBLE:             1000-1099
  BUILDINGS_AND_LAND:     1100-1199
  MACHINERY_AND_EQUIPMENT:1200-1299
  FINANCIAL:              1300-1399

CURRENT_ASSETS
  ALL:                    1400-1999
  INVENTORY:              1400-1499
  CUSTOMER_RECEIVABLES:   1500-1599
  OTHER_RECEIVABLES:      1600-1699
  PREPAID_EXPENSES:       1700-1799
  SHORT_TERM_INVESTMENTS: 1800-1899
  CASH_AND_BANK:          1900-1999

EQUITY
  ALL:                    2080-2099
  SHARE_CAPITAL:          2081-2089
  RETAINED_EARNINGS:      2091-2098
  NET_INCOME:             2099-2099

UNTAXED_RESERVES
  ALL:                    2100-2199

PROVISIONS
  ALL:                    2200-2299

LONG_TERM_LIABILITIES
  ALL:                    2300-2399
  INTEREST_BEARING:       2310-2359
  NON_INTEREST_BEARING:   2360-2399

CURRENT_LIABILITIES
  ALL:                    2400-2999
  ACCOUNTS_PAYABLE:       2400-2499
  TAX_LIABILITIES:        2500-2699
  PERSONNEL_LIABILITIES:  2700-2799
  OTHER_CURRENT:          2800-2899
  INTEREST_BEARING_SHORT: 2840-2849
  ACCRUED_EXPENSES:       2900-2999

REVENUE
  ALL:                    3000-3999
  NET_SALES:              3000-3699
  DISCOUNTS:              3700-3799
  CAPITALIZED_WORK:       3800-3899
  OTHER_OPERATING_INCOME: 3900-3999

COST_OF_GOODS_SOLD
  ALL:                    4000-4999
  MATERIALS:              4000-4499
  GOODS_FOR_RESALE:       4500-4999

OPERATING_EXPENSES
  ALL:                    5000-6999
  PREMISES:               5000-5099
  SALES_EXPENSES:         5100-5999
  OTHER_EXTERNAL:         6000-6999

PERSONNEL_COSTS
  ALL:                    7000-7999
  WAGES:                  7000-7699
  WRITE_DOWNS:            7700-7799
  DEPRECIATION:           7800-7899
  OTHER:                  7900-7999

FINANCIAL_ITEMS
  ALL:                    8000-8999
  FINANCIAL_INCOME:       8000-8299
  OTHER_FINANCIAL_EXPENSES:8300-8399
  INTEREST_EXPENSES:      8400-8499
  APPROPRIATIONS:         8800-8899
  TAXES:                  8900-8999
```

### SIE Sign Convention

| Class | Type | Sign |
|-------|------|------|
| 1xxx | Assets | Positive |
| 2xxx | Equity & Liabilities | **Negative** (use `Math.abs` to display) |
| 3xxx | Revenue | **Negative** (use `Math.abs` to display) |
| 4xxx-8xxx | Expenses | Positive |

### Account Utility Functions

```typescript
isInRange(accountNumber, range): boolean
sumAccountsInRange(balances, range): number
classifyAccount(accountNumber): string | null     // Swedish BAS category label
getAccountType(accountNumber): 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'UNKNOWN'
getAccountsInRange<T>(accounts, from, to): T[]
calculateAdjustedEquity(balanceSheet): number     // EK + reserves * 0.794
calculateTotalLiabilities(balanceSheet): number   // Includes latent tax from reserves
calculateInterestBearingDebt(balanceSheet): number // 2310-2359 + 2840-2849
calculateNetSales(incomeStatement): number        // Gross (3000-3699) - Discounts (3700-3799)
```

---

## 12. KPI Calculator (Complete Reference)

### `calculateKPIs(data: SIEParseResult, yearIndex?: number): SIEKPIs`

Computes ~50 financial KPIs from SIE balances. Uses Swedish BAS account classification.

### All KPIs Returned

**Balance Sheet Items:**
| KPI | Description | Source |
|-----|-------------|--------|
| `totalAssets` | Total assets | UB 1000-1999 |
| `fixedAssets` | Fixed assets | UB 1000-1399 |
| `currentAssets` | Current assets | UB 1400-1999 |
| `inventory` | Inventory | UB 1400-1499 |
| `customerReceivables` | Accounts receivable | UB 1500-1599 |
| `cashAndBank` | Cash and bank | UB 1900-1999 |
| `totalEquity` | Total equity | abs(UB 2080-2099) |
| `untaxedReserves` | Obeskattade reserver | abs(UB 2100-2199) |
| `adjustedEquity` | Justerat EK = equity + reserves*0.794 + YTD result | Computed |
| `deferredTaxLiability` | Latent skatteskuld = reserves * 0.206 | Computed |
| `provisions` | Avsättningar | abs(UB 2200-2299) |
| `longTermLiabilities` | Long-term liabilities | abs(UB 2300-2399) |
| `currentLiabilities` | Current liabilities | abs(UB 2400-2999) |
| `totalLiabilities` | All liabilities + deferred tax | Computed |
| `interestBearingDebt` | Interest-bearing: 2310-2359 + 2840-2849 | Computed |
| `netDebt` | Interest-bearing - cash | Computed |
| `accountsPayable` | Accounts payable | abs(UB 2400-2499) |

**Income Statement Items:**
| KPI | Description | Source |
|-----|-------------|--------|
| `netSales` | Gross (3000-3699) - Discounts (3700-3799) | abs(RES) |
| `totalOperatingIncome` | All revenue | abs(RES 3000-3999) |
| `costOfGoodsSold` | COGS | RES 4000-4999 |
| `grossProfit` | Net sales - COGS | Computed |
| `externalCosts` | External costs | RES 5000-6999 |
| `personnelCosts` | Personnel costs | RES 7000-7699 |
| `writeDowns` | Write-downs | RES 7700-7799 |
| `depreciation` | Depreciation | RES 7800-7899 |
| `ebitda` | Operating income - COGS - external - personnel | Computed |
| `ebit` | EBITDA - depreciation - write-downs | Computed |
| `financialIncome` | Financial income | abs(RES 8000-8299) |
| `interestExpenses` | Interest expenses | abs(RES 8400-8499) |
| `financialNet` | Financial income - interest - other financial | Computed |
| `resultBeforeTax` | EBIT + financial net | Computed |
| `tax` | Taxes | RES 8900-8999 |
| `netIncome` | Årets resultat | Computed |

**Margin KPIs** (as percentages, e.g. 72.5 = 72.5%):
| KPI | Formula |
|-----|---------|
| `grossMargin` | grossProfit / netSales * 100 |
| `ebitdaMargin` | ebitda / netSales * 100 |
| `operatingMargin` | ebit / netSales * 100 |
| `profitMargin` | resultBeforeTax / netSales * 100 |
| `netMargin` | netIncome / netSales * 100 |

**Return KPIs** (annualized, using IB/UB averages):
| KPI | Formula |
|-----|---------|
| `roa` | annualized EBIT / avg total assets * 100 |
| `roe` | annualized net income / avg adjusted equity * 100 |
| `roce` | annualized EBIT / avg capital employed * 100 |

**Capital Structure KPIs:**
| KPI | Formula |
|-----|---------|
| `equityRatio` | adjustedEquity / totalAssets * 100 (Soliditet) |
| `debtToEquityRatio` | totalLiabilities / adjustedEquity (Skuldsättningsgrad) |
| `deRatio` | interestBearingDebt / adjustedEquity |
| `netDebtToEbitda` | netDebt / annualized EBITDA |
| `interestCoverageRatio` | annualized EBITDA / annualized interest expenses (Räntetäckningsgrad) |

**Liquidity KPIs:**
| KPI | Formula |
|-----|---------|
| `cashRatio` | cashAndBank / currentLiabilities |
| `quickRatio` | (currentAssets - inventory) / currentLiabilities (Kassalikviditet) |
| `currentRatio` | currentAssets / currentLiabilities (Balanslikviditet) |
| `workingCapital` | currentAssets - currentLiabilities (SEK) |
| `workingCapitalRatio` | workingCapital / annualized netSales * 100 |

**Efficiency KPIs** (annualized):
| KPI | Formula |
|-----|---------|
| `dio` | avg inventory / annualized COGS * 365 (Days Inventory Outstanding) |
| `dso` | avg receivables / annualized netSales * 365 (Days Sales Outstanding) |
| `dpo` | avg payables / annualized COGS * 365 (Days Payables Outstanding) |
| `ccc` | DIO + DSO - DPO (Cash Conversion Cycle) |
| `assetTurnover` | annualized netSales / totalAssets (Kapitalomsättning) |

**Growth KPIs** (year-over-year, requires yearIndex -1 data):
| KPI | Formula |
|-----|---------|
| `revenueGrowth` | (currentRevenue - prevRevenue) / prevRevenue * 100 |
| `assetGrowth` | (currentAssets - prevAssets) / prevAssets * 100 |
| `equityGrowth` | (currentEquity - prevEquity) / prevEquity * 100 |

**Metadata:**
| KPI | Description |
|-----|-------------|
| `annualizationFactor` | 1.0 for full year, else 365/days |
| `daysInPeriod` | Days in the fiscal period |
| `isPartialYear` | true if < 350 or > 380 days |

### Adjusted Equity Calculation (Swedish Standard)

```
Justerat Eget Kapital = Equity (2080-2099)
                       + 79.4% of Untaxed Reserves (2100-2199)
                       + YTD Net Income (from RES 3000-8999)
```

### Annualization

If `#OMFATTN` date indicates partial year (<350 or >380 days):
```
annualizationFactor = 365 / actualDays
```
All flow KPIs (income statement-based) are multiplied by this factor.

---

## 13. SIE Type Definitions (Complete Reference)

### `SIEParseResult` — The Core Data Structure

```typescript
interface SIEParseResult {
  metadata: SIEMetadata;
  accounts: SIEAccount[];
  dimensions: SIEDimension[];
  transactions: SIETransaction[];
  balances: SIEBalance[];
}
```

### `SIEMetadata`

```typescript
interface SIEMetadata {
  companyName: string;
  currency: string;                    // 'SEK'
  generatedDate: string | null;        // 'YYYY-MM-DD'
  sieType: string | null;             // '4' for SIE4
  fiscalYearStart: string | null;     // 'YYYY-MM-DD'
  fiscalYearEnd: string | null;       // 'YYYY-MM-DD'
  orgNumber?: string;                 // 'XXXXXX-XXXX'
  omfattnDate?: string;               // Date of last transaction
}
```

### `SIEAccount`

```typescript
interface SIEAccount {
  accountNumber: string;               // '1930', '3010', etc.
  accountName: string;                 // 'Företagskonto', etc.
  accountGroup: string;                // '1 - Tillgångar', etc.
  taxCode?: string;                    // SRU code for tax reporting
}
```

### `SIEBalance`

```typescript
interface SIEBalance {
  accountNumber: string;
  balanceType: 'IB' | 'UB' | 'RES';  // Opening / Closing / Result
  yearIndex: number;                   // 0 = current, -1 = previous
  amount: number;
  quantity?: number;
}
```

### `SIETransaction`

```typescript
interface SIETransaction {
  verificationSeries: string;          // 'A', 'B', 'C', 'D', 'E', 'YE'
  verificationNumber: string;
  verificationDate: string;            // 'YYYY-MM-DD'
  verificationText: string;
  accountNumber: string;
  amount: number;                      // Positive = debit, Negative = credit
  costCenter: string;
  project: string;
  rowText: string;
  quantity?: number;
  registrationDate?: string;
}
```

### `SIEDimension`

```typescript
interface SIEDimension {
  dimensionType: number;               // 1 = cost center, 6 = project
  code: string;
  name: string;
}
```

---

## 14. SIE Parser & Encoding (for Round-Trip/Import)

### `parseSIE(content: string): SIEParseResult`

Parses SIE file text into `SIEParseResult`. Battle-tested with Fortnox, Visma/Spiris, Bokio, and Bjorn Lunden format variations.

Handles: `#FLAGGA`, `#PROGRAM`, `#FORMAT`, `#GEN`, `#SIETYP`, `#FNAMN`, `#ORGNR`, `#VALUTA`, `#RAR`, `#OMFATTN`, `#KONTO`, `#SRU`, `#OBJEKT`, `#IB`, `#UB`, `#RES`, `#VER`, `#TRANS`, `#BTRANS`, `#RTRANS`.

### Encoding Detection

SIE files historically use various encodings:

```typescript
decodeSIEBuffer(buffer: Buffer): string              // Auto-detect encoding
decodeSIEBufferWithEncoding(buffer, encoding): string // Specific encoding
detectSIEEncoding(buffer: Buffer): SIEEncoding | null

type SIEEncoding = 'utf-8' | 'cp437' | 'iso-8859-1' | 'windows-1252';
```

Detection order: UTF-8 → CP437 (Fortnox/DOS) → ISO-8859-1 → Windows-1252. Checks for `#FLAGGA` marker in decoded content to validate. Uses `iconv-lite` for conversion.

---

## 15. Key Design Decisions

1. **Two-phase architecture** — Single LLM call for the creative blueprint, then deterministic expansion. Keeps LLM costs low (~1 call per generation), ensures balanced transactions, and makes output reproducible.

2. **Bank as plug figure** — Bank (1930) always recalculated to force the balance sheet to balance, regardless of LLM output.

3. **Salary auto-expansion** — AI generates one salary template; expander handles Swedish payroll complexity (social security 31.42%, pension 5%, PAYE withholding 30%).

4. **Industry rules as guardrails** — Financial ratio targets per industry injected into prompt and used for seasonal variation.

5. **Seeded randomness** — Deterministic PRNG seeded from `hash(companyName + year)`. Same input = same output.

6. **Open income statement** — Year-end entries generated but income statement not closed to retained earnings, so KPIs reflect actual year's result.

7. **Current ratio normalization** — Post-generation check adds missing current liabilities if ratio > 3.0, funded from retained earnings.
