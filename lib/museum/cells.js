// Shared by the dungeon skin and the walk controls: reconstructs one
// wall-to-wall "cell" per facing pair (centerline, half-width, and a
// rotation whose local +Z is the corridor's direction of travel) purely
// from the actual slot positions layout.js already computed. Nothing
// here decides where a turn happens — a turn is just two adjacent cells
// with a different rotY, already baked into `slots` by layout.js.
// Plain arrays/numbers only, no `three` import, same rule as layout.js.

// Only used to extrapolate a trailing unpaired slot, or a single-pair
// cell with no same-index neighbor to measure against — matches
// layout.js's SPAN. Never used to decide where a turn happens.
export const SPAN_FALLBACK = 4.6;

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

export function pairCells(slots) {
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
// turn boundaries — lets a consumer avoid measuring a turn cell's span
// against a perpendicular (diagonal) neighbor. Only used for that
// measurement; never to decide where a leg ends.
export function legIndexPerPair(segments, totalPairs) {
  const turnsAtPair = new Set(segments.map((s) => s.turnAt / 2));
  const legOf = new Array(totalPairs);
  let leg = 0;
  for (let p = 0; p < totalPairs; p++) {
    if (turnsAtPair.has(p)) leg++;
    legOf[p] = leg;
  }
  return legOf;
}

// Same-leg-aware span (forward extent) for cell i — avoids a diagonal
// distance across a turn distorting the measurement.
export function legAwareSpan(cells, legOf, i) {
  if (i > 0 && legOf[i] === legOf[i - 1]) return dist2D(cells[i].centerline, cells[i - 1].centerline);
  if (i < cells.length - 1 && legOf[i] === legOf[i + 1]) return dist2D(cells[i].centerline, cells[i + 1].centerline);
  return SPAN_FALLBACK;
}

// Simple nearest-neighbor span (by array index, ignoring leg boundaries).
// At a turn this can be a diagonal distance, which only makes that cell's
// walkable box slightly larger than the true corridor width there — safe
// for bounds (still doesn't cross a wall), just not what you'd want for
// drawing wall geometry (use legAwareSpan for that).
export function nearestSpan(cells, i) {
  if (i > 0) return dist2D(cells[i].centerline, cells[i - 1].centerline);
  if (cells.length > 1) return dist2D(cells[i].centerline, cells[1].centerline);
  return SPAN_FALLBACK;
}
