// Pure geometry: turns a flat list of boards (see getRoomBoards in
// lib/data.js) into wall slots for a 3D room. No `three` import — skins
// turn these plain numbers into meshes, so this file must stay reusable by
// any future renderer and unit-reasonable on its own.
//
// The room is a ring: artworks hang evenly around a circular wall, all
// facing the centre. One rail step slides the visitor exactly one artwork
// along that wall, always travelling the same direction, and stepping past
// the last artwork arrives back at the first. Nothing dead-ends, and the
// step never swings the view from one wall across to a facing one.

export const MIN_SLOTS = 3;

// Arc length between neighbouring artworks along the wall, in meters. The
// ring's radius is derived from this and the artwork count, so a room with
// more pieces grows outward rather than cramming them closer together.
export const ARC_SPACING = 4.2;
// Floor of the radius, so a three-artwork room is still a room and not a
// tight huddle the camera cannot sit inside.
const MIN_RADIUS = 6.5;
// Board (and camera stop) height off the floor, in meters.
const BOARD_Y = 1.6;
// Eye height on the rail, in meters.
const EYE_Y = 1.62;
// How far in front of an artwork the rail parks, in meters. Clamped below
// so the stop can never pass through the ring's centre in a small room.
const VIEW_DISTANCE = 3.4;

export function ringRadius(slotCount) {
  return Math.max(MIN_RADIUS, (slotCount * ARC_SPACING) / (2 * Math.PI));
}

export function layout(boards) {
  const n = Math.max(MIN_SLOTS, boards.length);
  const radius = ringRadius(n);
  const step = (2 * Math.PI) / n;
  // Never let the viewing position reach the middle of a small ring.
  const viewDistance = Math.min(VIEW_DISTANCE, radius * 0.55);

  const slots = [];
  for (let i = 0; i < n; i++) {
    const angle = i * step;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const pos = [radius * sin, BOARD_Y, radius * cos];
    const standRadius = radius - viewDistance;

    slots.push({
      i,
      angle,
      // Kept for skins that want an outward direction without recomputing it.
      outward: [sin, 0, cos],
      pos,
      // A plane faces +Z by default; turning it half a revolution past its
      // own bearing points it back at the ring's centre.
      rotY: angle + Math.PI,
      board: boards[i] ?? null,
      stop: {
        pos: [standRadius * sin, EYE_Y, standRadius * cos],
        look: pos,
      },
    });
  }

  return {
    slots,
    n,
    radius,
    // Angular gap between neighbours — skins place pilasters and markers on
    // the half-step between artworks.
    step,
    // The walkable circle, for controls that need to keep a visitor inside.
    ring: { cx: 0, cz: 0, radius },
    // Total wall length, the ring analogue of the old corridor depth.
    depth: 2 * Math.PI * radius,
    // A ring never turns a corner; kept so skins written against the old
    // corridor shape still see a valid (empty) value.
    segments: [],
  };
}
