import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createPoser } from "./jdpose.js";
import { jdTier } from "./jdvoice.js";

// Copied from the app (~/Projects/questfit/avatar3d.js, jdpose.js, jdvoice.js); differences: model path, mountAvatar returns { react }, follows the cursor.
// JD is AvatarSample_C from VRoid Studio (credit required, no mesh edits: see public/models/README.md).
const MODEL_URL = "assets/models/jd.vrm";
const THEMES = {
  warrior: { glow: 0x735cff },
  ranger: { glow: 0x62e6ff },
  mage: { glow: 0xc9a2ff },
  allrounder: { glow: 0xff5db1 },
};

let modelPromise;
let greeted = false;

// The dashboard re-renders via innerHTML, so the VRM is fetched and parsed only once and each mount gets its own scene.
function loadModel() {
  modelPromise ??= (async () => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(MODEL_URL);
    return gltf.userData.vrm;
  })().catch((error) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

function fitToView(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.9 / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  model.position.set(-center.x, -box.min.y * scale - 0.55, -center.z);
}

export async function mountAvatar(container, { className = "warrior", avatarState = "normal", reaction, level = 1 } = {}) {
  let vrm;
  try {
    vrm = await loadModel();
  } catch (error) {
    console.warn("JD unavailable, keeping 2D fallback", error);
    return;
  }
  if (!container.isConnected) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    console.warn("WebGL unavailable, keeping 2D fallback", error);
    return;
  }

  const glow = (THEMES[className] || THEMES.warrior).glow;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
  camera.position.set(0, 0.5, 4.4);
  camera.lookAt(0, 0.45, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "JD, your 3D guide");

  scene.add(new THREE.HemisphereLight(0xd8f4ff, 0x111b2a, 2.3));
  const key = new THREE.DirectionalLight(0xffe5c5, 3.4);
  key.position.set(3, 4, 4);
  scene.add(key);
  const rim = new THREE.PointLight(glow, 2.4, 8);
  rim.position.set(-2, 1.7, 2);
  scene.add(rim);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.018, 8, 52),
    new THREE.MeshStandardMaterial({ color: glow, roughness: 0.25, metalness: 0.65 }),
  );
  ring.position.y = -0.55;
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const jd = vrm.scene;
  jd.scale.setScalar(1); // the VRM is shared between mounts, so undo the previous fit
  jd.position.set(0, 0, 0);
  fitToView(jd);
  const holder = new THREE.Group();
  holder.add(jd);
  scene.add(holder);

  // Turn toward the cursor (mouse only). look.x/y run -1..1 from the guide's centre.
  const look = { x: 0, y: 0 };
  const aim = { x: 0, y: 0, active: false };
  const onPointer = (event) => {
    const box = container.getBoundingClientRect();
    aim.x = THREE.MathUtils.clamp((event.clientX - box.left - box.width / 2) / (innerWidth / 2), -1, 1);
    aim.y = THREE.MathUtils.clamp((event.clientY - box.top - box.height / 2) / (innerHeight / 2), -1, 1);
    aim.active = true;
  };
  const onLeave = () => { aim.active = false; };
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const followCursor = !reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (followCursor) {
    addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }
  const poser = createPoser(vrm, avatarState);
  vrm.lookAt && (vrm.lookAt.target = camera); // eyes meet the viewer
  const playOnce = (name) => poser.play(name);
  const greeting = jdTier(level).greet; // cold at first, a wave once he has warmed up
  if (!playOnce(reaction) && !greeted && avatarState === "normal") playOnce(greeting);
  greeted = true;

  container.replaceChildren(renderer.domElement);

  const clock = new THREE.Clock();
  let frame = 0;
  let onScreen = true;
  let sinceRender = 0;
  // Capped at 30 fps: 120 Hz phones otherwise burn most of a CPU core on an idle loop.
  const animate = () => {
    frame = requestAnimationFrame(animate);
    sinceRender += clock.getDelta();
    if (sinceRender < 1 / 30) return;
    const ease = 1 - Math.exp(-6 * sinceRender);
    look.x += ((aim.active ? aim.x : 0) - look.x) * ease;
    look.y += ((aim.active ? aim.y : 0) - look.y) * ease;
    poser.update(sinceRender, look);
    vrm.update(sinceRender);
    sinceRender = 0;
    renderer.render(scene, camera);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  // Only animate while the panel is visible and the app is in the foreground, to save battery.
  const updateRunning = () => {
    if (reduceMotion) return;
    const shouldRun = onScreen && !document.hidden && container.isConnected;
    if (shouldRun && !frame) {
      clock.getDelta(); // drop the paused time so clips don't jump ahead
      sinceRender = 1 / 30;
      animate();
    } else if (!shouldRun) stop();
  };

  const resize = () => {
    if (!container.isConnected) return;
    const nextWidth = Math.max(1, container.clientWidth);
    const nextHeight = Math.max(1, container.clientHeight);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
    if (!frame) renderer.render(scene, camera);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    updateRunning();
  });
  visibilityObserver.observe(container);
  document.addEventListener("visibilitychange", updateRunning);
  if (!reduceMotion) renderer.domElement.addEventListener("pointerdown", () => playOnce(greeting));

  // A paused loop can't notice the dashboard re-rendering, so check for removal on a slow timer.
  const watcher = setInterval(() => {
    if (container.isConnected) return;
    clearInterval(watcher);
    stop();
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", updateRunning);
    removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    holder.remove(jd); // the VRM outlives this mount, so don't dispose it
    ring.geometry.dispose();
    ring.material.dispose();
    renderer.dispose();
  }, 1000);

  vrm.update(0);
  renderer.render(scene, camera);
  updateRunning();
  return { react: (reaction) => !reduceMotion && playOnce(reaction) };
}
