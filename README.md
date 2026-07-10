# 🏛️ Runar Museum

Public gallery of painted miniatures by **Runar Studio**, generated from a Notion database.
Live site: https://runarstudio.github.io/runar-museum

## How it works

```
Notion "🏛️ Miniatures Museum" DB ──(nightly GitHub Action)──▶ content/minis.json + public/images/ ──▶ Next.js static export ──▶ GitHub Pages
```

- Only Notion rows with the **Published** checkbox appear on the site.
- Photos are downloaded from Notion and re-hosted here as optimized `.webp`
  (Notion file URLs expire after ~1 hour, so the site never links them directly).
- The sync runs **nightly** and on the **Run workflow** button
  (Actions → "Sync from Notion & Deploy" → Run workflow).

## Updating the museum

Edit the Notion database — that's it. Add photos to *Cover image* / *Process images*,
tick *Published*, and the site updates on the next sync.

### Manual update (don't want to wait for the nightly sync)

1. Edit the **🏛️ Miniatures Museum** database in Notion (add/edit minis, upload photos, tick **Published**).
2. Open https://github.com/RunarStudio/runar-museum/actions/workflows/sync.yml
3. Click **Run workflow** → **Run workflow** (green button, leave everything default).
4. Wait ~2 minutes for the run to turn green — the site at
   https://runarstudio.github.io/runar-museum/ now shows the new content
   (hard-refresh with Ctrl+F5 if your browser cached the old page).

To **remove** a mini from the site, untick *Published* in Notion and run the same workflow —
its images are pruned from the repo automatically.

## One-time setup (secrets)

1. Go to https://www.notion.so/profile/integrations → **New integration**
   (workspace: the one containing Runar Studio; type: Internal). Copy the secret token.
2. In Notion, open the **🏛️ Miniatures Museum** database → `⋯` menu → **Connections** →
   add your new integration.
3. In this GitHub repo → Settings → Secrets and variables → Actions → add:
   - `NOTION_TOKEN` — the integration token
   - `NOTION_DATABASE_ID` — `288e7fa81a444b8a9909ff4b6aea93a3`
4. Repo Settings → Pages → Source: **GitHub Actions**.

## Local development

```bash
npm install
NOTION_TOKEN=... NOTION_DATABASE_ID=288e7fa81a444b8a9909ff4b6aea93a3 npm run sync
npm run dev      # dev server at http://localhost:3000/runar-museum
npm run build    # static export to out/
```

## Configuration

Site-wide settings (name, contact/commission link, base path) live in `site.config.mjs`.
UI translations (EN/ES) live in `lib/i18n.jsx`.

## Roadmap

- v1 (this): filterable 2D gallery ✅
- v2: Doom-style 3D museum (React Three Fiber) built on the same `content/minis.json` —
  the *Room / Wing* field in Notion already maps each mini to its future room.
