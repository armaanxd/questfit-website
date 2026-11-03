import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createPoser } from "./jdpose.js";
import { jdTier } from "./jdvoice.js";

// One JD for the whole page, and he lives on it: he stands on the page's own elements (headings, cards, the phone,
// the footer), and as you scroll he walks to the edge of one and jumps to the next one that is in view.
// The canvas is small and positioned in page space, so he stays glued to the layout while it scrolls.
const MODEL_URL = "assets/models/jd.vrm";
const SIZE = 520; // canvas size in CSS px
const PAD = 24; // feet sit this far above the canvas bottom
const PERCHES = ".hero-scene, .pill, main h2, .hero-phone, .quest, .jd-tier, .mode, .class, .soon-list li, .faq details, .tour-phone .phone, .watch-phone, .xp, .btn--soon, .site-footer";
const WALK = 0.9; // body heights per second
const RUN = 2.2;

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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
  canvas.setAttribute("aria-label", "JD, your guide, exploring the page");

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
  const height = () => (innerWidth < 700 ? 150 : 210);

  // ---- the page as a set of platforms, in page coordinates ----
  let perches = [];
  const measure = () => {
    perches = [];
    for (const el of document.querySelectorAll(PERCHES)) {
      if (el.closest("header")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 90 || !box.height) continue;
      perches.push({ el, l: box.left + scrollX, r: box.right + scrollX, y: (el.matches(".hero-scene") ? box.bottom : box.top) + scrollY });
    }
  };
  const perchOf = (el) => perches.find((p) => p.el === el);

  // ---- JD ----
  measure();
  const home = perchOf(document.querySelector(".hero-scene")) || perches[0];
  const me = { el: home?.el, x: home ? (home.l + home.r) / 2 : innerWidth / 2, y: home?.y ?? 0, face: 1, yaw: 0, mode: "stand", idle: 0, wander: 6, plan: null, jump: null, speed: 0, pending: null };
  const queue = (name) => {
    if (me.mode === "stand") return poser.play(name);
    me.pending = name; // he finishes the jump first
    return true;
  };
  queue(jdTier(level).greet);

  // Pointer look: his head turns toward the cursor.
  const look = { x: 0, y: 0 };
  const aim = { x: 0, y: 0, active: false };
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    addEventListener("pointermove", (event) => {
      aim.x = clamp((event.clientX - (me.x - scrollX)) / (innerWidth / 2), -1, 1);
      aim.y = clamp((event.clientY - (me.y - scrollY - height() * 0.9)) / (innerHeight / 2), -1, 1);
      aim.active = true;
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { aim.active = false; });
  }

  // Sections play a move as they arrive, so he warms up as you scroll.
  const moves = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) queue(entry.target.dataset.jdMove);
  }), { threshold: 0.45 });
  document.querySelectorAll("[data-jd-move]").forEach((el) => moves.observe(el));

  // Where to go next: a platform that is in the middle of the screen. When he has simply been standing a while
  // he also wanders to a nearby one, so he is never frozen.
  const choose = (forced) => {
    const top = scrollY;
    const view = innerHeight;
    const clear = (70 + height() * 0.9) / view; // below the sticky header, so his head isn't hidden
    const pick = (lo, hi) => perches
      .filter((p) => p.el !== me.el && p.y >= top + lo * view && p.y <= top + hi * view && (forced || (Math.abs(p.y - me.y) < 300 && Math.abs(clamp(me.x, p.l, p.r) - me.x) < 700)))
      .map((p) => ({ p, score: -Math.abs(p.y - (top + 0.58 * view)) - 0.2 * Math.abs(clamp(me.x, p.l, p.r) - me.x) + (p.el.matches(".quest") ? 90 : 0) + Math.random() * 40 }))
      .sort((a, b) => b.score - a.score)[0]?.p;
    return pick(Math.max(0.3, clear + 0.02), 0.82) || (forced ? pick(clear, 0.95) : undefined);
  };
  const startWalk = (target) => {
    const here = perchOf(me.el);
    // land somewhere on the platform, drifting toward its middle, so he crosses the page rather than only dropping straight down
    const landX = clamp(me.x + ((target.l + target.r) / 2 - me.x) * 0.4 + (Math.random() - 0.5) * 440, target.l + 30, target.r - 30);
    const edgeX = here ? clamp(landX, here.l + 24, here.r - 24) : me.x;
    me.plan = { el: target.el, landX, edgeX };
    me.mode = "walk";
    me.speed = Math.abs(edgeX - me.x) > 260 ? RUN : WALK;
  };
  const startJump = () => {
    const target = perchOf(me.plan.el);
    if (!target) return (me.mode = "stand");
    const x1 = clamp(me.plan.landX, target.l + 30, target.r - 30);
    const dist = Math.hypot(x1 - me.x, target.y - me.y);
    me.jump = { t: 0, dur: clamp(0.6 + dist / 1300, 0.7, 1.25), x0: me.x, y0: me.y, peak: 50 + dist * 0.12 + (target.y < me.y ? 40 : 0) };
    me.face = Math.sign(x1 - me.x) || me.face;
    me.mode = "jump";
  };

  const step = (dt) => {
    measure();
    const view = innerHeight;
    if (me.mode !== "jump") {
      const here = perchOf(me.el);
      if (here) me.y = here.y; // rides along if the layout shifts
      else { // his platform disappeared (resize): drop him on whatever is nearest
        const near = choose(true);
        if (near) { me.el = near.el; me.x = clamp(me.x, near.l, near.r); me.y = near.y; }
      }
    }
    if (me.mode === "stand") {
      me.idle += dt;
      const off = me.y < scrollY + 50 + height() * 0.9 || me.y > scrollY + 0.94 * view;
      if (off || me.idle > me.wander) {
        const target = choose(off);
        me.idle = 0;
        me.wander = 6 + Math.random() * 4;
        if (target) startWalk(target);
      }
    }
    if (me.mode === "walk") {
      const dx = me.plan.edgeX - me.x;
      const stepPx = me.speed * height() * dt;
      me.face = Math.sign(dx) || me.face;
      if (Math.abs(dx) <= stepPx) {
        me.x = me.plan.edgeX;
        startJump();
      } else me.x += Math.sign(dx) * stepPx;
    }
    if (me.mode === "jump") {
      const target = perchOf(me.plan.el);
      const j = me.jump;
      j.t += dt;
      const u = Math.min(j.t / j.dur, 1);
      if (target) {
        const x1 = clamp(me.plan.landX, target.l + 30, target.r - 30);
        const g = smooth(0.16, 0.88, u);
        me.x = j.x0 + (x1 - j.x0) * g;
        me.y = j.y0 + (target.y - j.y0) * g - 4 * j.peak * g * (1 - g);
      }
      if (u >= 1) {
        me.el = me.plan.el;
        me.mode = "stand";
        me.idle = 0;
        me.wander = 6 + Math.random() * 4;
        if (target) me.y = target.y;
        if (me.pending) { poser.play(me.pending); me.pending = null; }
      }
    }
    const yawTarget = me.mode === "stand" ? 0 : me.face * 1.2;
    me.yaw += (yawTarget - me.yaw) * (1 - Math.exp(-9 * dt));
  };

  const FRAME = 1 / 30;
  const clock = new THREE.Clock();
  let sinceRender = 0;
  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    step(dt);
    // Positioned every frame so he sticks to the page; the drawing is capped at 30 fps while he stands still.
    canvas.style.transform = `translate3d(${me.x - SIZE / 2}px, ${me.y - SIZE + PAD}px, 0)`;
    sinceRender += dt;
    const onScreen = me.y > scrollY - 200 && me.y < scrollY + innerHeight + 300;
    if (!onScreen || document.hidden || (me.mode === "stand" && sinceRender < FRAME)) return;
    const ease = 1 - Math.exp(-6 * sinceRender);
    look.x += ((aim.active ? aim.x : 0) - look.x) * ease;
    look.y += ((aim.active ? aim.y : 0) - look.y) * ease;
    const loco = me.mode === "walk" ? { mode: "walk", speed: me.speed, u: 0 } : me.mode === "jump" ? { mode: "jump", speed: 0, u: Math.min(me.jump.t / me.jump.dur, 1) } : undefined;
    poser.update(sinceRender, look, false, loco);
    vrm.update(sinceRender);
    sinceRender = 0;
    jd.scale.setScalar(height() / standing);
    holder.position.set(0, PAD, 0);
    holder.rotation.y = me.yaw;
    renderer.render(scene, camera);
    canvas.style.opacity = 1;
  };
  // A full-page clipping layer, so a canvas hanging off the right edge never adds horizontal scroll.
  const layer = document.createElement("div");
  layer.id = "jd-layer";
  layer.append(canvas);
  document.body.append(layer);
  document.documentElement.classList.add("stage-on");
  frame();
  return { react: (name) => queue(name) };
}
