import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { createGoldEnvironment } from './environment.js';
import { createCoin } from './coin.js';
import { createDust } from './particles.js';

const FOV = 40;

/**
 * The pose the scroll timeline writes into. Everything the camera, the coin
 * and the key light do across the page is a tween on these numbers; the render
 * loop only reads them and adds idle motion on top.
 */
export function createPose() {
  return {
    camX: 0,
    camY: 0,
    camZ: 8.1,
    coinX: 1.15,
    coinY: -1.25,
    coinZ: 0,
    coinScale: 0.94,
    rotX: -0.1,
    rotY: 0,
    rotZ: 0,
    light: -0.55,
    env: 0,
    glow: 1,
  };
}

function deviceProfile() {
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const modest = narrow || cores <= 4 || memory <= 4;

  return {
    narrow,
    modest,
    // Cap DPR at 2 everywhere; hold phones a touch lower — the coin is smooth
    // and the dust is soft, so nothing here is aliasing-sensitive.
    maxPixelRatio: narrow ? 1.75 : 2,
    dustCount: narrow ? 1100 : modest ? 1700 : 2600,
    segments: modest ? 96 : 144,
    bloomScale: narrow ? 0.4 : 0.6,
  };
}

export function createScene(canvas, { reducedMotion = false } = {}) {
  const profile = deviceProfile();

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false, // the composer resolves through its own targets
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x070a08, 1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.76;

  const scene = new Scene();
  scene.background = new Color(0x070a08);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, 7.4);

  // ── Content ───────────────────────────────────────────────
  const envMap = createGoldEnvironment(renderer);
  scene.environment = envMap;
  scene.environmentIntensity = 1.0;
  scene.environmentRotation = new Euler(0, 0, 0);

  const coin = createCoin({ segments: profile.segments });
  scene.add(coin.root);

  const dust = createDust({ count: profile.dustCount });
  scene.add(dust.points);

  // ── Light ─────────────────────────────────────────────────
  const key = new DirectionalLight(0xffe7bd, 1.5);
  key.position.set(4, 3, 6);
  scene.add(key);

  const rim = new DirectionalLight(0xbfd6c6, 0.6);
  rim.position.set(-5, 1.5, -4);
  scene.add(rim);

  const ambient = new HemisphereLight(0x16241b, 0x000000, 0.22);
  scene.add(ambient);

  // ── Post ──────────────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Subtle: the highlights should bleed, not the whole coin.
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.26, 0.42, 0.88);
  // Blur at a fraction of the output resolution. The composite still lands at
  // full size, so this is nearly free quality-wise and very much not free
  // perf-wise on a phone.
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) =>
    bloomSetSize(Math.max(2, Math.round(w * profile.bloomScale)), Math.max(2, Math.round(h * profile.bloomScale)));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ── State ─────────────────────────────────────────────────
  const pose = createPose();
  const target = new Vector3();

  let pixelRatio = 1;
  let width = 1;
  let height = 1;
  let frameScale = 1;
  let spread = 1;
  let bloomEnabled = true;
  let running = false;
  let rafId = 0;
  let elapsed = 0;
  let lost = false;

  function applyPixelRatio(value) {
    pixelRatio = value;
    renderer.setPixelRatio(value);
    composer.setPixelRatio(value);
    dust.setProjection(height * value, FOV);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;

    const aspect = width / Math.max(height, 1);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // Vertical FOV is fixed, so a portrait phone sees a far narrower slice of
    // the world. Ease the camera back rather than let the coin swallow the
    // screen behind the copy.
    frameScale = MathUtils.clamp(1.8 - aspect * 0.47, 0.9, 1.8);

    // How far the coin may wander off-axis. A wide screen has room to park it
    // beside the copy; a phone does not, so there it stays close to centre and
    // simply sits further back.
    spread = MathUtils.clamp(aspect * 0.95, 0.42, 1.5);

    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    applyPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
  }

  function frame(dt) {
    elapsed += dt;

    const coinX = pose.coinX * spread;

    // Camera — the scrubbed pose, eased back on narrow screens. It aims at a
    // near-fixed point rather than at the coin: if the look-at followed the
    // coin it would cancel out every offset and pin it to the middle of the
    // screen, which is exactly where the copy lives.
    camera.position.set(pose.camX * spread, pose.camY, pose.camZ * frameScale);
    target.set(pose.camX * spread * 0.25, pose.camY * 0.3, 0);
    camera.lookAt(target);

    // Coin — scroll pose plus a slow breath, and an idle turn about its own
    // face so the relief never sits perfectly still.
    coin.root.position.set(coinX, pose.coinY, pose.coinZ);
    coin.root.rotation.x = pose.rotX + Math.sin(elapsed * 0.23) * 0.035;
    coin.root.rotation.y = pose.rotY + Math.sin(elapsed * 0.17) * 0.05;
    coin.root.rotation.z = pose.rotZ;
    coin.root.scale.setScalar(pose.coinScale);
    coin.spin.rotation.y = elapsed * 0.075;

    // Key light sweeps around the coin as the page advances.
    const a = pose.light;
    key.position.set(Math.cos(a) * 5.5, 2.2 + Math.sin(a * 0.85) * 2.4, Math.sin(a) * 3.2 + 4.2);
    key.intensity = (1.35 + Math.sin(a * 1.4) * 0.35) * pose.glow;

    // ...and the whole studio turns with it, so the reflections travel too.
    scene.environmentRotation.y = pose.env;
    scene.environmentIntensity = pose.glow;

    dust.update(elapsed);

    if (bloomEnabled) composer.render();
    else renderer.render(scene, camera);
  }

  // ── Adaptive quality ──────────────────────────────────────
  // Sample the first stretch of real frames. If the device is struggling,
  // shed pixels first and bloom second rather than dropping frames.
  let samples = 0;
  let accum = 0;
  let degraded = 0;

  function measure(dt) {
    if (degraded >= 2 || dt <= 0 || dt > 0.5) return;
    accum += dt;
    samples += 1;
    if (samples < 70) return;

    const avg = accum / samples;
    samples = 0;
    accum = 0;

    if (avg > 0.021) {
      if (degraded === 0) {
        applyPixelRatio(Math.min(pixelRatio, 1.25));
      } else {
        bloomEnabled = false;
      }
      degraded += 1;
    } else {
      degraded = 2; // healthy — stop watching
    }
  }

  let last = 0;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    measure(dt);
    frame(dt);
  }

  function start() {
    if (running || lost) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function renderOnce() {
    frame(0);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else if (!reducedMotion) start();
  }

  function onContextLost(event) {
    event.preventDefault();
    lost = true;
    stop();
  }

  function onContextRestored() {
    lost = false;
    resize();
    if (!reducedMotion) start();
    else renderOnce();
  }

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  document.addEventListener('visibilitychange', onVisibility);

  resize();

  return {
    pose,
    profile,
    camera,
    resize,
    start,
    stop,
    renderOnce,
    dispose() {
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      coin.dispose();
      dust.dispose();
      envMap.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
