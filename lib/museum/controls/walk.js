// Walk controls: desktop-only, opt-in toggle. WASD + shift-run, drag to
// steer, fixed eye height. Ports the prototype's movement feel — see
// docs/prototype-reference.html — but the prototype only ever bounded a
// bounded to the room rather than to a corridor: the room is a ring, so a
// single radial clamp keeps a walker inside it. This replaced a per-cell
// bounding scheme that existed only because the old layout was a corridor
// that could wrap into an L — there are no cells, legs or turns to reason
// about any more, and no seams between them to get stuck on.

import * as THREE from 'three';

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
const MIN_HALF_EXTENT = 0.2; // never clamp the room down to nothing walkable
// How far inside the artwork ring a walker is stopped, in meters.
const WALL_MARGIN = 0.9;

export function createWalkControls({ camera, canvas, layout }) {
  // Start where the rail parks at the first artwork, so switching into walk
  // mode never teleports the visitor somewhere they weren't.
  const start = layout.slots[0]?.stop.pos ?? [0, EYE_HEIGHT, 0];
  const pos = new THREE.Vector3(start[0], EYE_HEIGHT, start[2]);
  let yaw = 0;
  let tYaw = 0;
  let pitch = 0;
  let tPitch = 0;

  const keys = Object.create(null);
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  // The room is a ring, so keeping a visitor inside it is a single radial
  // clamp — no per-cell boxes, no turn handling, no seams between cells to
  // get stuck on. This replaced the corridor's per-cell bounds wholesale.
  function clamp(x, z) {
    const limit = Math.max(layout.radius - WALL_MARGIN, MIN_HALF_EXTENT);
    const d = Math.hypot(x, z);
    if (d <= limit) return [x, z];
    const k = limit / d;
    return [x * k, z * k];
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
