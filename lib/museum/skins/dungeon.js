// Dungeon skin: a closed stone rotunda. Walls, floor and ceiling fully
// enclose the ring, with a pilaster between each pair of artworks and a
// warm sconce above each one.
//
// The room's shape comes entirely from `layout.ring` and `layout.slots` —
// this skin never decides where anything hangs, only what it is made of and
// how it is lit.
import * as THREE from 'three';

const WALL_HEIGHT = 4.1;
const WALL_CLEARANCE = 0.55; // stone sits this far behind the artwork plane
const FLOOR_MARGIN = 1.2;
const RADIAL_SEGMENTS = 64;

export const dungeon = {
  id: 'dungeon',
  label: 'Dungeon',
  bg: 0x0b0a08,
  fog: { color: 0x0b0a08, near: 8, far: 34 },
  frameColor: 0xb8893c,
  emptyColor: 0x08070a,
  hudAccent: '#d4a24e',

  build(layout, root, quality) {
    const { radius } = layout;
    const wallRadius = radius + WALL_CLEARANCE;

    const stone = new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 0.94, metalness: 0.02 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b1815, roughness: 0.86, metalness: 0.05 });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(wallRadius + FLOOR_MARGIN, RADIAL_SEGMENTS), floorMat);
    floor.rotation.x = -Math.PI / 2;
    root.add(floor);

    const ceiling = new THREE.Mesh(new THREE.CircleGeometry(wallRadius + FLOOR_MARGIN, RADIAL_SEGMENTS), stone);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    root.add(ceiling);

    // Open-ended cylinder seen from the inside: the enclosing wall. A ring
    // has no far end, so unlike the old corridor there is no end cap to
    // build — the room simply closes on itself.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(wallRadius, wallRadius, WALL_HEIGHT, RADIAL_SEGMENTS, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 0.94, metalness: 0.02, side: THREE.BackSide })
    );
    wall.position.y = WALL_HEIGHT / 2;
    root.add(wall);

    // Masonry between artworks, on the half-step so a pilaster never lands
    // behind a picture.
    for (let i = 0; i < layout.n; i++) {
      const angle = (i + 0.5) * layout.step;
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.34, WALL_HEIGHT, 0.5), stone);
      pilaster.position.set(
        Math.sin(angle) * (wallRadius - 0.18),
        WALL_HEIGHT / 2,
        Math.cos(angle) * (wallRadius - 0.18)
      );
      pilaster.rotation.y = angle;
      root.add(pilaster);
    }

    // Every artwork gets a visible sconce bulb, but only a fixed pool of
    // real lights exists — they follow the visitor (see anchors). A hall lit
    // near where you stand is what a real gallery looks like, and it keeps a
    // 40-artwork room costing the same as a 4-artwork one.
    const anchors = [];
    for (const s of layout.slots) {
      const px = s.outward[0] * (radius - 0.7);
      const pz = s.outward[2] * (radius - 0.7);
      anchors.push([px, 3.0, pz]);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
      );
      bulb.position.set(px, 3.0, pz);
      root.add(bulb);
    }

    // Lit for a wide rotunda: range matters far more than brightness here,
    // since a short-range sconce leaves the stone outside its falloff and
    // the room renders as a black void with one lit picture in it.
    const lights = [];
    root.add(new THREE.AmbientLight(0x6b5637, 0.95));
    for (let i = 0; i < Math.min(quality.maxLights, anchors.length); i++) {
      const light = new THREE.PointLight(0xffb257, 22, 17, 1.6);
      light.position.set(...anchors[i]);
      root.add(light);
      lights.push({ l: light, base: 22 });
    }

    return { lights, anchors, flicker: true };
  },

  // Artwork is deliberately unlit: MeshBasicMaterial ignores every light in
  // the scene, so a photo reads exactly as shot no matter where the visitor
  // stands or how dim the hall is. The lighting is set dressing for the
  // room, never something the miniatures have to survive.
  boardMat(board, texture) {
    return new THREE.MeshBasicMaterial({ map: texture });
  },

  frameMat() {
    return new THREE.MeshStandardMaterial({ color: 0xb8893c, roughness: 0.42, metalness: 0.72 });
  },
};
