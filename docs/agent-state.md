---
version: 1
status: complete
task_id: lanlu-catalog-gemini-ui-audit
updated_at: 2026-08-23T00:55:00+07:00
---

# Goal

Implement the LanLu Catalog + Gemini Assistant and major UI audit plan from the user, preserving the existing warm LanLu design system.

# User constraints

- Remove onboarding city/พื้นที่ร้าน field.
- Keep AI server-only and draft-only until explicit confirmation.
- Preserve audit trail/versioned recipes and idempotent imports.
- Fix dashboard overflow/cutoff and keep responsive/touch/keyboard behavior usable.

# Approved decisions

- Use /assistant as the primary AI/CSV workspace.
- Use shared CreatableSelect and DateField primitives.
- Keep Gemini key server-only in GEMINI_API_KEY.

# Findings

- Project is Next.js 15 + React 19 + Supabase + Tabler icons.
- Codebase graph indexed as Prototype (316 nodes, 596 edges).
- Dashboard route adds main-content-dashboard overflow-y:hidden on desktop.
- Onboarding city state/input exists in components/onboarding-page.tsx.
- Current production migration record_sales_batch references target_ingredient_id out of scope.

# Changed files

- lib/types.ts, lib/catalog.ts, lib/catalog.test.ts, lib/store.tsx
- lib/calculations.ts, lib/calculations.test.ts
- components/form-controls.tsx, components/assistant-page.tsx
- components/dashboard.tsx, components/sales-page.tsx, components/ui.tsx
- components/ingredient-settings.tsx, components/menu-settings.tsx, components/inventory-page.tsx
- components/capture-page.tsx, components/app-shell.tsx, components/dashboard.tsx
- app/api/assistant/route.ts, app/assistant/page.tsx
- app/globals.css, scripts/audit-production.mjs
- components/capture-page.tsx, components/assistant-page.tsx, components/ingredient-settings.tsx, components/menu-settings.tsx, components/inventory-page.tsx
- app/api/assistant/route.ts, lib/store.tsx, lib/types.ts, scripts/audit-capture.mjs, supabase/migrations/20260823010000_catalog_archive.sql
- supabase/migrations/20260822020000_catalog_assistant.sql
- supabase/migrations/20260822030000_catalog_purchase_bundle.sql

# Tests

- Initial graph index completed.
- Impeccable context loaded for components/dashboard.tsx.
- `npm run typecheck` passed.
- `npm run test` passed: 2 files, 10 tests (including package-cost conversion, CSV detection/mapping, and margin suggestions).
- `npm run build` passed and emitted `/assistant` plus `/api/assistant`.
- Local Playwright audit passed 17/17 guest checks at desktop/mobile with no horizontal overflow, unnamed controls, console errors, or failed requests.
- Impeccable detector ran once over changed UI targets and returned `[]`.
- Final `npm run typecheck`, `npm run test` (7/7), `npm run build`, and local Playwright audit (17/17) passed after the final icon/CSS pass.
- Codebase graph refreshed after implementation: 374 nodes, 729 edges.
- Final `npm run typecheck`, `npm run test` (10/10), `npm run build`, and local Playwright audit (17/17) passed after the conversation, costing, bundle, CSV mapping, package form, and icon updates.
- Codebase graph refreshed after implementation: 409 nodes, 794 edges.
- Diagnosed production React #418 as date-dependent hydration mismatch in dashboard/sales; removed module-load date dependence and added post-hydration shop-timezone date ranges.
- Raised audited mobile controls to at least 44px for date fields, edit buttons, assistant tabs, and quick replies.
- Final typecheck, build, test (11/11), detector (`[]`), and local guest audit (17/17) passed after these fixes.
- Production assistant endpoint returned HTTP 200 with deterministic package-cost answer (`0.13 บาท/ml`) during authenticated diagnostic.
- Added visible Gemini pending/error/timeout feedback and filtered archived catalog context.
- Added audited archive actions for ingredients, menus, and latest recipe versions; hard delete is avoided to preserve ledger, sales, recipe history, and audit events.
- Applied `20260823010000_catalog_archive.sql` to the linked Supabase project.
- Added `npm run test:capture`; authenticated production Capture audit passed 8/8 checks across all four tabs on desktop and mobile. Impeccable detector returned `[]` after the UI pass.
- After Vercel deployment of commit `302eae9`, authenticated production route audit passed `24/24`, Capture tab audit passed `8/8`, and `/api/assistant` returned HTTP 200 with the expected `0.13 บาท/ml` calculation and no page errors.
- Implemented the fresh Catalog UX pass: Inventory now owns ingredient search, status/expiry filters, inline create/edit, dependency-aware archive, and restore; Menu & recipe is a primary navigation destination and the misleading `ตั้งค่าร้าน` link is removed.
- Added `Stepper` context labels, selected Capture rows, mode-specific help copy, ingredient search, stronger archive/restore action labels, and the higher-specificity centered expiry icon CSS fix.
- Added `lib/assistant-parser.ts` deterministic fast path for `เพิ่มวัตถุดิบ นม 10 ขวด ขวดละ 50 บาท และ 500ml`, returning 5,000 ml, 10 bottles, 500 baht total, and 0.10 baht/ml without Gemini; draft calculation summaries and retry-preserved prompts are visible in Assistant.
- Added `20260823020000_catalog_restore.sql`; restoring is audited, and archiving all active recipe versions prevents an older recipe version from becoming active accidentally.
- Final verification after this pass: `npm run typecheck` passed, `npm run test` passed 13/13, `npm run build` passed, Impeccable detector returned `[]`, and local guest route audit passed 17/17. Authenticated Capture audit was not rerun because `AUDIT_EMAIL`/`AUDIT_PASSWORD` were unavailable in this session.

# Open issues

- Supabase CLI 2.115.0 applied `20260822030000_catalog_purchase_bundle.sql` to linked project `fcladiaymhnioczqpm`; `supabase migration list` confirms all four local migrations match remote.
- Local Supabase/RLS validation is unavailable because Docker/Podman is not installed.
- The supplied audit account authenticated successfully against production; no credential was stored in the repository.
- `npm install` reported 3 high severity dependency audit findings; no `npm audit fix --force` run.

# Latest checkpoint

Catalog UX and assistant implementation are complete locally; production deployment and authenticated verification remain outside this session.

# Next action

If continuing, apply the new Supabase migration and rerun authenticated route/Capture audits with the supplied audit account.
