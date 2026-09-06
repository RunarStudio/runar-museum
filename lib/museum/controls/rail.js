// Rail controls: default movement mode on every device. Steps between
// slots along the corridor; camera eases to each slot's `stop`. Ports the
// prototype's drag/free-look/swipe/pick logic — see
// docs/prototype-reference.html — plus the mobile tap zones the prototype
// never had to handle (it was desktop-only chrome).
//
// Mode handoff: rail and walk controls both read/write a plain
// `{ pos: Vector3, look: Vector3 }` pose instead of sharing internal
// yaw/pitch state, since the two numbers mean different things in each
// mode (rail's yaw is a temporary look-around offset around a fixed
// board-facing direction; walk's yaw is the actual steering heading).
// Trading through world-space position/look-at avoids that mismatch.
import * as THREE from 'three';

// Hard limits so a board can never leave frame during free look — do not
// loosen these; if it feels restrictive, that's a Phase 5 tuning call
// once there's an actual camera to judge it against, not a Phase 4 one.
export const YAW_LIMIT = 0.62;
export const PITCH_LIMIT = 0.5;

const SWIPE_THRESHOLD = 70;
const TAP_MOVE_THRESHOLD = 6;
// Deliberately slow: the rail glide is how a visitor understands they are
// being moved from one piece to the next. Faster reads as a jump cut.
const POS_SMOOTH = 1.5;
const LOOK_SMOOTH = 9;
// Unattended, the rail moves itself to the next piece so the museum plays
// as a slideshow. Any real input restarts the countdown — the visitor is
// always in charge, and the timer only fills their silence.
export const AUTO_ADVANCE_SECONDS = 40;
const DRAG_YAW_RATE = 0.0035;
const DRAG_PITCH_RATE = 0.0028;

// Left/right thirds of the viewport step the rail; the middle third is
// drag-to-look only. Exported so Phase 5/6 chrome can draw matching
// overlay zones instead of guessing the split.
export const TAP_ZONE_SPLIT = 1 / 3;
export const TAP_ZONE_HINT_MS = 2500;

export function createRailControls({ camera, canvas, layout, onOpenCard, onCloseCard, onTapZonesVisible }) {
  let cursor = 0;
  let idle = 0;
  let yaw = 0;
  let tYaw = 0;
  let pitch = 0;
  let tPitch = 0;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const tgtPos = new THREE.Vector3();
  const tgtLook = new THREE.Vector3();
  const lastLook = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let pickables = [];

  function snap(instant) {
    const stop = layout.slots[cursor].stop;
    tgtPos.set(stop.pos[0], stop.pos[1], stop.pos[2]);
    tgtLook.set(stop.look[0], stop.look[1], stop.look[2]);
    if (instant) {
      camPos.copy(tgtPos);
      camLook.copy(tgtLook);
    }
  }

  function setCursor(i, instant = false) {
    cursor = Math.max(0, Math.min(layout.slots.length - 1, i));
    tYaw = 0;
    tPitch = 0;
    snap(instant);
  }

  function step(dir) {
    idle = 0;
    setCursor(cursor + dir);
    onCloseCard?.();
  }

  // Unlike step(), this wraps: left alone at the last piece, the rail
  // returns to the first rather than parking there forever.
  function autoAdvance() {
    idle = 0;
    setCursor(cursor + 1 >= layout.n ? 0 : cursor + 1);
    onCloseCard?.();
  }

  function pick(clientX, clientY) {
    if (pickables.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(
      pickables.map((p) => p.mesh),
      false
    )[0];
    if (!hit) return null;
    return pickables.find((p) => p.mesh === hit.object)?.slot ?? null;
  }

  function handleTap(clientX, clientY) {
    // A tap that hits an artboard always opens it, regardless of zone —
    // only a tap that hits nothing falls through to the step zones.
    const hitSlot = pick(clientX, clientY);
    if (hitSlot) {
      setCursor(hitSlot.i);
      onOpenCard?.(hitSlot);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    if (frac < TAP_ZONE_SPLIT) step(-1);
    else if (frac > 1 - TAP_ZONE_SPLIT) step(1);
    // middle third: drag-to-look only, a plain tap there does nothing
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;

  function onPointerDown(e) {
    idle = 0;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    moved = 0;
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    tYaw = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, tYaw - dx * DRAG_YAW_RATE));
    tPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, tPitch - dy * DRAG_PITCH_RATE));
  }
  function onPointerUp(e) {
    dragging = false;
    if (moved < TAP_MOVE_THRESHOLD) handleTap(e.clientX, e.clientY);
  }
  function onPointerCancel() {
    dragging = false;
  }

  let touchStartX = 0;
  let touchStartY = 0;
  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
  }

  function onKeyDown(e) {
    if (e.target?.closest && e.target.closest('input, textarea, select')) return;
    idle = 0;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onOpenCard?.(layout.slots[cursor]);
    } else if (e.key === 'Escape') {
      onCloseCard?.();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  let zonesTimer = null;
  if (onTapZonesVisible) {
    onTapZonesVisible(true);
    zonesTimer = setTimeout(() => onTapZonesVisible(false), TAP_ZONE_HINT_MS);
  }

  setCursor(0, true);
  lastLook.copy(camLook);

  return {
    getCursor: () => cursor,
    setCursor,
    setPickables(next) {
      pickables = next;
    },

    // Called once per frame by the owning React component; writes into
    // `camera` but never reads from it, so it stays the single source of
    // truth for where the rail thinks the camera is.
    update(dt) {
      idle += dt;
      if (idle >= AUTO_ADVANCE_SECONDS) autoAdvance();

      const lookRate = Math.min(1, dt * LOOK_SMOOTH);
      yaw += (tYaw - yaw) * lookRate;
      pitch += (tPitch - pitch) * lookRate;

      const posRate = Math.min(1, dt * POS_SMOOTH);
      camPos.lerp(tgtPos, posRate);
      camLook.lerp(tgtLook, posRate);
      camera.position.copy(camPos);

      const off = camLook.clone().sub(camPos);
      off.applyAxisAngle(upAxis, yaw);
      off.y += Math.sin(pitch) * off.length() * 0.9;
      lastLook.copy(camPos).add(off);
      camera.lookAt(lastLook);
    },

    // For mode switching: the camera's actual current pose (post free-look).
    getPose() {
      return { pos: camPos.clone(), look: lastLook.clone() };
    },
    // For mode switching: adopt an external pose without an animated jump.
    // Also re-centers cursor to the nearest slot so further stepping is
    // sensible, without moving the camera to that slot's exact stop.
    adoptPose({ pos, look }) {
      let nearest = 0;
      let nearestD = Infinity;
      for (let i = 0; i < layout.slots.length; i++) {
        const d = pos.distanceTo(new THREE.Vector3(...layout.slots[i].stop.pos));
        if (d < nearestD) {
          nearestD = d;
          nearest = i;
        }
      }
      cursor = nearest;
      camPos.copy(pos);
      tgtPos.copy(pos);
      camLook.copy(look);
      tgtLook.copy(look);
      lastLook.copy(look);
      yaw = tYaw = 0;
      pitch = tPitch = 0;
      // Write the camera immediately — don't wait for the next update()
      // tick, so there's no one-frame-stale pose right after a mode switch.
      camera.position.copy(camPos);
      camera.lookAt(lastLook);
    },

    dispose() {
      clearTimeout(zonesTimer);
      onTapZonesVisible?.(false);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
