import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createPoser } from "./jdpose.js";
import { jdTier } from "./jdvoice.js";

// One JD for the whole page. A small fixed canvas follows whichever [data-jd-anchor] element is on screen,
// flies between anchors as you scroll, and docks in the corner (desktop) when none is in view.
// A canvas that moves is far cheaper than a full-screen WebGL layer.
const MODEL_URL = "assets/models/jd.vrm";
const SIZE = 520; // canvas size in CSS px
const PAD = 24; // feet sit this far above the canvas bottom
const MAX_HEIGHT = 400; // JD's tallest on-screen size; a raised fist still fits in the canvas
const DOCK = { margin: 24, height: 240 };

const clamp = THREE.MathUtils.clamp;

export async function mountStage({ level = 1 } = {}) {
  let vrm;
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    vrm = (await loader.loadAsync(MODEL_URL)).userData.vrm;
  } catch (error) {
    console.warn("JD unavailable, keeping the still images", error);
    return;
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    console.warn("WebGL unavailable, keeping the still images", error);
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "jd-stage";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "JD, your guide");

  // World units are canvas pixels, so JD's size on screen is simply his scale.
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-SIZE / 2, SIZE / 2, SIZE, 0, -1000, 1000);
  camera.position.z = 500;
  scene.add(new THREE.HemisphereLight(0xd8f4ff, 0x111b2a, 2.3));
  const key = new THREE.DirectionalLight(0xffe5c5, 3.4);
  key.position.set(3, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x735cff, 1);
  rim.position.set(-3, 2, 2);
  scene.add(rim);

  const jd = vrm.scene;
  const standing = new THREE.Box3().setFromObject(jd).getSize(new THREE.Vector3()).y;
  const holder = new THREE.Group();
  holder.add(jd);
  scene.add(holder);
  vrm.lookAt && (vrm.lookAt.target = camera);
  const poser = createPoser(vrm, "normal");
  poser.play(jdTier(level).greet);

  // Pointer look: his head turns toward the cursor, like the guide in the demo used to.
  const look = { x: 0, y: 0 };
  const aim = { x: 0, y: 0, active: false };
  const cur = { x: -999, y: -999, h: DOCK.height, yaw: 0, shown: 0 };
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointer = (event) => {
    aim.x = clamp((event.clientX - cur.x) / (innerWidth / 2), -1, 1);
    aim.y = clamp((event.clientY - (cur.y - cur.h * 0.9)) / (innerHeight / 2), -1, 1);
    aim.active = true;
  };
  if (finePointer) {
    addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { aim.active = false; });
  }

  const anchors = [...document.querySelectorAll("[data-jd-anchor]")];
  let current = null; // the anchor JD is standing on
  let flight = 0; // seconds of slow easing left after switching anchors
  const aim_at = () => {
    let best = null;
    let bestVisible = 0.4;
    for (const el of anchors) {
      const box = el.getBoundingClientRect();
      if (!box.height) continue;
      const visible = (Math.min(box.bottom, innerHeight) - Math.max(box.top, 0)) / box.height;
      if (visible > bestVisible) {
        bestVisible = visible;
        best = { el, x: box.left + box.width / 2, y: box.bottom, h: Math.min(box.height, MAX_HEIGHT), yaw: Number(el.dataset.jdYaw || 0), shown: 1 };
      }
    }
    if (best) return best;
    // shortcut: no docked JD on phones (it would cover the text); revisit if the layout gets a free margin there
    // he peeks up from the bottom corner, hips and below off screen, so he covers as little text as possible
    if (innerWidth >= 900) return { el: null, x: innerWidth - DOCK.margin - DOCK.height * 0.3, y: innerHeight + DOCK.height * 0.4, h: DOCK.height, yaw: -0.35, shown: 1 };
    return { el: current?.el ?? null, x: cur.x, y: cur.y, h: cur.h, yaw: cur.yaw, shown: 0 };
  };

  // Sections play a move as they arrive, so he warms up as you scroll. The demo is driven by the visitor's level instead.
  const moves = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) poser.play(entry.target.dataset.jdMove);
  }), { threshold: 0.45 });
  document.querySelectorAll("[data-jd-move]").forEach((el) => moves.observe(el));

  const FRAME = 1 / 30;
  const clock = new THREE.Clock();
  let sinceRender = 0;
  let first = true;
  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const target = aim_at();
    if (target.el !== current) {
      current = target.el;
      if (!first) flight = 0.9;
    }
    flight = Math.max(0, flight - dt);
    const ease = first ? 1 : 1 - Math.exp(-(flight > 0 ? 5 : 26) * dt);
    first = false;
    cur.x += (target.x - cur.x) * ease;
    cur.y += (target.y - cur.y) * ease;
    cur.h += (target.h - cur.h) * ease;
    cur.yaw += (target.yaw - cur.yaw) * ease;
    cur.shown = target.shown;
    // Positioned every frame so he sticks to the page while scrolling; only the drawing is capped at 30 fps.
    canvas.style.transform = `translate3d(${cur.x - SIZE / 2}px, ${cur.y - SIZE + PAD}px, 0)`;
    canvas.style.opacity = cur.shown;

    sinceRender += dt;
    if (!cur.shown || document.hidden || sinceRender < FRAME) return;
    const ease2 = 1 - Math.exp(-6 * sinceRender);
    look.x += ((aim.active ? aim.x : 0) - look.x) * ease2;
    look.y += ((aim.active ? aim.y : 0) - look.y) * ease2;
    poser.update(sinceRender, look);
    vrm.update(sinceRender);
    sinceRender = 0;
    jd.scale.setScalar(cur.h / standing);
    holder.position.set(0, PAD, 0);
    holder.rotation.y = cur.yaw;
    renderer.render(scene, camera);
  };
  document.body.append(canvas);
  document.documentElement.classList.add("stage-on");
  frame();
  return { react: (name) => poser.play(name) };
}
