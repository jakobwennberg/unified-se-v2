import { NextResponse } from 'next/server';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { resolveConsent } from '@/lib/api/resolve-consent';
import { createChatTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { getAIConfig, hasAWSCredentials } from '@/lib/generate-company/config';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;

  // Authenticate
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify consent ownership
  let resolved;
  try {
    resolved = await resolveConsent(auth.tenantId, consentId);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json(
      { error: e.message ?? 'Failed to resolve consent' },
      { status: e.status ?? 500 },
    );
  }

  // Check AWS credentials
  const aiConfig = getAIConfig();
  if (!hasAWSCredentials(aiConfig)) {
    return NextResponse.json(
      { error: 'AI features are not configured (missing AWS credentials)' },
      { status: 503 },
    );
  }

  // Parse messages from request body
  const { messages }: { messages: UIMessage[] } = await request.json();

  // Build context
  const consent = resolved.consent;
  const provider = consent.provider as string;
  const companyName = (consent.company_name as string | null) ?? null;

  const systemPrompt = buildSystemPrompt({
    consentId,
    tenantId: auth.tenantId,
    provider,
    companyName,
  });

  // Create bedrock provider with explicit credentials
  const bedrock = createAmazonBedrock({
    region: aiConfig.awsRegion,
    accessKeyId: aiConfig.awsAccessKeyId,
    secretAccessKey: aiConfig.awsSecretAccessKey,
  });

  const tools = createChatTools(consentId);

  const result = streamText({
    model: bedrock(aiConfig.bedrockModelId),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: aiConfig.bedrockMaxTokens,
  });

  return result.toUIMessageStreamResponse();
}
