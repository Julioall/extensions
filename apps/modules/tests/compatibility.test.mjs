import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=p=>readFileSync(resolve(here,p),'utf8');
const json=p=>JSON.parse(text(p));
test('all original source JavaScript/CSS files retain their exact checksum',()=>{
 const {hashes}=json('compat-integrity.json');
 assert.ok(Object.keys(hashes).length>45);
 for(const [path,expected] of Object.entries(hashes)){
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
 assert.deepEqual(c.modules.map(m=>[m.id,m.version]),[['corrections','1.7.9'],['dates','1.3.9']]);
});
test('original background workers are imported without rewriting',()=>{
 const master=text('modules-background.js');
 assert.match(master,/import '\.\/src\/background\.js'/);
 assert.match(master,/import '\.\/background\.js'/);
 assert.doesNotMatch(master,/chrome\.userScripts/);
});
