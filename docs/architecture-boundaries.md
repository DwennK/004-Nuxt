# Architecture boundaries

The repository follows this dependency direction:

```text
app ──────┐
          ├──> shared
server ───┘
```

- `shared/` contains runtime-neutral contracts, validation, constants, and pure utilities used by both application and server code. It must not import from `app/` or `server/`.
- `server/` owns persistence, integrations, and server-only business orchestration. It may import from `shared/`, but it must not import from `app/` through `~/...` or `@/...` aliases.
- `app/` owns Vue pages, components, composables, and presentation-only types. It may consume contracts and pure utilities from `shared/`.
- Cross-boundary request and response shapes belong in `shared/types/`; shared runtime validation belongs in `shared/validation/`.

`app/types/index.d.ts` temporarily re-exports smartphone contracts from `shared/types/smartphones.ts` so existing application imports keep working while consumers migrate incrementally. New smartphone imports should use `~~/shared/types/smartphones` directly.

The scoped ESLint rule `project/server-import-boundaries` prevents new static imports from `server/` to the application aliases. A repository check for any remaining server-to-app imports is:

```sh
rg -n "(from|import\\()\\s*['\"](?:~|@)/" server
```
