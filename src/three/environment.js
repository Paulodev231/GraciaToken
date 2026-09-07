import {
  CanvasTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
} from 'three';

/**
 * A warm studio built in code, pre-filtered into an environment map.
 *
 * Gold is almost entirely reflection: without an env map a metalness-1
 * material has nothing to mirror and reads as flat brown paint. Rather than
 * ship an HDRI we render a small scene of emissive panels — a champagne key,
 * a low gold fill, a cool rim and a long specular strip that draws the glint
 * along the coin's bevel — and let PMREM do the rest.
 */

function gradientBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#141a15'); // faint green cast overhead
  g.addColorStop(0.42, '#0b100d');
  g.addColorStop(0.72, '#060907');
  g.addColorStop(1.0, '#030504'); // near-black floor
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);

  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function panel(scene, { w, h, x, y, z, color, intensity }) {
  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: intensity,
      side: DoubleSide,
    })
  );
  mesh.position.set(x, y, z);
  mesh.lookAt(0, 0, 0);
  scene.add(mesh);
  return mesh;
}

export function createGoldEnvironment(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const scene = new Scene();
  const backdrop = gradientBackdrop();
  scene.background = backdrop;

  // Champagne key, high and to the right. Deliberately small: gold reads as
  // gold because of the dark it reflects between the highlights, so a broad
  // panel here would flatten the whole coin to cream.
  panel(scene, { w: 3.6, h: 3.6, x: 5.0, y: 4.0, z: 2.0, color: 0xffd9a2, intensity: 6.0 });
  // A tight, very bright strip — this is the travelling glint on the bevel.
  panel(scene, { w: 0.55, h: 9, x: 1.6, y: 0.4, z: 4.6, color: 0xffeac2, intensity: 10 });
  // Low antique-gold fill on the opposite side.
  panel(scene, { w: 5, h: 3, x: -4.8, y: 0.6, z: 1.2, color: 0xd8a343, intensity: 1.9 });
  // Cool rim from behind for edge separation.
  panel(scene, { w: 6, h: 5, x: -1.6, y: 2.2, z: -5.0, color: 0xd9e4dc, intensity: 0.8 });
  // Deep green bounce from below.
  panel(scene, { w: 12, h: 12, x: 0, y: -4.2, z: 0, color: 0x14301f, intensity: 0.9 });

  const envMap = pmrem.fromScene(scene, 0.035, 0.1, 120).texture;

  // The source scene has done its job.
  scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
  backdrop.dispose();
  pmrem.dispose();

  return envMap;
}
