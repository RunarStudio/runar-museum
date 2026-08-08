# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A public gallery of painted miniatures ("Runar Museum") built as a **statically-exported Next.js 15 / React 19 site** deployed to GitHub Pages. Content is sourced entirely from a Notion database — there is no runtime backend and no client-side data fetching.

## Commands

```bash
npm install
npm run dev      # dev server — note the app is served under the basePath: http://localhost:3000/runar-museum
npm run build    # static export to out/ (output: 'export')
npm run sync     # regenerate content/minis.json + public/images/ from Notion (needs env vars below)
```

There is no test suite, linter, or typechecker configured. `npm run sync` requires `NOTION_TOKEN` and `NOTION_DATABASE_ID` (database id is `288e7fa81a444b8a9909ff4b6aea93a3`); without them the script exits immediately.

## The data pipeline (the core architecture)

Understanding this flow is essential — most of the site's behavior is decided at sync time, not render time.

```
Notion DB ──(scripts/sync.mjs)──▶ content/minis.json + public/images/<slug>/*.webp ──▶ Next.js static export ──▶ GitHub Pages
```

- **`scripts/sync.mjs`** queries Notion for rows where `Published = true`, downloads their photos, converts them to optimized `.webp` via `sharp`, and writes `content/minis.json`. It runs in CI (`.github/workflows/sync.yml`) nightly + on manual dispatch, and commits the result back to `main`. **A plain `push` to main does NOT re-sync** — it only rebuilds/deploys the already-committed content (the sync step is gated on `github.event_name != 'push'`).
- Notion file URLs expire (~1h), so images are **re-hosted** in the repo. `content/image-manifest.json` maps each image key to a stable Notion id (the uuid embedded in uploaded-file URLs) so re-syncs only re-download changed images.
- Unpublishing a mini in Notion prunes its `public/images/<slug>/` folder on the next sync.
- `content/minis.json` and `public/images/` are **generated artifacts committed to the repo** — edit Notion, not these files. `mapPage()` in sync.mjs defines the exact shape of each mini (slug, name, warband, game, topics, techniques, room, datePainted, forSale, price, notes, cover, thumb, gallery, process).

Notion → mini field mapping of note: `Room / Wing` (select) drives the museum room structure; `Cover image` → `cover`/`thumb`; **images placed in the Notion page body** → `gallery` (recursed up to depth 3 through columns/toggles); `Process images` → `process`.

## Site structure

Read-only data access goes through **`lib/data.js`** — components never import `minis.json` directly. Key derived views:

- **Entrance** (`app/page.jsx`): `getEntranceMinis()` = minis with `room === 'Entrance'`, falling back to the 5 newest if none are tagged.
- **Rooms** (`app/rooms/[room]/page.jsx`): every distinct `Room / Wing` value (except Entrance) auto-becomes a room via `getRooms()`; `roomSlug()` generates URL slugs. Static params come from `generateStaticParams()`.
- **View all** (`app/all/page.jsx`): the filterable/searchable grid.
- **Detail** (`app/minis/[slug]/page.jsx`): one page per mini.

`app/layout.jsx` wraps everything in `LangProvider` + `Header`/`Footer`. Page components (`app/`) are server components that fetch data and hand it to interactive client components (`components/`, marked `'use client'`) — `Gallery`, `Entrance`, `RoomDeck`, `MiniDetail` handle keyboard/swipe navigation.

## Conventions that will bite you

- **basePath is manual for assets.** `next.config.mjs` sets `basePath: '/runar-museum'`. Next handles it for `<Link>`/routing, but static files under `public/` must be prefixed yourself — always build image/asset URLs with `asset()` from `lib/data.js`, never a bare `/images/...` path. Images are `unoptimized` (no Next image server on Pages).
- **Central config lives in `site.config.mjs`** (site name, URL, `BASE_PATH`, `CONTACT_URL`) — edit there, not in components.
- **UI is bilingual (EN/ES).** All user-facing strings go in `lib/i18n.jsx` `STRINGS` and are read via `useLang().t('key')`; language is persisted to `localStorage`. Don't hardcode display text in components.
- **`trailingSlash: true`** — all routes export as `/path/` directories.
