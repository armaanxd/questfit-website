import { chromium } from '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs';
// Refreshes assets/screen-*.jpg from the running QuestFit dev server (npm run dev in ~/Projects/questfit).
// Usage: node capture-screens.mjs [outDir] [appUrl]
const out = process.argv[2] || new URL('../assets', import.meta.url).pathname;
const url = process.argv[3] || 'http://localhost:5173/';
// Set CHROME_PATH to use a specific Chromium build if Playwright's own browser isn't downloaded.
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); p.on('dialog', d => d.dismiss());
// Fake the date only (10:00 today) and leave timers real: a fully frozen clock also froze the app's Motion
// animations, so views stayed invisible. Skipping ahead moves the date, which is all the session timer reads.
let now = new Date(); now.setHours(10, 0, 0, 0); now = now.getTime();
await p.clock.setSystemTime(now);
const skip = async (ms) => { now += ms; await p.clock.setSystemTime(now); await p.waitForTimeout(1100); };
await p.goto(url); await p.waitForTimeout(400);
await p.click('[data-action=create-account]'); await p.waitForTimeout(300);
await p.fill('input[name=name]', 'Kael');
await p.click('#onboarding-form button[type=submit]'); await p.waitForTimeout(500);
const quests = async () => { await p.click('.sidebar [data-view=quests]'); await p.waitForTimeout(300); };
await quests();
await p.locator('#quests-view [data-action=start-session]').first().click();
await skip(20 * 60000);
await p.click('#quests-view [data-action=finish-session]'); await p.waitForTimeout(300);
await p.locator('#quests-view .manual-log').first().locator('summary').click();
await p.locator('#quests-view .log-form').first().locator('input').fill('2000');
await p.locator('#quests-view .log-form').first().locator('button[type=submit]').click(); await p.waitForTimeout(300);
for (let set = 0; set < 2; set += 1) {
  await quests();
  await p.click('#quests-view [data-action=set-done]');
  await skip(31000);
}
for (const v of ['dashboard', 'quests', 'stats', 'character']) {
  await p.click(`.sidebar [data-view=${v}]`); await p.waitForTimeout(500);
  // The browser build shows "Health Connect is in the Android app"; hide it so the shots look like the phone.
  await p.evaluate(() => { document.querySelector('.connect-card')?.remove(); window.scrollTo(0, 0); }); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/screen-${v}.jpg`, type: 'jpeg', quality: 82 });
}
await b.close();
