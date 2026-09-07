# Gracia Token

The single-page site for **Gracia Token ($GRACIA)** on BNB Smart Chain — a
charitable-purpose token funding rehabilitation, education and reintegration
programmes for inmates.

Contract: `0x8B4E7b09c4c88fAA543945910437c831deC9A91b`

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # static output in dist/
npm run preview  # serve the built output
```

## Deploying

Cloudflare Workers, connected to this repository. `wrangler.jsonc` declares an
assets-only Worker pointed at `dist/`, so the dashboard needs only:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

The Worker name comes from `wrangler.jsonc`, not the dashboard field. `.nvmrc`
pins Node 22 — Vite 8 needs 20.19 or newer and the build image defaults lower.

`public/_headers` is copied into `dist/` by the build and is honoured by Workers
static assets, so caching rules ship with the site. Unknown paths return a real
404 rather than serving the homepage.

Everything resolves from the site root, so if the site is ever served from a
subpath, change `base` in `vite.config.js` to match.

## How it is put together

Vite, Three.js, GSAP ScrollTrigger and Lenis. Vanilla JS, plain CSS, no
framework.

```
index.html            markup and meta
src/main.js           scroll wiring, camera waypoints, UI behaviour
src/styles.css        the whole stylesheet
src/fonts.css         self-hosted @font-face declarations
src/three/scene.js    renderer, lights, post-processing, render loop
src/three/coin.js     the coin: lathed profile and struck relief
src/three/particles.js the gold dust field
src/three/environment.js the procedural studio, pre-filtered to an env map
public/images/        logo, coin art, pillars source art
public/fonts/         Cormorant Garamond and Inter, variable woff2
```

### The scene

A fixed full-viewport canvas sits behind every section.

The coin is a `LatheGeometry` revolved from a draughtsman's profile — an inner
ledge, a raised rim, two bevels and a vertical edge — with creased normals so
the bevels stay crisp while the circumference stays smooth. Its faces carry a
normal map derived with Sobel gradients from a height field drawn in canvas
(the G, the beading, the legend). That relief is not decoration: a flat metal
disc with uniform normals mirrors a single direction across its whole surface
and reads as a painted circle, and the normal map is what makes it read as
struck metal instead.

Lighting is almost entirely reflection. A small scene of emissive panels — a
champagne key, a narrow bright strip that draws the glint along the bevel, a
low gold fill, a cool rim and a green floor bounce — is rendered through
`PMREMGenerator` into an environment map. The key panel is deliberately small:
gold reads as gold because of the dark it reflects between highlights.

The dust is a single `Points` object with an additive shader. Motion, wrapping
and fading all happen in the vertex shader, so the CPU never touches a particle.

### Scroll

One GSAP timeline scrubs the camera, the coin's pose, the key light angle, the
environment rotation and an overall `glow` across the whole document. Its
keyframes are positioned at the scroll progress where each section *actually*
sits, measured from the DOM, and rebuilt whenever layout changes — sections are
nowhere near equal in height, and a keyframe half a screen out puts the coin
behind the copy instead of beside it.

On narrow viewports there is no "beside the copy", so the scene sinks the coin
below the reading band and takes light out of it rather than parking it aside.

### Performance

Nearly all traffic is phones, so:

- `devicePixelRatio` capped at 2, and at 1.75 on narrow viewports
- particle count and coin tessellation reduced on phones and low-core devices
- bloom blurred at 40–60% of output resolution; the composite is still full size
- `powerPreference: 'high-performance'`, no antialias (the composer resolves)
- the render loop stops on `visibilitychange` and on WebGL context loss
- an adaptive pass samples the first frames and sheds pixels, then bloom, if
  they run long

`prefers-reduced-motion: reduce` gets a single composed still frame. Lenis and
ScrollTrigger are dynamically imported and never load in that mode — importing
ScrollTrigger self-registers it with GSAP and keeps a `requestAnimationFrame`
loop alive for the life of the page, which is not what someone asking for no
motion should get. In that mode the page settles to zero animation frames.

If WebGL is unavailable the canvas is removed and a CSS gradient stands in.
