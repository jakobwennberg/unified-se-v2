# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run typecheck    # TypeScript type checking (tsc --noEmit)
npm run lint         # ESLint via Next.js
npm run clean        # Remove .next and .turbo dirs
```

No test framework is configured. There are no unit or integration tests.

## Architecture

**Arcim** is a Swedish accounting integration platform. It connects to multiple accounting providers (Fortnox, Visma, Briox, Bokio, Björn Lunden) and a manual SIE file upload flow, exposing a unified REST API for accessing accounting data through a consent-based model.

**Stack:** Next.js 15 (App Router) + React 19 + Supabase (PostgreSQL + Auth) + Tailwind CSS 4 + shadcn/ui components + Zod 4 for validation.

### Route Groups

- `src/app/(auth)/` — Login/signup pages
- `src/app/(admin)/` — Protected dashboard pages (dashboard, consents, api-keys, settings, generate-company)
- `src/app/api/v1/` — Customer-facing versioned API (consents, auth/OAuth flows, SIE upload, sync, AI company generation)
- `src/app/api/admin/` — Internal admin API (API key management)
- `src/app/api/auth/` — Supabase Auth callback
- `src/app/api/health/` — Health check endpoint
- `src/app/onboarding/` — OAuth callback flows
- `src/app/customer/` — Customer-facing views

### Provider Pattern

Each accounting provider lives in `src/lib/providers/<name>/` and follows the same structure:

- `client.ts` — HTTP client with rate limiting (TokenBucketRateLimiter) and retry (exponential backoff)
- `config.ts` — Resource configurations mapping ResourceType enums to API endpoints, keys, and mappers
- `mapper.ts` — Transforms raw provider API responses into canonical DTOs (defined in `src/lib/types/dto.ts`)
- `oauth.ts` — Provider-specific OAuth/token flows

This pattern holds for the five OAuth-based providers: **Fortnox, Visma, Briox, Bokio, Björn Lunden**.

The **manual-sie** provider is different — it only has `parser.ts` and `mapper.ts` since it handles uploaded SIE files rather than API calls.

Provider types are defined in `src/lib/providers/types.ts`. The `ProviderName` union is `'fortnox' | 'visma' | 'briox' | 'bokio' | 'bjornlunden' | 'manual-sie'`. Each provider has its own `ResourceConfig` variant (FortnoxResourceConfig, VismaResourceConfig, etc.) extending a base interface.

The shared `TokenBucketRateLimiter` class lives in `src/lib/providers/rate-limiter.ts`.

### Dual Authentication

Implemented in `src/lib/api/auth-middleware.ts`:

1. **API Key** — `Authorization: Bearer <key>`, SHA256 hashed, looked up in `api_keys` table (with fallback to legacy `tenants.api_key_hash`)
2. **Supabase Session** — Cookie-based, for dashboard users. Tenant resolved via `auth_user_id` on `tenants` table.

Route protection for the admin dashboard is handled by `middleware.ts` at project root. Protected routes: `/dashboard`, `/api-keys`, `/consents`, `/settings`, `/generate-company`.

### Consent + Token Resolution

`src/lib/api/resolve-consent.ts` is the central function for accessing provider APIs. It loads a consent, verifies status, loads tokens, and auto-refreshes expired tokens using the appropriate provider's refresh flow. Different providers have different token strategies:
- Fortnox/Visma/Briox: OAuth 2.0 with refresh tokens
- Bokio: Static private API tokens (no expiry)
- Björn Lunden: Client credentials grant (auto-refresh on expiry)
- manual-sie: No tokens (SIE data comes from the `sie_uploads` table)

OAuth configuration for each provider is in `src/lib/api/oauth-config.ts`.

### SIE Module

`src/lib/sie/` handles the Swedish SIE (Standard Import/Export) file format:

- `parser.ts` — Parses SIE4 files (handles CP437/Latin-1 encoding)
- `mapper.ts` — Maps parsed SIE data to canonical DTOs
- `types.ts` — SIE types and SIEKPIs interface (~50 financial KPI metrics)
- `accounts.ts` — Swedish BAS account plan range utilities
- `kpi.ts` — Financial KPI calculations from SIE data
- `writer.ts` — Generates SIE4 files

### AI Company Generation

`src/lib/generate-company/` generates realistic fictional Swedish companies with full double-entry bookkeeping in SIE4 format using a two-phase architecture:

1. **AI blueprint** — LangChain + AWS Bedrock (Claude) generates a company profile and financial blueprint
2. **Deterministic expansion** — Blueprint is expanded into full transaction sets

Key files: `company-generator.ts`, `blueprint-expander.ts`, `config.ts`, `industry-rules.ts`, `types.ts`.

Exposed via admin page `(admin)/generate-company/` and API endpoint `api/v1/generate/company/`.

### Sync Architecture

`src/lib/sync/` implements a generic granular sync engine for provider data:

- `sync-engine.ts` — Main sync orchestrator
- `fetch-all.ts` — Paginated fetching logic per provider
- `db.ts` — Database operations (uses `synced_resources` and `sync_state` tables)
- `extract-fields.ts` — Extracts indexed fields from DTOs
- `types.ts` — Sync types

API endpoints: `api/v1/consents/[id]/sync/` (POST) and `api/v1/consents/[id]/sync/status/` (GET).

**Note:** The `synced_resources` and `sync_state` tables are referenced in code but do not yet have migration files.

### Key Types

- `src/lib/providers/types.ts` — ProviderName union, ResourceConfig interfaces, OAuthConfig, TokenResponse, RateLimitConfig
- `src/lib/types/dto.ts` — ResourceType enum (14 types) and all canonical DTOs: SalesInvoiceDto, SupplierInvoiceDto, CustomerDto, SupplierDto, JournalDto, AccountingAccountDto, CompanyInformationDto, PaymentDto, AccountingPeriodDto, FinancialDimensionDto, BalanceSheetDto, IncomeStatementDto, TrialBalanceDto, AttachmentDto, plus supporting types (PaginatedResponse, PartyDto, LegalMonetaryTotalDto, etc.)

### Database

Supabase PostgreSQL with migrations in `supabase/migrations/`. Migrations:

1. `001_initial.sql` — Core tables: `tenants`, `connections`, `consents`, `consent_tokens`, `one_time_codes`
2. `002_rls_policies.sql` — Row-level security policies
3. `003_api_keys_and_auth_link.sql` — `api_keys` table and `auth_user_id` column on `tenants`
4. `004_sie_uploads.sql` — `sie_uploads` table for manual SIE file data

Two Supabase client factories in `src/lib/supabase/`:
- `client.ts` — Browser client (anon key)
- `server.ts` — Server client (SSR-safe with cookies) + service role client for admin operations

Supabase ID: ttlkxlcfrtkwszfypunk

### Components

- `src/components/ui/` — shadcn/ui primitives (button, card, dialog, dropdown-menu, input, select, table, tabs, badge)
- `src/components/admin/` — Admin dashboard components (header, sidebar, stats-cards, consent-filters, api-key-dialog, api-key-table, onboarding-link)
- `src/components/customer/` — Customer-facing components (consent-status-card)
- `src/components/providers/` — React context providers (supabase-provider)
- `src/components/shared/` — Shared components (resource-browser)

### Utilities

- `src/lib/utils.ts` — `cn()` Tailwind class merging utility
- `src/lib/retry.ts` — Exponential backoff retry utility
- `src/lib/hooks/use-api.ts` — React hook for API calls

### Domain Documentation

`dev_docs/` contains detailed provider API docs, SIE file format specs, encoding docs, Swedish BAS account ranges, KPI calculation methodology, sync architecture design docs, and AI company generation reference. Provider-specific docs live in `dev_docs/<provider>/`. Consult these when working on provider integrations or financial calculations.

## Environment Variables

See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client config
- `SUPABASE_SERVICE_ROLE_KEY` — Backend admin operations
- `NEXT_PUBLIC_API_URL` — API URL
- `API_KEY_ENCRYPTION_KEY` — 64-hex-char key for encrypting stored API keys
- `ARCIM_SERVICE_KEY` — Service key for customer proxy

Not in `.env.local.example` but used by providers/features:
- `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REDIRECT_URI`
- `VISMA_CLIENT_ID`, `VISMA_CLIENT_SECRET`, `VISMA_REDIRECT_URI`
- `BRIOX_CLIENT_ID`
- `BJORN_LUNDEN_CLIENT_ID`, `BJORN_LUNDEN_CLIENT_SECRET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — For AI company generation (Bedrock)

## Path Alias

`@/*` maps to `src/*` (configured in tsconfig.json).
