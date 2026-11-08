// Automated WCAG checks for selected rendered states; this is not a full
// conformance assessment. Manual assistive-technology testing is still required.
// Usage: node scripts/audit.mjs   (build first: npm.cmd run build:app)
// Screenshots go to .test-artifacts/audit/. Exit code 1 if any violation remains.
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const out = path.resolve('.test-artifacts/audit');
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(path.resolve('.test-artifacts'), 'audit-profile-'));
const env = { ...process.env, GEMINI_API_KEY: '' };
delete env.ELECTRON_RUN_AS_NODE;

const executablePath=process.env.TIDY_EXECUTABLE;
const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : ['.']), `--user-data-dir=${profile}`], env, timeout: 60000 });
const page = await app.firstWindow();
await page.locator('#main-content').waitFor();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];
let total = 0;
const report=[];

async function audit(label) {
  await page.evaluate(src => { if (!window.axe) (0, eval)(src); }, axeSource);
  await page.waitForTimeout(350);
  const result = await page.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations','incomplete'] }), TAGS);
  await page.screenshot({ path: path.join(out, `${label}.png`) });
  const wcag=result.violations.filter(v=>v.tags.some(tag=>/^wcag/.test(tag)));
  const advisory=result.violations.filter(v=>!v.tags.some(tag=>/^wcag/.test(tag)));
  report.push({state:label,violations:wcag,bestPracticeAdvisories:advisory,incomplete:result.incomplete});
  console.log(`\n=== ${label}: ${wcag.length} WCAG rule violations (${advisory.length} advisory findings)`);
  for (const v of wcag) {
    total += v.nodes.length;
    console.log(` - ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) {
      const data = n.any[0]?.data;
      const extra = data?.contrastRatio ? ` contrast ${data.contrastRatio} (needs ${data.expectedContrastRatio}) fg ${data.fgColor} bg ${data.bgColor}` : '';
      console.log(`     ${n.target.join(' ')}${extra}`);
    }
  }
}

async function closePanel(name) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (await page.getByRole('dialog').count()) {
    console.log(`!! ${name}: Escape did not close the dialog (keyboard users are trapped unless they find Close)`);
    total += 1;
    const close = page.getByRole('button', { name: /close/i }).first();
    if (await close.count()) await close.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function states(scheme) {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
  await page.waitForTimeout(400);
  await audit(`${scheme}-top`);
  await page.getByRole('button',{name:/^Documents 12 types$/}).click();
  await page.locator('#ai-smart-rename-chip').click();
  await audit(`${scheme}-expanded-rules`);
  await page.getByRole('combobox',{name:'Date modified',exact:true}).click();
  await audit(`${scheme}-filter-menu`);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Documents 12 types$/}).click();
  await page.getByRole('radio',{name:/daily/i}).click();
  await page.locator('input[type="time"]').fill('14:37');
  await audit(`${scheme}-schedule`);
  await page.locator('main, #main-content').first().evaluate(el => el.scrollTo(0, el.scrollHeight));
  await audit(`${scheme}-bottom`);
  await page.locator('main, #main-content').first().evaluate(el => el.scrollTo(0, 0));
  for (const [name, button] of [['settings', /^settings/i], ['audit-log', /audit log|activity|history/i], ['insights', /insights/i]]) {
    const btn = page.getByRole('button', { name: button }).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
      await audit(`${scheme}-${name}`);
      await closePanel(`${scheme}-${name}`);
    } else console.log(`(no button matched for ${name})`);
  }
  const adv = page.getByRole('button', { name: /advanced editor/i });
  if (await adv.count()) { await adv.click(); await page.waitForTimeout(500); await audit(`${scheme}-advanced`); await closePanel(`${scheme}-advanced`); }
}


await states('light');
await states('dark');
await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active', reducedMotion: 'reduce' });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, 'forced-colors.png') });

await fs.writeFile(path.join(out,'report.json'),JSON.stringify({scope:'Automated WCAG checks only; incomplete results require manual review.',states:report},null,2));
await app.close();
console.log(`\nTOTAL violating nodes: ${total}`);
process.exitCode = total ? 1 : 0;
