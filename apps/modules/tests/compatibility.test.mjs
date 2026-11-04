import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFileSync(resolve(here,p),'utf8');
const json=p=>JSON.parse(text(p));
test('all untouched original JavaScript/CSS files retain exact SHA-256 checksums',()=>{
 const {hashes}=json('compat-integrity.json');
 const patched=new Set(['radial.js','src/radar-main.js','src/radar/moodle-pages.js','src/radar/radar-ui.js','src/radar/scanner.js']);
 assert.ok(Object.keys(hashes).length>45);
 for(const [path,expected] of Object.entries(hashes)){
  if(patched.has(path))continue;
  const data=readFileSync(resolve(here,path));
  assert.equal(createHash('sha256').update(data).digest('hex'),expected,path);
 }
});
test('all four original content-script groups remain mapped in order',()=>{
 const groups=json('module-script-groups.json');
 assert.equal(groups.corrections.length,2);
 assert.equal(groups.dates.length,2);
 assert.deepEqual(groups.dates[0].js,['plan-core.js','course.js']);
 assert.deepEqual(groups.dates[1].js,['form.js']);
 assert.equal(groups.dates[1].allFrames,true);
 for(const group of Object.values(groups).flat()){
  assert.ok(group.id.startsWith('modules-'));
  for(const file of [...group.js,...(group.css||[])])assert.ok(existsSync(resolve(here,file)),file);
 }
});
test('catalog is toolbar popup only, without a Modules radial action',()=>{
 const m=json('manifest.json'),radial=text('radial.js');
 assert.equal(m.manifest_version,3);
 assert.equal(m.action.default_popup,'popup.html');
 assert.equal(m.options_page,undefined);
 assert.deepEqual(m.content_scripts[0].js,['radial.js']);
 assert.match(radial,/id: 'scan'/);
 assert.match(radial,/id: 'download'/);
 assert.match(radial,/id: 'import'/);
 assert.match(radial,/id: 'dates'/);
 assert.doesNotMatch(radial,/id: 'manager'|id: 'catalog'/);
 assert.doesNotMatch(text('popup.html'),/mrm-dialog|mrm-overlay/);
});
test('catalog lists exactly the submitted source versions',()=>{
 const c=json('catalog.json');
 assert.deepEqual(c.modules.map(m=>[m.id,m.version]),[['corrections','1.7.10'],['dates','1.3.9']]);
});
test('original background workers are imported without rewriting',()=>{
 const master=text('modules-background.js');
 assert.match(master,/import '\.\/src\/background\.js'/);
 assert.match(master,/import '\.\/background\.js'/);
 assert.doesNotMatch(master,/chrome\.userScripts/);
});

test('course-search route and Tiles index are included in Corrections discovery',()=>{
 const m=json('module-script-groups.json');
 assert.ok(m.corrections[1].matches.some(s=>s.includes('/course/search.php')));
 const main=text('src/radar-main.js'), radial=text('radial.js'), pages=text('src/radar/moodle-pages.js');
 assert.match(main,/isSearch/);
 assert.match(radial,/course\/search\.php/);
 assert.match(pages,/visibleTitle/);
 assert.match(text('src/radar/radar-ui.js'),/includeIndexUndated: true/);
});
test('category searches are manual, lazy and never exceed two course workers',()=>{
 const ui=text('src/radar/radar-ui.js'),scanner=text('src/radar/scanner.js');
 assert.match(ui,/Math\.min\(2, courses\.length\)/);
 assert.match(ui,/nextCourse\+\+/);
 assert.match(ui,/maxInflight: 1/);
 assert.match(ui,/minIntervalMs: 450/);
 assert.match(ui,/maxConcurrent: 2, initialConcurrent: 1/);
 assert.doesNotMatch(ui,/Promise\.all\(courses\.map/);
 assert.match(ui,/bar\.refresh\.addEventListener\('click', \(\) => scan\(true\)\)/);
 assert.match(scanner,/results\[index\] = await checkOne/);
});
