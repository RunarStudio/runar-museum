// Notion → site sync.
// Queries the Miniatures Museum database for rows with Published = true,
// downloads their photos (Notion file URLs expire, so we re-host them here),
// converts everything to optimized .webp, and writes content/minis.json.
//
// Required env vars: NOTION_TOKEN, NOTION_DATABASE_ID
// Run: npm run sync

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const MANIFEST_PATH = path.join(CONTENT_DIR, 'image-manifest.json');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID environment variables.');
  process.exit(1);
}

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

async function queryPublished() {
  const pages = [];
  let cursor = undefined;
  do {
    const res = await fetch(`${NOTION_API}/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: NOTION_HEADERS,
      body: JSON.stringify({
        filter: { property: 'Published', checkbox: { equals: true } },
        start_cursor: cursor,
        page_size: 100,
      }),
    });
    if (!res.ok) {
      throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const plain = (rich) => (rich ?? []).map((t) => t.plain_text).join('').trim();

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'mini';
}

function fileEntries(prop) {
  return (prop?.files ?? []).map((f) => {
    const url = f.type === 'external' ? f.external.url : f.file.url;
    // Uploaded Notion files live at .../<uuid>/<filename>?signed — the uuid is
    // stable across fetches even though the signature changes, so it works as
    // a cache key. External files are keyed by their full URL.
    const stable =
      f.type === 'external'
        ? url
        : (url.match(/\/([0-9a-f-]{36})\/[^/?]+/i)?.[1] ?? url.split('?')[0]);
    return { url, stableId: stable, name: f.name ?? 'image' };
  });
}

function mapPage(page) {
  const p = page.properties;
  const name = plain(p['Name']?.title);
  const slug = plain(p['Slug']?.rich_text) || slugify(name);
  return {
    id: page.id,
    slug,
    name,
    warband: p['Warband / Army']?.select?.name ?? null,
    game: p['Game']?.select?.name ?? null,
    topics: (p['Topic / Category']?.multi_select ?? []).map((o) => o.name),
    techniques: (p['Technique']?.multi_select ?? []).map((o) => o.name),
    room: p['Room / Wing']?.select?.name ?? null,
    datePainted: p['Date painted']?.date?.start ?? null,
    forSale: p['For sale']?.checkbox ?? false,
    price: p['Price']?.number ?? null,
    notes: plain(p['Notes']?.rich_text),
    coverFiles: fileEntries(p['Cover image']),
    processFiles: fileEntries(p['Process images']),
  };
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function downloadAndOptimize(url, destBase, { thumb = false } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url.split('?')[0]}`);
  const input = Buffer.from(await res.arrayBuffer());
  const img = sharp(input, { density: 150 }); // density helps SVG rasterization
  await img
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(`${destBase}.webp`);
  if (thumb) {
    await img
      .clone()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(`${destBase}-thumb.webp`);
  }
}

async function main() {
  console.log('Querying Notion…');
  const pages = await queryPublished();
  console.log(`${pages.length} published mini(s) found.`);

  const minis = pages.map(mapPage);

  // Guard against duplicate slugs
  const seen = new Map();
  for (const m of minis) {
    const n = seen.get(m.slug) ?? 0;
    seen.set(m.slug, n + 1);
    if (n > 0) m.slug = `${m.slug}-${n + 1}`;
  }

  const manifest = await readManifest();
  const newManifest = {};

  for (const mini of minis) {
    const dir = path.join(IMAGES_DIR, mini.slug);

    if (mini.coverFiles.length > 0) {
      const f = mini.coverFiles[0];
      const key = `${mini.slug}/cover`;
      newManifest[key] = f.stableId;
      const outFile = path.join(dir, 'cover.webp');
      const exists = await fs.access(outFile).then(() => true, () => false);
      if (manifest[key] !== f.stableId || !exists) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ↓ ${key}`);
        await downloadAndOptimize(f.url, path.join(dir, 'cover'), { thumb: true });
      }
      mini.cover = `images/${mini.slug}/cover.webp`;
      mini.thumb = `images/${mini.slug}/cover-thumb.webp`;
    } else {
      mini.cover = null;
      mini.thumb = null;
    }

    mini.process = [];
    for (let i = 0; i < mini.processFiles.length; i++) {
      const f = mini.processFiles[i];
      const key = `${mini.slug}/wip-${i + 1}`;
      newManifest[key] = f.stableId;
      const outFile = path.join(dir, `wip-${i + 1}.webp`);
      const exists = await fs.access(outFile).then(() => true, () => false);
      if (manifest[key] !== f.stableId || !exists) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ↓ ${key}`);
        await downloadAndOptimize(f.url, path.join(dir, `wip-${i + 1}`));
      }
      mini.process.push(`images/${mini.slug}/wip-${i + 1}.webp`);
    }

    delete mini.coverFiles;
    delete mini.processFiles;
  }

  // Prune image folders for minis that were unpublished or deleted
  const keep = new Set(minis.map((m) => m.slug));
  let pruned = 0;
  try {
    for (const entry of await fs.readdir(IMAGES_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && !keep.has(entry.name)) {
        await fs.rm(path.join(IMAGES_DIR, entry.name), { recursive: true });
        pruned++;
      }
    }
  } catch {
    // images dir may not exist yet
  }
  if (pruned) console.log(`Pruned ${pruned} stale image folder(s).`);

  // Newest first; undated entries last
  minis.sort((a, b) => (b.datePainted ?? '').localeCompare(a.datePainted ?? ''));

  await fs.mkdir(CONTENT_DIR, { recursive: true });
  await fs.writeFile(path.join(CONTENT_DIR, 'minis.json'), JSON.stringify(minis, null, 2));
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(newManifest, null, 2));
  console.log(`Wrote content/minis.json (${minis.length} minis).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
