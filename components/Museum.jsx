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
import { getQuality } from '../lib/museum/quality.js';

// Board planes more than this many facing-pairs from the active one stay
// untextured — a slot a couple of pairs away won't be crisp on screen
// anyway, and it keeps a big room from loading every photo on entry.
const TEXTURE_LOAD_RADIUS = 3;
// Textures are dropped only well outside the radius that loads them. With a
// single threshold, a board sitting exactly on the boundary loads and unloads
// as the camera glides, which reads as a picture flickering into something
// else mid-transition.
const TEXTURE_KEEP_RADIUS = 6;
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

// Skins build a fixed pool of lights plus an anchor per slot. Each frame the
// pool is reassigned to the anchors nearest the camera, so a room of any size
// costs the same to light and the visitor always stands in the lit part of it.
// The pool's SIZE never changes: three.js recompiles every material when the
// light count changes, which stalls visibly.
const anchorScratch = [];
function moveLightsToNearestAnchors(world) {
  const rig = world.lightRig;
  const anchors = rig?.anchors;
  if (!rig?.lights?.length || !anchors?.length) return;
  if (anchors.length <= rig.lights.length) return; // pool already covers every slot

  const cam = world.camera.position;
  anchorScratch.length = 0;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    anchorScratch.push({ a, d: (cam.x - a[0]) ** 2 + (cam.z - a[2]) ** 2 });
  }
  anchorScratch.sort((p, q) => p.d - q.d);
  for (let i = 0; i < rig.lights.length; i++) {
    const a = anchorScratch[i].a;
    rig.lights[i].l.position.set(a[0], a[1], a[2]);
  }
}

function buildRoom(world, layoutResult, skin, quality) {
  disposeRoom(world);
  world.root = new THREE.Group();
  world.scene.add(world.root);
  world.scene.background = new THREE.Color(skin.bg);
  world.scene.fog = new THREE.Fog(skin.fog.color, skin.fog.near, skin.fog.far);

  world.lightRig = skin.build(layoutResult, world.root, quality);

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
    const distance = Math.abs(pairIndex - active);
    const inRange = distance <= TEXTURE_LOAD_RADIUS;
    const keep = distance <= TEXTURE_KEEP_RADIUS;

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
    } else if (!keep && b.loaded) {
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
  // Double-tap/double-click opens the full-resolution photo over the canvas.
  // The 3D board carries a downscaled texture on purpose; this is how a
  // visitor actually inspects brushwork.
  const [zoom, setZoom] = useState(undefined);
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

  function stepRoom(dir) {
    const i = rooms.findIndex((r) => r.slug === roomSlug);
    const next = ((i + dir) % rooms.length + rooms.length) % rooms.length;
    setRoomSlug(rooms[next].slug);
  }

  function exitMuseum() {
    router.push('/');
  }

  // The museum covers the viewport, so the page behind it must not scroll
  // under the canvas while a drag-to-look gesture is in progress.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc backs out one level: it closes an open card (handled by the rail
  // controls), and otherwise leaves the museum entirely. Without this a
  // full-viewport canvas has no keyboard escape at all.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (zoom !== undefined) {
        setZoom(undefined);
        return;
      }
      if (card !== undefined) return;
      if (e.target?.closest && e.target.closest('input, textarea, select')) return;
      exitMuseum();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, zoom]);

  // Hold space to zoom, release to drop back. Double-tap is the deliberate,
  // stay-open way in; this is the quick look — press, inspect the brushwork,
  // let go, keep moving. Rail only: walk mode has no notion of a current
  // piece, since the visitor points the camera themselves.
  useEffect(() => {
    if (moveId !== 'rail') return undefined;
    function onDown(e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.repeat) return; // holding must not re-fire every frame
      if (e.target?.closest && e.target.closest('input, textarea, select, button')) return;
      e.preventDefault(); // space would otherwise scroll the page behind
      const world = worldRef.current;
      const slot = world?.layoutResult?.slots?.[world.controls?.getCursor?.() ?? 0];
      if (slot?.board) setZoom(slot);
    }
    function onUp(e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      setZoom(undefined);
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [moveId]);

  // Renderer + scene: created once WebGL is confirmed available, torn
  // down on unmount. Room/skin/control changes below reuse this world.
  useEffect(() => {
    if (webglOK !== true) return;
    const mount = mountRef.current;
    const quality = getQuality();
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
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
      quality,
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
        // A skin may animate itself (matrix's glyph rain and color cycle).
        // It gets the scene so it can drive fog and background too, which
        // aren't reachable from the root group it built into.
        world.lightRig?.update?.(dt, now / 1000, world.scene);
        moveLightsToNearestAnchors(world);
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
      buildRoom(world, layoutResult, skin, world.quality ?? getQuality());
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
            onZoom: (slot) => setZoom(slot),
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
        <div className="museum-brand">
          <button className="museum-exit" onClick={exitMuseum} aria-label={t('museum_exit')}>
            <span aria-hidden="true">←</span> {t('museum_exit')}
          </button>
        </div>
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
              {/* A stepper, not one button per room: room names are long and a
                  segmented control grew wider with every room added until it
                  crowded the view. This stays one fixed size however many
                  rooms exist, and wraps at both ends like the rail does. */}
              <div className="museum-seg museum-stepper">
                <button onClick={() => stepRoom(-1)} aria-label={t('museum_room_prev')}>
                  &#8249;
                </button>
                <span className="museum-stepper-value">{rooms.find((r) => r.slug === roomSlug)?.name}</span>
                <button onClick={() => stepRoom(1)} aria-label={t('museum_room_next')}>
                  &#8250;
                </button>
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
          <button className="museum-arrow" onClick={goPrev} aria-label={t('museum_prev')}>
            ‹
          </button>
          <span className="museum-pos">
            {cursorPos + 1} / {hud.n}
          </span>
          <button className="museum-arrow" onClick={goNext} aria-label={t('museum_next')}>
            ›
          </button>
        </div>
      )}

      <div className="museum-hud museum-hint">
        {moveId === 'walk' ? t('museum_hint_walk') : narrow ? t('museum_hint_mobile') : t('museum_hint_desktop')}
      </div>

      {zonesVisible && moveId === 'rail' && (
        <div className="museum-tap-zones" aria-hidden="true">
          <div className="museum-tap-zone left" />
          <div className="museum-tap-zone center" />
          <div className="museum-tap-zone right" />
        </div>
      )}

      {zoom !== undefined && (
        <div className="museum-zoom" role="dialog" aria-modal="true" onClick={() => setZoom(undefined)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset(zoom.board.src)} alt={zoom.board.miniName} />
          <div className="museum-zoom-bar">
            <span>{zoom.board.miniName}</span>
            <button onClick={() => setZoom(undefined)} aria-label={t('close')}>
              {t('close')}
            </button>
          </div>
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
