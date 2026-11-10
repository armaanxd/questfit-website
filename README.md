# QuestFit website

The marketing site for the QuestFit app. Plain HTML, CSS and JavaScript: no build step. Outside scripts, all from jsDelivr: Three.js and `@pixiv/three-vrm` (JD at the level 16 moment, desktop only).

The page is a "live surface" built with the scroll-craft skill: it behaves like the app, and scrolling levels a demo campaign from 1 to 16 on the app's real rules while JD warms up. The brief is in `scrollcraft/builds/questfit/BRIEF.md`.

| File | What it is |
|---|---|
| `index.html` | The landing page: eight acts (Today, Classes, Stakes, Stats, Level 15, Level 16, The app, New campaign) |
| `page.js` | The demo campaign: the XP keyframes, HUD, class picker, stakes switch, campaign log, JD's lines, the closing form, and the 3D JD at level 16. The class data copies `~/Projects/questfit/game.js`, so keep it in step |
| `page.css` | The page's styles and theme tokens; palette and fonts match the app |
| `scrollcraft.js`, `scrollcraft.css` | The scroll-craft engine (pinning, sideways rail, reveals). Don't edit; theme it from `page.css` |
| `styles.css` | Styles for `privacy.html` only |
| `privacy.html` | Privacy policy (draft, see below) |
| `assets/` | App screenshots, favicon, and `jd-hero.webp` and `jd-aloof/grudging/warm/proud.webp` (transparent still renders of JD; retake them if the model or poses change) |
| `assets/jdpose.js`, `assets/jdvoice.js`, `assets/models/jd.vrm` | JD. `jdpose.js` and `jdvoice.js` are copied from `~/Projects/questfit` (keep in step). Model: "AvatarSample_C" by pixiv VRoid Project, credit required, no modification. Phones, reduced motion and save data keep the still image |
| `assets/app-tour.mp4`, `assets/app-tour.webm` | The 30-second video in "The app" (a screen recording of the app). The MP4 is for Safari |
| `tools/capture-screens.mjs` | Retakes the app screenshots |
| `tools/record-video.mjs` | Re-records both videos from the running app. Start the app with `npx vite --host 127.0.0.1` in `~/Projects/questfit` (`npm run dev` opens it to the whole network). The MP4 needs Homebrew's `ffmpeg` |
| `scrollcraft/` | The build brief and the fingerprint registry the skill checks new builds against |
| `fun.js` | The play layer: the live app phone, the stakes simulator, card spotlights and the level-up burst |
| `tools/build-demo.sh` | Builds the real app from `~/Projects/questfit` into `app/` (git-ignored, ~17 MB) for "Play the real app". Rerun after app changes and before deploying |
| `assets/questfit.apk` | The signed Android build behind "Download for Android" (git-ignored: copy it in from `~/Projects/questfit/android/app/build/outputs/apk/release/`) |

## View it locally

```bash
cd ~/Projects/questfit-website
./tools/build-demo.sh   # once, and after app changes
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Turn on the Google Play button

The page has no store link yet: the closing form says "QuestFit isn't on Google Play yet". When the listing is live, add the official "Get it on Google Play" badge (https://play.google.com/intl/en_us/badges/, saved as `assets/google-play-badge.png`; Google requires its own artwork) linking to the listing, in the `#start` form in `index.html`.

## Before publishing

- `privacy.html` is a draft: review it and remove the draft notice. Contact: contact.questfit.app@gmail.com (also in the app's `public/privacypolicy.html`).
- Update the privacy policy before the food log or cloud backup ships. Keep it in step with the app's `public/privacypolicy.html`.

## Refresh the screenshots

With the app's dev server running (`npm run dev` in `~/Projects/questfit`):

```bash
node ~/Projects/questfit-website/tools/capture-screens.mjs [outDir] [appUrl]
```

It creates a sample campaign called Kael, logs some progress, and saves the Dashboard, Quests, Stats and Character screens to `assets/`. It uses the Playwright copy installed with `@playwright/cli` and a fake clock for the timer session. If Playwright says its browser is missing, set `CHROME_PATH` to a Chromium binary (e.g. the one in `~/Library/Caches/ms-playwright`).

## Hosting

Any static host works: Netlify, Cloudflare Pages, GitHub Pages, or Railway alongside the future backend.
