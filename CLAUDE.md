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

**Arcim** is a Swedish accounting integration platform. It connects to multiple accounting providers (Fortnox, Visma, Briox, Bokio, Björn Lunden) and exposes a unified REST API for accessing accounting data through a consent-based model.

**Stack:** Next.js 15 (App Router) + React 19 + Supabase (PostgreSQL + Auth) + Tailwind CSS 4 + shadcn/ui components.

### Route Groups

- `src/app/(auth)/` — Login/signup pages
- `src/app/(admin)/` — Protected dashboard pages (dashboard, consents, api-keys, settings)
- `src/app/api/v1/` — Customer-facing versioned API (consents, auth/OAuth flows)
- `src/app/api/admin/` — Internal admin API (API key management)
- `src/app/onboarding/` — OAuth callback flows
- `src/app/customer/` — Customer-facing views

### Provider Pattern

Each accounting provider lives in `src/lib/providers/<name>/` and follows the same structure:

- `client.ts` — HTTP client with rate limiting (TokenBucketRateLimiter) and retry (exponential backoff)
- `config.ts` — Resource configurations mapping ResourceType enums to API endpoints, keys, and mappers
- `mapper.ts` — Transforms raw provider API responses into canonical DTOs (defined in `src/lib/types/dto.ts`)
- `oauth.ts` — Provider-specific OAuth/token flows

Provider types are defined in `src/lib/providers/types.ts`. Each provider has its own `ResourceConfig` variant (FortnoxResourceConfig, VismaResourceConfig, etc.) extending a base interface.

### Dual Authentication

Implemented in `src/lib/api/auth-middleware.ts`:

1. **API Key** — `Authorization: Bearer <key>`, SHA256 hashed, looked up in `api_keys` table (with fallback to legacy `tenants.api_key_hash`)
2. **Supabase Session** — Cookie-based, for dashboard users. Tenant resolved via `auth_user_id` on `tenants` table.

Route protection for the admin dashboard is handled by `middleware.ts` at project root.

### Consent + Token Resolution

`src/lib/api/resolve-consent.ts` is the central function for accessing provider APIs. It loads a consent, verifies status, loads tokens, and auto-refreshes expired tokens using the appropriate provider's refresh flow. Different providers have different token strategies:
- Fortnox/Visma/Briox: OAuth 2.0 with refresh tokens
- Bokio: Static private API tokens (no expiry)
- Björn Lunden: Client credentials grant (auto-refresh on expiry)

### Key Types

- `src/lib/providers/types.ts` — ProviderName union, ResourceConfig interfaces, OAuthConfig, TokenResponse
- `src/lib/types/dto.ts` — All canonical DTOs (~18 types: SalesInvoiceDto, CustomerDto, SupplierDto, AccountDto, JournalEntryDto, etc.)

### Database

Supabase PostgreSQL with migrations in `supabase/migrations/`. Key tables: `tenants`, `consents`, `consent_tokens`, `api_keys`, `accounting_entity_records`, `accounting_sync_state`.

Two Supabase client factories in `src/lib/supabase/`:
- `client.ts` — Browser client (anon key)
- `server.ts` — Server client (SSR-safe with cookies) + service role client for admin operations

### Domain Documentation

`dev_docs/` contains detailed provider API docs, SIE file format parsing specs, Swedish BAS account ranges, KPI calculation methodology, and sync architecture design docs. Consult these when working on provider integrations or financial calculations.

## Environment Variables

See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client config
- `SUPABASE_SERVICE_ROLE_KEY` — Backend admin operations
- `API_KEY_ENCRYPTION_KEY` — 64-hex-char key for encrypting stored API keys
- `ARCIM_SERVICE_KEY` — Service key for customer proxy

## Path Alias

`@/*` maps to `src/*` (configured in tsconfig.json).
