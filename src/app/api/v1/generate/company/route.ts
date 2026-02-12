import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { CompanyGenerator } from '@/lib/generate-company/company-generator';
import { getAIConfig, hasAWSCredentials } from '@/lib/generate-company/config';
import type { CompanyIndustry, CompanySize } from '@/lib/generate-company/types';

export const maxDuration = 120;

const VALID_INDUSTRIES: CompanyIndustry[] = [
  'consulting', 'retail', 'manufacturing', 'restaurant',
  'construction', 'saas', 'healthcare', 'transport', 'real_estate',
];
const VALID_SIZES: CompanySize[] = ['micro', 'small', 'medium'];

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = getAIConfig();
  if (!hasAWSCredentials(config)) {
    return NextResponse.json(
      { error: 'AWS Bedrock credentials not configured' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const industry = body.industry as string | undefined;
  const size = (body.size as string | undefined) ?? 'small';
  const fiscalYear = body.fiscalYear as number | undefined;
  const includePreviousYear = body.includePreviousYear as boolean | undefined;

  if (industry && !VALID_INDUSTRIES.includes(industry as CompanyIndustry)) {
    return NextResponse.json(
      { error: `Invalid industry. Valid: ${VALID_INDUSTRIES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!VALID_SIZES.includes(size as CompanySize)) {
    return NextResponse.json(
      { error: `Invalid size. Valid: ${VALID_SIZES.join(', ')}` },
      { status: 400 },
    );
  }

  if (fiscalYear != null && (fiscalYear < 2000 || fiscalYear > 2099)) {
    return NextResponse.json(
      { error: 'fiscalYear must be between 2000 and 2099' },
      { status: 400 },
    );
  }

  try {
    const generator = new CompanyGenerator(config);
    const result = await generator.generate({
      industry: industry as CompanyIndustry | undefined,
      size: size as CompanySize,
      fiscalYear,
      includePreviousYear,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('Company generation failed:', err);
    return NextResponse.json(
      { error: 'Company generation failed. Please try again.' },
      { status: 500 },
    );
  }
}
