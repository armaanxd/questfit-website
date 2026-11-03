import { jdLine, jdTier } from "./assets/jdvoice.js";

// Paste the Play Store listing URL here once the app is published.
// Empty: every download button shows "Coming soon to Google Play".
const PLAY_STORE_URL = "";

// Google requires its official badge artwork for live links. Download it from
// https://play.google.com/intl/en_us/badges/ and save it to this path.
const PLAY_BADGE_SRC = "assets/google-play-badge.png";

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5v17l14-8.5z"/></svg>';

document.querySelectorAll("[data-play]").forEach((slot) => {
  slot.innerHTML = PLAY_STORE_URL
    ? `<a class="play-badge" href="${PLAY_STORE_URL}" rel="noopener"><img src="${PLAY_BADGE_SRC}" alt="Get it on Google Play" /></a>`
    : `<span class="btn btn--soon" role="note">${PLAY_ICON}Coming soon to Google Play</span>`;
});

// Every effect below checks this, so visitors who ask for reduced motion get a still page.
const motionOK = matchMedia("(prefers-reduced-motion: no-preference)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
if (motionOK) document.documentElement.classList.add("motion");

const rand = (min, max) => min + Math.random() * (max - min);

// ---------- Hero: drifting runes and cursor glow ----------
const hero = document.querySelector(".hero");
const runes = document.querySelector(".runes");
if (motionOK) {
  for (let i = 0; i < 16; i += 1) {
    const rune = document.createElement("span");
    rune.className = "rune";
    rune.textContent = "✦";
    rune.style.cssText = `--x:${rand(2, 98)}%;--y:${rand(15, 95)}%;--s:${rand(8, 18)}px;--o:${rand(.2, .55)};--d:${rand(7, 13)}s;--delay:${-rand(0, 13)}s;--sway:${rand(-30, 30)}px`;
    runes.append(rune);
  }
}
if (motionOK && finePointer) {
  hero.addEventListener("pointermove", (event) => {
    const box = runes.getBoundingClientRect();
    runes.style.setProperty("--mx", `${event.clientX - box.left}px`);
    runes.style.setProperty("--my", `${event.clientY - box.top}px`);
    runes.style.setProperty("--glow", "1");
  });
  hero.addEventListener("pointerleave", () => runes.style.setProperty("--glow", "0"));
}

// ---------- Scroll reveals ----------
if (motionOK) {
  document.querySelectorAll("main section:not(.hero) h2, .demo-copy p, .stakes-lede, .soon-lede, .stakes-safe, .cta .play-slot")
    .forEach((el) => el.classList.add("reveal"));
  document.querySelectorAll("[data-stagger]").forEach((group) => {
    [...group.children].forEach((child, index) => child.style.setProperty("--i", index));
  });
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  }), { threshold: .2, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal, [data-stagger], .screen-strip").forEach((el) => observer.observe(el));
}

// ---------- Screenshot phones tilt toward the cursor ----------
if (motionOK && finePointer) {
  document.querySelectorAll(".screen-strip .phone").forEach((phone) => {
    phone.addEventListener("pointermove", (event) => {
      const box = phone.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      phone.classList.add("is-tilting");
      phone.style.transform = `perspective(900px) rotateX(${-y * 10}deg) rotateY(${x * 14}deg) scale(1.02)`;
    });
    phone.addEventListener("pointerleave", () => {
      phone.classList.remove("is-tilting");
      phone.style.transform = "";
    });
  });
}

// ---------- Class icons play their hover animation once on touch screens ----------
if (motionOK && !matchMedia("(hover: hover)").matches) {
  const iconObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    setTimeout(() => entry.target.classList.add("is-played"), 500); // after the stagger reveal settles
    iconObserver.unobserve(entry.target);
  }), { threshold: .6 });
  document.querySelectorAll(".class").forEach((el) => iconObserver.observe(el));
}

// ---------- FAQ answers slide open and closed ----------
document.querySelectorAll(".faq details").forEach((details) => {
  const answer = details.querySelector("p");
  details.querySelector("summary").addEventListener("click", (event) => {
    if (!motionOK) return;
    event.preventDefault();
    if (details.open) {
      const closing = answer.animate(
        [{ height: `${answer.offsetHeight}px`, paddingBottom: "1.25rem", opacity: 1 }, { height: "0px", paddingBottom: "0px", opacity: 0 }],
        { duration: 240, easing: "ease-in" },
      );
      closing.onfinish = () => { details.open = false; };
    } else {
      details.open = true;
      answer.animate(
        [{ height: "0px", paddingBottom: "0px", opacity: 0 }, { height: `${answer.offsetHeight}px`, paddingBottom: "1.25rem", opacity: 1 }],
        { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" },
      );
    }
  });
});

// ---------- Menu links: the section heading glows once you arrive ----------
document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", () => {
  const heading = document.querySelector(link.getAttribute("href"))?.querySelector("h2");
  if (!heading || !motionOK) return;
  setTimeout(() => {
    heading.classList.remove("is-arrived");
    void heading.offsetWidth; // restart the glow if the same link is clicked twice
    heading.classList.add("is-arrived");
  }, 550);
}));

// ---------- Playable main quest ----------
const TARGET = 30;
const STEP = 10; // the guide reacts every 10 minutes
const TICK_MS = 100; // one demo minute
const QUEST_XP = 100;
const QUEST_COINS = 20;
const XP_PER_LEVEL = 250;
const LINE_KINDS = { 0: "waiting", 10: "partial", 20: "nearly", 30: "done" }; // by minutes into the quest

const quest = document.getElementById("quest");
const bar = document.getElementById("quest-bar");
const count = document.getElementById("quest-count");
const button = document.getElementById("quest-log");
const reward = document.getElementById("reward");
const guide = document.getElementById("guide");
const says = document.getElementById("guide-says");
let robot = null; // { react } once the 3D guide has loaded

// Loaded only when the demo scrolls near, so Three.js and the model never slow the first paint.
new IntersectionObserver(([entry], observer) => {
  if (!entry.isIntersecting) return;
  observer.disconnect();
  import("./assets/avatar3d.js")
    .then(({ mountAvatar }) => mountAvatar(guide, { className: "warrior", level: levelOf(totalXp) }))
    .then((api) => { robot = api || null; })
    .catch((error) => console.warn("3D guide unavailable", error));
}, { rootMargin: "200px" }).observe(guide);
const xpLevel = document.getElementById("xp-level");
const xpText = document.getElementById("xp-text");
const xpFill = document.getElementById("xp-fill");
const jdLabel = document.getElementById("jd-label");
let progress = 0;
let totalXp = 120;
let timer = null;

const levelOf = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;

function showXp() {
  const intoLevel = totalXp % XP_PER_LEVEL;
  xpLevel.textContent = `Level ${levelOf(totalXp)}`;
  xpText.textContent = `${intoLevel} / ${XP_PER_LEVEL} XP`;
  xpFill.style.width = `${(intoLevel / XP_PER_LEVEL) * 100}%`;
  jdLabel.textContent = jdTier(levelOf(totalXp)).label;
}

function render() {
  const done = progress >= TARGET;
  bar.firstElementChild.style.width = `${(progress / TARGET) * 100}%`;
  bar.setAttribute("aria-valuenow", progress);
  count.textContent = done ? "Quest complete" : `${progress} / ${TARGET} min`;
  says.textContent = jdLine(levelOf(totalXp), LINE_KINDS[Math.floor(progress / STEP) * STEP]);
  button.textContent = done ? "Play again" : timer ? "Pause" : progress ? "Resume" : "Start session";
  quest.classList.toggle("is-done", done);
  reward.textContent = done ? `+${QUEST_XP} XP and +${QUEST_COINS} coins` : "";
  showXp();
}

// Removes a one-shot effect element once its animation ends.
function spawn(parent, className, text, style) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  el.setAttribute("aria-hidden", "true");
  if (style) el.style.cssText = style;
  el.addEventListener("animationend", () => el.remove());
  parent.append(el);
}

function popNumber() {
  spawn(button.parentElement, "float-num", `+${STEP} min`);
}

function burst() {
  const colors = ["#f4c76b", "#e2d9ff", "#b8a0ff", "#6c9cff", "#ff6f9e"];
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + rand(-.2, .2);
    const distance = rand(70, 150);
    spawn(quest, "spark", "✦", `--x:${rand(40, 60)}%;--y:55%;--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px;--r:${rand(-180, 180)}deg;--s:${rand(10, 20)}px;--c:${colors[i % colors.length]}`);
  }
}


function levelUp(level) {
  // Shown even with reduced motion: it tells the player something happened.
  const banner = document.createElement("div");
  banner.className = "levelup";
  banner.textContent = `Level ${level}`;
  quest.append(banner);
  setTimeout(() => banner.remove(), 1800);
  says.textContent = jdLine(level, "levelup");
}

function tick() {
  progress += 1;
  if (progress >= TARGET) {
    clearInterval(timer);
    timer = null;
  }
  render();
  if (progress % STEP === 0 && progress < TARGET) {
    if (motionOK) popNumber();
    if (jdTier(levelOf(totalXp)).tier >= 2) robot?.react("nod"); // the cold JD doesn't nod along
  }
  if (progress >= TARGET) complete();
}

function complete() {
  const levelBefore = levelOf(totalXp);
  totalXp += QUEST_XP;
  showXp();
  const leveledUp = levelOf(totalXp) > levelBefore;
  if (leveledUp) levelUp(levelOf(totalXp));
  robot?.react(jdTier(levelOf(totalXp)).move); // JD celebrates as warmly as his level allows
  if (motionOK) burst();
}

button.addEventListener("click", () => {
  if (progress >= TARGET) progress = 0;
  else if (timer) {
    clearInterval(timer);
    timer = null;
  } else timer = setInterval(tick, TICK_MS);
  render();
});

// Lets visitors meet JD at each attitude without playing through fifteen levels.
document.querySelectorAll("[data-level]").forEach((chip) => chip.addEventListener("click", () => {
  totalXp = (Number(chip.dataset.level) - 1) * XP_PER_LEVEL + 120;
  document.querySelectorAll("[data-level]").forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
  showXp();
  render();
  robot?.react(jdTier(levelOf(totalXp)).move);
}));

render();
