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
  await a.click('.tool-caret[title^="More rectangle"]');
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

  // Extensions: Color Palette (via toolbar button).
  await a.keyboard.press('Escape');
  await a.click('#btn-extensions');
  await a.waitForSelector('.ext-list');
  check((await a.locator('.ext').count()) >= 12, `extensions listed (${await a.locator('.ext').count()})`);
  await a.click('.ext:has-text("Color Palette")');
  await a.click('text=Run Color Palette');
  await a.waitForTimeout(300);
  check((await layerNames(a)).includes('Palette'), 'Color Palette extension created swatches');
  await a.keyboard.press('Control+z');
  check(!(await layerNames(a)).includes('Palette'), 'extension run is one undo step');

  // Quick actions palette: search and run a command.
  await a.keyboard.press('Control+/');
  await a.waitForSelector('.palette');
  await a.keyboard.type('section');
  check((await a.locator('.cmd').first().textContent())?.includes('Section'), 'quick actions finds "Section"');
  await a.keyboard.press('Enter');
  await a.waitForTimeout(100);
  await drag(650, 450, 1000, 700);
  check((await layerNames(a)).some((n) => n.startsWith('Section')), 'section tool via quick actions');
  await a.keyboard.press('Escape');

  // Text: side handle switches to fixed width and wraps.
  await a.keyboard.press('t');
  await a.mouse.click(...at(200, 620));
  await a.waitForTimeout(100);
  await a.keyboard.type('A long line of text that should wrap nicely');
  await a.mouse.click(...at(1100, 760));
  await a.click('.layer-row:has-text("Text 2")');
  const eHandle = a.locator('[data-handle="e"]');
  const hb = await eHandle.boundingBox();
  await a.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await a.mouse.down();
  await a.mouse.move(hb.x - 150, hb.y + hb.height / 2, { steps: 5 });
  await a.mouse.up();
  const tspans = await a.evaluate(() => {
    const sel = document.querySelector('.layer-row.selected');
    return sel ? Math.max(...[...document.querySelectorAll('.world text')].map((t) => t.querySelectorAll('tspan').length)) : 0;
  });
  check(tspans >= 2, `fixed-width text wraps (${tspans} lines)`);

  // Color style: create from the selected rectangle's fill.
  a.once('dialog', (d) => d.accept('Brand / Primary'));
  await a.keyboard.press('Escape');
  await a.keyboard.press('r');
  await drag(700, 150, 780, 230);
  await a.click('.style-open:has-text("style")');
  await a.click('.style-row.create');
  await a.waitForSelector('.style-chip');
  check((await a.locator('.style-chip').textContent())?.includes('Brand / Primary'), 'color style created and linked');

  // Tab navigation between layers.
  const before1 = await a.locator('.layer-row.selected .layer-name').textContent();
  await a.locator('.canvas-svg').hover();
  await a.keyboard.press('Tab');
  const after1 = await a.locator('.layer-row.selected .layer-name').textContent();
  check(before1 !== after1, `Tab selects next layer (${before1} → ${after1})`);

  // Radial repeat extension.
  await a.click('#btn-extensions');
  await a.click('.ext:has-text("Radial Repeat")');
  await a.click('text=Run Radial Repeat');
  await a.waitForTimeout(200);
  check((await layerNames(a)).includes('Radial repeat'), 'radial repeat extension');

  // Tooltip with shortcut chip.
  await a.hover('.toolbar .tool[aria-pressed]:first-child');
  await a.waitForSelector('.tooltip kbd', { timeout: 3000 }).then(
    () => check(true, 'tooltip with shortcut'),
    () => check(false, 'tooltip with shortcut'),
  );

  // Preferences: dock the toolbar in the top bar.
  await a.keyboard.press('Control+,');
  await a.click('.window:has-text("Preferences") >> text=Docked (top bar)');
  check((await a.locator('.tb-center .toolbar.docked').count()) === 1, 'toolbar docks into the top bar');
  await a.click('.window:has-text("Preferences") >> text=Floating (bottom)');
  await a.keyboard.press('Escape');

  // Frame presets (frame tool with nothing selected).
  await a.keyboard.press('Escape');
  await a.keyboard.press('Escape');
  await a.keyboard.press('f');
  await a.click('.preset:has-text("iPhone 16")');
  check((await layerNames(a)).includes('iPhone 16'), 'frame preset inserts iPhone 16');

  // Bezier pen: drag while placing a point to curve.
  await a.keyboard.press('Escape');
  await a.keyboard.press('p');
  await a.mouse.move(...at(150, 650));
  await a.mouse.down();
  await a.mouse.move(...at(200, 610), { steps: 4 });
  await a.mouse.up();
  await a.mouse.click(...at(320, 660));
  await a.keyboard.press('Enter');
  const curved = await a.evaluate(() => [...document.querySelectorAll('.world path')].some((p) => /C/.test(p.getAttribute('d') ?? '')));
  check(curved, 'pen drag creates bezier curve');

  // Inspect → Tailwind.
  await a.click('.panel.right .tabs >> text=Inspect');
  await a.click('.seg >> text=Tailwind');
  check(/w-\[/.test((await a.locator('.code').textContent()) ?? ''), 'Inspect generates Tailwind classes');
  await a.click('.panel.right .tabs >> text=Design');

  // Variables: bind a rectangle's fill to a color variable, then edit the variable.
  await a.keyboard.press('Escape');
  await a.keyboard.press('Escape');
  await a.keyboard.press('r');
  await drag(420, 560, 500, 640);
  const varRect = await a.locator('.layer-row.selected .layer-name').textContent();
  await a.click('.logo-btn');
  await a.click('.menu >> text=Variables…');
  await a.click('.window:has-text("Variables") >> text=+ Collection');
  await a.click('.window:has-text("Variables") >> text=+ Color');
  await a.locator('.var-table input[type="color"]').first().fill('#ff3366');
  await a.click('.window:has-text("Variables") .window-head .icon-btn');
  await a.click(`.layer-row:has-text("${varRect}")`);
  await a.click('text=Bind fill to variable…');
  await a.click('.style-menu .style-row');
  check((await a.locator('.var-chip').count()) === 1, 'fill bound to a variable');
  await a.click('.logo-btn');
  await a.click('.menu >> text=Variables…');
  await a.locator('.var-table input[type="color"]').first().fill('#22cc88');
  await a.click('.window:has-text("Variables") .window-head .icon-btn');
  await a.waitForTimeout(200);
  check((await a.locator('.world [fill="#22cc88"]').count()) >= 1, 'editing a variable re-colors bound layers');

  // SVG paste → editable vectors.
  await a.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path id="Heart" d="M50 85 C20 60 5 40 20 25 A15 15 0 0 1 50 30 A15 15 0 0 1 80 25 C95 40 80 60 50 85Z" fill="#e11d48"/><rect id="Box" x="10" y="10" width="20" height="20" rx="4" fill="#0ea5e9"/></svg>');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  });
  await a.waitForTimeout(200);
  await a.fill('.layers .search input', 'Heart');
  check((await a.locator('.layer-row:has-text("Heart")').count()) === 1, 'pasted SVG imports as editable vectors');
  await a.fill('.layers .search input', '');
  await a.locator('.layers .search input').blur();

  // Variants: two components → combine → switch the instance's variant.
  await a.keyboard.press('Escape');
  for (const x of [520, 600]) {
    await a.keyboard.press('r');
    await drag(x, 560, x + 50, 610);
    await a.keyboard.press('Control+Alt+k');
  }
  const comps = await a.locator('.layer-row.comp .layer-name').allTextContents();
  await a.click(`.layer-row:has-text("${comps[0]}")`);
  await a.keyboard.down('Shift');
  await a.click(`.layer-row:has-text("${comps[1]}")`);
  await a.keyboard.up('Shift');
  await a.click('text=Combine as variants');
  await a.click('.panel.left .tabs >> text=Assets');
  await a.locator('.asset').first().click();
  await a.click('.panel.left .tabs >> text=File');
  const variantSelect = a.locator('.field:has-text("❖ Variant") select');
  check((await variantSelect.count()) === 1, 'instance shows a variant property');
  const opts = await variantSelect.locator('option').allTextContents();
  await variantSelect.selectOption(opts[opts.length - 1]);
  check(((await a.locator('.header-section .muted').first().textContent()) ?? '').includes(opts[opts.length - 1]), `variant switched to ${opts[opts.length - 1]}`);

  // Sandboxed third-party extension from a URL.
  await a.keyboard.press('Escape');
  await a.click('#btn-extensions');
  await a.fill('.remote-ext input', `${BASE}extensions/hello-remote.js`);
  await a.click('.remote-ext button:has-text("Install")');
  await a.waitForSelector('.ext:has-text("Hello (remote)")', { timeout: 8000 }).catch(() => null);
  await a.click('.ext:has-text("Hello (remote)")');
  await a.click('text=Run Hello (remote)');
  await a.waitForTimeout(800);
  check((await layerNames(a)).includes('Greeting'), 'sandboxed URL extension runs through the API');

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
  check((await layerNames(b)).includes('Radial repeat'), 'collaborator B loads the shared file');

  // A draws; B should see it.
  await a.keyboard.press('r');
  const ha = await canvasHelpers(a);
  await ha.drag(900, 150, 1000, 250);
  await b.waitForFunction(() => [...document.querySelectorAll('.layer-row .layer-name')].some((e) => e.textContent?.startsWith('Rectangle')), null, { timeout: 8000 }).then(
    () => check(true, 'edit in A appears in B'),
    () => check(false, 'edit in A appears in B'),
  );

  // Regression: A has a long undo history; a remote *text* edit from B must still arrive (it used to crash sync).
  const hB = await canvasHelpers(b);
  // Count text layers in A's (flat, searchable) layer list; rendered text may be off-screen in A's viewport.
  const textLayers = async (p = a) => {
    await p.fill('.layers .search input', 'Text');
    const n = await p.locator('.layer-row').count();
    await p.fill('.layers .search input', '');
    await p.locator('.layers .search input').blur();
    return n;
  };
  const bBefore = await textLayers(b);
  const beforeTexts = await textLayers();
  await b.keyboard.press('t');
  await b.mouse.click(...hB.at(560, 620));
  await b.waitForTimeout(100);
  await b.keyboard.type('Typed by B');
  await b.mouse.click(...hB.at(860, 780));
  let afterTexts = beforeTexts;
  for (let i = 0; i < 16 && afterTexts <= beforeTexts; i++) {
    await a.waitForTimeout(500);
    afterTexts = await textLayers();
  }
  check(afterTexts > beforeTexts, `remote text edit reaches a client with undo history (${beforeTexts} → ${afterTexts} text layers)`);
  check((await a.locator('.live-dot').getAttribute('class'))?.includes('live'), 'client stays live after remote text edits');


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

  // MCP: an AI agent connects to the live file over JSON-RPC.
  const [, roomId, token] = editUrl.match(/#\/room\/(\w+)\/(\w+)$/);
  // Auth = the project's edit token as a Bearer header; the URL carries no room id or secret.
  const mcpUrl = `${BASE}api/mcp?name=Claude`;
  let rpcId = 0;
  const post = (method, auth) =>
    fetch(mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: {} }) });
  check((await post('tools/list')).status === 401, 'MCP rejects requests without a token (401)');
  check((await post('tools/list', 'Bearer wrongtoken123')).status === 401, 'MCP rejects a wrong token (401)');
  const rpc = async (method, params = {}) => {
    const r = await fetch(mcpUrl, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
    return (await r.json()).result;
  };
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  check(init?.serverInfo?.name === 'vellum', 'MCP initialize');
  const tools = await rpc('tools/list');
  check((tools?.tools?.length ?? 0) >= 8, `MCP tools listed (${tools?.tools?.length})`);
  const live = await rpc('tools/call', { name: 'get_live_view', arguments: {} });
  check(/Guest/.test(live?.content?.[0]?.text ?? ''), 'MCP get_live_view sees collaborators');
  const created = await rpc('tools/call', { name: 'create_layer', arguments: { type: 'rect', name: 'From Claude', w: 120, h: 80, props: { fill: '#0d9488', radius: 12 } } });
  check(!created?.isError && /Created/.test(created?.content?.[0]?.text ?? ''), 'MCP create_layer');
  await b.waitForFunction(() => [...document.querySelectorAll('.layer-row .layer-name')].some((e) => e.textContent === 'From Claude'), null, { timeout: 8000 }).then(
    () => check(true, 'MCP edit appears live in the browser'),
    () => check(false, 'MCP edit appears live in the browser'),
  );
  await b.waitForFunction(() => [...document.querySelectorAll('.avatars .avatar')].some((e) => e.textContent?.includes('🤖')), null, { timeout: 8000 }).then(
    () => check(true, 'AI agent shows as a live collaborator'),
    () => check(false, 'AI agent shows as a live collaborator'),
  );
  // watch_changes: the agent follows along live.
  const start = await rpc('tools/call', { name: 'watch_changes', arguments: { timeoutSeconds: 1 } });
  const since = Number((start?.content?.[0]?.text ?? '').match(/since=(\d+)/)?.[1]);
  const watching = rpc('tools/call', { name: 'watch_changes', arguments: { since, timeoutSeconds: 15 } });
  await a.waitForTimeout(500);
  await a.keyboard.press('Escape');
  await a.keyboard.press('o');
  await ha.drag(900, 400, 980, 480);
  const seen = (await watching)?.content?.[0]?.text ?? '';
  check(/Ellipse/.test(seen) && /changed/.test(seen), 'MCP watch_changes reports live edits');

  const svg = await rpc('tools/call', { name: 'render_svg', arguments: {} });
  check((svg?.content?.[0]?.text ?? '').startsWith('<svg'), 'MCP render_svg returns SVG');

  // Revoke: resetting the edit link invalidates the old token for MCP.
  const rot = await (await fetch(`${BASE}api/rooms/rotate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: roomId, token }) })).json();
  check(typeof rot.token === 'string' && rot.token !== token, 'edit link can be reset');
  check((await post('tools/list', `Bearer ${token}`)).status === 401, 'old token is revoked for MCP');
  check((await post('tools/list', `Bearer ${rot.token}`)).status === 200, 'new token works for MCP');
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
