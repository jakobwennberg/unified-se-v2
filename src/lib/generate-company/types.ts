import type { SIEParseResult, SIEKPIs } from '@/lib/sie/types';

export type CompanyIndustry =
  | 'consulting'
  | 'retail'
  | 'manufacturing'
  | 'restaurant'
  | 'construction'
  | 'saas'
  | 'healthcare'
  | 'transport'
  | 'real_estate';

export type CompanySize = 'micro' | 'small' | 'medium';

export interface GenerateCompanyRequest {
  industry?: CompanyIndustry;
  size?: CompanySize;
  fiscalYear?: number;
  includePreviousYear?: boolean;
}

export interface CompanyProfile {
  companyName: string;
  orgNumber: string;
  industry: CompanyIndustry;
  size: CompanySize;
  description: string;
}

export interface GenerateCompanyResult {
  profile: CompanyProfile;
  sieData: SIEParseResult;
  sieText: string;
  kpis: SIEKPIs;
}
