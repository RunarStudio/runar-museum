// Walk controls: desktop-only, opt-in toggle. WASD + shift-run, drag to
// steer, fixed eye height. Ports the prototype's movement feel — see
// docs/prototype-reference.html — but the prototype only ever bounded a
// single straight corridor with one X/Z clamp. That doesn't work once
// the corridor spirals (WRAP_AFTER=8): a single bounding box over the
// whole layout would let someone walk diagonally across the middle of
// the spiral, straight through a wall that only *looks* like it's in
// the way from the dungeon skin's geometry.
//
// Fix: bound per facing-pair cell (same cells the dungeon skin derives
// from `layout.slots` in lib/museum/cells.js). Each frame, find the cell
// nearest the player, clamp the candidate position in *that cell's own
// rotated local frame* (lateral clamp keeps you off the walls, forward
// clamp keeps you off the end caps), then convert back to world space.
// Consecutive cells' boxes touch exactly on a straight run and overlap
// in the shared square corner at a turn — same reason the dungeon skin's
// floor tiles need no special corner piece — so movement stays smooth
// across a turn with no dead zone at the seam, while never permitting a
// shortcut across a turn's inside corner through solid geometry.
import * as THREE from 'three';
import { pairCells, legIndexPerPair, SPAN_FALLBACK } from '../cells.js';

export const EYE_HEIGHT = 1.62;
// The walk toggle should be hidden entirely below this viewport width —
// exported so Phase 5/6 chrome doesn't have to guess the breakpoint.
export const WALK_MIN_VIEWPORT_WIDTH = 900;

const WALK_SPEED = 2.6;
const RUN_SPEED = 5.2;
// Unlike rail's yaw (a clamped look-*offset* around a fixed board-facing
// direction), walk's yaw is the actual absolute steering heading — it
// must be free to reach any angle, since navigating a 90° corridor turn
// on foot requires steering a full quarter-turn. (The prototype clamped
// this to ±1.1 rad, but that only ever had to serve one straight
// corridor where you'd never need to turn more than a moderate look
// angle; a spiral corridor breaks that assumption the same way it broke
// the single-AABB bounds above.) Pitch stays clamped — looking away from
// dead level is fine, no reason to allow looking straight up or down.
const PITCH_LIMIT = 0.5;
const LOOK_RATE = 9;
const DRAG_YAW_RATE = 0.0035;
const DRAG_PITCH_RATE = 0.0028;
const LATERAL_MARGIN = 0.35; // stay this far inboard of the wall plane
const FORWARD_MARGIN = 0.15; // stay this far inboard of a true dead end (the two end caps)
const MIN_HALF_EXTENT = 0.2; // never clamp a cell down to zero walkable room

function dist2D(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

// A cell's local +Z consistently points toward the *previous* pair
// (entrance-ward) — pairCells derives forward as perp(rightVec), and
// rightVec is itself perp(travelDir), so forward = perp(perp(travelDir))
// = -travelDir. So at an interior (same-leg) boundary between cell i and
// i+1, cell i's *negative*-Z edge meets cell i+1's *positive*-Z edge.
//
// Each side's half-extent must match its same-leg neighbor's exactly
// (the shared midpoint, no margin) or a walker gets permanently stuck
// oscillating in the gap between two boxes that both stop short of it.
//
// A cell at a turn boundary has no same-leg neighbor on one side at all —
// cells[i-1] or cells[i+1] there belongs to a *different* leg, sitting to
// the *side* (see computeLateralExtents), not ahead. Treating it as a
// forward neighbor would bound the wrong axis. So a turn-boundary side is
// treated exactly like a true dead end (own-leg span, margin applied) —
// the lateral fix below is what actually connects it to the next leg.
function computeForwardExtents(cells, legOf) {
  const prevHalf = new Array(cells.length); // toward local +Z (previous pair)
  const nextHalf = new Array(cells.length); // toward local -Z (next pair)
  for (let i = 0; i < cells.length; i++) {
    const ownSpan =
      i > 0 && legOf[i] === legOf[i - 1]
        ? dist2D(cells[i].centerline, cells[i - 1].centerline)
        : i < cells.length - 1 && legOf[i] === legOf[i + 1]
          ? dist2D(cells[i].centerline, cells[i + 1].centerline)
          : SPAN_FALLBACK;

    if (i > 0 && legOf[i] === legOf[i - 1]) {
      prevHalf[i] = dist2D(cells[i].centerline, cells[i - 1].centerline) / 2;
    } else {
      prevHalf[i] = Math.max(ownSpan / 2 - FORWARD_MARGIN, MIN_HALF_EXTENT);
    }
    if (i < cells.length - 1 && legOf[i] === legOf[i + 1]) {
      nextHalf[i] = dist2D(cells[i].centerline, cells[i + 1].centerline) / 2;
    } else {
      nextHalf[i] = Math.max(ownSpan / 2 - FORWARD_MARGIN, MIN_HALF_EXTENT);
    }
  }
  return { prevHalf, nextHalf };
}

// Where cell `to`'s centerline falls in cell `from`'s local frame.
function localOffset(cells, from, to) {
  const dx = cells[to].centerline[0] - cells[from].centerline[0];
  const dz = cells[to].centerline[2] - cells[from].centerline[2];
  const cos = Math.cos(-cells[from].rotY);
  const sin = Math.sin(-cells[from].rotY);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

// The forward-axis fix above only connects same-leg neighbors — at a
// turn, the next leg's first cell sits to the *side* of the previous
// leg's last cell (a 90° turn moves the neighbor from "ahead" to
// "lateral"), not ahead of it. Left alone, the lateral clamp (sized to
// stay off the *side* walls) doesn't reach far enough to meet it, so the
// two cells' boxes never touch and a walker gets stuck exactly at the
// corner — verified by simulating a sustained walk through a 40-board
// spiral before this fix existed. `layout.segments` is what tells us
// *which* cells are on either side of a turn — walking straight through
// a leg never needs it, only handing off across one does. Fix: widen
// the lateral bound specifically on the side that turn neighbor is on,
// for exactly the two cells adjacent to each turn, out to the shared
// midpoint (same "meet exactly, no margin" rule as the forward axis).
function computeLateralExtents(cells, segments) {
  const posHalf = cells.map(() => Infinity); // filled in below with the default
  const negHalf = cells.map(() => Infinity);
  for (const seg of segments) {
    const after = seg.turnAt / 2;
    const before = after - 1;
    if (before < 0 || after >= cells.length) continue;
    const [lx] = localOffset(cells, before, after);
    const half = Math.abs(lx) / 2;
    if (lx >= 0) posHalf[before] = half;
    else negHalf[before] = half;
    const [lx2] = localOffset(cells, after, before);
    const half2 = Math.abs(lx2) / 2;
    if (lx2 >= 0) posHalf[after] = half2;
    else negHalf[after] = half2;
  }
  return { posHalf, negHalf };
}

export function createWalkControls({ camera, canvas, layout }) {
  const cells = pairCells(layout.slots);
  const legOf = legIndexPerPair(layout.segments, cells.length);
  const { prevHalf, nextHalf } = computeForwardExtents(cells, legOf);
  const { posHalf: lateralPosOverride, negHalf: lateralNegOverride } = computeLateralExtents(cells, layout.segments);

  const start = cells[0]?.centerline ?? [0, 0, 0];
  const pos = new THREE.Vector3(start[0], EYE_HEIGHT, start[2]);
  let yaw = 0;
  let tYaw = 0;
  let pitch = 0;
  let tPitch = 0;

  const keys = Object.create(null);
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function nearestCellIndex(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const d = dist2D([x, 0, z], cells[i].centerline);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function clamp(x, z) {
    if (cells.length === 0) return [x, z];
    const i = nearestCellIndex(x, z);
    const cell = cells[i];
    const cos = Math.cos(-cell.rotY);
    const sin = Math.sin(-cell.rotY);
    const dx = x - cell.centerline[0];
    const dz = z - cell.centerline[2];
    let lx = dx * cos - dz * sin;
    let lz = dx * sin + dz * cos;

    const halfWidth = Math.max(cell.wallOffset - LATERAL_MARGIN, MIN_HALF_EXTENT);
    // A turn cell gets widened on whichever side its cross-leg neighbor is
    // on (see computeLateralExtents); every other cell just stays off its
    // side walls.
    const posLimit = Number.isFinite(lateralPosOverride[i]) ? Math.max(halfWidth, lateralPosOverride[i]) : halfWidth;
    const negLimit = Number.isFinite(lateralNegOverride[i]) ? Math.max(halfWidth, lateralNegOverride[i]) : halfWidth;
    lx = Math.max(-negLimit, Math.min(posLimit, lx));
    // +lz = toward the previous pair, -lz = toward the next pair (see
    // computeHalfExtents for why these two bounds are asymmetric).
    lz = Math.max(-nextHalf[i], Math.min(prevHalf[i], lz));

    const c2 = Math.cos(cell.rotY);
    const s2 = Math.sin(cell.rotY);
    return [cell.centerline[0] + lx * c2 - lz * s2, cell.centerline[2] + lx * s2 + lz * c2];
  }

  function onKeyDown(e) {
    if (e.target?.closest && e.target.closest('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'shift') keys[k] = true;
  }
  function onKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  function onPointerDown(e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    tYaw -= dx * DRAG_YAW_RATE;
    tPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, tPitch - dy * DRAG_PITCH_RATE));
  }
  function onPointerUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  lookAt.copy(pos).add(new THREE.Vector3(0, 0, -1));

  return {
    update(dt) {
      const rate = Math.min(1, dt * LOOK_RATE);
      yaw += (tYaw - yaw) * rate;
      pitch += (tPitch - pitch) * rate;

      const speed = (keys.shift ? RUN_SPEED : WALK_SPEED) * dt;
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));

      let nx = pos.x;
      let nz = pos.z;
      if (keys.w) {
        nx += fwd.x * speed;
        nz += fwd.z * speed;
      }
      if (keys.s) {
        nx -= fwd.x * speed;
        nz -= fwd.z * speed;
      }
      if (keys.d) {
        nx += right.x * speed;
        nz += right.z * speed;
      }
      if (keys.a) {
        nx -= right.x * speed;
        nz -= right.z * speed;
      }

      const [cx, cz] = clamp(nx, nz);
      pos.x = cx;
      pos.z = cz;
      pos.y = EYE_HEIGHT;

      camera.position.copy(pos);
      lookAt.copy(pos).add(fwd);
      lookAt.y = EYE_HEIGHT + Math.sin(pitch) * 2.2;
      camera.lookAt(lookAt);
    },

    // For mode switching: the camera's actual current pose.
    getPose() {
      return { pos: pos.clone(), look: lookAt.clone() };
    },
    // For mode switching: adopt an external pose without an animated jump.
    // Derives walk's steering yaw/pitch from the given look direction —
    // rail's own yaw/pitch aren't reused directly, since they mean a
    // different thing there (a look-around offset, not a heading).
    adoptPose({ pos: p, look }) {
      const [cx, cz] = clamp(p.x, p.z);
      pos.set(cx, EYE_HEIGHT, cz);

      // Inverts this module's own lookAt convention (horizontal unit `fwd`
      // plus a `sin(pitch) * 2.2` vertical wobble) rather than treating
      // `look` as a true spherical direction — an approximation, but the
      // handoff only needs a reasonable starting glance, not precision.
      const dir = new THREE.Vector3().subVectors(look, p);
      yaw = tYaw = Math.atan2(-dir.x, -dir.z);
      pitch = tPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.asin(Math.max(-1, Math.min(1, dir.y / 2.2)))));

      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      lookAt.copy(pos).add(fwd);
      lookAt.y = EYE_HEIGHT + Math.sin(pitch) * 2.2;
      // Write the camera immediately — don't wait for the next update()
      // tick, so there's no one-frame-stale pose right after a mode switch.
      camera.position.copy(pos);
      camera.lookAt(lookAt);
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
