// Pure geometry: turns a flat list of boards (see getRoomBoards in
// lib/data.js) into wall slots for a 3D corridor. No `three` import —
// skins turn these plain numbers into meshes, so this file must stay
// reusable by any future renderer and unit-reasonable on its own.

export const MIN_SLOTS = 3;

// Facing-pair spacing along the corridor's direction of travel, in meters.
const SPAN = 4.6;
// Distance from the centerline to each wall's board plane, in meters.
const WALL_OFFSET = 1.8;
// Board (and camera stop) height off the floor, in meters.
const BOARD_Y = 1.6;
// Boards per corridor leg before it turns 90°. 6 facing pairs.
const WRAP_AFTER = 12;
const PAIRS_PER_LEG = WRAP_AFTER / 2;

// Forward direction per leg, turning 90° clockwise (viewed from above)
// each time it wraps: +z, +x, -z, -x, then repeats. This walks a
// right-angle spiral instead of one ever-lengthening hallway.
const LEG_DIRS = [
  [0, 1], // +z
  [1, 0], // +x
  [0, -1], // -z
  [-1, 0], // -x
];

// The "side +1" (right) wall direction, 90° clockwise from forward.
function perp([fx, fz]) {
  return [fz, -fx];
}

// Angle (radians) that rotates a plane whose default normal is +z to
// point along the given [x, z] direction.
function angleFor([x, z]) {
  return Math.atan2(x, z);
}

export function layout(boards) {
  const n = Math.max(MIN_SLOTS, boards.length);
  const totalPairs = Math.ceil(n / 2);

  // Walk leg by leg, recording each pair's centerline point and the
  // direction of travel that produced it. `segments` only records turns —
  // a corridor that never wraps has zero legs beyond the first and so
  // reports an empty segments array.
  const pairCenters = [];
  const pairDirs = [];
  const segments = [];

  let legIdx = 0;
  let pairsWalked = 0;
  let originX = 0;
  let originZ = 0;

  while (pairsWalked < totalPairs) {
    const dir = LEG_DIRS[legIdx % LEG_DIRS.length];
    const legPairs = Math.min(PAIRS_PER_LEG, totalPairs - pairsWalked);
    const from = pairsWalked * 2;
    const to = Math.min((pairsWalked + legPairs) * 2, n);

    if (legIdx > 0) {
      segments.push({ axis: dir[0] !== 0 ? 'x' : 'z', from, to, turnAt: from });
    }

    for (let p = 0; p < legPairs; p++) {
      const dist = (p + 1) * SPAN;
      pairCenters.push([originX + dir[0] * dist, originZ + dir[1] * dist]);
      pairDirs.push(dir);
    }

    originX += dir[0] * legPairs * SPAN;
    originZ += dir[1] * legPairs * SPAN;
    pairsWalked += legPairs;
    legIdx++;
  }

  const slots = [];
  for (let i = 0; i < n; i++) {
    const pairIndex = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const [cx, cz] = pairCenters[pairIndex];
    const dir = pairDirs[pairIndex];
    const [px, pz] = perp(dir);
    const offset = side * WALL_OFFSET;
    const pos = [cx + px * offset, BOARD_Y, cz + pz * offset];
    // Board faces back toward the centerline, i.e. the opposite of the
    // direction it was offset in.
    const rotY = angleFor([-px * side, -pz * side]);

    slots.push({
      i,
      side,
      pos,
      rotY,
      board: boards[i] ?? null,
      stop: {
        pos: [cx, BOARD_Y, cz],
        look: pos,
      },
    });
  }

  const depth = totalPairs * SPAN;

  return { slots, n, depth, segments };
}
