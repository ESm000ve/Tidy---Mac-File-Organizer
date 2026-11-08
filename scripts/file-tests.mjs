import assert from 'node:assert/strict';
import fsStreams from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const base=path.resolve('.test-artifacts');
await fs.mkdir(base,{recursive:true});
const root=await fs.mkdtemp(path.join(base,'files-'));
const bundle=path.join(root,'services.mjs');
await build({stdin:{contents:'export * from "./electron/lib/files"; export * from "./electron/services/organizer"; export * from "./electron/services/preview"; export * from "./electron/services/renameCache"; export * from "./electron/services/smartRename"; export * from "./src/shared/naming"; export * from "./src/app/lib/ruleReview";',resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',external:['@google/genai'],plugins:[{name:'electron-fixture',setup(build){build.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const safeStorage={decryptString:()=>{throw new Error()}}; export const app = { getPath: () => '+JSON.stringify(root)+' };',loader:'js'}));}}]});
const {moveFile,validatePathSegment,runOrganizeJob,undoOperations,buildPreview,cacheKey,setCachedRename,validateRenameSuggestions,normalizeNamingStyle,applyNamingStyle,initialRuleQuestion,prepareRuleDraft,readRuleResponse}=await import(pathToFileURL(bundle));
process.env.GEMINI_API_KEY='';
const crossVolumeSource = path.join(root, 'cross-volume-source.txt');
const crossVolumeDest = path.join(root, 'cross-volume-dest.txt');
const crossVolumeModified = new Date('2020-01-02T12:34:56.789Z');
await fs.writeFile(crossVolumeSource, 'Cross-volume fixture');
await fs.utimes(crossVolumeSource, crossVolumeModified, crossVolumeModified);
const rename = fs.rename;
try {
  fs.rename = async () => { throw Object.assign(new Error('Cross-volume fixture'), { code: 'EXDEV' }); };
  await moveFile(crossVolumeSource, crossVolumeDest);
} finally {
  fs.rename = rename;
}
assert.ok(Math.abs((await fs.stat(crossVolumeDest)).mtimeMs - crossVolumeModified.getTime()) < 1);
assert.equal(await fs.readFile(crossVolumeDest, 'utf8'), 'Cross-volume fixture');
await assert.rejects(fs.stat(crossVolumeSource), { code: 'ENOENT' });
console.log('PASS cross-volume move preserves the modified date');
const source=path.join(root,'source'); const dest=path.join(root,'destination');
await fs.mkdir(source); await fs.mkdir(path.join(dest,'Documents'),{recursive:true});
await fs.writeFile(path.join(source,'report.txt'),'new report');
await fs.writeFile(path.join(source,'ignore.jpg'),'image');
await fs.writeFile(path.join(dest,'Documents','report.txt'),'keep original');
const request={sourcePath:source,destPath:dest,categories:[{id:'documents',name:'Documents',enabled:true,extensions:['txt'],subfolders:false,duplicateDetection:false}],filters:{dateModified:'any',fileSize:'any',excludeHidden:true},conflictResolution:'rename'};
const result=await runOrganizeJob(request);
assert.equal(result.moved,1); assert.equal(result.errors,0);
assert.equal(await fs.readFile(path.join(dest,'Documents','report.txt'),'utf8'),'keep original');
assert.equal(result.operations[0].newName,'report (1).txt');
assert.equal((await undoOperations(result.operations)).reverted,1);
assert.equal(await fs.readFile(path.join(source,'report.txt'),'utf8'),'new report');
const invalid=await runOrganizeJob({...request,renames:{'report.txt':'../escape.txt'}});
assert.equal(invalid.moved,0); assert.equal(invalid.errors,1);
const escaped=await runOrganizeJob({...request,categories:[{...request.categories[0],name:'..'}]});
assert.equal(escaped.moved,0); assert.equal(escaped.errors,1);
const second=await runOrganizeJob(request);
await fs.writeFile(path.join(source,'report.txt'),'created after run');
assert.equal((await undoOperations(second.operations)).errors,1);
assert.equal(await fs.readFile(path.join(source,'report.txt'),'utf8'),'created after run');
console.log('PASS Traversal rejection, move, collision rename, undo, and undo conflict preservation');

// Files with a common 64 KB header and different tails must never be skipped.
const duplicatesSource=path.join(root,'duplicates');await fs.mkdir(duplicatesSource);
const header=Buffer.alloc(65536,65);
await fs.writeFile(path.join(duplicatesSource,'first.txt'),Buffer.concat([header,Buffer.from('first')]));
await fs.writeFile(path.join(duplicatesSource,'second.txt'),Buffer.concat([header,Buffer.from('other')]));
await fs.copyFile(path.join(duplicatesSource,'first.txt'),path.join(duplicatesSource,'copy.txt'));
await fs.writeFile(path.join(duplicatesSource,'unique.txt'),'different size');
await fs.copyFile(path.join(duplicatesSource,'unique.txt'),path.join(duplicatesSource,'unmatched.bin'));
const dupCategories=[{...request.categories[0],duplicateDetection:true}];
const hashedFiles = [];
const createReadStream = fsStreams.createReadStream;
try {
  fsStreams.createReadStream = (file, ...options) => {
    hashedFiles.push(path.basename(file));
    return createReadStream(file, ...options);
  };
  const duplicatePreview = await buildPreview(duplicatesSource, dupCategories);
  assert.deepEqual(duplicatePreview.filter(file => file.isDuplicate).map(file => [file.name, file.duplicateOf]), [['first.txt', 'copy.txt']]);
  assert.deepEqual(hashedFiles.splice(0), ['copy.txt', 'first.txt', 'second.txt']);

  const duplicateRun = await runOrganizeJob({...request, sourcePath:duplicatesSource, destPath:path.join(root,'dup-output'), categories:dupCategories, conflictResolution:'skip'});
  assert.equal(duplicateRun.moved, 3);
  assert.equal(duplicateRun.duplicates, 1);
  assert.deepEqual(hashedFiles, ['copy.txt', 'first.txt', 'second.txt']);
} finally {
  fsStreams.createReadStream = createReadStream;
}
console.log('PASS preview and organizer hash only shared sizes and distinguish equal-size files with shared headers');

const filteredSource=path.join(root,'filtered');await fs.mkdir(filteredSource);
await fs.writeFile(path.join(filteredSource,'recent.txt'),'recent');
await fs.writeFile(path.join(filteredSource,'old.txt'),'old');
await fs.utimes(path.join(filteredSource,'old.txt'),new Date('2020-01-01'),new Date('2020-01-01'));
await fs.writeFile(path.join(filteredSource,'.hidden.txt'),'hidden');
await fs.writeFile(path.join(filteredSource,'disabled.jpg'),'disabled');
const customCategories=[{...request.categories[0],id:'custom_123',name:'Family papers'}, {id:'images',name:'Images',enabled:false,extensions:['jpg'],subfolders:false}];
const filtered=await buildPreview(filteredSource,customCategories,false,{...request.filters,dateModified:'week'});
assert.deepEqual(filtered.map(file=>file.name),['recent.txt']);assert.equal(filtered[0].categoryId,'custom_123');
const unhidden=await buildPreview(filteredSource,customCategories,false,{...request.filters,excludeHidden:false});
assert.ok(unhidden.some(file=>file.name==='.hidden.txt'));assert.ok(!unhidden.some(file=>file.name==='disabled.jpg'));
await assert.rejects(()=>buildPreview(path.join(root,'missing'),customCategories),/source folder/);
console.log('PASS preview respects enabled custom rules, dates, hidden-file setting, and missing-folder errors');

const cacheA=path.join(root,'cache-a');const cacheB=path.join(root,'cache-b');await fs.mkdir(cacheA);await fs.mkdir(cacheB);
for(const folder of [cacheA,cacheB])await fs.writeFile(path.join(folder,'notes.txt'),'same length');
const fileA=path.join(cacheA,'notes.txt');const statsA=await fs.stat(fileA);
setCachedRename(cacheKey(fileA,statsA.size,statsA.mtimeMs),{suggested:'Topic_A.txt',reason:'A only',confidence:'high'});
assert.equal((await buildPreview(cacheA,request.categories,true))[0].smartRename.suggested,'Topic_A.txt');
assert.equal((await buildPreview(cacheB,request.categories,true))[0].smartRename,undefined);
await fs.utimes(fileA,new Date(),new Date(statsA.mtimeMs+2000));
assert.equal((await buildPreview(cacheA,request.categories,true))[0].smartRename,undefined);
console.log('PASS rename cache isolates folders and invalidates edited files with unchanged size');

const replaceSource=path.join(root,'replace');const replaceDest=path.join(root,'replace-output');await fs.mkdir(replaceSource);await fs.mkdir(path.join(replaceDest,'Documents'),{recursive:true});
await fs.writeFile(path.join(replaceSource,'family.txt'),'new version');await fs.writeFile(path.join(replaceDest,'Documents','family.txt'),'old version');
const replaced=await runOrganizeJob({...request,sourcePath:replaceSource,destPath:replaceDest,conflictResolution:'overwrite'});
assert.equal(replaced.moved,1);assert.equal(replaced.operations.length,2);
assert.equal(await fs.readFile(path.join(replaceDest,'Documents','family.txt'),'utf8'),'new version');
assert.equal(await fs.readFile(replaced.operations[0].newPath,'utf8'),'old version');
const restored=await undoOperations(replaced.operations);assert.equal(restored.success,true);
assert.equal(await fs.readFile(path.join(replaceSource,'family.txt'),'utf8'),'new version');
assert.equal(await fs.readFile(path.join(replaceDest,'Documents','family.txt'),'utf8'),'old version');
assert.equal((await undoOperations(replaced.operations)).errors,1);
console.log('PASS replace preserves the old file and Undo restores both versions');

const aiFiles=[{id:'one',name:'notes.txt',path:fileA,size:11}];
assert.deepEqual(validateRenameSuggestions(aiFiles,{one:{suggested:'../escape.txt'}}),{});
assert.deepEqual(validateRenameSuggestions(aiFiles,{one:{suggested:'notes.exe'}}),{});
assert.equal(validateRenameSuggestions(aiFiles,{one:{suggested:'clean.txt',confidence:'invented',subfolder:'../escape'}}).one.confidence,'medium');
assert.equal(validateRenameSuggestions(aiFiles,{one:{suggested:'clean.txt',subfolder:'../escape'}}).one.subfolder,undefined);
const sortSource=path.join(root,'sort-only');await fs.mkdir(sortSource);await fs.writeFile(path.join(sortSource,'Screenshot 2026-10-22.txt'),'Synthetic screenshot-name fixture');
const sortCategories=[{...request.categories[0],smartCategorization:true}];
const sortPreview=await buildPreview(sortSource,sortCategories,false);
assert.equal(sortPreview[0].smartRename.subfolder,'Screenshots');
const sortFile=sortPreview[0];
const sortRun=await runOrganizeJob({...request,sourcePath:sortSource,destPath:path.join(root,'sort-output'),categories:sortCategories,renames:{[sortFile.name]:{...sortFile.smartRename,suggested:sortFile.name}}});
assert.equal(sortRun.renamed,0);assert.equal(sortRun.moved,1);assert.match(sortRun.operations[0].newPath,/Screenshots/);assert.equal(sortRun.operations[0].newName,sortFile.name);
console.log('PASS malformed AI suggestions are ignored and Smart sort works without renaming');
const activeRun=runOrganizeJob({...request,sourcePath:filteredSource,destPath:path.join(root,'concurrency-output')});
const blockedRun=await runOrganizeJob(request);assert.equal(blockedRun.success,false);assert.match(blockedRun.error,/already moving/);
const blockedUndo=await undoOperations(second.operations);assert.equal(blockedUndo.success,false);assert.match(blockedUndo.error,/already moving/);
await activeRun;
console.log('PASS overlapping manual/scheduled runs and Undo cannot race file moves');

const namingSource=path.join(root,'naming');await fs.mkdir(namingSource);
await fs.writeFile(path.join(namingSource,'Report1.txt'),'Synthetic naming fixture');
const modified=new Date(2022,2,4,12);await fs.utimes(path.join(namingSource,'Report1.txt'),modified,modified);
const names=await buildPreview(namingSource,request.categories,true,request.filters,'descriptive');
const dated=await buildPreview(namingSource,request.categories,true,request.filters,'date-first');
assert.equal(names[0].smartRename.suggested,'Doc_Report1.txt');
assert.equal(dated[0].smartRename.suggested,'2022-03-04_Doc_Report1.txt');
assert.equal((await buildPreview(namingSource,request.categories,true,request.filters,'descriptive'))[0].smartRename.suggested,names[0].smartRename.suggested,'Switching back uses the correct style-specific cache');
await fs.writeFile(path.join(namingSource, 'Report on the annual picnic.txt'), 'Named by a person');
const offlinePreview = await buildPreview(namingSource, request.categories, true);
assert.equal(offlinePreview.find(file => file.name === 'Report on the annual picnic.txt').smartRename, undefined);
const offlineRename = offlinePreview.find(file => file.name === 'Report1.txt').smartRename;
assert.equal(offlineRename.confidence, 'medium');
const offlineRun = await runOrganizeJob({
  ...request,
  sourcePath: namingSource,
  destPath: path.join(root, 'offline-rename'),
  renames: { 'Report1.txt': offlineRename },
});
assert.equal(offlineRun.renamed, 1);
assert.equal(path.basename(path.dirname(offlineRun.operations.find(operation => operation.originalName === 'Report1.txt').newPath)), 'Documents');
assert.ok((await undoOperations(offlineRun.operations)).success);
assert.equal(normalizeNamingStyle('invented'),'descriptive');
assert.equal(applyNamingStyle('2020-01-01_Plan.PDF','date-first',modified.getTime()),'2022-03-04_Plan.PDF');
assert.equal(applyNamingStyle('a'.repeat(250)+'.txt','date-first',modified.getTime()).length,255);
assert.equal(await fs.readFile(path.join(namingSource,'Report1.txt'),'utf8'),'Synthetic naming fixture','Suggestions never rename source files');
console.log('PASS descriptive/date-first suggestions use file metadata, preserve extensions, and isolate cache entries');

assert.ok(initialRuleQuestion('Organize old PDFs'));assert.ok(initialRuleQuestion('Organize recent PDFs'));
assert.equal(initialRuleQuestion('Organize PDFs modified within the past month'),null);
assert.equal(initialRuleQuestion('Organize PDFs older than 30 days'),null);
assert.throws(()=>readRuleResponse([]));assert.throws(()=>readRuleResponse({clarification:123}));
const reviewConfig={...request,schedule:{enabled:false,frequency:'manual',date:null,time:'09:00'}};
const original=JSON.stringify(reviewConfig);
const draft=prepareRuleDraft(reviewConfig,false,{updateCategories:[{id:'documents',extensions:['pdf']}],updateFilters:{dateModified:'month'},smartRename:true,execute:true},'date-first');
assert.equal(JSON.stringify(reviewConfig),original,'Preparing a review must not apply any settings');
assert.match(draft.summary.find(row=>row.label==='Files').value,/\.pdf/);assert.doesNotMatch(draft.summary.find(row=>row.label==='Files').value,/\.txt/);
assert.match(draft.summary.find(row=>row.label==='Modified').value,/past 30 days/);
assert.match(draft.summary.find(row=>row.label==='Name changes').value,/last modified date/);
assert.throws(()=>prepareRuleDraft(reviewConfig,false,{updateFilters:{dateModified:'older-than-month'}},'descriptive'),/not supported/);
const olderDraft = prepareRuleDraft(reviewConfig, false, { updateFilters: { dateModified: 'older', olderThanDays: 45 } }, 'descriptive');
assert.ok(olderDraft.summary.some(row => row.value.includes('Older than 45')));
assert.throws(() => prepareRuleDraft(reviewConfig, false, { updateFilters: { dateModified: 'older' } }, 'descriptive'), /valid cutoff/);
console.log('PASS vague instructions ask a question and review summaries reflect validated settings without applying them');
const changedSource=prepareRuleDraft({...reviewConfig,includeSubfolders:true,selectedSourceFolders:['Old folder']},false,{sourcePath:path.join(root,'another-source'),execute:true},'descriptive');
assert.equal(changedSource.config.selectedSourceFolders,null);
console.log('PASS reviewed AI source changes clear folder selections belonging to the previous source');
