// The play layer: the real app in a phone, the stakes simulator, card spotlights and the level-up burst.
// All of it is extra: the page reads the same without it, and nothing moves when motion is reduced.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

// ------------------------------------------------------------- live app
// The app reads its save from these keys, so a seeded save opens straight onto a demo hero's dashboard.
const STATE_KEY = "questfit-local-v1";
const SESSION_KEY = "questfit-session-v1";
const phone = $("[data-live]");
const frame = $("[data-live-frame]");
const startButton = $("[data-live-start]");
const resetButton = $("[data-live-reset]");
const localDay = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD in the visitor's time zone

async function startLive() {
  startButton.disabled = true;
  try {
    if (!localStorage.getItem(STATE_KEY)) {
      const res = await fetch("./app/demo-state.json");
      if (!res.ok) throw new Error(`demo state: ${res.status}`);
      const raw = await res.text();
      // The save was made on build day; moving it to today stops the app opening on a pile of missed days.
      localStorage.setItem(STATE_KEY, raw.replaceAll(JSON.parse(raw).day, localDay()));
      localStorage.setItem(SESSION_KEY, "active");
    }
  } catch (error) {
    console.warn("Live demo unavailable", error);
    startButton.textContent = "Live demo unavailable";
    return;
  }
  // On a phone the frame fills the screen and swallows the page's scroll, so the app opens full screen instead.
  if (matchMedia("(max-width: 860px), (pointer: coarse)").matches) return void (location.href = "./app/index.html");
  frame.src = "./app/index.html";
  frame.hidden = false;
  phone.classList.add("is-live");
  resetButton.hidden = false;
}

function resetLive() {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {}
  frame.src = "about:blank";
  phone.classList.remove("is-live");
  startButton.disabled = false;
  resetButton.hidden = true;
}

// JD's dock sits in the same corner, so it steps aside while the phone is on screen
if (phone) new IntersectionObserver(([e]) => document.body.classList.toggle("is-live-view", e.isIntersecting), { threshold: 0.2 }).observe(phone);
startButton?.addEventListener("click", startLive);
try { if (resetButton && localStorage.getItem(STATE_KEY)) resetButton.hidden = false; } catch {}
resetButton?.addEventListener("click", resetLive);

// ------------------------------------------------------- stakes simulator
// The app's own miss rules (questfit/game.js applyMiss): Soft pauses and never spends the shield;
// Balanced and Hardcore spend the shield first, then reset the streak and cut XP until the next main quest.
const MODES = {
  soft: { reset: false, debuff: 0, coinLoss: 0 },
  balanced: { reset: true, debuff: 25, coinLoss: 0 },
  hardcore: { reset: true, debuff: 50, coinLoss: 0.05 },
};
const sim = $("[data-sim]");
if (sim) {
  const s = { streak: 13, debuff: 0, coins: 735, shield: 1 };
  const out = (key) => $(`[data-sim="${key}"]`, sim);
  const mode = () => $('input[name="stakes"]:checked')?.value || "balanced";
  const pop = (key, color) => {
    if (reduce) return;
    out(key).animate([{ transform: "scale(1.3)", color }, { transform: "scale(1)" }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
  };
  const render = (changed = [], color = "var(--sc-ink)") => {
    out("streak").textContent = s.streak;
    out("rate").textContent = `${100 - s.debuff}%`;
    out("coins").textContent = s.coins.toLocaleString("en");
    out("shield").textContent = s.shield;
    changed.forEach((key) => pop(key, color));
  };
  const log = (text) => (out("log").textContent = text);

  $('[data-sim-act="miss"]', sim).addEventListener("click", () => {
    const m = MODES[mode()];
    if (m.reset && s.shield > 0) {
      s.shield -= 1;
      log("Your shield absorbed the miss. Streak safe, nothing else changes. Miss again and the stakes bite.");
      return render(["shield"], "var(--sc-blue)");
    }
    const changed = [];
    if (m.reset && s.streak) { s.streak = 0; changed.push("streak"); }
    if (m.debuff !== s.debuff) { s.debuff = m.debuff; changed.push("rate"); }
    let lost = 0;
    if (m.coinLoss) { lost = s.coins - Math.floor(s.coins * (1 - m.coinLoss)); s.coins -= lost; changed.push("coins"); }
    log(!m.reset
      ? `Missed. On Soft your streak pauses at ${s.streak} and nothing else changes.`
      : `Missed. Streak reset, and XP is ${m.debuff}% lower until you clear your next main quest${lost ? `. You lost ${lost} coins` : ""}.`);
    render(changed, "var(--sc-pink)");
    if (!reduce) sim.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 360 });
  });

  $('[data-sim-act="clear"]', sim).addEventListener("click", () => {
    const xp = Math.floor(100 * (1 - s.debuff / 100));
    const lifted = s.debuff > 0;
    s.streak += 1;
    s.coins += 20;
    s.debuff = 0;
    log(`Main quest cleared: +${xp} XP, +20 coins${lifted ? ". Penalty lifted" : ""}.`);
    render(["streak", "coins", ...(lifted ? ["rate"] : [])], "var(--cls)");
  });
}

// -------------------------------------------------- spotlights and glow
if (finePointer && !reduce) {
  for (const card of $$(".board, .cls, .sheet, .stakes__panel, .newgame, .phone")) {
    card.classList.add("glow");
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }, { passive: true });
  }
  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  document.body.append(glow);
  let x = innerWidth / 2, y = innerHeight / 3, queued = false;
  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; glow.style.transform = `translate3d(${x}px, ${y}px, 0)`; });
  }, { passive: true });
}

// ------------------------------------------------------- level-up burst
const levelEl = $('[data-hud="level"]');
if (levelEl && !reduce) {
  let last = Number(levelEl.textContent), lastBurst = 0;
  new MutationObserver(() => {
    const level = Number(levelEl.textContent);
    // fast scrolling crosses several levels a second: one burst at a time is plenty
    if (level > last && performance.now() - lastBurst > 350) { lastBurst = performance.now(); burst(); }
    last = level;
  }).observe(levelEl, { childList: true, characterData: true, subtree: true });
}

function burst() {
  const r = $(".hud__lv").getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ring = document.createElement("span");
  ring.className = "burst-ring";
  ring.style.left = `${cx}px`;
  ring.style.top = `${cy}px`;
  document.body.append(ring);
  ring.animate([{ transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.9 }, { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.then(() => ring.remove());
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement("span");
    dot.className = "burst-dot";
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    if (i % 2) dot.style.background = "var(--cls)";
    document.body.append(dot);
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 34 + Math.random() * 30;
    dot.animate([
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.3)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 200, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.then(() => dot.remove());
  }
}
