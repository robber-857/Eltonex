import * as THREE from './vendor/three.module.min.js';
import { SVGLoader } from './vendor/SVGLoader.js';

// ELTONEX / Gold Horizon. Original scene, exact brand silhouette, 12s closed phase.
const WIDTH = 1600, HEIGHT = 900, DURATION = 12, TAU = Math.PI * 2;
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#studio-film'), antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#24251f');
scene.fog = new THREE.FogExp2('#474238', 0.012);
const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 180);

// Actual reflective studio cards give the milled metal a broad luminous edge.
function createEnvironment() {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#30332e');
  const panels = [];
  function panel(color, intensity, size, position, rotation) {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    studio.add(mesh);
    panels.push(mesh);
  }
  panel('#fff6dd', 5, [10, 4, 0.1], [-3, 7, 5], [-0.45, -0.2, -0.15]);
  panel('#fffdf5', 7, [1.8, 12, 0.1], [7, 0, 4], [0, 0.8, 0.05]);
  panel('#e9b43f', 3.5, [10, 2, 0.1], [0, -4, 4], [0.6, 0, -0.08]);
  panel('#dfe3d6', 3.2, [6, 10, 0.1], [-7, 0, 3], [0, -0.85, 0]);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(studio, 0.025, 0.1, 100);
  generator.dispose();
  panels.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  return target.texture;
}
scene.environment = createEnvironment();

// The horizon is a continuous atmospheric dome, never a flat glow card or halo.
const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    zenith: { value: new THREE.Color('#151d1d') },
    haze: { value: new THREE.Color('#68675e') },
    amber: { value: new THREE.Color('#efc886') },
  },
  vertexShader: `varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
    varying vec3 vDirection; uniform vec3 zenith; uniform vec3 haze; uniform vec3 amber;
    void main(){
      vec3 d=normalize(vDirection);
      float horizon=exp(-pow((d.y+0.035)*5.0,2.));
      float sunrise=exp(-pow((d.x-.30)*2.0,2.)-pow((d.y+.045)*10.,2.));
      vec3 color=mix(zenith,haze,horizon*.84);
      color+=amber*sunrise*.37;
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -10;
scene.add(sky);

// Seeded coherent noise shapes real terrain geometry and its fine-grained PBR maps.
function hash(x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 76193;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy * (1 - fx) + (d - b) * fx * fy;
}
function fbm(x, y) {
  return noise(x, y) * 0.5 + noise(x * 2.13, y * 2.13) * 0.25 + noise(x * 4.71, y * 4.71) * 0.125 + noise(x * 9.31, y * 9.31) * 0.0625;
}
function terrainHeight(x, z) {
  const distance = THREE.MathUtils.smoothstep(-z, 5, 38);
  const ridge = Math.pow(Math.max(0, fbm(x * .11 + 7, z * .09) - .30), 1.7) * 7 * distance;
  const dunes = .09 * Math.sin(x * .44 + z * .18) + .07 * Math.sin(z * 1.3 + Math.sin(x * .19) * 2);
  return ridge + dunes + (fbm(x * 1.8, z * 1.8) - .5) * .08;
}
function sandTexture() {
  const size = 1024;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = hash(x, y);
      const coarse = fbm(x / 55, y / 55);
      const value = 90 + coarse * 85 + fine * 38;
      const index = (y * size + x) * 4;
      data[index] = value; data[index + 1] = value; data[index + 2] = value; data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(44, 55);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}
const sand = sandTexture();
const groundGeometry = new THREE.PlaneGeometry(90, 110, 340, 350);
groundGeometry.rotateX(-Math.PI / 2);
const terrainPositions = groundGeometry.attributes.position;
for (let i = 0; i < terrainPositions.count; i += 1) {
  const x = terrainPositions.getX(i), z = terrainPositions.getZ(i) - 24;
  terrainPositions.setXYZ(i, x, terrainHeight(x, z), z);
}
groundGeometry.computeVertexNormals();
const terrain = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({
  color: '#101815', roughness: 1, metalness: 0,
  map: sand, bumpMap: sand, bumpScale: .085,
  envMapIntensity: .08,
}));
terrain.receiveShadow = true;
scene.add(terrain);

scene.add(new THREE.HemisphereLight('#d2d9d8', '#202723', .9));
const key = new THREE.DirectionalLight('#fff4d8', 3.2);
key.position.set(-3, 9, 6);
scene.add(key);
const rim = new THREE.DirectionalLight('#ffd37d', 3.6);
rim.position.set(5, 5, -8);
scene.add(rim);
const fill = new THREE.DirectionalLight('#eeeae2', 1.1);
fill.position.set(10, 3, 9);
scene.add(fill);
// A neutral landscape fill provides the cast shadow while preserving dark albedo.
const groundSun = new THREE.DirectionalLight('#d4d7d1', 1.15);
groundSun.position.set(-4, 9, 7);
groundSun.castShadow = true;
groundSun.shadow.mapSize.set(2048, 2048);
Object.assign(groundSun.shadow.camera, { left: -12, right: 14, top: 14, bottom: -6, near: .5, far: 45 });
groundSun.shadow.bias = -.0002;
groundSun.shadow.normalBias = .025;
groundSun.shadow.radius = 4;
scene.add(groundSun);
const pool = new THREE.SpotLight('#ffcd67', 28, 12, .53, 1, 2);
pool.position.set(4.75, 3.4, .3);
pool.target.position.set(4.75, 0, .3);
scene.add(pool, pool.target);

function ambientShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 15, 128, 128, 123);
  gradient.addColorStop(0, 'rgba(0,0,0,.38)');
  gradient.addColorStop(.45, 'rgba(0,0,0,.19)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(4.75, .13, .4);
  scene.add(mesh);
  return mesh;
}
const softShadow = ambientShadow();

const graphite = new THREE.MeshPhysicalMaterial({ color: '#424c45', metalness: .62, roughness: .25, clearcoat: .65, clearcoatRoughness: .19, envMapIntensity: 1.55 });
const side = new THREE.MeshPhysicalMaterial({ color: '#111915', metalness: .72, roughness: .23, clearcoat: .5, envMapIntensity: 1.65 });
const silver = new THREE.MeshPhysicalMaterial({ color: '#7a8076', metalness: .86, roughness: .19, clearcoat: .65, clearcoatRoughness: .17, envMapIntensity: 1.9 });
const gold = new THREE.MeshPhysicalMaterial({ color: '#f1b823', metalness: .74, roughness: .26, clearcoat: .35, clearcoatRoughness: .15, envMapIntensity: 1.35 });
const goldSide = new THREE.MeshPhysicalMaterial({ color: '#9c6a13', metalness: .78, roughness: .25, envMapIntensity: 1.7 });
const goldBevel = new THREE.MeshPhysicalMaterial({ color: '#ffe09c', metalness: .76, roughness: .18, clearcoat: .7, envMapIntensity: 1.8 });
const sculpture = new THREE.Group();

function makeMark(source) {
  new SVGLoader().parse(source).paths.forEach((path, index) => {
    const isGold = index > 0;
    const depth = isGold ? 52 : 78;
    const geometry = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth, bevelEnabled: true, bevelSegments: 7, steps: 1,
      bevelSize: isGold ? 5 : 8.5, bevelThickness: isGold ? 5 : 8.5, curveSegments: 40,
    });
    const normals = geometry.attributes.normal;
    const groups = [[], [], []];
    for (let vertex = 0; vertex < normals.count; vertex += 3) {
      const z = Math.abs(normals.getZ(vertex));
      const material = z > .999 ? 0 : z < .08 ? 1 : 2;
      groups[material].push(vertex, vertex + 1, vertex + 2);
    }
    geometry.setIndex(groups.flat());
    geometry.clearGroups();
    let offset = 0;
    groups.forEach((indices, material) => { geometry.addGroup(offset, indices.length, material); offset += indices.length; });
    geometry.translate(-739, -362, -depth / 2);
    // A shallow crowned face changes both surface depth and normals continuously.
    // The XY silhouette is untouched: the actual ELTONEX outline stays exact.
    const positions = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const crown = isGold ? 8 : 13;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
      const sign = z >= 0 ? 1 : -1;
      const profile = crown * (1 - (x / 270) ** 2 - (y / 280) ** 2);
      positions.setZ(vertex, z + sign * profile);
      const nx = normal.getX(vertex), ny = normal.getY(vertex), nz = normal.getZ(vertex);
      const corrected = new THREE.Vector3(nx + nz * sign * crown * 2 * x / (270 ** 2), ny + nz * sign * crown * 2 * y / (280 ** 2), nz).normalize();
      normal.setXYZ(vertex, corrected.x, corrected.y, corrected.z);
    }
    geometry.scale(.0148, .0148, .0148);
    const mesh = new THREE.Mesh(geometry, isGold ? [gold, goldSide, goldBevel] : [graphite, side, silver]);
    mesh.rotation.x = Math.PI;
    mesh.position.z = isGold ? .43 : 0;
    mesh.castShadow = mesh.receiveShadow = true;
    sculpture.add(mesh);
  });
  sculpture.scale.setScalar(1.18);
  scene.add(sculpture);
}

function renderAt(time) {
  const phase = (((Number(time) || 0) % DURATION) / DURATION) * TAU;
  sculpture.position.set(4.75, 4.00 + .10 * Math.sin(phase), .25);
  sculpture.rotation.set(.10 + .035 * Math.sin(phase), -.47 + .085 * Math.sin(phase + .4), -.035 + .02 * Math.sin(phase));
  camera.position.set(.035 * Math.sin(phase), 4.5 + .025 * Math.sin(phase), 18);
  camera.lookAt(0, 3.3, -5);
  key.position.x = -3 + .75 * Math.sin(phase);
  key.position.z = 6 + .65 * Math.cos(phase);
  pool.intensity = 28 + 3 * Math.sin(phase);
  softShadow.material.opacity = .9 - .06 * Math.sin(phase);
  softShadow.scale.setScalar(1.16 + .03 * Math.sin(phase));
  renderer.render(scene, camera);
  window.__filmTime = Number(time) || 0;
}

// The only fetch is local and completes before any render-critical seek.
const source = await fetch(new URL('./rocket-mark.svg', import.meta.url)).then(response => response.text());
makeMark(source);
window.addEventListener('hf-seek', event => renderAt(event.detail.time));
window.__renderFilmAt = renderAt;
renderAt(window.__hfThreeTime || 0);
window.__filmReady = true;
