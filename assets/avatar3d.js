import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

// Copied from the app (~/Projects/questfit/avatar3d.js); differences: model path, extra reactions (nod, dance), mountAvatar returns { react }, follows the cursor.
// JD is AvatarSample_C from VRoid Studio (credit required, no mesh edits: see public/models/README.md).
const MODEL_URL = "assets/models/jd.vrm";
// Arm angles (rad) around z: the VRM rest pose is a T-pose, so these swing the arms down or up.
const ARM_DOWN = 1.2;
const ARM_UP = 2.3;
const MOODS = {
  normal: { head: 0, lean: 0, tilt: 0, breath: 1.6, sad: 0 },
  tired: { head: 0.22, lean: 0.1, tilt: 0, breath: 0.9, sad: 0.3 },
  injured: { head: 0.28, lean: 0.14, tilt: -0.1, breath: 1.1, sad: 0.6 },
};
const REACTIONS = { greet: 1.8, cheer: 1.6, sad: 1.8, nod: 1.0, dance: 2.4 }; // seconds

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

export async function mountAvatar(container, { className = "warrior", avatarState = "normal", reaction } = {}) {
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
  const mood = MOODS[avatarState] || MOODS.normal;
  const holder = new THREE.Group();
  holder.rotation.z = mood.tilt;
  holder.add(jd);
  scene.add(holder);

  const bone = (name) => vrm.humanoid.getNormalizedBoneNode(name);
  const bones = Object.fromEntries(
    ["hips", "spine", "chest", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"].map((name) => [name, bone(name)]),
  );
  const hipsY = bones.hips.position.y; // the hips carry the model's standing height
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
  let move = null; // { name, t } while a reaction plays
  const playOnce = (name) => {
    if (REACTIONS[name]) move = { name, t: 0 };
  };
  // Posed from code every frame, so no animation clips ship with the model.
  const pose = (time) => {
    const e = move ? Math.sin(Math.PI * Math.min(move.t / REACTIONS[move.name], 1)) : 0;
    const cheer = move?.name === "cheer" ? e : 0;
    const greet = move?.name === "greet" ? e : 0;
    const sad = move?.name === "sad" ? e : 0;
    const nod = move?.name === "nod" ? Math.sin(time * 10) * 0.2 * e : 0;
    const dance = move?.name === "dance" ? e : 0;
    const beat = Math.sin(time * 8);
    const wave = Math.sin(time * 12) * 0.35 * greet;
    bones.spine.rotation.set(mood.lean + sad * 0.15, 0, 0);
    bones.chest.rotation.x = Math.sin(time * mood.breath) * 0.015;
    bones.head.rotation.set(mood.head + sad * 0.3 - cheer * 0.1 + nod + look.y * 0.35, Math.sin(time * 0.5) * 0.06 + look.x * 0.4, 0);
    bones.hips.position.y = hipsY + Math.abs(Math.sin(time * 9)) * 0.03 * Math.max(cheer, dance);
    bones.leftUpperArm.rotation.z = -ARM_DOWN + (ARM_DOWN + ARM_UP) * Math.max(cheer, dance * (0.6 + 0.4 * beat));
    bones.rightUpperArm.rotation.z = ARM_DOWN - (ARM_DOWN + ARM_UP) * Math.max(cheer, greet, dance * (0.6 - 0.4 * beat));
    bones.leftLowerArm.rotation.z = 0;
    bones.rightLowerArm.rotation.z = -wave;
    const blink = (time % 4) < 0.14 ? 1 : 0;
    const x = vrm.expressionManager;
    x.setValue("blink", blink);
    x.setValue("happy", Math.max(cheer, greet, dance) * 0.8);
    x.setValue("sad", Math.max(mood.sad, sad));
  };

  if (REACTIONS[reaction]) playOnce(reaction);
  else if (!greeted && avatarState === "normal") playOnce("greet");
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
    if (move && (move.t += sinceRender) > REACTIONS[move.name]) move = null;
    const ease = 1 - Math.exp(-6 * sinceRender);
    look.x += ((aim.active ? aim.x : 0) - look.x) * ease;
    look.y += ((aim.active ? aim.y : 0) - look.y) * ease;
    pose(clock.elapsedTime);
    vrm.update(sinceRender);
    sinceRender = 0;
    const sway = Math.sin(clock.elapsedTime * 0.65) * 0.18 * (1 - Math.min(1, Math.abs(look.x) * 2));
    holder.rotation.y = sway + look.x * 0.45;
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
  if (!reduceMotion) renderer.domElement.addEventListener("pointerdown", () => playOnce("greet"));

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

  pose(0);
  vrm.update(0);
  renderer.render(scene, camera);
  updateRunning();
  return { react: (reaction) => !reduceMotion && playOnce(reaction) };
}
