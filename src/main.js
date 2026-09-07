import 'lenis/dist/lenis.css';
import './fonts.css';
import './styles.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { createScene } from './three/scene.js';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
root.classList.remove('no-js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══════════════════════════════════════════════════════════════
   Smooth scroll
   ══════════════════════════════════════════════════════════════ */

let lenis = null;

if (!reducedMotion) {
  lenis = new Lenis({
    duration: 1.05,
    lerp: 0.1,
    smoothWheel: true,
    // Native momentum on touch is better than anything we'd fake, and it
    // costs nothing on the devices that matter most here.
    syncTouch: false,
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToTarget(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  const offset = -(document.getElementById('nav')?.offsetHeight ?? 0) - 8;

  if (lenis) lenis.scrollTo(el, { offset, duration: 1.15 });
  else el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════
   WebGL backdrop
   ══════════════════════════════════════════════════════════════ */

/**
 * Where the camera, the coin and the key light stand when the page is at each
 * section. X offsets are written for a wide screen; the scene scales them down
 * on narrow ones so the coin never crowds the copy.
 *
 * `glow` dims the studio through the reading-heavy sections and opens it back
 * up for the hero and the tokenomics — the coin is scenery, and scenery yields.
 */
const WAYPOINTS = [
  {
    at: '#hero',
    pose: { camX: 0, camY: 0, camZ: 8.1, coinX: 1.15, coinY: -1.25, coinScale: 0.94,
      rotX: -0.1, rotY: 0, rotZ: 0, light: -0.55, env: 0, glow: 1 },
  },
  {
    at: '#contract',
    pose: { camX: 0.1, camY: 0.08, camZ: 7.6, coinX: 1.6, coinY: -0.35, coinScale: 0.98,
      rotX: -0.14, rotY: 0.34, rotZ: -0.03, light: -0.1, env: 0.25, glow: 0.88 },
  },
  {
    at: '#vision',
    pose: { camX: 0.3, camY: 0.05, camZ: 7.0, coinX: -2.05, coinY: 0.45, coinScale: 1,
      rotX: -0.05, rotY: 0.68, rotZ: -0.06, light: 0.35, env: 0.6, glow: 0.6 },
  },
  {
    at: '#impact',
    pose: { camX: -0.25, camY: -0.04, camZ: 6.4, coinX: 2.15, coinY: -0.3, coinScale: 1.02,
      rotX: 0.06, rotY: 1.0, rotZ: -0.1, light: 0.85, env: 1.0, glow: 0.58 },
  },
  {
    at: '#tokenomics',
    pose: { camX: 0.2, camY: 0.1, camZ: 5.6, coinX: -2.0, coinY: 0.25, coinScale: 1.06,
      rotX: 0.14, rotY: 1.32, rotZ: -0.16, light: 1.35, env: 1.45, glow: 0.7 },
  },
  {
    at: '#community',
    pose: { camX: 0, camY: 0, camZ: 5.9, coinX: 1.25, coinY: -0.55, coinScale: 1,
      rotX: 0.05, rotY: 1.66, rotZ: -0.06, light: 1.95, env: 1.9, glow: 0.92 },
  },
];

const canvas = document.getElementById('scene');
const view = canvas ? createScene(canvas, { reducedMotion }) : null;

if (!view) {
  root.classList.add('no-webgl');
  canvas?.remove();
} else {
  const { pose } = view;

  if (reducedMotion) {
    // A single, composed still: coin three-quarters on, light already swept to
    // where it flatters the bevel most.
    Object.assign(pose, WAYPOINTS[0].pose, {
      camZ: 6.9,
      camY: 0.12,
      coinX: 1.35,
      coinY: -0.6,
      rotX: -0.16,
      rotY: 0.52,
      light: 0.25,
      env: 0.35,
    });
    view.renderOnce();
    canvas.classList.add('is-ready');
  } else {
    view.start();
    requestAnimationFrame(() => canvas.classList.add('is-ready'));

    /* ── The scrubbed camera timeline ────────────────────────────
       One scrubbed timeline across the whole document, its keyframes placed at
       the scroll progress where each section actually sits rather than at
       guessed weights — sections are nowhere near equal in height, and a
       keyframe half a screen out puts the coin behind the copy. */
    let flight = null;

    const scrollMax = () =>
      Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);

    function progressOf(selector, index, count) {
      if (index === 0) return 0;
      if (index === count - 1) return 1;

      const el = document.querySelector(selector);
      if (!el) return index / (count - 1);

      const rect = el.getBoundingClientRect();
      const centre = rect.top + window.scrollY + rect.height / 2 - window.innerHeight / 2;
      return gsap.utils.clamp(0, 1, centre / scrollMax());
    }

    function buildFlight() {
      flight?.scrollTrigger?.kill();
      flight?.kill();

      const marks = WAYPOINTS.map((w, i) => progressOf(w.at, i, WAYPOINTS.length));

      // Keep the marks strictly increasing; a zero-length tween would stall the
      // scrub on very short viewports.
      for (let i = 1; i < marks.length; i++) {
        marks[i] = Math.max(marks[i], marks[i - 1] + 0.02);
      }
      const span = marks[marks.length - 1];

      Object.assign(pose, WAYPOINTS[0].pose);

      flight = gsap.timeline({
        defaults: { ease: 'sine.inOut' },
        scrollTrigger: {
          trigger: document.body,
          start: 0,
          end: 'max',
          scrub: 1.1,
        },
      });

      for (let i = 1; i < WAYPOINTS.length; i++) {
        const from = marks[i - 1] / span;
        const to = marks[i] / span;
        flight.to(pose, { ...WAYPOINTS[i].pose, duration: to - from }, from);
      }
    }

    buildFlight();
    view.rebuild = buildFlight;
  }

  const onResize = () => {
    view.resize();
    if (reducedMotion) view.renderOnce();
  };

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      onResize();
      view.rebuild?.();
      ScrollTrigger.refresh();
    }, 140);
  });
  window.addEventListener('orientationchange', onResize);
}

/* ══════════════════════════════════════════════════════════════
   Reveals
   ══════════════════════════════════════════════════════════════ */

const revealables = gsap.utils.toArray('[data-reveal]');

if (reducedMotion) {
  revealables.forEach((el) => el.classList.add('is-revealed'));
} else {
  revealables.forEach((el) => {
    const stagger = Number(el.dataset.stagger || 0);
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.95,
      delay: stagger * 0.11,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onComplete: () => el.classList.add('is-revealed'),
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   Distribution bars
   ══════════════════════════════════════════════════════════════ */

const format = (n) => (Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`);

function setBar(bar, ratio) {
  const value = Number(bar.dataset.value);
  const fill = bar.querySelector('.bar__fill');
  const pct = bar.querySelector('.bar__pct');
  fill.style.width = `${value * ratio}%`;
  pct.textContent = format(value * ratio);
}

const bars = gsap.utils.toArray('#bars .bar');

bars.forEach((bar) => {
  const value = Number(bar.dataset.value);
  const track = bar.querySelector('.bar__track');
  const name = bar.querySelector('.bar__name').textContent.trim();

  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `${name}: ${format(value)} of total supply`);

  if (reducedMotion) {
    setBar(bar, 1);
    return;
  }

  const counter = { ratio: 0 };
  gsap.to(counter, {
    ratio: 1,
    duration: 1.6,
    ease: 'power2.out',
    onUpdate: () => setBar(bar, counter.ratio),
    scrollTrigger: { trigger: bar, start: 'top 90%', once: true },
  });
});

/* ══════════════════════════════════════════════════════════════
   Contract address
   ══════════════════════════════════════════════════════════════ */

const addressEl = document.getElementById('contract-address');
const copyBtn = document.getElementById('copy-btn');
const copyLabel = document.getElementById('copy-label');
const copyStatus = document.getElementById('copy-status');

if (addressEl) {
  const full = addressEl.textContent.trim();
  addressEl.dataset.full = full;
  addressEl.setAttribute('title', full);

  const fit = () => {
    // Below ~420px even 12px monospace can't hold 42 characters, so show the
    // ends — the parts anyone actually eyeballs — and keep the full string in
    // the clipboard, the title and the copy button.
    if (window.innerWidth < 420) {
      addressEl.textContent = `${full.slice(0, 12)}…${full.slice(-10)}`;
      addressEl.classList.add('is-truncated');
    } else {
      addressEl.textContent = full;
      addressEl.classList.remove('is-truncated');
    }
  };

  fit();

  let fitTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fit, 120);
  });
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(scratch);
  scratch.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  scratch.remove();
  return ok;
}

if (copyBtn) {
  let resetTimer = 0;

  copyBtn.addEventListener('click', async () => {
    const ok = await writeClipboard(copyBtn.dataset.copy);

    copyLabel.textContent = ok ? 'Copied' : 'Press ⌘C';
    copyBtn.classList.toggle('is-copied', ok);
    copyStatus.textContent = ok
      ? 'Contract address copied to clipboard'
      : 'Copy failed — select the address and copy it manually';

    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      copyLabel.textContent = 'Copy';
      copyBtn.classList.remove('is-copied');
      copyStatus.textContent = '';
    }, 2000);
  });
}

/* ══════════════════════════════════════════════════════════════
   Nav
   ══════════════════════════════════════════════════════════════ */

const nav = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

function closeMenu() {
  navLinks?.classList.remove('is-open');
  navToggle?.setAttribute('aria-expanded', 'false');
  navToggle?.setAttribute('aria-label', 'Open menu');
}

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks.classList.contains('is-open')) {
      closeMenu();
      navToggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!navLinks.classList.contains('is-open')) return;
    if (nav.contains(event.target)) return;
    closeMenu();
  });
}

// In-page anchors go through Lenis so the smooth scroll stays consistent.
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  const href = link.getAttribute('href');
  if (!href || href === '#') return;

  link.addEventListener('click', (event) => {
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    closeMenu();
    scrollToTarget(target);
    // Keep the keyboard where the eye went.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

if (nav) {
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ══════════════════════════════════════════════════════════════
   Misc
   ══════════════════════════════════════════════════════════════ */

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Late-loading webfonts change text metrics, which moves every trigger.
function relayout() {
  view?.rebuild?.();
  ScrollTrigger.refresh();
}

if (document.fonts?.ready) {
  document.fonts.ready.then(relayout);
}

window.addEventListener('load', relayout);
