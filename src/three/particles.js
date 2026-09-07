import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Uniform,
} from 'three';

const BOX = { x: 16, y: 13, z: 9 };

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uScale;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 p = position;

    // Rise, and wrap back to the floor of the box on the way out of the ceiling.
    float span = ${BOX.y.toFixed(1)};
    p.y = mod(p.y + uTime * aSpeed + span * 0.5, span) - span * 0.5;

    // A lazy lateral drift, so the field never reads as a rising grid.
    float t = uTime * 0.16 + aSeed * 6.2831853;
    p.x += sin(t) * 0.42;
    p.z += cos(t * 0.77) * 0.28;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Fade at the ceiling and floor of the box so the wrap is invisible.
    float edge = 1.0 - smoothstep(span * 0.28, span * 0.5, abs(p.y));

    // ...and fade whatever drifts too close to the lens or too far behind.
    float dist = -mv.z;
    float depth = smoothstep(0.6, 3.2, dist) * (1.0 - smoothstep(14.0, 22.0, dist));

    vAlpha = edge * depth;
    vSeed = aSeed;

    // uScale carries (bufferHeight / 2) / tan(fov / 2), so a mote keeps a
    // constant world size and shrinks honestly with distance.
    gl_PointSize = min(aSize * uScale / max(dist, 0.1), 64.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform vec3 uGold;
  uniform vec3 uChampagne;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Soft halo with a tighter core — dust catching light, not a hard dot.
    float halo = smoothstep(0.5, 0.06, d);
    float core = smoothstep(0.22, 0.0, d);
    float a = (halo * 0.4 + core * 0.7) * vAlpha;

    gl_FragColor = vec4(mix(uGold, uChampagne, vSeed), a);
  }
`;

export function createDust({ count = 2400 }) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * BOX.x;
    positions[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * BOX.z - 1.0;

    // Mostly fine dust; a scattering of larger flecks to catch the eye.
    sizes[i] = Math.random() > 0.965 ? 0.05 + Math.random() * 0.035 : 0.011 + Math.random() * 0.017;
    seeds[i] = Math.random();
    speeds[i] = 0.07 + Math.random() * 0.16;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: new Uniform(0),
      uScale: new Uniform(1000),
      uGold: new Uniform(new Color(0xd4af37)),
      uChampagne: new Uniform(new Color(0xf7e6c0)),
    },
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;

  return {
    points,
    /** @param {number} bufferHeight physical pixels @param {number} fov degrees */
    setProjection(bufferHeight, fov) {
      const half = (fov * Math.PI) / 360;
      material.uniforms.uScale.value = bufferHeight / 2 / Math.tan(half);
    },
    update(elapsed) {
      material.uniforms.uTime.value = elapsed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
