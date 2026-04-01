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

Run `npm run lint` and `npm run typecheck` after meaningful code changes. Run `npm run build` when the change affects app wiring, server routes, or deployment behavior.

## Repo Shape

- `app/pages`: route pages
- `app/components`: reusable UI and domain components
- `app/layouts`: shell and navigation
- `app/composables`: client composables
- `server/api`: Nuxt server routes
- `server/utils`: server-side domain logic
- `server/db`: database schema
- `shared/types`: shared TypeScript types
- `shared/validation`: shared Zod validation
- `shared/constants`: shared domain constants

Do not edit generated output in `.nuxt/` or `.output/`.

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

## Domain Rules

Respect the POS model described in `README.md`:

- `ticket`: tracked work case
- `document`: commercial object such as quote, invoice, receipt, credit note
- `payment`: cashflow object tracked separately

Do not collapse these concepts together in UI, API, or database changes unless explicitly requested.

## Data And Validation

When data shapes are shared between client and server, keep types in `shared/types` and validation in `shared/validation`.

Prefer narrow, explicit server utilities in `server/utils/pos` over putting business rules directly into page components or route handlers.

## Change Style

Prefer focused changes over broad refactors.

When changes span multiple concerns, split them into separate commits by logical unit. Prefer one coherent commit per fix, feature, refactor, or documentation change rather than mixing unrelated work together.

Before creating a new component, composable, or utility, check whether a nearby existing one can be extended.

Preserve French user-facing copy unless the task asks for a rewrite.
