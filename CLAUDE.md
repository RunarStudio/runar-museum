# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A public gallery of painted miniatures ("Runar Museum") built as a **statically-exported Next.js 15 / React 19 site** deployed to GitHub Pages. Content is sourced entirely from a Notion database — there is no runtime backend and no client-side data fetching.

The site is bilingual (English/Spanish) with interactive keyboard/touch navigation (arrow keys, swipe, lightbox modes). Styling is pure CSS with no build toolchain (no Tailwind, PostCSS, etc.)

## Commands & setup

```bash
npm install

# Development
npm run dev      # dev server at http://localhost:3000/runar-museum (note basePath)
npm run build    # static export to out/ (output: 'export')

# Content sync from Notion — requires env vars
npm run sync     # regenerate content/minis.json + public/images/ from Notion
```

**Environment setup:** To run `npm run sync` locally, set these env vars:
- `NOTION_TOKEN`: API token from https://www.notion.so/my-integrations (Bot must have read access to the Miniatures Museum database)
- `NOTION_DATABASE_ID`: `288e7fa81a444b8a9909ff4b6aea93a3` (Miniatures Museum)

Without these, `npm run sync` exits immediately (no error thrown). In CI, these are secrets in `.github/` (see `.github/workflows/sync.yml`).

**No linter, test suite, or typechecker.** Validation happens at sync time (Notion field parsing) and build time (Next.js).

## The data pipeline (the core architecture)

Understanding this flow is essential — most of the site's behavior is decided at sync time, not render time.

```
Notion DB ──(scripts/sync.mjs)──▶ content/minis.json + public/images/<slug>/*.webp ──▶ Next.js static export ──▶ GitHub Pages
```

### Sync & deploy workflow

- **`scripts/sync.mjs`** queries Notion for rows where `Published = true`, downloads their photos, converts to optimized `.webp` via `sharp`, and writes `content/minis.json`. Runs in CI (`.github/workflows/sync.yml`) on:
  - **Nightly** (3:30 UTC, scheduled job)
  - **Manual dispatch** (workflow_dispatch button on GitHub)
  - **NOT on plain push** — `github.event_name != 'push'` gates the sync step, so code-only commits skip sync and go straight to build/deploy
- Notion file URLs expire (~1h), so images are **re-hosted** in `public/images/`. `content/image-manifest.json` maps each image key to a stable Notion id (uuid in uploaded-file URLs) — re-syncs only re-download changed images.
- Unpublishing a mini in Notion prunes its `public/images/<slug>/` folder on the next sync.
- `content/minis.json` and `public/images/` are **committed generated artifacts** — edit Notion, not these files. `mapPage()` in sync.mjs defines the output shape (slug, name, warband, game, topics, techniques, room, datePainted, forSale, price, notes, cover, thumb, gallery, process).

### Notion database schema

Required fields for a mini to publish (when `Published = true`):
- **Name** (title) — mini's display name, auto-slugified to URL
- **Room / Wing** (select) — museum room/section; drives site structure. Omit or use "Entrance" for landing page
- **Cover image** (file) — the gallery thumbnail and detail page header
- **Images** (files in the property, OR inline images in the page body) — detail gallery

Optional fields:
- **Warband, Game, Category, Technique** (multi-select) — used for filtering in the "View all" grid
- **Date painted** (date) — sorts entrance/fallback; used to timestamp each mini
- **For sale**, **Price** (checkbox + text) — display sale status
- **Process images** (file property) — shown in dedicated "Painting process" section on detail page
- **Notes** (rich text) — detail page description


## Site structure & component patterns

All data flows through **`lib/data.js`** — components never import `minis.json` directly. This centralizes slug/filter logic and allows swapping the data source without touching React code.

### Pages & views

- **Entrance** (`app/page.jsx` → `<Entrance/>`): `getEntranceMinis()` returns minis with `room === 'Entrance'`, or the 5 newest if none are tagged. Displays a grid of minis + museum room doors.
- **Rooms** (`app/rooms/[room]/page.jsx` → `<RoomDeck/>`): every distinct `Room / Wing` value (except Entrance) auto-becomes a room. `getRooms()` lists all rooms; `generateStaticParams()` pre-renders each room's detail page. `roomSlug()` creates URL-safe slugs.
- **View all** (`app/all/page.jsx` → `<Gallery/>`): interactive filterable/searchable grid. Supports filtering by warband, game, technique, topic, and sale status.
- **Detail** (`app/minis/[slug]/page.jsx` → `<MiniDetail/>`): one page per mini. Shows cover, gallery, process shots, metadata, and commission CTA.
- **Static pages**: Commissions (`app/commissions/`), About (`app/about/`), with content in `components/CommissionsContent.jsx` and `components/AboutContent.jsx`.

### Component architecture

- **Page components** (`app/*/page.jsx`): Server components. Fetch data via `lib/data.js`, pass props to interactive client components. Never use `'use client'`.
- **Interactive components** (`components/*.jsx`, marked `'use client'`): Client components. `Gallery`, `Entrance`, `RoomDeck`, `MiniDetail` all handle keyboard/swipe navigation. They don't call `lib/data.js` themselves — data comes from parent.
- **`app/layout.jsx`**: Root server component wrapping everything in `LangProvider` (bilingual context) + `Header`/`Footer`.
- **Language context** (`lib/i18n.jsx`): `LangProvider` + `useLang()`. Persists to localStorage; all display strings live in `STRINGS` object (EN + ES keys).

## Conventions that will bite you

- **basePath is manual for assets.** `next.config.mjs` sets `basePath: '/runar-museum'`. Next handles it for `<Link>` and routing automatically, but static files under `public/` must be prefixed by hand — always build image/asset URLs with `asset()` from `lib/data.js`, never bare `/images/...` paths. Images are `unoptimized` (no Next image server on GitHub Pages).
- **Central config lives in `site.config.mjs`** (SITE_NAME, SITE_DESCRIPTION, BASE_PATH, SITE_URL, CONTACT_URL) — edit there if changing site metadata, not in components.
- **All display strings are bilingual.** Put user-facing text in `lib/i18n.jsx` under `STRINGS.en` and `STRINGS.es`, access via `useLang().t('key')`. Language persists to localStorage. Don't hardcode any display text in components.
- **`trailingSlash: true`** — all routes (including dynamic ones) export as directories: `/path/` not `/path`. The GitHub Pages upload preserves this.
- **Static export, no server routes.** API routes, middleware, ISR, SSR, streaming won't work. Everything must be statically renderable at build time. Use `generateStaticParams()` for dynamic routes (rooms, mini details).
- **Content is read-only at build time.** You cannot fetch or compute data during request handling (no runtime at all on GitHub Pages). All data must come from `content/minis.json` and be baked into the HTML/JS bundle.
- **Generated artifacts are committed.** `content/minis.json` and `public/images/` are built by the sync script and checked into git. Editing them by hand gets overwritten on the next sync. Always edit Notion, never these files.

## Common tasks

**Add a new mini:** Create a row in the Notion database with at least Name, Room/Wing, and Cover image. Set `Published = true` to publish it. On the next nightly sync (or manually trigger via GitHub Actions), it will appear.

**Create a new museum room:** Add minis with the new `Room / Wing` value. The room auto-appears on the entrance/rooms listing; `generateStaticParams()` will pre-render its detail page on the next build.

**Change site name/URL/config:** Edit `site.config.mjs`, not the components. The config is imported wherever it's needed.

**Rename a filter category:** Edit `lib/i18n.jsx` for the display label, then update minis in Notion to use the new value. Old values won't appear once the next sync runs.

**Test the site locally before sync:** Run `npm run dev` and navigate to `http://localhost:3000/runar-museum`. The app uses whatever is in `content/minis.json` — no need to sync; you can test UI changes in isolation.

**Rebuild with current content (no sync):** A plain `git push` to main triggers a build/deploy but skips the Notion sync. Use this for code-only changes.

**Debug the sync script:** Run `NOTION_TOKEN=... NOTION_DATABASE_ID=... node scripts/sync.mjs` locally. The script logs each step and exits with an error if Notion API fails.

**Build & export locally:** `npm run build` writes the static site to `out/`. This is what GitHub Pages deploys. You can serve `out/` locally with any static server to test the exact export build.
