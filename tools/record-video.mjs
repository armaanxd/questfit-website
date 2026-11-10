import { chromium } from '/Users/armaansingh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
// Records assets/app-tour.webm: a walk through the running QuestFit dev server (npm run dev in ~/Projects/questfit).
// Usage: node record-video.mjs [appUrl]. Set CHROME_PATH to use a specific Chromium build.
const url = process.argv[2] || 'http://localhost:5173/';
const out = new URL('../assets/app-tour.webm', import.meta.url).pathname;
// A real 2x display (not emulated), because the screencast ignores emulated pixel density.
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--force-device-scale-factor=2', '--window-size=390,1154'] });
const ctx = await b.newContext({ viewport: null });
const p = await ctx.newPage(); p.on('dialog', d => d.dismiss());
// Fake the date only (10:00 today) and leave timers real: a fully frozen clock also froze the app's Motion
// animations, so views stayed invisible. Skipping ahead moves the date, which is all the session timer reads.
let now = new Date(); now.setHours(10, 0, 0, 0); now = now.getTime();
await p.clock.setSystemTime(now);
const skip = async (ms) => { now += ms; await p.clock.setSystemTime(now); await p.waitForTimeout(1100); };

// Capture CDP screencast frames and re-time them to a steady 25 fps ourselves.
const frames = [];
const cdp = await ctx.newCDPSession(p);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, jpeg: Buffer.from(data, 'base64') });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
const pause = (ms) => p.waitForTimeout(ms);
const glide = async (to) => { // a slow scroll, so the video reads like a thumb
  await p.evaluate(async (y) => { const from = scrollY; for (let i = 1; i <= 30; i += 1) { scrollTo(0, from + (y - from) * (i / 30)); await new Promise(r => setTimeout(r, 25)); } }, to);
};
const view = async (name, hold = 1800) => {
  await p.click(`.sidebar [data-view=${name}]`); await pause(500);
  await p.evaluate(() => { document.querySelector('.connect-card')?.remove(); scrollTo(0, 0); });
  await pause(hold);
};

await p.goto(url);
// The browser build shows "Health Connect is in the Android app"; hide it so the video looks like the phone.
await p.addStyleTag({ content: '.connect-card { display: none !important; }' }); await pause(1200);
await p.click('[data-action=create-account]'); await pause(900);
await p.locator('input[name=name]').pressSequentially('Kael', { delay: 160 }); await pause(700);
await p.click('#onboarding-form button[type=submit]'); await pause(1800);
await glide(420); await pause(1200); await glide(0); await pause(600);

await view('quests', 1500);
await p.locator('#quests-view [data-action=start-session]').first().click(); await pause(1200);
await skip(10 * 60000); await pause(1200);
await skip(10 * 60000); await pause(900);
await p.click('#quests-view [data-action=finish-session]'); await pause(1800);
await glide(380); await pause(1200); await glide(0); await pause(500);

await view('stats', 1500);
await glide(500); await pause(1200);
await view('character', 1500);
await glide(450); await pause(1500);
await view('dashboard', 2200);

await cdp.send('Page.stopScreencast');
await b.close();

// Encode with the ffmpeg that ships with Playwright (VP8 only, reads MJPEG from a pipe).
const ffmpeg = process.env.FFMPEG || `${process.env.HOME}/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac`;
const FPS = 25;
const t0 = frames[0].t;
const total = Math.ceil((frames.at(-1).t - t0) * FPS);
const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '1100k', '-pix_fmt', 'yuv420p', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
let at = 0;
for (let i = 0; i < total; i += 1) {
  while (at + 1 < frames.length && frames[at + 1].t - t0 <= i / FPS) at += 1;
  if (!enc.stdin.write(frames[at].jpeg)) await new Promise(r => enc.stdin.once('drain', r));
}
enc.stdin.end();
await new Promise(r => enc.on('close', r));
console.log('wrote', out, fs.statSync(out).size, 'bytes,', frames.length, 'captured frames');
// An H.264 copy for Safari, which can't play every WebM. Needs a full ffmpeg (Homebrew's); Playwright's only does VP8.
const mp4 = out.replace(/\.webm$/, '.mp4');
const h264 = spawn(process.env.FFMPEG_FULL || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
await new Promise(r => h264.on('close', r));
if (fs.existsSync(mp4)) console.log('wrote', mp4, fs.statSync(mp4).size, 'bytes');
