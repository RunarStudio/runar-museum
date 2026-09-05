# Spec: 3D Museum (`/museum/`)

Architect spec. Implement in phases; report after each phase before starting the next.

## Goal

An immersive three.js museum at `/museum/`, additive — every existing 2D route stays
exactly as it is and keeps working. The 3D scene is a second front door, not a replacement.

Core constraint: **layout and skin are fully decoupled.** One module decides where
artboards hang; skins only supply materials, lights and shell geometry. Adding a third
skin later must touch zero layout code.

## Non-goals

- Do not modify `Entrance.jsx`, `RoomDeck.jsx`, `Gallery.jsx`, `MiniDetail.jsx`.
- Do not refactor the existing duplicated keyboard handlers. Separate task.
- No physics engine, no model loading, no post-processing passes.

---

## Phase 0 — Prerequisite: image dimensions in the sync pipeline

**Problem:** `content/minis.json` carries no width/height. Three.js must size an artboard
plane *before* its texture loads, or every board starts square and visibly snaps when the
image arrives.

**Change `scripts/sync.mjs`:**

- `sharp` already reads each image during conversion. Capture `metadata()` output.
- Change every image field from a bare string to `{ src, w, h }`.
  Affects `cover`, `thumb`, and each entry of `gallery` and `process`.
- Keep the value backward-compatible-ish is NOT required — instead update `lib/data.js`
  and the four existing components to read `.src`. This is a small mechanical change;
  do it carefully and verify all 2D pages still render.
- Also emit a `board` variant per cover, gallery **and process** image: process shots
  hang on artboards too (`getRoomBoards` emits `kind: 'process'`), so they need the
  variant as well. Only `thumb` is exempt. Max 1024px on the long edge,
  webp quality 80, written as `<name>-board.webp`. 3D textures do not need full-res.
  Add it as `{ src, w, h, board }`.

**Cannot run the sync locally** (no Notion token). So:

- Write the sync change, then hand-patch `content/minis.json` to the new shape using
  `sharp` over the already-committed files in `public/images/` via a one-off script.
  Generate the `-board.webp` variants the same way and commit them.
- Verify the one-off script's output shape matches exactly what `mapPage()` would now emit.

**Done when:** `npm run build` succeeds, all existing 2D pages render identically,
and every image entry in `minis.json` is `{ src, w, h, board }` (`board` absent for `thumb`).

---

## Phase 1 — Data layer

**`lib/data.js`** — add, do not change existing exports:

```js
// Flattens a room's minis into one artboard per IMAGE.
// Rooms hold few minis but many photos, so per-mini would give 1-board corridors.
getRoomBoards(roomSlug) -> Array<{
  miniSlug, miniName, kind: 'cover'|'gallery'|'process',
  src, board, w, h, ar   // ar = w/h, precomputed
}>

getMuseumRooms() -> Array<{ name, slug, boardCount, miniCount }>
```

Ordering within a room: minis in existing `getRoomMinis` order; within each mini,
cover first, then gallery, then process.

---

## Phase 2 — Layout module (pure, no three.js import)

**`lib/museum/layout.js`**

```js
export const MIN_SLOTS = 3;

export function layout(boards) -> {
  slots: Array<{
    i, side: -1|1, pos:[x,y,z], rotY,
    board: Board|null,          // null => empty black board (padding)
    stop: { pos:[x,y,z], look:[x,y,z] }   // rail camera stop
  }>,
  n, depth, segments
}
```

Rules:
- Slots alternate left wall / right wall, forming facing pairs.
- `n = Math.max(MIN_SLOTS, boards.length)`. Shortfall padded with `board: null`.
- **Wrap:** after 12 boards the corridor turns 90°. Emit `segments` as an array of
  `{ axis, from, to, turnAt }` so skins know where to place corner geometry. A 60-image
  room becomes an L or a spiral, not a 140-metre hallway.
  *(Confirm the wrap threshold with the architect if the geometry gets awkward.)*
- Pure functions only. No `THREE` import in this file — it must be unit-reasonable
  and reusable by any future skin.

---

## Phase 3 — Skins

**`lib/museum/skins/dungeon.js`**, **`lib/museum/skins/matrix.js`**, **`index.js`**

Each skin exports:

```js
{
  id, label,
  bg, fog, frameColor, emptyColor, hudAccent,
  build(layout, root) -> { lights, flicker },   // shell geometry + lighting
  boardMat(board, texture),
  frameMat()
}
```

- **dungeon:** stone walls, ceiling, pilasters between alcoves, warm flickering point
  lights per slot, corridor **capped** at the far end with an arch.
- **matrix:** no walls, no ceiling, **no end cap** — grid floor to the horizon, green
  key + rim lights, faint slot markers where the dungeon puts pilasters.
- A skin may read `layout.slots` and `layout.segments`. It must never modify them.

Reference implementation of both skins exists in the prototype artifact; the geometry and
lighting values there are a good starting point.

---

## Phase 4 — Controls

**`lib/museum/controls/rail.js`** — default on every device.

- `←` / `→` step between slots; camera eases to `slot.stop`.
- Drag (pointer or touch) = free look, clamped to ±0.62 rad yaw, ±0.5 rad pitch.
- `Enter` opens the info card for the current slot. `Esc` closes it.
- Swipe horizontally (>70px, mostly-horizontal) steps.
- **Mobile tap zones:** tap in the left third of the viewport steps back, right third
  steps forward, centre third is drag-to-look only. A tap that hits an artboard opens
  its card instead, regardless of zone. Distinguish tap from drag with a movement
  threshold (~6px). Show the zones briefly on first load, then fade them out.

**`lib/museum/controls/walk.js`** — desktop only, opt-in toggle.

- WASD, shift to run, drag to steer, eye height 1.62m.
- Soft AABB bounds derived from `layout` so you can't walk through the shell.
- Hide the toggle entirely below 900px viewport width.

Both write to the same camera. Switching modes must not jump the view.

---

## Phase 5 — React integration

- **`app/museum/page.jsx`** — server component. Calls `getMuseumRooms()` +
  `getRoomBoards()`, passes as props. No `'use client'`.
- **`app/museum/[room]/page.jsx`** — same, with `generateStaticParams()` over rooms.
- **`components/Museum.jsx`** — `'use client'`. Owns the canvas, renderer, loop.
- Load it with `next/dynamic(() => import('...'), { ssr: false })`. **Required** — WebGL
  APIs don't exist during static export. This is the codebase's first dynamic import.
- Textures: load `board` variant on approach; a slot more than 2 pairs away stays
  untextured. Dispose textures when switching rooms — the prototype leaks otherwise.
- Clicking an artboard's card CTA routes to `/minis/<slug>/` via `useRouter().push()`.

**Fallback:** if `WebGLRenderingContext` is unavailable, render a plain link back to
`/rooms/<slug>/`. Never a blank canvas.

---

## Phase 6 — Chrome, i18n, entry point

- All display strings go in `lib/i18n.jsx` under `STRINGS.en` / `STRINGS.es`.
  New keys, snake_case, matching existing convention:
  `museum_title, museum_enter, museum_skin, museum_skin_dungeon, museum_skin_matrix,
   museum_move, museum_move_rail, museum_move_walk, museum_room, museum_hint_desktop,
   museum_hint_mobile, museum_empty_board, museum_empty_board_note, museum_open_detail,
   museum_loading, museum_no_webgl, museum_images, museum_pieces`
- Reuse the existing CSS custom properties from `app/globals.css` (`--accent`,
  `--frame-gold`, `--bg`, etc.). The matrix skin overrides them under a
  `[data-skin="matrix"]` scope. Add new rules to `globals.css`, don't introduce
  CSS modules.
- Add an "Enter the museum" link on the Entrance page pointing at `/museum/`.
  One link. Do not restructure the entrance.

---

## Constraints (all phases)

- Static export only: no API routes, no SSR, no runtime fetch.
- All asset URLs go through `asset()` — `basePath` is `/runar-museum`.
- `trailingSlash: true` — every route path ends in `/`.
- Pin `three` to an exact version in `package.json`. No `@react-three/fiber` or `drei`
  unless you hit a wall and say so first — plain three.js keeps the bundle far smaller.
- three.js must **not** appear in the bundle for `/`, `/all/`, `/rooms/*`, `/minis/*`.
  Verify with the build output.
- Bilingual: zero hardcoded display text in components.

## Acceptance

1. `npm run build` succeeds; `out/museum/index.html` and one dir per room exist.
2. Existing 2D routes render identically to before (spot-check all four page types).
3. Skin toggle swaps materials/lighting/shell with **zero** change to board positions.
4. A room with 1 image shows 3 slots: 1 art board, 2 black boards.
5. Rail controls work on desktop keyboard and on touch, including the tap zones.
6. Walk mode toggle is absent below 900px.
7. Bundle check: no three.js on the 2D routes.
