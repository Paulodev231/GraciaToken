import {
  CanvasTexture,
  CircleGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Vector2,
} from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OUTER = 1.0; // outer radius
const FACE_R = 0.735; // radius of the flat struck face
const FACE_Y = 0.085; // face plane height

/**
 * The coin's silhouette, revolved around Y.
 *
 * Read `half` as a draughtsman's section of the upper surface: out along the
 * inner ledge, up over the raised rim, then two bevels down to the vertical
 * edge. The full profile runs inner-bottom → outer edge → inner-top, which is
 * the winding LatheGeometry needs for outward-facing normals.
 */
function profile() {
  const half = [
    [FACE_R, FACE_Y],
    [0.792, FACE_Y],
    [0.822, 0.106], // rise onto the rim
    [0.9, 0.108], // rim table
    [0.934, 0.09],
    [0.972, 0.071], // first bevel
    [0.996, 0.046], // second bevel
    [OUTER, 0.034],
  ];

  const bottom = half.map(([x, y]) => new Vector2(x, -y));
  const top = half.map(([x, y]) => new Vector2(x, y)).reverse();

  return [...bottom, ...top];
}

/**
 * The struck relief: a serif G, a beaded inner ring and the legend running
 * around the border, drawn as a height field where brighter means higher.
 */
function emblemHeight(S) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const c = S / 2;

  ctx.fillStyle = '#808080'; // neutral = the base surface
  ctx.fillRect(0, 0, S, S);

  // Everything below is struck into a soft die, not cut with a scalpel.
  ctx.filter = 'blur(2px)';

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Border rings
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, S * 0.462, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(c, c, S * 0.318, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c, c, S * 0.302, 0, Math.PI * 2);
  ctx.stroke();

  // Beading between the rings
  ctx.fillStyle = '#dcdcdc';
  const beads = 72;
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * Math.PI * 2;
    const r = S * 0.392;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legend around the border
  const legend = (text, radius, startAngle, sweep, size) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#efefef';
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    const step = sweep / Math.max(chars.length - 1, 1);
    chars.forEach((ch, i) => {
      const a = startAngle + step * i;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -radius);
      if (sweep < 0) ctx.rotate(Math.PI);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  };

  legend('GRACIA TOKEN', S * 0.362, -0.86, 1.72, 34);
  legend('GRACE MEETS GAIN', S * 0.362, Math.PI - 1.04, -2.08, 26);

  // The G
  ctx.fillStyle = '#f4f4f4';
  ctx.font = `700 ${S * 0.44}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', c, c + S * 0.02);

  // Two small stars flanking it
  ctx.fillStyle = '#e0e0e0';
  const star = (x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.34;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(c - S * 0.235, c, 9);
  star(c + S * 0.235, c, 9);

  ctx.filter = 'none';
  return ctx.getImageData(0, 0, S, S);
}

/**
 * Turn that height field into a tangent-space normal map.
 *
 * A bump map would do in principle, but its shader takes the raw screen-space
 * derivative of the texture, and on a mirror-metal face every hard edge in the
 * artwork explodes into noise — the coin comes out milky. Sobel gradients over
 * a blurred height give smooth, controllable normals instead, which is what
 * makes a flat disc read as struck metal rather than a painted circle.
 */
function emblemNormalMap(strength = 2.6) {
  const S = 512;
  const height = emblemHeight(S);
  const src = height.data;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(S, S);
  const dst = out.data;

  // Luminance is uniform across RGB here, so the red channel is the height.
  const at = (x, y) => {
    const cx = x < 0 ? 0 : x > S - 1 ? S - 1 : x;
    const cy = y < 0 ? 0 : y > S - 1 ? S - 1 : y;
    return src[(cy * S + cx) * 4] / 255;
  };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);

      const nx = dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);

      const i = (y * S + x) * 4;
      dst[i] = ((nx / len) * 0.5 + 0.5) * 255;
      dst[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      dst[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      dst[i + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createCoin({ segments = 128 } = {}) {
  const body = toCreasedNormals(new LatheGeometry(profile(), segments), 0.42);

  const gold = new MeshStandardMaterial({
    color: 0xcf9f33,
    metalness: 1.0,
    roughness: 0.155,
    envMapIntensity: 1.0,
  });

  const emblem = emblemNormalMap();
  const faceGold = new MeshStandardMaterial({
    color: 0xcf9f33,
    metalness: 1.0,
    roughness: 0.19,
    envMapIntensity: 0.95,
    normalMap: emblem,
    normalScale: new Vector2(0.85, 0.85),
  });

  const faceGeometry = new CircleGeometry(FACE_R, segments);

  const bodyMesh = new Mesh(body, gold);

  const front = new Mesh(faceGeometry, faceGold);
  front.rotation.x = -Math.PI / 2;
  front.position.y = FACE_Y;

  const back = new Mesh(faceGeometry, faceGold);
  back.rotation.x = Math.PI / 2;
  back.position.y = -FACE_Y;

  // Lay the coin over so its faces look down +Z. Euler XYZ applies Y before X,
  // so `spin.rotation.y` still turns the coin about its own normal — idle spin
  // stays independent of the scroll pose held on the parent group.
  const spin = new Group();
  spin.add(bodyMesh, front, back);
  spin.rotation.x = Math.PI / 2;

  const root = new Group();
  root.add(spin);

  return {
    root,
    spin,
    materials: [gold, faceGold],
    dispose() {
      body.dispose();
      faceGeometry.dispose();
      emblem.dispose();
      gold.dispose();
      faceGold.dispose();
    },
  };
}
