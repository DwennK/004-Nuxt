# AGENTS

## Purpose

This repository is a Nuxt 4 POS / shop-management app for a physical tech store.
Favor small, production-friendly changes that preserve the current business model and keep the codebase easy to extend.

## Stack

- Nuxt 4
- Vue 3
- TypeScript
- `@nuxt/ui` v4
- Tailwind CSS v4
- Drizzle ORM
- Turso / libSQL
- Cloudflare Workers via Nitro

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Preview worker output: `npm run preview`
- DB push: `npm run db:push`
- DB studio: `npm run db:studio`
- Deploy worker: `npm run deploy`
- Refresh Cloudflare worker types: `npm run cf-typegen`

Run `npm run lint` and `npm run typecheck` after meaningful code changes. Run `npm run build` when the change affects app wiring, server routes, or deployment behavior.

Use `npm run preview` when the change may behave differently on Cloudflare Workers than in local Nuxt dev.

## Environment

Before local work, check `.env.example` and confirm the relevant variables exist.

- required for most POS flows: `TURSO_URL`, `TURSO_TOKEN`
- used for public app metadata and OG generation: `NUXT_PUBLIC_SITE_URL`
- required only for internal assistant work: `MINIMAX_API_KEY`
- optional for internal assistant provider selection: `MINIMAX_MODEL`, `MINIMAX_BASE_URL`

## Repo Shape

- `app/pages`: route pages
- `app/components`: reusable UI and domain components
- `app/layouts`: shell and navigation
- `app/composables`: client composables
- `app/assets`: global styles and assets
- `server/api`: Nuxt server routes
- `server/utils`: server-side domain logic
- `server/utils/assistant`: internal assistant guardrails and orchestration
- `server/db`: database schema
- `shared/types`: shared TypeScript types
- `shared/validation`: shared Zod validation
- `shared/constants`: shared domain constants
- `shared/utils`: shared business and formatting utilities
- `docs`: internal implementation notes

Do not edit generated output in `.nuxt/` or `.output/`.

## Runtime Constraints

This app is deployed through Nitro to Cloudflare Workers.

- prefer Worker-compatible server code
- avoid introducing Node-only runtime assumptions unless explicitly requested
- keep deployment-sensitive changes small and easy to verify
- run `npm run build` for server, route, runtime config, or deployment-sensitive changes
- run `npm run preview` when checking Worker-specific behavior locally

## UI Guidance

For UI work, use [`$nuxt-ui`](/Users/dwenn/.codex/skills/nuxt-ui/SKILL.md) when available.

Prefer existing `@nuxt/ui` components and patterns before introducing custom primitives. In this repo, that usually means reusing patterns already present in the dashboard shell, forms, slideovers, modals, tables, and navigation.

Keep the existing brand baseline unless the task says otherwise:

- primary color: `green`
- neutral color: `zinc`
- font: `Public Sans`

Prefer semantic UI tokens and utilities over raw Tailwind palette classes when possible.

Do not make the UI bland just to be safe. Strong hierarchy, dense professional layouts, and clear workflows are good. Match the existing app rather than defaulting to generic admin boilerplate.

### POS UX Preferences

Default to practical, dense POS interfaces rather than spacious dashboard layouts.

- Keep the main task visible in the viewport whenever reasonably possible, especially on desktop.
- Prefer local scroll inside tables, lists, and side panels over long page-level scrolling.
- Make the primary work surface obvious:
  - sale flow: cart first
  - ticket flow: current operational state first
  - document flow: overview / lines / payments, not decorative panels
- Avoid duplicate information across the same screen. If an action already exists in the header, it usually should not consume a full tab or card again.
- Prefer read mode by default and move full editing into slideovers, modals, or explicit edit actions when that improves density.
- Hide secondary or fallback UI until needed:
  - quick picks can be contextual
  - search results can live in a dropdown / combobox instead of a permanent block
  - advanced options should stay collapsed unless actively used
- Reduce large explanatory text. Short labels, good defaults, and visible actions are preferred over long helper copy.
- When designing a two-column layout, the center/left area should hold the primary object being manipulated; the right rail should stay secondary and action-oriented.
- For cart, line-item, and POS operator views, compact icon actions are preferred for reorder / clone / delete when they remain understandable.
- Treat empty states carefully: do not let them create large dead zones if the screen can instead surface the next likely action.

### Playwright Workflow

When debugging or checking the UI with Playwright:

- Reuse the same Playwright session and browser window by default.
- Open Playwright in a full-width desktop window by default. If a new session is needed, resize it before interacting so the layout is not tested in a narrow viewport by accident.
- Do not open a new Chrome window for every check or iteration.
- When changing flow on the same app, prefer `goto`, refresh, clearing local UI state, or reusing the existing tab before creating a new session.
- Only open a new Playwright window when the current session is broken, unrecoverable, or must be isolated on purpose.
- Minimize window churn: assume the user should not need to close extra browser windows created during routine UI work.
- If Playwright reports that the browser, page, or profile is already in use, first treat it as a session-recovery problem rather than a reason to abandon browser testing.
- Before falling back to CLI-only checks, always try this recovery order:
  - inspect the existing Playwright tab or page state
  - reuse the current page if it is still healthy
  - wait briefly and retry once if the session appears temporarily busy
  - close only the broken tab or page if needed, then reopen a single full-width page
- Do not switch to CLI as a silent fallback for UI validation when Playwright is expected to work. If browser recovery fails, state clearly that Playwright is blocked and why.
- When Playwright is blocked by stale session state, prefer resetting the current browser context or tab before creating an additional browser window.

## Domain Rules

Respect the POS model described in `README.md`:

- `ticket`: tracked work case
- `document`: commercial object such as quote, invoice, credit note
- `payment`: cashflow object tracked separately

Do not collapse these concepts together in UI, API, or database changes unless explicitly requested.

Preserve the current business split:

- tracked repairs and service flows
- direct sales
- commercial documents
- payments and cashflow
- end-of-day reporting

Treat these implementation rules as defaults unless the task explicitly changes them:

- money is stored as integer cents
- catalog and document pricing is TTC / VAT-inclusive
- VAT can matter at both line and document level
- document line quantity is stored as an integer
- ticket numbers and document numbers are generated server-side

## Feature Scope

Core POS scope:

- customers
- catalog items
- direct sales
- repair / service tickets
- commercial documents
- document lines
- payments
- end-of-day reporting
- company settings

Secondary modules that still matter:

- smartphone stock management
- smartphone reservation flows
- vacation tracking

Demo or scaffold areas still present:

- members
- notifications
- generic profile settings
- inbox shell

Do not expand demo or scaffold areas as if they were core POS flows unless explicitly requested.

## Data And Validation

When data shapes are shared between client and server, keep types in `shared/types` and validation in `shared/validation`.

Prefer narrow, explicit server utilities in `server/utils/pos` over putting business rules directly into page components or route handlers.

Keep API handlers thin. Prefer parsing, validation, persistence, and business rules to live in shared or server utility layers rather than page components.

Use `shared/utils` for shared domain formatting or calculation helpers instead of duplicating logic across client and server.

## Internal Assistant

The `/assistant` route is an internal tool with intentionally narrow capabilities.

- keep assistant SQL access read-only
- preserve the allowlist and validation guardrails in `server/utils/assistant`
- do not broaden database access, tool access, or model behavior without an explicit request

## Git Workflow

When working in this repository:

- Assume the user may work in multiple Codex chats on the same worktree.
- Do not infer commit boundaries from the current chat session alone.
- Determine commit boundaries from the actual diff and the purpose of the changes.
- Treat each logical change as its own commit.
- Do not create a single combined commit for unrelated fixes, refactors, or features handled in parallel.
- Before committing, review the diff carefully and separate changes by task.
- Use partial staging when needed so unrelated changes do not end up in the same commit.
- Do not commit code that appears to belong to another parallel task unless the separation is clearly intentional or the user explicitly asked for it.
- If changes from different tasks are mixed together and cannot be cleanly separated, stop and say so instead of creating a misleading commit.
- Prefer multiple small, coherent commits over one large mixed commit.
- Keep the existing commit title style unless the user asks otherwise.
- Do not create title-only commit messages.
- Always write a multi-line commit message with the existing title style on the first line and a body after a blank line.
- The commit body should explain what changed, why it changed, and any important impact, constraint, or follow-up.
- Prefer 2 to 5 short body lines rather than a single long paragraph.
- Do not push automatically after each commit.
- Push only after the logical commits for the current work are complete and clearly separated, or when the user explicitly asks for a push.

## Verification

Default verification after meaningful changes:

- run `npm run lint`
- run `npm run typecheck`

Additionally:

- run `npm run build` when changing app wiring, server routes, runtime config, or deployment behavior
- run `npm run preview` when debugging Worker-specific behavior
- manually check the affected screens for layout, density, and workflow regressions when changing UI

## Change Style

Prefer focused changes over broad refactors.

When changes span multiple concerns, split them into separate commits by logical unit. Prefer one coherent commit per fix, feature, refactor, or documentation change rather than mixing unrelated work together.

Before creating a new component, composable, or utility, check whether a nearby existing one can be extended.

Before adding a new abstraction, inspect the closest POS page, editor, slideover, or shared utility and extend that first if it keeps the code understandable.

Preserve French user-facing copy unless the task asks for a rewrite.
