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
import heicConvert from 'heic-convert';

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

// Uploaded Notion files live at .../<uuid>/<filename>?signed — the uuid is
// stable across fetches even though the signature changes, so it works as
// a cache key. External files are keyed by their full URL.
function stableId(url, isExternal) {
  return isExternal ? url : (url.match(/\/([0-9a-f-]{36})\/[^/?]+/i)?.[1] ?? url.split('?')[0]);
}

function fileEntries(prop) {
  return (prop?.files ?? []).map((f) => {
    const url = f.type === 'external' ? f.external.url : f.file.url;
    return { url, stableId: stableId(url, f.type === 'external'), name: f.name ?? 'image' };
  });
}

// Images placed in the page body (below the properties) also join the
// mini's photo gallery. Containers (columns, toggles, …) are recursed.
async function contentImages(blockId, depth = 0) {
  if (depth > 3) return [];
  const images = [];
  let cursor = undefined;
  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await fetch(url, { headers: NOTION_HEADERS });
    if (!res.ok) throw new Error(`Blocks fetch failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const b of data.results) {
      if (b.type === 'image') {
        const src = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
        images.push({ url: src, stableId: stableId(src, b.image.type === 'external') });
      } else if (b.has_children) {
        images.push(...(await contentImages(b.id, depth + 1)));
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return images;
}

function mapPage(page) {
  const p = page.properties;
  const name = plain(p['Name']?.title);
  const slug = slugify(plain(p['Slug']?.rich_text) || name);
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

// Returns pixel dimensions of each variant written, so callers can embed
// { w, h } in minis.json without a texture ever needing to load first.
// sharp's bundled libheif refuses many iPhone HEIC files outright: Apple
// writes more references in the iref box than libheif's compiled-in security
// limit of 16 allows, and there's no way to raise that limit through sharp.
// The files are perfectly valid photos, so rather than make anyone re-shoot
// or re-export them, decode HEIC with a separate pure-JS decoder that has no
// such limit and hand the raw pixels to sharp.
async function decodeToSharp(input) {
  try {
    const img = sharp(input, { density: 150 }); // density helps SVG rasterization
    await img.metadata(); // forces a header read, so a bad HEIC fails here
    return img;
  } catch (err) {
    if (!/heif|heic/i.test(String(err.message))) throw err;
    const jpeg = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.94 });
    return sharp(Buffer.from(jpeg));
  }
}

async function downloadAndOptimize(url, destBase, { thumb = false, board = false } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url.split('?')[0]}`);
  const input = Buffer.from(await res.arrayBuffer());
  const img = await decodeToSharp(input);
  const main = await img
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(`${destBase}.webp`);
  const out = { w: main.width, h: main.height };
  if (thumb) {
    const t = await img
      .clone()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(`${destBase}-thumb.webp`);
    out.thumbW = t.width;
    out.thumbH = t.height;
  }
  if (board) {
    // Lower-res variant for 3D textures — full-res detail is wasted on a wall board.
    await img
      .clone()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(`${destBase}-board.webp`);
  }
  return out;
}

// One unreadable photo must never block the whole site's content. Notion
// accepts whatever a phone uploads, and some of it sharp cannot decode —
// notably iPhone HEIC files that trip libheif's reference-count security
// limit. Before this, the first such file aborted the entire sync, so every
// other mini silently stopped updating too. Now the bad image is skipped and
// named in the log, and everything else still publishes.
const skipped = [];
async function tryOptimize(url, destBase, opts, label) {
  try {
    return await downloadAndOptimize(url, destBase, opts);
  } catch (err) {
    const [reason] = String(err.message).split(/\r?\n/);
    skipped.push({ label, reason });
    console.warn(`  ! skipped ${label}: ${reason}`);
    return null;
  }
}

async function fileDims(filePath) {
  const meta = await sharp(filePath).metadata();
  return { w: meta.width, h: meta.height };
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
      let dims;
      if (manifest[key] !== f.stableId || !exists) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ↓ ${key}`);
        dims = await tryOptimize(f.url, path.join(dir, 'cover'), { thumb: true, board: true }, key);
      } else {
        dims = { ...(await fileDims(outFile)) };
        const t = await fileDims(path.join(dir, 'cover-thumb.webp'));
        dims.thumbW = t.w;
        dims.thumbH = t.h;
      }
      if (dims) {
        mini.cover = {
          src: `images/${mini.slug}/cover.webp`,
          w: dims.w,
          h: dims.h,
          board: `images/${mini.slug}/cover-board.webp`,
        };
        mini.thumb = {
          src: `images/${mini.slug}/cover-thumb.webp`,
          w: dims.thumbW,
          h: dims.thumbH,
        };
      } else {
        // Undecodable: leave it unrecorded so the next sync retries it rather
        // than treating the missing file as already up to date.
        delete newManifest[key];
        mini.cover = null;
        mini.thumb = null;
      }
    } else {
      mini.cover = null;
      mini.thumb = null;
    }

    mini.gallery = [];
    const bodyImages = await contentImages(mini.id);
    for (let i = 0; i < bodyImages.length; i++) {
      const f = bodyImages[i];
      const key = `${mini.slug}/photo-${i + 1}`;
      newManifest[key] = f.stableId;
      const outFile = path.join(dir, `photo-${i + 1}.webp`);
      const exists = await fs.access(outFile).then(() => true, () => false);
      let dims;
      if (manifest[key] !== f.stableId || !exists) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ↓ ${key}`);
        dims = await tryOptimize(f.url, path.join(dir, `photo-${i + 1}`), { board: true }, key);
      } else {
        dims = await fileDims(outFile);
      }
      if (!dims) {
        delete newManifest[key]; // retry this one next sync
        continue;
      }
      mini.gallery.push({
        src: `images/${mini.slug}/photo-${i + 1}.webp`,
        w: dims.w,
        h: dims.h,
        board: `images/${mini.slug}/photo-${i + 1}-board.webp`,
      });
    }

    mini.process = [];
    for (let i = 0; i < mini.processFiles.length; i++) {
      const f = mini.processFiles[i];
      const key = `${mini.slug}/wip-${i + 1}`;
      newManifest[key] = f.stableId;
      const outFile = path.join(dir, `wip-${i + 1}.webp`);
      const exists = await fs.access(outFile).then(() => true, () => false);
      let dims;
      if (manifest[key] !== f.stableId || !exists) {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ↓ ${key}`);
        dims = await tryOptimize(f.url, path.join(dir, `wip-${i + 1}`), { board: true }, key);
      } else {
        dims = await fileDims(outFile);
      }
      if (!dims) {
        delete newManifest[key]; // retry this one next sync
        continue;
      }
      mini.process.push({
        src: `images/${mini.slug}/wip-${i + 1}.webp`,
        w: dims.w,
        h: dims.h,
        board: `images/${mini.slug}/wip-${i + 1}-board.webp`,
      });
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

  // Surface skips loudly at the end. Buried mid-log they'd go unnoticed for
  // weeks, and a silently missing photo is the whole reason this sync used
  // to fail hard instead.
  if (skipped.length > 0) {
    console.warn(`
${skipped.length} image(s) could not be processed and were left out:`);
    for (const s2 of skipped) console.warn(`  - ${s2.label}: ${s2.reason}`);
    console.warn('Re-upload these to Notion as JPEG or PNG (HEIC from an iPhone is the usual cause).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
