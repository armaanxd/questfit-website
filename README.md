# QuestFit website

The marketing site for the QuestFit app. Plain HTML, CSS and JavaScript: no build step. Outside scripts, all from jsDelivr: Three.js and `@pixiv/three-vrm` (JD, loaded after first paint) and Lenis (smooth scrolling).

| File | What it is |
|---|---|
| `index.html` | The landing page |
| `privacy.html` | Privacy policy (draft, see below) |
| `styles.css` | All styles; palette and fonts match the app |
| `main.js` | Google Play button and the playable quest demo |
| `assets/` | App screenshots, favicon, and `jd-hero.webp` and `jd-aloof/grudging/warm/proud.webp` (transparent still renders of JD for the hero and the attitude cards; retake them if the model or poses change) |
| `assets/jdstage.js`, `assets/jdpose.js`, `assets/jdvoice.js`, `assets/models/jd.vrm` | JD, one 3D character for the whole page. `jdstage.js` moves a small fixed canvas to whichever `[data-jd-anchor]` element is on screen and docks it in the corner otherwise; `data-jd-move` on a section plays a move as it arrives. `jdpose.js` and `jdvoice.js` are copied from `~/Projects/questfit` (keep in step). Model: "AvatarSample_C" by pixiv VRoid Project, credit required, no modification. Visitors who prefer reduced motion or save data keep the still images. |
| `tools/capture-screens.mjs` | Retakes the app screenshots |

## View it locally

```bash
cd ~/Projects/questfit-website
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Turn on the Google Play button

1. In `main.js`, set `PLAY_STORE_URL` to the app's Play Store link.
2. Download the official "Get it on Google Play" badge from https://play.google.com/intl/en_us/badges/ and save it as `assets/google-play-badge.png`. Google requires its own badge artwork.

Until then, every download button shows "Coming soon to Google Play".

## Before publishing

- `privacy.html` is a draft: review it, replace `hello@example.com` with a real contact address, and remove the draft notice.
- Update the privacy policy before the food log or cloud backup ships. Keep it in step with the app's `public/privacypolicy.html`.

## Refresh the screenshots

With the app's dev server running (`npm run dev` in `~/Projects/questfit`):

```bash
node ~/Projects/questfit-website/tools/capture-screens.mjs [outDir] [appUrl]
```

It creates a sample campaign called Kael, logs some progress, and saves the Dashboard, Quests, Stats and Character screens to `assets/`. It uses the Playwright copy installed with `@playwright/cli` and a fake clock for the timer session. If Playwright says its browser is missing, set `CHROME_PATH` to a Chromium binary (e.g. the one in `~/Library/Caches/ms-playwright`).

## Hosting

Any static host works: Netlify, Cloudflare Pages, GitHub Pages, or Railway alongside the future backend.
