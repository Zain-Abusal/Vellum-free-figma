// End-to-end smoke test: builds nothing, serves ./dist with `vite preview` (which also serves /api
// with in-memory rooms) and drives real Chrome. Usage: npm run build && npm run test:e2e
// Set CHROME_PATH if Chrome isn't at /usr/bin/google-chrome. Screenshots go to ./test-results/.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'error' });
const BASE = 'http://localhost:4179/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
const errors = [];
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed++;
};

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push('console: ' + m.text()));
  return page;
}

async function canvasHelpers(page) {
  const c = await page.locator('.canvas-svg').boundingBox();
  const at = (x, y) => [c.x + x, c.y + y];
  const drag = async (x1, y1, x2, y2) => {
    await page.mouse.move(...at(x1, y1));
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(...at(x1 + ((x2 - x1) * i) / 6, y1 + ((y2 - y1) * i) / 6));
    await page.mouse.up();
  };
  return { at, drag };
}

const layerNames = (page) => page.locator('.layer-row .layer-name').allTextContents();

try {
  /* ---------- editor basics ---------- */
  const a = await newPage();
  await a.goto(BASE);
  await a.click('text=New design file');
  await a.waitForSelector('.canvas-svg');
  const { at, drag } = await canvasHelpers(a);

  await a.keyboard.press('f');
  await drag(100, 100, 600, 500);
  await a.keyboard.press('r');
  await drag(150, 150, 300, 260);
  await a.keyboard.press('o');
  await drag(350, 150, 450, 250);
  await a.keyboard.press('t');
  await a.mouse.click(...at(160, 330));
  await a.waitForTimeout(100);
  await a.keyboard.type('Hello Vellum');
  await a.mouse.click(...at(900, 650));
  check((await layerNames(a)).join() === 'Frame 1,Text 1,Ellipse 1,Rectangle 1', 'draw frame, rectangle, ellipse, text');

  // Drag uses a visual preview, then commits on drop.
  const before = await a.evaluate(() => document.querySelector('[data-id]') && 1);
  await a.mouse.click(...at(200, 200));
  await drag(200, 200, 260, 240);
  const xVal = await a.locator('.num:has(.num-label:text-is("X")) input').inputValue();
  check(before === 1 && xVal !== '', `drag move commits (X=${xVal})`);
  await a.keyboard.press('Control+z');

  // Star tool from the shape menu.
  await a.click('.tool-caret');
  await a.click('.menu.up >> text=Star');
  await drag(700, 150, 800, 250);
  check((await layerNames(a))[0] === 'Star', 'star tool');

  // Boolean: union of rect + ellipse.
  await a.keyboard.press('Escape');
  await a.mouse.click(...at(200, 200));
  await a.keyboard.down('Shift');
  await a.mouse.click(...at(400, 200));
  await a.keyboard.up('Shift');
  await a.click('.bool-row >> text=Union');
  check((await a.locator('.layer-row .layer-name').allTextContents()).includes('Union') || (await a.locator('.type-badge').textContent()) === 'Vector', 'boolean union');

  // Extensions: Color Palette and Lorem Ipsum.
  await a.keyboard.press('Escape');
  await a.keyboard.press('Control+/');
  await a.waitForSelector('.ext-list');
  check((await a.locator('.ext').count()) >= 10, `extensions listed (${await a.locator('.ext').count()})`);
  await a.click('.ext:has-text("Color Palette")');
  await a.click('text=Run Color Palette');
  await a.waitForTimeout(300);
  check((await layerNames(a)).includes('Palette'), 'Color Palette extension created swatches');
  await a.keyboard.press('Control+z');
  check(!(await layerNames(a)).includes('Palette'), 'extension run is one undo step');

  await a.screenshot({ path: `${OUT}/editor.png` });

  // Local storage mirror.
  await a.waitForTimeout(900);
  const lsKeys = await a.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vellum:file:')).length);
  check(lsKeys >= 1, 'file mirrored to localStorage');

  /* ---------- live collaboration ---------- */
  await a.click('.topbar >> text=Share');
  await a.click('text=Start live collaboration');
  await a.waitForURL(/#\/room\//);
  await a.waitForSelector('.live-dot.live', { timeout: 10000 });
  const editUrl = a.url();
  check(/#\/room\/\w+\/\w+$/.test(editUrl), 'room created with edit link');

  const b = await newPage();
  await b.goto(editUrl);
  await b.waitForSelector('.live-dot.live', { timeout: 10000 });
  check((await layerNames(b)).includes('Frame 1'), 'collaborator B loads the shared file');

  // A draws; B should see it.
  await a.keyboard.press('r');
  const ha = await canvasHelpers(a);
  await ha.drag(900, 150, 1000, 250);
  await b.waitForFunction(() => [...document.querySelectorAll('.layer-row .layer-name')].some((e) => e.textContent?.startsWith('Rectangle')), null, { timeout: 8000 }).then(
    () => check(true, 'edit in A appears in B'),
    () => check(false, 'edit in A appears in B'),
  );

  // B sees A's cursor and avatar.
  await a.mouse.move(...ha.at(500, 500));
  await a.mouse.move(...ha.at(520, 520));
  await b.waitForSelector('.peer-cursor', { timeout: 8000 }).then(
    () => check(true, 'live cursor of A visible in B'),
    () => check(false, 'live cursor of A visible in B'),
  );
  check((await b.locator('.avatars .avatar:not(.me)').count()) >= 1, 'avatar of A shown in B');

  // View-only link.
  const viewUrl = editUrl.replace(/\/\w+$/, '');
  const v = await newPage();
  await v.goto(viewUrl);
  await v.waitForSelector('.avatars .badge', { timeout: 10000 });
  check((await v.locator('.avatars .badge').textContent()) === 'View only', 'view link is read-only');

  await b.screenshot({ path: `${OUT}/collab.png` });
} catch (e) {
  console.error(e);
  failed++;
} finally {
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
  server.httpServer.close();
}
process.exit(failed || errors.length ? 1 : 0);
