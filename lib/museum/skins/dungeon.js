// Dungeon skin: stone corridor with warm flickering sconces, capped at
// the far end with an arch. Ports the prototype's materials, pilaster
// placement and flicker curve — see docs/prototype-reference.html.
//
// The prototype only ever renders one straight corridor. This skin must
// also handle layout.segments (a corridor that wraps into an L or a
// spiral), so shell geometry — floor, ceiling, walls, pilasters — is
// built per facing-pair "cell" instead of one long plane. Each cell's
// orientation is read straight off its two slots' actual positions, so
// a turn just falls out of the data; this file never decides where one
// happens (that's `layout`'s job — segments here only pick where a
// corner deserves a heavier pilaster instead of a floating stub).
import * as THREE from 'three';

const STONE = 0x35302a;
const FLOOR_COLOR = 0x1b1815;
const WALL_HEIGHT = 4.1;
const WALL_STANDOFF = 0.55; // wall plane sits this far beyond the boards
const FLOOR_MARGIN = 1.2; // floor/ceiling overhang past the wall planes
const PILASTER_W = 0.34;
const CORNER_PILASTER_W = 0.55;
// Only used to extrapolate a trailing unpaired slot, or a single-pair leg
// with no same-leg neighbor to measure against — matches layout's SPAN.
const SPAN_FALLBACK = 4.6;

function perp([x, , z]) {
  return [z, -x];
}
function angleOf([x, z]) {
  return Math.atan2(x, z);
}
function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
function dist2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

// One wall-to-wall cell per facing pair: centerline, half-width
// (wallOffset) and a rotation whose local +Z is the corridor's direction
// of travel through that pair — derived purely from the two slots'
// positions, so it stays correct through any number of turns.
function pairCells(slots) {
  const cells = [];
  for (let i = 0; i < slots.length; i += 2) {
    const left = slots[i];
    const right = slots[i + 1];
    if (left && right) {
      const dx = right.pos[0] - left.pos[0];
      const dz = right.pos[2] - left.pos[2];
      const wallOffset = Math.hypot(dx, dz) / 2;
      const forward = perp([dx / (2 * wallOffset), 0, dz / (2 * wallOffset)]);
      cells.push({ centerline: mid(left.pos, right.pos), wallOffset, rotY: angleOf(forward) });
    } else if (left && cells.length > 0) {
      // Trailing odd slot with no facing partner: extrapolate one more
      // step from the previous cell rather than guessing an orientation.
      const prev = cells[cells.length - 1];
      const step = cells.length > 1 ? dist2D(prev.centerline, cells[cells.length - 2].centerline) : SPAN_FALLBACK;
      const fwd = [Math.sin(prev.rotY), 0, Math.cos(prev.rotY)];
      cells.push({
        centerline: [prev.centerline[0] + fwd[0] * step, prev.centerline[1], prev.centerline[2] + fwd[2] * step],
        wallOffset: prev.wallOffset,
        rotY: prev.rotY,
      });
    }
  }
  return cells;
}

// Which leg (0, 1, 2, ...) each pair index belongs to, from segments'
// turn boundaries — used only to pick same-leg neighbors for span
// measurement and to mark corner cells, never to decide where a leg ends.
function legIndexPerPair(segments, totalPairs) {
  const turnsAtPair = new Set(segments.map((s) => s.turnAt / 2));
  const legOf = new Array(totalPairs);
  let leg = 0;
  for (let p = 0; p < totalPairs; p++) {
    if (turnsAtPair.has(p)) leg++;
    legOf[p] = leg;
  }
  return legOf;
}

function cellSpan(cells, legOf, i) {
  if (i > 0 && legOf[i] === legOf[i - 1]) return dist2D(cells[i].centerline, cells[i - 1].centerline);
  if (i < cells.length - 1 && legOf[i] === legOf[i + 1]) return dist2D(cells[i].centerline, cells[i + 1].centerline);
  return SPAN_FALLBACK;
}

export const dungeon = {
  id: 'dungeon',
  label: 'Dungeon',
  bg: 0x0b0a08,
  fog: { color: 0x0b0a08, near: 8, far: 34 },
  frameColor: 0xb8893c,
  emptyColor: 0x08070a,
  hudAccent: '#d4a24e',

  build(layout, root) {
    const cells = pairCells(layout.slots);
    const legOf = legIndexPerPair(layout.segments, cells.length);
    const turnPairs = new Set(layout.segments.map((s) => s.turnAt / 2));

    const stone = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.94, metalness: 0.02 });
    const floorMat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.86, metalness: 0.05 });

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const span = cellSpan(cells, legOf, i);
      const width = cell.wallOffset * 2 + FLOOR_MARGIN;

      const group = new THREE.Group();
      group.position.set(cell.centerline[0], 0, cell.centerline[2]);
      group.rotation.y = cell.rotY;
      root.add(group);

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, span), floorMat);
      floor.rotation.x = -Math.PI / 2;
      group.add(floor);

      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, span), stone);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = WALL_HEIGHT;
      group.add(ceil);

      const isCorner = turnPairs.has(i);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, WALL_HEIGHT), stone);
        wall.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        wall.position.set(side * (cell.wallOffset + WALL_STANDOFF), WALL_HEIGHT / 2, 0);
        group.add(wall);

        // A pilaster at the cell's leading edge reads as masonry along a
        // straight run; corners get a heavier one instead, so the turn
        // reads as a cornerstone rather than two wall stubs meeting at air.
        const pw = isCorner ? CORNER_PILASTER_W : PILASTER_W;
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(pw, WALL_HEIGHT, 0.5), stone);
        pilaster.position.set(side * (cell.wallOffset + WALL_STANDOFF - 0.19), WALL_HEIGHT / 2, -span / 2);
        group.add(pilaster);
      }
    }

    // Entrance wall behind the very first cell, and a capped arch beyond
    // the very last — the dungeon's defining trait vs. the matrix skin,
    // which has no end cap at all.
    if (cells.length > 0) {
      const first = cells[0];
      const firstSpan = cellSpan(cells, legOf, 0);
      const firstWidth = first.wallOffset * 2 + FLOOR_MARGIN;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(firstWidth, WALL_HEIGHT), stone);
      back.rotation.y = first.rotY + Math.PI;
      back.position.set(
        first.centerline[0] - Math.sin(first.rotY) * (firstSpan / 2 + 0.4),
        WALL_HEIGHT / 2,
        first.centerline[2] - Math.cos(first.rotY) * (firstSpan / 2 + 0.4)
      );
      root.add(back);

      const lastIdx = cells.length - 1;
      const last = cells[lastIdx];
      const lastSpan = cellSpan(cells, legOf, lastIdx);
      const lastWidth = last.wallOffset * 2 + FLOOR_MARGIN;

      const endGroup = new THREE.Group();
      endGroup.position.set(
        last.centerline[0] + Math.sin(last.rotY) * (lastSpan / 2 + 0.4),
        0,
        last.centerline[2] + Math.cos(last.rotY) * (lastSpan / 2 + 0.4)
      );
      endGroup.rotation.y = last.rotY;
      root.add(endGroup);

      const endWall = new THREE.Mesh(new THREE.PlaneGeometry(lastWidth, WALL_HEIGHT), stone);
      endWall.position.y = WALL_HEIGHT / 2;
      endGroup.add(endWall);

      const arch = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2.5),
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 })
      );
      arch.position.set(0, 1.25, 0.01);
      endGroup.add(arch);
    }

    const lights = [];
    root.add(new THREE.AmbientLight(0x50412c, 0.5));
    for (const s of layout.slots) {
      // Pull the sconce slightly inward (toward the centerline) from the
      // board it lights, using the facing direction layout already gave us.
      const inward = [Math.sin(s.rotY), 0, Math.cos(s.rotY)];
      const px = s.pos[0] + inward[0] * 0.6;
      const pz = s.pos[2] + inward[2] * 0.6;

      const light = new THREE.PointLight(0xffb257, 9, 8.5, 2);
      light.position.set(px, 3.0, pz);
      root.add(light);
      lights.push({ l: light, base: 9 });

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
      );
      bulb.position.copy(light.position);
      root.add(bulb);
    }

    return { lights, flicker: true };
  },

  boardMat(board, texture) {
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.04 });
  },

  frameMat() {
    return new THREE.MeshStandardMaterial({ color: 0xb8893c, roughness: 0.42, metalness: 0.72 });
  },
};
