'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { useLang } from '../lib/i18n.jsx';
import { asset } from '../lib/data.js';
import { layout as buildLayout } from '../lib/museum/layout.js';
import { skins, defaultSkinId } from '../lib/museum/skins/index.js';
import { createRailControls } from '../lib/museum/controls/rail.js';
import { createWalkControls, WALK_MIN_VIEWPORT_WIDTH } from '../lib/museum/controls/walk.js';

// Board planes more than this many facing-pairs from the active one stay
// untextured — a slot a couple of pairs away won't be crisp on screen
// anyway, and it keeps a big room from loading every photo on entry.
const TEXTURE_LOAD_RADIUS = 2;
const BOARD_HEIGHT = 1.45;

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function disposeMaterial(mat) {
  if (!mat) return;
  mat.map?.dispose();
  mat.dispose();
}

// Tears down everything under world.root (shell geometry from the skin,
// plus every board/frame mesh and its material/texture) and swaps in a
// fresh empty root. Runs on every room or skin change — skipping this is
// exactly the leak the prototype has and the spec calls out.
function disposeRoom(world) {
  if (!world.root) return;
  world.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
  });
  world.scene.remove(world.root);
  world.boards = [];
}

function buildRoom(world, layoutResult, skin) {
  disposeRoom(world);
  world.root = new THREE.Group();
  world.scene.add(world.root);
  world.scene.background = new THREE.Color(skin.bg);
  world.scene.fog = new THREE.Fog(skin.fog.color, skin.fog.near, skin.fog.far);

  world.lightRig = skin.build(layoutResult, world.root);

  for (const slot of layoutResult.slots) {
    const group = new THREE.Group();
    group.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    group.rotation.y = slot.rotY;

    if (slot.board) {
      const w = BOARD_HEIGHT * slot.board.ar;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, BOARD_HEIGHT + 0.16, 0.07), skin.frameMat());
      frame.position.z = -0.02;
      group.add(frame);

      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(w, BOARD_HEIGHT),
        new THREE.MeshStandardMaterial({ color: skin.emptyColor, roughness: 0.95 })
      );
      art.position.z = 0.03;
      group.add(art);

      world.boards.push({ mesh: art, frame, slot, loaded: false, loading: false, texture: null });
    } else {
      // Padding: fewer boards than MIN_SLOTS holds an empty black board.
      const empty = new THREE.Mesh(
        new THREE.BoxGeometry(1.1 + 0.16, BOARD_HEIGHT + 0.16, 0.07),
        new THREE.MeshStandardMaterial({ color: skin.emptyColor, roughness: 0.95 })
      );
      group.add(empty);
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(1.1 + 0.18, BOARD_HEIGHT + 0.18, 0.05),
        new THREE.MeshBasicMaterial({ color: skin.frameColor, wireframe: true, transparent: true, opacity: 0.18 })
      );
      group.add(edge);
      world.boards.push({ mesh: empty, frame: null, slot, loaded: true, loading: false, texture: null });
    }
    world.root.add(group);
  }
}

// Which facing pair the active view is nearest — rail's own cursor when
// on the rail, or the nearest slot to the camera when walking freely.
function activePairIndex(world, moveId, layoutResult) {
  if (moveId === 'rail') return Math.floor(world.controls.getCursor() / 2);
  let best = 0;
  let bestD = Infinity;
  for (const slot of layoutResult.slots) {
    const d = Math.hypot(world.camera.position.x - slot.pos[0], world.camera.position.z - slot.pos[2]);
    if (d < bestD) {
      bestD = d;
      best = Math.floor(slot.i / 2);
    }
  }
  return best;
}

function updateTextures(world, skin, moveId, layoutResult) {
  const active = activePairIndex(world, moveId, layoutResult);
  for (const b of world.boards) {
    if (!b.slot.board) continue; // padding boards never get a texture
    const pairIndex = Math.floor(b.slot.i / 2);
    const inRange = Math.abs(pairIndex - active) <= TEXTURE_LOAD_RADIUS;

    if (inRange && !b.loaded && !b.loading) {
      b.loading = true;
      const url = asset(b.slot.board.board ?? b.slot.board.src);
      world.textureLoader.load(url, (tex) => {
        b.loading = false;
        if (world.disposed || !world.boards.includes(b)) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        disposeMaterial(b.mesh.material);
        b.mesh.material = skin.boardMat(b.slot.board, tex);
        b.texture = tex;
        b.loaded = true;
      });
    } else if (!inRange && b.loaded) {
      b.texture?.dispose();
      disposeMaterial(b.mesh.material);
      b.mesh.material = new THREE.MeshStandardMaterial({ color: skin.emptyColor, roughness: 0.95 });
      b.loaded = false;
      b.texture = null;
    }
  }
}

export default function Museum({ rooms, boardsByRoom, initialRoomSlug }) {
  const { t } = useLang();
  const router = useRouter();
  const mountRef = useRef(null);
  const worldRef = useRef(null);
  const prevRef = useRef({ roomSlug: null, skinId: null });
  const cursorRef = useRef(0);

  const [webglOK, setWebglOK] = useState(null);
  const [roomSlug, setRoomSlug] = useState(initialRoomSlug ?? rooms[0]?.slug ?? null);
  const [skinId, setSkinId] = useState(defaultSkinId);
  const [moveId, setMoveId] = useState('rail');
  const [narrow, setNarrow] = useState(false);
  const [card, setCard] = useState(undefined); // undefined = closed, slot object = open
  const [zonesVisible, setZonesVisible] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [hud, setHud] = useState({ n: 0, boardCount: 0, miniCount: 0, roomName: '' });

  useEffect(() => {
    setWebglOK(hasWebGL());
  }, []);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < WALK_MIN_VIEWPORT_WIDTH);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A viewport shrunk below the walk breakpoint mid-session shouldn't
  // strand the player in a mode whose toggle just disappeared.
  useEffect(() => {
    if (narrow && moveId === 'walk') setMoveId('rail');
  }, [narrow, moveId]);

  // Renderer + scene: created once WebGL is confirmed available, torn
  // down on unmount. Room/skin/control changes below reuse this world.
  useEffect(() => {
    if (webglOK !== true) return;
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 300);
    const world = {
      renderer,
      scene,
      camera,
      root: new THREE.Group(),
      boards: [],
      controls: null,
      lightRig: null,
      layoutResult: null,
      skin: null,
      textureLoader: new THREE.TextureLoader(),
      raf: null,
      last: performance.now(),
      disposed: false,
      built: false,
    };
    scene.add(world.root);
    worldRef.current = world;

    function resize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / (h || 1);
      camera.fov = w < 640 ? 68 : 58;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    function frame(now) {
      if (world.disposed) return;
      const dt = Math.min(0.05, (now - world.last) / 1000);
      world.last = now;
      world.controls?.update(dt);
      if (world.skin && world.layoutResult) {
        updateTextures(world, world.skin, world.moveId ?? 'rail', world.layoutResult);
        if (world.lightRig?.flicker) {
          const tt = now * 0.004;
          world.lightRig.lights.forEach((o, i) => {
            o.l.intensity = o.base * (0.86 + Math.sin(tt + i * 2.1) * 0.05 + Math.sin(tt * 2.7 + i) * 0.055);
          });
        }
      }
      if (world.moveId === 'rail' && world.controls) {
        const c = world.controls.getCursor();
        if (c !== cursorRef.current) {
          cursorRef.current = c;
          setCursorPos(c);
        }
      }
      renderer.render(scene, camera);
      world.raf = requestAnimationFrame(frame);
    }
    world.raf = requestAnimationFrame(frame);

    return () => {
      world.disposed = true;
      cancelAnimationFrame(world.raf);
      window.removeEventListener('resize', resize);
      world.controls?.dispose();
      disposeRoom(world);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      worldRef.current = null;
    };
  }, [webglOK]);

  // Room/skin/mode changes reuse the same renderer. A room or skin change
  // rebuilds the shell + boards (skin swaps materials/lights only — the
  // slot positions come from the same layout(), so they never move); a
  // pure move-mode change only swaps the controller, keeping every mesh.
  useEffect(() => {
    if (webglOK !== true) return;
    const world = worldRef.current;
    if (!world || !roomSlug) return;

    const boards = boardsByRoom[roomSlug] ?? [];
    const layoutResult = buildLayout(boards);
    const skin = skins[skinId];
    const room = rooms.find((r) => r.slug === roomSlug);

    const needsRebuild = !world.built || prevRef.current.roomSlug !== roomSlug || prevRef.current.skinId !== skinId;
    const prevPose = world.controls?.getPose?.();
    world.controls?.dispose();

    if (needsRebuild) {
      buildRoom(world, layoutResult, skin);
      world.built = true;
    }
    world.layoutResult = layoutResult;
    world.skin = skin;
    world.moveId = moveId;

    const canvas = world.renderer.domElement;
    const controls =
      moveId === 'walk'
        ? createWalkControls({ camera: world.camera, canvas, layout: layoutResult })
        : createRailControls({
            camera: world.camera,
            canvas,
            layout: layoutResult,
            onOpenCard: (slot) => setCard(slot),
            onCloseCard: () => setCard(undefined),
            onTapZonesVisible: setZonesVisible,
          });
    if (moveId === 'rail') controls.setPickables(world.boards.map((b) => ({ mesh: b.mesh, slot: b.slot })));
    if (prevPose) controls.adoptPose(prevPose);
    world.controls = controls;
    cursorRef.current = moveId === 'rail' ? controls.getCursor() : 0;
    setCursorPos(cursorRef.current);

    setCard(undefined);
    setHud({ n: layoutResult.n, boardCount: boards.length, miniCount: room?.miniCount ?? 0, roomName: room?.name ?? '' });

    prevRef.current = { roomSlug, skinId };

    return () => {
      controls.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug, skinId, moveId, webglOK]);

  if (webglOK === false) {
    return (
      <div className="museum-fallback">
        <Link href={`/rooms/${roomSlug}/`}>{t('museum_no_webgl')}</Link>
      </div>
    );
  }

  if (webglOK !== true) {
    return <div className="museum-loading">{t('museum_loading')}</div>;
  }

  const goPrev = () => worldRef.current?.controls?.setCursor(cursorPos - 1);
  const goNext = () => worldRef.current?.controls?.setCursor(cursorPos + 1);

  return (
    <div className="museum" data-skin={skinId}>
      <div className="museum-stage" ref={mountRef} />

      <div className="museum-hud museum-top">
        <div className="museum-brand">{t('museum_title')}</div>
        <div className="museum-controls">
          <div className="museum-row">
            <span className="museum-ctrl-label">{t('museum_skin')}</span>
            <div className="museum-seg">
              {Object.values(skins).map((s) => (
                <button key={s.id} aria-pressed={skinId === s.id} onClick={() => setSkinId(s.id)}>
                  {t(`museum_skin_${s.id}`)}
                </button>
              ))}
            </div>
          </div>
          {!narrow && (
            <div className="museum-row">
              <span className="museum-ctrl-label">{t('museum_move')}</span>
              <div className="museum-seg">
                <button aria-pressed={moveId === 'rail'} onClick={() => setMoveId('rail')}>
                  {t('museum_move_rail')}
                </button>
                <button aria-pressed={moveId === 'walk'} onClick={() => setMoveId('walk')}>
                  {t('museum_move_walk')}
                </button>
              </div>
            </div>
          )}
          {rooms.length > 1 && (
            <div className="museum-row">
              <span className="museum-ctrl-label">{t('museum_room')}</span>
              <div className="museum-seg">
                {rooms.map((r) => (
                  <button key={r.slug} aria-pressed={roomSlug === r.slug} onClick={() => setRoomSlug(r.slug)}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="museum-hud museum-plaque">
        <div className="museum-plaque-name">{hud.roomName}</div>
        <div className="museum-plaque-meta">
          {hud.boardCount} {t('museum_images')} · {hud.miniCount} {hud.miniCount === 1 ? t('piece') : t('pieces')}
        </div>
      </div>

      {moveId === 'rail' && (
        <div className="museum-hud museum-rail">
          <button className="museum-arrow" onClick={goPrev} aria-label="Previous">
            ‹
          </button>
          <span className="museum-pos">
            {cursorPos + 1} / {hud.n}
          </span>
          <button className="museum-arrow" onClick={goNext} aria-label="Next">
            ›
          </button>
        </div>
      )}

      {moveId === 'rail' && (
        <div className="museum-hud museum-hint">{narrow ? t('museum_hint_mobile') : t('museum_hint_desktop')}</div>
      )}

      {zonesVisible && moveId === 'rail' && (
        <div className="museum-tap-zones" aria-hidden="true">
          <div className="museum-tap-zone left" />
          <div className="museum-tap-zone center" />
          <div className="museum-tap-zone right" />
        </div>
      )}

      {card !== undefined && (
        <div className="museum-card open" role="dialog" aria-modal="true">
          <button className="museum-card-close" onClick={() => setCard(undefined)} aria-label={t('close')}>
            ×
          </button>
          {card?.board ? (
            <>
              <div
                className="museum-card-swatch"
                style={{ backgroundImage: `url(${asset(card.board.board ?? card.board.src)})` }}
              />
              <div className="museum-card-body">
                <h3>{card.board.miniName}</h3>
                <button className="cta" onClick={() => router.push(`/minis/${card.board.miniSlug}/`)}>
                  {t('museum_open_detail')}
                </button>
              </div>
            </>
          ) : (
            <div className="museum-card-body">
              <h3>{t('museum_empty_board')}</h3>
              <p>{t('museum_empty_board_note')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
