// Matrix skin: no walls, no ceiling, no end cap — a green grid floor to
// the horizon. Ports the prototype's grid/floor materials and lighting;
// see docs/prototype-reference.html.
//
// Unlike dungeon, nothing here needs to turn: the floor is one big flat
// plane under the whole layout regardless of its shape, and slot markers
// just read layout.slots' positions directly, so a wrap "just works"
// without this skin knowing where the turns are.
import * as THREE from 'three';

const GRID_SIZE = 400; // generous flat grid; a spiral can extend either axis
const GRID_DIVISIONS = 200;
const SLOT_MARKER_HEIGHT = 3.6;

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
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

export const matrix = {
  id: 'matrix',
  label: 'Matrix',
  bg: 0x04070a,
  fog: { color: 0x04070a, near: 10, far: 52 },
  frameColor: 0x3ad6a6,
  emptyColor: 0x02100c,
  hudAccent: '#3ad6a6',

  build(layout, root) {
    const { cx, cz } = bboxCenter(layout.slots.map((s) => s.pos));

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

    const lights = [];
    root.add(new THREE.AmbientLight(0x7fd8c0, 0.42));
    const key = new THREE.DirectionalLight(0xbdfbe6, 0.55);
    key.position.set(cx + 2, 8, cz + 2);
    root.add(key);

    for (const s of layout.slots) {
      // Slot markers hover where a dungeon would put a pilaster: just
      // outside the board, using the facing direction layout already gave
      // us to push away from the centerline.
      const outward = [-Math.sin(s.rotY), 0, -Math.cos(s.rotY)];
      const px = s.pos[0] + outward[0] * 0.4;
      const pz = s.pos[2] + outward[2] * 0.4;

      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, SLOT_MARKER_HEIGHT, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x1d6b57 })
      );
      bar.position.set(px, SLOT_MARKER_HEIGHT / 2, pz);
      root.add(bar);

      const light = new THREE.PointLight(0x3ad6a6, 5.5, 7.5, 2);
      light.position.set(s.pos[0], 2.4, s.pos[2]);
      root.add(light);
      lights.push({ l: light, base: 5.5 });
    }

    return { lights, flicker: false };
  },

  boardMat(board, texture) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.35,
      emissive: 0x0a2a22,
      emissiveIntensity: 0.5,
    });
  },

  frameMat() {
    return new THREE.MeshBasicMaterial({ color: 0x3ad6a6 });
  },
};
