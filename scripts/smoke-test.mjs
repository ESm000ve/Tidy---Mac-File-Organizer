/**
 * End-to-end smoke test.
 *
 * Serves the production build and drives the real UI in a headless browser,
 * with no Electron bridge present — which is also the degraded path the app
 * must survive. It asserts that the screen renders, the rule grid responds to
 * input, search filters, and desktop-only actions fail with a message rather
 * than an exception.
 *
 * Run with `npm test`, after `npm run build:app`.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'dist');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const host = '127.0.0.1';
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, host, resolve);
});
const { port } = server.address();

// CI installs its own browser; CHROMIUM_PATH lets a sandbox point at an existing one.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const results = [];
const check = (name, pass, detail='') => results.push({ name, pass, detail });

await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1. Expand the Documents rule card.
const docsToggle = page.locator('button', { hasText: 'Documents' }).first();
await docsToggle.click();
await page.waitForTimeout(500);
const extCount = await page.locator('button').evaluateAll(bs => bs.filter(b => /^\.\w+$/.test(b.textContent.trim())).length);
check('category expands and lists extensions', extCount >= 12, `${extCount} extension chips`);

// 2. Toggle an extension off, then on.
const pdf = page.locator('button', { hasText: /^\.pdf$/ }).first();
const before = await pdf.getAttribute('aria-pressed');
await pdf.click(); await page.waitForTimeout(250);
const after = await pdf.getAttribute('aria-pressed');
check('extension toggles', before === 'true' && after === 'false', `${before} -> ${after}`);
await pdf.click(); await page.waitForTimeout(250);

// 3. Rule count in the header reflects enabled rules.
const activeLabel = await page.locator('section[aria-label="File Rules"] span', { hasText: /active$/ }).first().textContent();
check('active rule count renders', /^\d+ active$/.test(activeLabel.trim()), activeLabel.trim());

// 4. AI chips toggle aria-pressed.
const chip = page.locator('#ai-smart-rename-chip');
const chipBefore = await chip.getAttribute('aria-pressed');
await chip.click(); await page.waitForTimeout(250);
const chipAfter = await chip.getAttribute('aria-pressed');
check('Smart Rename chip toggles', chipBefore === 'false' && chipAfter === 'true', `${chipBefore} -> ${chipAfter}`);

// 5. Smart Sort chip flips every category (the shared-feature path).
const sortChip = page.locator('#ai-smart-cat-chip');
await sortChip.click(); await page.waitForTimeout(300);
check('Smart Sort chip toggles all rules', await sortChip.getAttribute('aria-pressed') === 'true');

// 6. Search filters the rule grid.
await page.locator('button[aria-label="Open search"]').click();
await page.waitForTimeout(300);
const searchInput = page.locator('input[aria-label="Search rules and categories"]');
await searchInput.fill('mp3');
await page.waitForTimeout(400);
const matching = await page
  .locator('section[aria-label="File Rules"] span', { hasText: /matching$/ })
  .first().textContent().catch(() => null);
check('search shows a match count', matching?.trim() === '1 matching', matching?.trim() ?? 'no match label');
await searchInput.fill('');
await page.waitForTimeout(300);

// 7. AI command bar accepts input and its send button enables.
const ai = page.locator('#nl-inline-input');
await ai.fill('Organize PDFs modified within the past month');
await page.waitForTimeout(250);
check('AI send button enables with input', !(await page.locator('#nl-send-btn').isDisabled()));

// 8. Submitting outside Electron reports the desktop-only message, not a crash.
await page.locator('#nl-send-btn').click();
await page.waitForTimeout(500);
check('AI bar degrades gracefully without Electron',
  (await page.locator('section[aria-label="Ask Tidy AI"]').innerText()).includes('desktop app'));

// 9. Enter with no source folder raises the notice dialog rather than running.
await ai.fill('');
await page.locator('body').click({ position: { x: 5, y: 400 } });
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const dialog = page.locator('[role="alertdialog"]');
check('Enter with no source shows a notice', await dialog.count() > 0,
  await dialog.innerText().catch(() => 'no dialog'));
if (await dialog.count()) { await page.locator('[role="alertdialog"] button').click(); await page.waitForTimeout(300); }

// 10. Filter selects are wired.
check('filter selects present', await page.locator('section[aria-label="Filters"] [role="combobox"]').count() === 2);

await ai.fill('Organize old PDFs');await page.locator('#nl-send-btn').click();
const question=page.getByRole('dialog',{name:'One detail first',exact:true});await question.waitFor();
check('vague instructions ask before configuring rules',(await question.innerText()).includes('Which date range'));
await question.getByRole('button',{name:'Cancel',exact:true}).click();await question.waitFor({state:'hidden'});
check('cancelling a question leaves filters unchanged',(await page.getByRole('combobox',{name:'Date modified',exact:true}).innerText())==='Any time');

console.log(results.map(r => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`).join('\n'));
console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
await browser.close();
server.close();
process.exit(results.every(r => r.pass) && errors.length === 0 ? 0 : 1);
