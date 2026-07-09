# `apps/docs` — LocalMode Documentation

The LocalMode documentation site: a [Fumadocs](https://fumadocs.dev) + Next.js 16 app that hosts the API reference, package guides, and blog for the `@localmode/*` packages. Deploys to [`localmode.dev`](https://localmode.dev).

> This is a hosted site, not an installable package — end users just visit it. This README is for contributors editing the docs.

## Stack

- Next.js 16 (App Router) + React 19
- Fumadocs (MDX content, Orama search, `llms.txt`)
- Tailwind CSS 4

## Develop / build

```bash
pnpm install                    # from the repo root
pnpm --filter docs dev          # next dev on http://localhost:3000
pnpm --filter docs build        # production build
pnpm --filter docs types:check  # fumadocs-mdx + next typegen + tsc --noEmit
pnpm --filter docs lint         # eslint
```

## Structure

| Path | What lives here |
| ---- | --------------- |
| `content/docs/` | MDX docs, one folder per package (`core/`, `react/`, `transformers/`, `wllama/`, …) plus top-level guides `getting-started.mdx`, `index.mdx`, `nextjs.mdx`, `ui.mdx`. `meta.json` files order the sidebar. |
| `content/blog/` | Blog posts — hand-authored `.mdx` at the top level, plus generated programmatic-SEO pages under `compare/`, `compatibility/`, `models/`, `tasks/`, `use-cases/`. |
| `src/app/docs/[[...slug]]/` | The docs route + layout that renders `content/docs`. |
| `src/app/(home)/` | Landing page, `/about`, and the `/blog` index. |
| `src/app/api/` | `og/` (per-page OpenGraph images) and `search/` (Orama). |
| `src/lib/` | `source.ts` (Fumadocs source), `og.ts`, `rss.ts`, shared layout. |

## Content ownership

The docs and the provider guides have non-overlapping ownership — do not duplicate API reference across them:

- **Core pages** (`content/docs/core/*`) own the API reference: functions, option/result type tables, `AbortSignal` patterns, custom-provider `implements` examples, middleware.
- **Provider pages** (`content/docs/transformers/*`, etc.) own recommended-model tables, provider config, and recipes — and link back to core rather than repeating it.

## Related

- Root overview and package list: [`../../README.md`](../../README.md)
- The registry + blocks gallery site: [`../ui/README.md`](../ui/README.md)
