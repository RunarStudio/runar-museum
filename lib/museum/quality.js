// Render budget, decided once when the scene is created.
//
// These are deliberately not reactive. Changing the light count forces
// three.js to recompile every material's shader — a visible stall — so the
// budget is sampled at build time and held for the life of the scene. A
// visitor rotating their phone keeps whatever budget they started with.

const MOBILE_MAX_WIDTH = 900;

export function getQuality(width = typeof window === 'undefined' ? 1200 : window.innerWidth) {
  const mobile = width < MOBILE_MAX_WIDTH;
  return {
    mobile,
    // The single biggest mobile cost: every light is evaluated for every
    // pixel it touches, so a 12-board room with a light per board is 12x
    // the fragment work. Instead a fixed pool of lights follows the
    // visitor, lighting the nearest slots and leaving distant ones dark —
    // which is what a real gallery looks like anyway.
    maxLights: mobile ? 4 : 8,
    // A phone's devicePixelRatio of 3 means rendering ~9x the pixels the
    // screen can show. 1.5 is indistinguishable at arm's length.
    pixelRatio: mobile ? 1.5 : 2,
    // The glyph rain redraws a canvas and re-uploads it to the GPU. At 20fps
    // it reads identically to 60 and costs a third as much.
    rainFps: mobile ? 15 : 24,
    // Rain sheets ringing the room. One draw call regardless of count, but
    // each costs overdraw where they overlap — the dominant fill cost on a
    // phone, so the storm is thinner there.
    rainSheets: mobile ? 80 : 260,
  };
}
