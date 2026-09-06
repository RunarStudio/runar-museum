// Matrix skin: no walls, no ceiling, no end cap — a grid floor to the
// horizon, glyph rain falling all around, and a glowing strip along the
// floor marking where the room actually is. Ports the prototype's
// grid/floor materials and lighting; see docs/prototype-reference.html.
//
// Unlike dungeon, nothing here needs to turn: the floor is one big flat
// plane under the whole layout regardless of its shape, and slot markers
// just read layout.slots' positions directly, so a wrap "just works"
// without this skin knowing where the turns are.
import * as THREE from 'three';
import { SPAN } from '../layout.js';

const GRID_SIZE = 400; // generous flat grid; a spiral can extend either axis
const GRID_DIVISIONS = 200;
const SLOT_MARKER_HEIGHT = 3.6;

// Glyph rain, drawn once per frame into a canvas and mapped onto a box the
// visitor stands inside. A texture is far cheaper than thousands of meshes,
// and the box means the rain surrounds you rather than sitting on one wall.
const RAIN_W = 512;
const RAIN_H = 512;
const RAIN_COLUMNS = 32;
const RAIN_FONT = 18;
// Rain lives OUTSIDE the room, never over it. Sheets are scattered in a ring
// whose inner radius clears the room's own footprint, so a visitor walking
// the hall always looks *out* at the storm rather than standing in it — the
// room stays clean and the artwork never competes with falling glyphs.
const RAIN_SHEET_W = 7;
const RAIN_SHEET_H = 13;
const RAIN_RING_CLEARANCE = 9; // metres of clear air beyond the room's edge
const RAIN_RING_DEPTH = 52; // how far out the storm extends
const RAIN_BAND_LOW = -4;
const RAIN_BAND_HIGH = 30;
// Sheets are stretched by a random factor rather than all being one length,
// so the storm has long trailing falls among short ones instead of reading
// as a single uniform curtain.
const RAIN_STRETCH_MIN = 0.7;
const RAIN_STRETCH_MAX = 3.4;
const RAIN_DRIFT = 0.35; // slow vertical float, for parallax between sheets
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// The skin's base color walks green → blue → red and back, holding each for
// most of its leg and easing across the last quarter, so the room reads as
// deliberately shifting rather than continuously smeared between hues.
const CYCLE_COLORS = [0x3ad6a6, 0x3a8fd6, 0xd64a3a];
const CYCLE_SECONDS = 60;
const CYCLE_HOLD = 0.75;

function bboxCenter(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    // Half-diagonal: the radius of a circle that fully contains the room,
    // whatever shape the spiral turned it into.
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2,
  };
}

function cycleColor(elapsedSeconds, out) {
  const legs = CYCLE_COLORS.length;
  const total = legs * CYCLE_SECONDS;
  const t = ((elapsedSeconds % total) + total) % total;
  const leg = Math.floor(t / CYCLE_SECONDS);
  const within = (t % CYCLE_SECONDS) / CYCLE_SECONDS;
  const from = CYCLE_COLORS[leg];
  const to = CYCLE_COLORS[(leg + 1) % legs];
  const mix = within < CYCLE_HOLD ? 0 : (within - CYCLE_HOLD) / (1 - CYCLE_HOLD);
  return out.setHex(from).lerp(new THREE.Color(to), mix);
}

function createRain(fps) {
  const frameInterval = 1 / fps;
  let sinceDraw = 0;
  const canvas = document.createElement('canvas');
  canvas.width = RAIN_W;
  canvas.height = RAIN_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, RAIN_W, RAIN_H);

  const colWidth = RAIN_W / RAIN_COLUMNS;
  const drops = Array.from({ length: RAIN_COLUMNS }, () => ({
    y: Math.random() * RAIN_H,
    speed: 70 + Math.random() * 190,
  }));

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);

  function update(dt) {
    // Redrawing and re-uploading this canvas is the skin's heaviest
    // per-frame cost, so it runs at its own frame rate rather than the
    // renderer's. Falling glyphs read the same at 15-24fps.
    sinceDraw += dt;
    if (sinceDraw < frameInterval) return;
    const step = sinceDraw;
    sinceDraw = 0;

    // Fade rather than clear: what's already drawn dims each frame, which
    // is what leaves a trail behind every falling head.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
    ctx.fillRect(0, 0, RAIN_W, RAIN_H);
    ctx.font = `${RAIN_FONT}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y += d.speed * step;
      if (d.y > RAIN_H) {
        d.y = -RAIN_FONT * (1 + Math.random() * 6);
        d.speed = 70 + Math.random() * 190;
      }
      const glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const x = i * colWidth + (colWidth - RAIN_FONT) / 2;
      // The leading glyph is near-white and the one behind it green: the
      // canvas stays in these two tones, and the cycling base color tints
      // the whole sheet from outside.
      ctx.fillStyle = '#f2fffa';
      ctx.fillText(glyph, x, d.y);
      ctx.fillStyle = 'rgba(120, 240, 190, 0.55)';
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, d.y - RAIN_FONT);
    }
    texture.needsUpdate = true;
  }

  return { texture, update };
}

export const matrix = {
  id: 'matrix',
  label: 'Matrix',
  bg: 0x04070a,
  fog: { color: 0x04070a, near: 10, far: 52 },
  frameColor: 0x3ad6a6,
  emptyColor: 0x02100c,
  hudAccent: '#3ad6a6',

  build(layout, root, quality) {
    const { cx, cz, radius } = bboxCenter(layout.slots.map((s) => s.pos));

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x3ad6a6, 0x0e3a2e);
    grid.position.set(cx, 0, cz);
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    root.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_SIZE + 20, GRID_SIZE + 20),
      new THREE.MeshStandardMaterial({ color: 0x04070a, roughness: 0.28, metalness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, -0.02, cz);
    root.add(floor);

    const rain = createRain(quality.rainFps);
    const rainMat = new THREE.MeshBasicMaterial({
      map: rain.texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    // A ring of billboards facing the room's centre. Each is placed once and
    // then only floats vertically, so the storm costs one draw call and a
    // handful of matrix writes per frame no matter how big it looks.
    const sheetCount = quality.rainSheets;
    const rainField = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(RAIN_SHEET_W, RAIN_SHEET_H),
      rainMat,
      sheetCount
    );
    rainField.frustumCulled = false;
    const sheets = [];
    const m4 = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();

    for (let i = 0; i < sheetCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius + RAIN_RING_CLEARANCE + Math.random() * RAIN_RING_DEPTH;
      sheets.push({
        x: cx + Math.cos(angle) * dist,
        z: cz + Math.sin(angle) * dist,
        y: RAIN_BAND_LOW + Math.random() * (RAIN_BAND_HIGH - RAIN_BAND_LOW),
        // Face the room's centre, so a visitor inside always sees the sheets
        // flat-on rather than edge-on.
        rotY: -angle + Math.PI / 2,
        speed: RAIN_DRIFT * (0.4 + Math.random() * 1.6),
        // A long sheet is a long fall: the glyph texture stretches with it,
        // and its slower apparent motion adds to the parallax.
        stretch: RAIN_STRETCH_MIN + Math.random() ** 2 * (RAIN_STRETCH_MAX - RAIN_STRETCH_MIN),
      });
    }

    function layoutSheets() {
      for (let i = 0; i < sheets.length; i++) {
        const sh = sheets[i];
        pos.set(sh.x, sh.y, sh.z);
        euler.set(0, sh.rotY, 0);
        quat.setFromEuler(euler);
        scale.set(1, sh.stretch, 1);
        m4.compose(pos, quat, scale);
        rainField.setMatrixAt(i, m4);
      }
      rainField.instanceMatrix.needsUpdate = true;
    }
    layoutSheets();
    root.add(rainField);

    const lights = [];
    const ambient = new THREE.AmbientLight(0x7fd8c0, 0.42);
    root.add(ambient);
    const key = new THREE.DirectionalLight(0xbdfbe6, 0.55);
    key.position.set(cx + 2, 8, cz + 2);
    root.add(key);

    // Everything whose color follows the cycle. Collected here so update()
    // never has to walk the scene graph looking for things to recolor.
    const tinted = [grid.material, rainMat, ambient.color, key.color];
    const glowMats = [];
    const anchors = [];

    for (const s of layout.slots) {
      // Slot markers hover where a dungeon would put a pilaster: just
      // outside the board, using the facing direction layout already gave
      // us to push away from the centerline.
      const outward = [-Math.sin(s.rotY), 0, -Math.cos(s.rotY)];
      const px = s.pos[0] + outward[0] * 0.4;
      const pz = s.pos[2] + outward[2] * 0.4;

      const markerMat = new THREE.MeshBasicMaterial({ color: 0x1d6b57 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, SLOT_MARKER_HEIGHT, 0.05), markerMat);
      bar.position.set(px, SLOT_MARKER_HEIGHT / 2, pz);
      root.add(bar);
      tinted.push(markerMat);

      // Floor glow: a bright strip running along the base of each wall.
      // With no walls or ceiling, this is the only thing that tells you
      // where the room ends and the endless grid begins.
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x3ad6a6,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      // A slot's local X runs along its wall, so rotating by rotY lays the
      // strip down the corridor without this skin knowing which way it turns.
      const glow = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 0.05, 0.16), glowMat);
      glow.position.set(s.pos[0], 0.03, s.pos[2]);
      glow.rotation.y = s.rotY;
      root.add(glow);
      glowMats.push(glowMat);

      anchors.push([s.pos[0], 2.4, s.pos[2]]);
    }

    // A fixed pool of lights that follows the visitor, rather than one per
    // slot: lights are the dominant per-pixel cost on a phone.
    for (let i = 0; i < Math.min(quality.maxLights, anchors.length); i++) {
      const light = new THREE.PointLight(0x3ad6a6, 5.5, 7.5, 2);
      light.position.set(...anchors[i]);
      root.add(light);
      lights.push({ l: light, base: 5.5 });
      tinted.push(light.color);
    }

    const base = new THREE.Color();
    const rainTint = new THREE.Color();

    function update(dt, elapsedSeconds, scene) {
      rain.update(dt);

      // Sheets drift slowly downward and wrap, which gives the storm depth
      // that the flat canvas animation alone cannot: nearer sheets visibly
      // pass farther ones.
      for (const sh of sheets) {
        sh.y -= sh.speed * dt;
        if (sh.y + (RAIN_SHEET_H * sh.stretch) / 2 < RAIN_BAND_LOW) {
          sh.y = RAIN_BAND_HIGH + (RAIN_SHEET_H * sh.stretch) / 2;
        }
      }
      layoutSheets();
      cycleColor(elapsedSeconds, base);

      for (const target of tinted) {
        // Materials expose .color; raw Color instances (light colors) are
        // already the thing to write to.
        (target.isColor ? target : target.color).copy(base);
      }
      // Rain keeps its whiteish character by only half-taking the tint.
      rainTint.copy(base).lerp(new THREE.Color(0xffffff), 0.35);
      rainMat.color.copy(rainTint);

      for (const m of glowMats) m.color.copy(base);

      // The ground and haze pick up a heavily darkened version of the base
      // so the whole world reads as one color, not a green room with a red
      // light in it.
      if (scene?.fog) scene.fog.color.copy(base).multiplyScalar(0.09);
      if (scene?.background?.isColor) scene.background.copy(base).multiplyScalar(0.09);
      floor.material.color.copy(base).multiplyScalar(0.08);
    }

    return { lights, anchors, flicker: false, update };
  },

  // Artwork is deliberately unlit: MeshBasicMaterial ignores every light in
  // the scene, so a photo reads exactly as shot regardless of where the
  // visitor stands or what color the room currently is. The cycling base
  // color must never wash over the miniatures themselves.
  boardMat(board, texture) {
    return new THREE.MeshBasicMaterial({ map: texture });
  },

  frameMat() {
    return new THREE.MeshBasicMaterial({ color: 0x3ad6a6 });
  },
};
