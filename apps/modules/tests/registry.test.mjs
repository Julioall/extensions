import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {validCatalog,validDescriptor,routeOf} from '../catalog-v2-lib.js';
const here=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(resolve(here,p),'utf8');
const parsed=p=>JSON.parse(read(p));
const catalog=parsed('../catalog-v2.json');
const original=parsed('../../../registry/catalog-v2.json');
const manifest=parsed('../manifest.json');
test('registry v2 is valid and matches the offline copy',()=>{
  assert.deepEqual(catalog,original);assert.equal(validCatalog(catalog),true);
  assert.deepEqual(catalog.modules.map(x=>x.id),['corrections','dates']);
});
test('pinned SHA-256 matches actual release source bytes',()=>{
  for(const mod of catalog.modules){
    assert.equal(validDescriptor(mod),true);
    const js=read('../../../registry/packages/'+mod.id+'-'+mod.version+'.js');
    const digest=createHash('sha256').update(js,'utf8').digest('hex');
    assert.equal(digest,mod.sha256,'Hash mismatch: '+mod.id);
    assert.ok(!/\b(?:eval|new Function)\s*\(/.test(js));
    assert.ok(!/\bchrome\.(?:downloads|tabs|storage)\b/.test(js),'User script must not hold privileged Chrome APIs');
  }
});
test('invalid routes, URLs and hashes are blocked',()=>{
  const d=catalog.modules[0];
  assert.equal(validDescriptor({...d,scriptUrl:'https://evil.com/module.js'}),false);
  assert.equal(validDescriptor({...d,scriptUrl:'https://raw.githubusercontent.com/other/repo/main/x.js'}),false);
  assert.equal(validDescriptor({...d,sha256:'abc'}),false);
  assert.equal(validDescriptor({...d,routes:['*']}),false);
  assert.equal(validCatalog({...catalog,modules:[d,d]}),false);
});
test('only valid Moodle URLs activate actions',()=>{
  assert.equal(routeOf('https://ead.fieg.com.br/course/view.php?id=123'),'course');
  assert.equal(routeOf('https://ead.fieg.com.br/course/index.php?categoryid=6433'),'category');
  assert.equal(routeOf('https://ead.senai.br/mod/assign/view.php?id=8&action=grading'),'grading');
  assert.equal(routeOf('https://evil.com/course/view.php?id=123'),'other');
  assert.equal(routeOf('https://ead.fieg.com.br/course/view.php?id=0'),'other');
});
test('MV3: one master Chrome extension with userScripts',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.name,'Modules — Moodle');
  assert.equal(manifest.version,'0.2.0');
  assert.equal(manifest.background.service_worker,'background-v2.js');
  assert.ok(manifest.permissions.includes('userScripts'));
  assert.equal(manifest.content_scripts.length,1);
  assert.deepEqual(manifest.content_scripts[0].js,['content-v2.js']);
  assert.ok(!manifest.permissions.includes('management'));
});
test('dynamic menu: installed state, radial radius and executable route checks',()=>{
  const menu=read('../content-v2.js'),host=read('../background-v2.js');
  assert.match(menu,/installedModules/);
  assert.match(menu,/\*89/);
  assert.match(menu,/mrm-action/);
  assert.doesNotMatch(menu,/\.imn-root|#mod-date-button/);
  assert.match(host,/chrome\.userScripts\.register/);
});
