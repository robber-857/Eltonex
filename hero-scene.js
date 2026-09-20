/**
 * A small, on-demand Three.js sculpture of the actual ELTONEX mark.
 * All geometry comes from logo-mark-light.svg; nothing is loaded from a CDN.
 * The SVG remains visible until WebGL completes its first frame.
 */
const containers = [...document.querySelectorAll('[data-hero-scene]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');
const activeScenes = new Map();
const pendingScenes = new Set();
let pageActive = true;
let generation = 0;
let libraries;

function loadLibraries() {
  libraries ??= Promise.all([
    import('./assets/vendor/three.module.min.js'),
    import('./assets/vendor/SVGLoader.js'),
    fetch(new URL('./assets/logo-mark-light.svg', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('ELTONEX mark could not be loaded');
      return response.text();
    }),
  ]);
  return libraries;
}

function showFallback(container) {
  container.dataset.sceneState = 'fallback';
  const fallback = container.querySelector('.hero-rocket-fallback');
  if (fallback) fallback.hidden = false;
}

function makeStudioEnvironment(THREE, renderer) {
  // Real light-panel reflections give the metal its shape without an HDR download.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x252725);
  const cards = [];
  const addPanel = (color, intensity, dimensions, position, rotation = [0, 0, 0]) => {
    const geometry = new THREE.BoxGeometry(...dimensions);
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(...position);
    panel.rotation.set(...rotation);
    studio.add(panel);
    cards.push(panel);
  };
  addPanel(0xffffff, 6, [8, 3.5, 0.12], [-2, 5, 5], [-0.55, -0.25, -0.25]);
  addPanel(0xf5f7f4, 3.5, [1.7, 10, 0.12], [6, 0, 2], [0, 0.85, 0.1]);
  addPanel(0xffffff, 1.2, [5, 8, 0.12], [-6, -2, 1], [0, -0.8, 0]);
  addPanel(0xeabd58, 2, [8, 1.2, 0.12], [1, -5, 3], [0.7, 0, -0.15]);
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(studio, 0.06, 0.1, 100);
  generator.dispose();
  cards.forEach(card => {
    card.geometry.dispose();
    card.material.dispose();
  });
  return environment;
}

function buildSculpture(THREE, SVGLoader, source) {
  const sculpture = new THREE.Group();
  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xf4f5ef, metalness: 0.44, roughness: 0.27,
    clearcoat: 0.7, clearcoatRoughness: 0.17, envMapIntensity: 1.5,
  });
  const graphite = new THREE.MeshPhysicalMaterial({
    color: 0x6b706b, metalness: 0.65, roughness: 0.26,
    clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.6,
  });
  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xffcd37, metalness: 0.42, roughness: 0.24,
    clearcoat: 0.55, clearcoatRoughness: 0.18, envMapIntensity: 1.35,
  });
  const goldEdge = new THREE.MeshPhysicalMaterial({
    color: 0xc18a16, metalness: 0.6, roughness: 0.28,
    clearcoat: 0.45, envMapIntensity: 1.35,
  });

  new SVGLoader().parse(source).paths.forEach((path, index) => {
    const isGold = index > 0;
    const depth = isGold ? 35 : 45;
    const geometry = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth, bevelEnabled: true, bevelSegments: 6,
      steps: 1, bevelSize: isGold ? 3 : 6,
      bevelThickness: isGold ? 3 : 6, curveSegments: 32,
    });
    // Keep the long extrusion walls graphite, but let the broad chamfer catch
    // the same bright studio reflections as the face instead of becoming a rim.
    const normals = geometry.attributes.normal;
    const brightFaces = [];
    const sideWalls = [];
    for (let vertex = 0; vertex < normals.count; vertex += 3) {
      const indices = Math.abs(normals.getZ(vertex)) > 0.1 ? brightFaces : sideWalls;
      indices.push(vertex, vertex + 1, vertex + 2);
    }
    // Consolidate each material into one draw call, even around the curved mark.
    geometry.setIndex([...brightFaces, ...sideWalls]);
    geometry.clearGroups();
    geometry.addGroup(0, brightFaces.length, 0);
    geometry.addGroup(brightFaces.length, sideWalls.length, 1);
    geometry.translate(-739, -362, -depth / 2);
    geometry.scale(0.01, 0.01, 0.01);
    const mesh = new THREE.Mesh(geometry, isGold ? [gold, goldEdge] : [silver, graphite]);
    // Flip SVG's downward Y axis by a rotation, preserving outward face winding.
    mesh.rotation.x = Math.PI;
    mesh.position.z = isGold ? 0.105 : 0;
    sculpture.add(mesh);
  });
  return sculpture;
}

async function initialize(container) {
  if (!pageActive || pendingScenes.has(container) || activeScenes.has(container)) return;
  const thisGeneration = generation;
  pendingScenes.add(container);
  let renderer;
  let cleanup;
  try {
    const [THREE, { SVGLoader }, source] = await loadLibraries();
    if (!pageActive || thisGeneration !== generation) return;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'hero-rocket-canvas';
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', position: 'absolute', inset: '0', pointerEvents: 'none' });

    const scene = new THREE.Scene();
    const environment = makeStudioEnvironment(THREE, renderer);
    scene.environment = environment.texture;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    const sculpture = buildSculpture(THREE, SVGLoader, source);
    scene.add(sculpture);
    scene.add(new THREE.HemisphereLight(0xf5f6ee, 0x34372f, 1.65));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd66e, 1.5);
    rim.position.set(4, -2, -2);
    scene.add(rim);

    const hero = container.closest('.hero') || container;
    const base = { x: 0.2, y: -0.48, z: -0.055 };
    const target = { ...base };
    const current = reducedMotion.matches ? { ...base } : { x: 0.32, y: -0.71, z: -0.1 };
    let raf = 0;
    let previousFrame = 0;
    let settleDeadline = 0;
    let visible = true;
    let disposed = false;
    let contextAvailable = true;
    let firstFrame = true;

    function canRender() {
      return !disposed && contextAvailable && visible && !document.hidden && pageActive;
    }

    function draw(now) {
      raf = 0;
      if (!canRender()) return;
      const dt = previousFrame ? Math.min((now - previousFrame) / 1000, 0.05) : 1 / 60;
      previousFrame = now;
      const blend = reducedMotion.matches || now >= settleDeadline ? 1 : 1 - Math.exp(-dt * 7.5);
      let difference = 0;
      for (const axis of ['x', 'y', 'z']) {
        current[axis] += (target[axis] - current[axis]) * blend;
        difference += Math.abs(target[axis] - current[axis]);
      }
      sculpture.rotation.set(current.x, current.y, current.z);
      renderer.render(scene, camera);
      container.dataset.rotation = `${current.x.toFixed(3)},${current.y.toFixed(3)}`;
      if (firstFrame) {
        firstFrame = false;
        container.dataset.sceneState = 'ready';
        const fallback = container.querySelector('.hero-rocket-fallback');
        if (fallback) fallback.hidden = true;
      }
      if (difference > 0.0005 && !reducedMotion.matches) raf = requestAnimationFrame(draw);
    }

    function requestDraw() {
      if (!canRender()) return;
      // Even a throttled tab or a stalled frame must settle in a bounded interval.
      settleDeadline = performance.now() + 1800;
      if (raf) return;
      previousFrame = 0;
      raf = requestAnimationFrame(draw);
    }

    function size() {
      if (disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Fit the same complete mark in both the wide desktop and narrow mobile slot.
      const fitHeight = Math.max(4.45, 4.65 / camera.aspect);
      camera.position.set(0, 0, fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(17.5))));
      camera.updateProjectionMatrix();
      requestDraw();
    }

    function onPointer(event) {
      if (!finePointer.matches || reducedMotion.matches || event.pointerType === 'touch') return;
      const rect = hero.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      target.x = base.x + y * 0.16;
      target.y = base.y + x * 0.26;
      target.z = base.z - x * 0.035;
      requestDraw();
    }

    function resetPose() {
      Object.assign(target, base);
      requestDraw();
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else requestDraw();
    }

    function onContextLost(event) {
      event.preventDefault();
      contextAvailable = false;
      cancelAnimationFrame(raf);
      raf = 0;
      showFallback(container);
      canvas.style.visibility = 'hidden';
    }

    function onContextRestored() {
      // PMREM render-target pixels are lost with the context. Rebuild the studio
      // along with the mesh instead of displaying metal with a blank reflection.
      cleanup();
      activeScenes.delete(container);
      initialize(container);
    }

    const resize = new ResizeObserver(size);
    const intersection = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) requestDraw();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }, { threshold: 0.02 });

    cleanup = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      intersection.disconnect();
      hero.removeEventListener('pointermove', onPointer);
      hero.removeEventListener('pointerleave', resetPose);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', resetPose);
      finePointer.removeEventListener('change', resetPose);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      const materials = new Set();
      sculpture.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      });
      materials.forEach(material => material.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      showFallback(container);
    };

    container.append(canvas);
    hero.addEventListener('pointermove', onPointer, { passive: true });
    hero.addEventListener('pointerleave', resetPose, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', resetPose);
    finePointer.addEventListener('change', resetPose);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    resize.observe(container);
    intersection.observe(container);
    activeScenes.set(container, cleanup);
    size();
  } catch (error) {
    cleanup?.();
    if (!cleanup) renderer?.dispose();
    showFallback(container);
    // Failure is deliberately non-blocking: the same accessible SVG stays in place.
    console.info('ELTONEX: using the static brand mark.', error.message);
  } finally {
    if (thisGeneration === generation) pendingScenes.delete(container);
  }
}

const bootObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    bootObserver.unobserve(entry.target);
    initialize(entry.target);
  });
}, { rootMargin: '180px' });

containers.forEach(container => {
  showFallback(container);
  bootObserver.observe(container);
});

window.addEventListener('pagehide', () => {
  pageActive = false;
  generation += 1;
  pendingScenes.clear();
  bootObserver.disconnect();
  activeScenes.forEach(dispose => dispose());
  activeScenes.clear();
});

window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  pageActive = true;
  containers.forEach(container => bootObserver.observe(container));
});
