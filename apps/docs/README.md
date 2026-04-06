# Choicekit Docs

Documentation site for Choicekit, built with Astro and Starlight.

## Content layout

- `src/content/docs/guides`: getting-started and feature guides
- `src/content/docs/reference`: generated API reference
- `scripts/add-api-frontmatter.mjs`: adds frontmatter to generated API pages
- `scripts/audit-choicekit-coverage.mjs`: checks docs coverage and link integrity

## Commands

Run these from `apps/docs`:

| Command | Action |
| :-- | :-- |
| `bun run dev` | Start the local docs server |
| `bun run build` | Regenerate API docs and build the site |
| `bun run preview` | Preview the built site locally |
| `bun run docs:api` | Regenerate the typed API reference |
| `bun run docs:audit` | Run the docs coverage audit |
