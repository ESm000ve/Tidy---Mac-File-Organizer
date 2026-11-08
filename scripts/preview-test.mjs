// Exercise populated file preview, contrast, focus restoration and 200% zoom.
import {_electron as electron} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const out=path.resolve('.test-artifacts/tidy-validation');await fs.mkdir(out,{recursive:true});const root=await fs.mkdtemp(path.join(out,'profile-'));
const source=path.join(root,'Source');const destination=path.join(root,'Destination');await fs.mkdir(source);await fs.mkdir(destination);await fs.writeFile(path.join(source,'report.txt'),'Synthetic preview fixture.');
await fs.writeFile(path.join(source,'Download1.txt'),'Synthetic low-confidence fixture.');
await fs.writeFile(path.join(source,'Screenshot 2026-10-22.txt'),'Synthetic high-confidence fixture.');
const env={...process.env,GEMINI_API_KEY:''};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.TIDY_EXECUTABLE;
const app=await electron.launch({executablePath,args:[...(executablePath?[]:['.']),`--user-data-dir=${root}`],env,timeout:60000});const page=await app.firstWindow();const report=[];const palettes=[];
const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'];
async function checkPalette(theme){
 const values=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return Object.fromEntries(['foreground','muted-foreground','card','background','system-blue','accent-text','accent-subtle','control-stroke-strong','control-fill'].map(name=>[name,style.getPropertyValue('--'+name).trim()]));});
 const lum=value=>{value=value.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,(_,r,g,b)=>"#"+r+r+g+g+b+b);assert.match(value,/^#[0-9a-f]{6}$/i);const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const pairs=[['Body text','foreground','card',4.5],['Secondary text','muted-foreground','card',4.5],['Secondary text on base','muted-foreground','background',4.5],['Accent text','system-blue','card',4.5],['Accent button label','accent-text','system-blue',4.5],['Selected chip label','system-blue','accent-subtle',4.5],['Input boundary cue','control-stroke-strong','control-fill',3]];
 const measurements=pairs.map(([role,fg,bg,min])=>{const a=lum(values[fg]),b=lum(values[bg]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=min,theme+' '+role+' contrast: '+ratio);return {role,foreground:values[fg],background:values[bg],ratio,minimum:min};});palettes.push({theme,measurements});console.log(theme+': all '+measurements.length+' color-role contrast checks pass');
}
async function check(label){await page.evaluate(src=>{if(!window.axe)(0,eval)(src);},axe);await page.waitForTimeout(300);const result=await page.evaluate(tags=>window.axe.run(document,{runOnly:{type:'tag',values:tags},resultTypes:['violations','incomplete']}),tags);const capture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toDataURL());await fs.writeFile(path.join(out,label+'.png'),Buffer.from(capture.split(',')[1],'base64'));report.push({state:label,...result});console.log(label+': '+result.violations.length+' WCAG violations');}
try{
 await page.locator('#main-content').waitFor();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,900));
 await page.evaluate(({source,destination})=>{localStorage.setItem('tidy_source_path',source);localStorage.setItem('tidy_dest_path',destination);},{source,destination});await page.reload();
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('ai:parseRule');ipcMain.handle('ai:parseRule',(_event,_rule,context)=>({success:true,data:{updateCategories:context.categories.map(category=>({id:category.id,enabled:category.id==='documents',extensions:category.id==='documents'?['txt']:category.extensions})),updateFilters:{dateModified:'month'},execute:false}}));});
 for(const colorScheme of ['light','dark']){
  await page.emulateMedia({colorScheme});await page.waitForTimeout(200);await checkPalette(colorScheme);
  await page.getByRole('combobox',{name:'Date modified',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox',{name:'Date modified',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Run Tidy',exact:true}).click();await page.getByRole('dialog',{name:'Preview Changes',exact:true}).waitFor();await page.getByText('report.txt',{exact:true}).first().waitFor();await check(colorScheme+'-populated-preview');
  await page.getByRole('button',{name:'Close preview',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.locator('#ai-smart-rename-chip').click();await page.getByRole('combobox',{name:'Naming style',exact:true}).click();await page.getByRole('option',{name:'Date first',exact:true}).click();await check(colorScheme+'-naming-style');await page.getByRole('button',{name:'Run Tidy',exact:true}).click();await page.getByRole('dialog',{name:'Preview Changes',exact:true}).waitFor();await page.getByText('Local name suggestion',{exact:true}).first().waitFor();await check(colorScheme+'-AI-confidence-preview');
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('#ai-smart-rename-chip').click();
  await page.locator('#nl-inline-input').fill('Organize text files modified within the past month');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await page.getByRole('dialog',{name:'Review AI rule',exact:true}).waitFor();await check(colorScheme+'-rule-review');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.locator('#nl-inline-input').fill('Organize old files');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await page.getByRole('dialog',{name:'One detail first',exact:true}).waitFor();await check(colorScheme+'-rule-question');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 }
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(800,600);w.webContents.setZoomFactor(2);});await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No page overflow at 200% zoom');
 await page.getByRole('button',{name:'Open search',exact:true}).click();await page.getByRole('searchbox').fill('pdf');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Search fits at 200% zoom');
 await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('button',{name:/^Settings/}).click();await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();await check('zoom-200-settings');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('#nl-inline-input').fill('Organize text files modified within the past month');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await page.getByRole('dialog',{name:'Review AI rule',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await check('zoom-200-rule-review');const details=page.getByRole('region',{name:'Proposed rule details',exact:true});await details.focus();await page.keyboard.press('PageDown');await expect.poll(()=>details.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.locator('#nl-inline-input').fill('Organize old files');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await page.getByRole('dialog',{name:'One detail first',exact:true}).waitFor();await check('zoom-200-rule-question');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.locator('#nl-inline-input').fill('Organize text files modified within the past month');await page.getByRole('button',{name:'Review AI rule',exact:true}).click();await page.getByRole('dialog',{name:'Review AI rule',exact:true}).waitFor();await check('contrast-theme');
 assert.equal(report.flatMap(r=>r.violations).length,0);
 console.log('PASS populated previews, popup focus restoration, 200% zoom/reflow, settings and contrast theme.');
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({states:report,palettes},null,2));await app.close();}
