import { z } from 'zod';

const AIConfigSchema = z.object({
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsRegion: z.string().default('eu-west-1'),
  bedrockModelId: z
    .string()
    .default('eu.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  bedrockMaxTokens: z.number().default(8192),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

export function getAIConfig(): AIConfig {
  return AIConfigSchema.parse({
    awsAccessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    awsSecretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    awsRegion: process.env['AWS_REGION'] || undefined,
    bedrockModelId: process.env['BEDROCK_MODEL_ID'] || undefined,
    bedrockMaxTokens: process.env['BEDROCK_MAX_TOKENS']
      ? parseInt(process.env['BEDROCK_MAX_TOKENS'], 10)
      : undefined,
  });
}

export function hasAWSCredentials(config?: AIConfig): boolean {
  const c = config ?? getAIConfig();
  return Boolean(c.awsAccessKeyId && c.awsSecretAccessKey);
}
