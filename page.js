// The demo campaign: scroll is training. Every number comes from the app's rules (questfit/game.js):
// 250 XP a level, and each class's full daily board. JD's tiers and lines are the app's own (jdvoice.js).
import { jdTier, jdLine } from "./assets/jdvoice.js";

const CLASSES = {
  warrior:    { name: "Warrior",     icon: "⚔", main: ["Break the Iron Gate", "Complete a focused strength session and clear the first gate.", 30, "+100 XP · +20 coins"], side: [["March the Ember Road", "6,000 steps"], ["Brace the Shield", "10 min"], ["Forge a Training Sigil", "3 sets · class trial"]], daily: 270, coins: 53,
    stats: { strength: 64, cardio: 26, mobility: 24, endurance: 38, discipline: 52, recovery: 30, agility: 22, versatility: 20 } },
  ranger:     { name: "Ranger",      icon: "➶", main: ["Run the Windline", "Build enough momentum to reach the lookout before dusk.", 20, "+100 XP · +20 coins"], side: [["Map the Wilds", "8,000 steps"], ["String the Bow", "10 min"], ["Unlock Far-Sight", "15 min · class trial"]], daily: 280, coins: 55,
    stats: { strength: 22, cardio: 62, mobility: 26, endurance: 56, discipline: 50, recovery: 30, agility: 36, versatility: 20 } },
  mage:       { name: "Mage",        icon: "✦", main: ["Channel the Leyline", "Move with control and restore your connection to the valley.", 20, "+100 XP · +20 coins"], side: [["Gather Momentum", "15 min"], ["Trace the Runes", "5,000 steps"], ["Cast Arcane Flow", "10 min · class trial"]], daily: 280, coins: 54,
    stats: { strength: 20, cardio: 30, mobility: 64, endurance: 26, discipline: 52, recovery: 46, agility: 34, versatility: 20 } },
  allrounder: { name: "All-Rounder", icon: "✹", main: ["Conquer the Champion Circuit", "Complete a demanding strength session worthy of the all-rounder path.", 45, "+125 XP · +25 coins"], side: [["Walk the Long Road", "10,000 steps"], ["Outrun the Storm", "30 min"], ["Master the Fourfold Path", "20 min · class trial"]], daily: 365, coins: 73,
    stats: { strength: 44, cardio: 44, mobility: 42, endurance: 44, discipline: 56, recovery: 34, agility: 36, versatility: 60 } },
};
const STAKES = {
  soft:     ["Pauses", "No change", "Kept", "Unchanged"],
  balanced: ["Resets", "25% less until you clear your next main quest", "Kept", "Looks tired"],
  hardcore: ["Resets", "50% less until you clear your next main quest", "You lose 5%", "Injured"],
};
const XP_PER_LEVEL = 250;
const TABS = { today: "today", classes: "classes", stakes: "stakes", stats: "stats", fifteen: "stats", sixteen: "stats", app: "app", start: "app" };

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const acts = Object.fromEntries($$("[data-q-act]").map((el) => [el.id, el]));

let cls = CLASSES.warrior;
let own = null; // the visitor's own campaign, once they start one at the close

// ---------------------------------------------------------------- class
function pick(key) {
  cls = CLASSES[key];
  document.body.dataset.class = key;
  $$("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pick === key)));
  $$("[data-classname]").forEach((el) => (el.textContent = cls.name));
  $('[data-q="icon"]').textContent = cls.icon;
  $('[data-q="title"]').textContent = cls.main[0];
  $('[data-q="desc"]').textContent = cls.main[1];
  $('[data-q="target"]').textContent = cls.main[2];
  $('[data-q="reward"]').textContent = cls.main[3];
  cls.side.forEach(([name, target], i) => {
    $(`[data-q="s${i + 1}"]`).textContent = name;
    $(`[data-q="s${i + 1}t"]`).textContent = target;
  });
  lastLog = "";
  frame();
}
$$("[data-pick]").forEach((b, i) => {
  b.style.setProperty("--i", i);
  b.addEventListener("click", () => pick(b.dataset.pick));
});

// --------------------------------------------------------------- stakes
$$('input[name="stakes"]').forEach((input) => input.addEventListener("change", () => {
  const [streak, xp, coins, look] = STAKES[input.value];
  Object.entries({ streak, xp, coins, look }).forEach(([k, v]) => ($(`[data-stake="${k}"]`).textContent = v));
}));

// ------------------------------------------------- scroll → campaign state
// Act progress, measured the same way the engine does: pinned acts over their travel, flow acts over their whole pass.
const pinned = (el) => el.hasAttribute("data-sc-act") && el.dataset.scAct !== "flow";
function progress(el) {
  const r = el.getBoundingClientRect(), vh = innerHeight;
  return pinned(el) ? clamp01(-r.top / Math.max(r.height - vh, 1)) : clamp01((vh - r.top) / (r.height + vh));
}
// Document y at which an act reaches progress p, for the XP keyframes.
function yAt(el, p) {
  const r = el.getBoundingClientRect(), top = r.top + scrollY, vh = innerHeight;
  return pinned(el) ? top + p * Math.max(r.height - vh, 1) : top - vh + p * (r.height + vh);
}
let keys = [];
function measure() {
  keys = [
    [0, 0],
    [yAt(acts.today, 0.72), 0],
    [yAt(acts.today, 0.8), 100],     // the main quest clears
    [yAt(acts.stats, 0), 270],       // the rest of day one's board, while you pick a class and your stakes
    [yAt(acts.stats, 1), 3400],      // two weeks of full boards
    [yAt(acts.fifteen, 0.5), 3740],  // ten XP short
    [yAt(acts.sixteen, 0.3), 3740],
    [yAt(acts.sixteen, 0.36), 3750], // level 16
  ];
}
function xpAt(y) {
  for (let i = 1; i < keys.length; i++) {
    const [y0, x0] = keys[i - 1], [y1, x1] = keys[i];
    if (y <= y1) return Math.round(x0 + (x1 - x0) * clamp01((y - y0) / Math.max(y1 - y0, 1)));
  }
  return keys[keys.length - 1][1];
}

const hud = $(".hud");
const set = (sel, v) => { const el = $(sel); if (el.textContent !== String(v)) el.textContent = v; };
let lastLevel = 0, lastLine = "", lastLog = "";

function frame() {
  const vh = innerHeight;
  const xp = own ? 0 : xpAt(scrollY);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp % XP_PER_LEVEL;
  const day = Math.floor(xp / cls.daily) + 1;

  // HUD
  set('[data-hud="level"]', level);
  set('[data-hud="xpin"]', into);
  set('[data-hud="day"]', day);
  set('[data-hud="streak"]', day - 1);
  set('[data-hud="coins"]', Math.round((xp / cls.daily) * cls.coins).toLocaleString("en"));
  const bar = $('[data-hud="bar"]');
  bar.style.setProperty("--xp", (into / XP_PER_LEVEL).toFixed(3));
  bar.setAttribute("aria-valuenow", into);
  if (level > lastLevel && lastLevel) { hud.classList.remove("is-up"); void hud.offsetWidth; hud.classList.add("is-up"); }

  // Act 1: your scroll runs the main quest's timer
  const pToday = progress(acts.today);
  const done = own ? 0 : clamp01((pToday - 0.08) / 0.62);
  acts.today.style.setProperty("--done", done.toFixed(3));
  acts.today.style.setProperty("--cleared", own ? 0 : clamp01((pToday - 0.74) / 0.06).toFixed(3));
  set('[data-q="done"]', Math.round(done * cls.main[2]));

  // Act 4: the stat sheet fills, and the log records each level as it lands
  const pStats = own ? 0 : progress(acts.stats);
  const ease = 1 - Math.pow(1 - pStats, 2);
  $$("[data-stat]").forEach((li) => {
    const v = Math.round(6 + (cls.stats[li.dataset.stat] - 6) * ease);
    li.style.setProperty("--v", (v / 100).toFixed(3));
    li.querySelector("b").textContent = v;
  });
  const logKey = `${cls.name}:${level}`;
  if (logKey !== lastLog) {
    lastLog = logKey;
    const rows = [];
    for (let l = level; l >= 2 && rows.length < 5; l--) rows.push(`<li><b>Day ${Math.floor(((l - 1) * XP_PER_LEVEL) / cls.daily) + 1}</b>Reached level ${l}${l === 6 || l === 11 || l === 16 ? ` · JD is ${jdTier(l).label}` : ""}</li>`);
    if (!rows.length) rows.push(`<li><b>Day 1</b>${xp >= 100 ? "Cleared the main quest" : "Campaign started"}</li>`);
    $("[data-log]").innerHTML = rows.join("");
  }

  // JD, with the app's own lines for where you are
  const pPeak = progress(acts.sixteen);
  let line;
  if (own) line = jdLine(1, "waiting");
  else if (xp < 100) line = jdLine(1, done === 0 ? "waiting" : done < 0.7 ? "partial" : "nearly");
  else if (xp === 3740) line = jdLine(15, "nearly");
  else if (level >= 16 && pPeak > 0.62) line = jdLine(16, "done");
  else if (level > 1) line = jdLine(level, "levelup");
  else line = jdLine(1, "done");
  const tierLevel = own ? 1 : level;
  if (line !== lastLine) {
    lastLine = line;
    const dock = $(".dock");
    set('[data-jd="line"]', line);
    dock.classList.remove("is-talking"); void dock.offsetWidth; dock.classList.add("is-talking");
  }
  const tier = jdTier(tierLevel).label;
  set('[data-jd="tier"]', tier);
  const face = `./assets/jd-${tier.toLowerCase()}.webp`;
  if (!$('[data-jd="face"]').src.endsWith(face.slice(1))) $('[data-jd="face"]').src = face;

  // The peak owns the screen while it is up, so the dock steps aside
  const peakBox = acts.sixteen.getBoundingClientRect();
  document.body.classList.toggle("is-peak", peakBox.top < vh * 0.5 && peakBox.bottom > vh * 0.5);
  if (jd) jd.cue(pPeak);

  // Tabs: the section under the top third of the screen
  let current = "today";
  for (const [id, el] of Object.entries(acts)) if (el.getBoundingClientRect().top <= vh * 0.35) current = TABS[id];
  $$(".tabs a").forEach((a) => a.setAttribute("aria-current", String(a.getAttribute("href") === `#${current}`)));

  lastLevel = level;
}

let queued = false;
const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; frame(); }); } };
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", () => { measure(); schedule(); });
// the engine sizes the pinned acts on mount, so measure after it and after fonts settle
requestAnimationFrame(() => { measure(); frame(); });
document.fonts?.ready.then(() => { measure(); frame(); });

// ---------------------------------------------------------------- close
$("[data-newgame]").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = new FormData(event.target).get("hero").toString().trim().slice(0, 24);
  if (!name) return;
  own = name;
  event.target.classList.add("is-started");
  $("[data-newgame-out]").textContent = `${name} the ${cls.name}. Level 1, E-Rank, Day 1. Download the app below to start for real.`;
  set('[data-hud="demo"]', `Campaign: ${name}`);
  lastLog = "";
  frame();
});

// ----------------------------------------------------- JD at the peak (3D)
// The still render is the default and the fallback. The live model loads only where it is cheap to:
// a wide screen, motion allowed, no data saver.
let jd = null;
const wants3d = !reduce && !navigator.connection?.saveData && matchMedia("(min-width: 861px)").matches;
if (wants3d) {
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    mountJD().catch((error) => console.warn("JD unavailable, keeping the still image", error));
  }, { rootMargin: "150% 0px" });
  io.observe(acts.sixteen);
}

async function mountJD() {
  const [THREE, { GLTFLoader }, { VRMLoaderPlugin }, { createPoser }] = await Promise.all([
    import("three"), import("three/examples/jsm/loaders/GLTFLoader.js"), import("@pixiv/three-vrm"), import("./assets/jdpose.js"),
  ]);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const vrm = (await loader.loadAsync("./assets/models/jd.vrm")).userData.vrm;
  const host = $('[data-peak="canvas"]');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  // Same cap as the app: uncapped, JD's 57 morph targets become 8096x1 textures that GPUs pad to ~880 MB.
  renderer.capabilities.maxTextureSize = Math.min(renderer.capabilities.maxTextureSize, 1024);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x1a120a, 2.2));
  const key = new THREE.DirectionalLight(0xffe0b0, 3.4);
  key.position.set(2, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf4c76b, 1.4);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  scene.add(vrm.scene);
  const tall = new THREE.Box3().setFromObject(vrm.scene).getSize(new THREE.Vector3()).y;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const fit = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const dist = (tall * 0.6) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); // head to feet with some air
    camera.position.set(0, tall * 0.52, dist);
    camera.lookAt(0, tall * 0.5, 0);
    camera.updateProjectionMatrix();
  };
  fit();
  addEventListener("resize", fit);
  vrm.lookAt && (vrm.lookAt.target = camera);

  const poser = createPoser(vrm, "normal");
  const look = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { look.x = (e.clientX / innerWidth) * 2 - 1; look.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  let visible = true, last = performance.now(), cheered = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(acts.sixteen);
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (!visible) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    poser.update(dt, look, false);
    vrm.update(dt);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
  $(".peak").classList.add("has-3d");
  // the fist pump lands with "Level 16"; scrolling back above it re-arms it
  jd = { cue: (p) => { if (p > 0.32 && !cheered) { cheered = true; poser.play("fistpump"); } else if (p < 0.2) cheered = false; } };
}
