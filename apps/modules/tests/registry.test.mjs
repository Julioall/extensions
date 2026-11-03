import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {validCatalog,validDescriptor,routeOf} from '../catalog-v3-lib.js';
const dir=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(dir,path),'utf8');
const json=path=>JSON.parse(read(path));
const catalog=json('../catalog-v3.json');
const manifest=json('../manifest.json');
test('only v0.3 module sources remain in catalog',()=>{
  assert.equal(validCatalog(catalog),true);
  assert.deepEqual(catalog,json('../../../registry/catalog-v3.json'));
  assert.deepEqual(catalog.modules.map(m=>m.id),['corrections','dates']);
  for(const m of catalog.modules){
    assert.equal(m.version,'0.3.0');
    assert.ok(validDescriptor(m));
    assert.match(m.scriptUrl,/\/[a-f0-9]{40}\/registry\/packages\//);
  }
});
test('GitHub packages are pinned and integrity hashes match',()=>{
  for(const m of catalog.modules){
    const src=read('../../../registry/packages/'+m.id+'-'+m.version+'.js');
    assert.equal(createHash('sha256').update(src,'utf8').digest('hex'),m.sha256);
    assert.doesNotMatch(src,/\beval\s*\(|new Function\s*\(/);
    assert.match(src,/render\(body\)/);
    assert.doesNotMatch(src,/diagn[oó]stic|prot[oó]tip|vers[aã]o de teste/i);
    assert.doesNotMatch(src,/createElement\(['"]section['"]\)/);
  }
});
test('no open-in-new-tab extension UI, only the modal host',()=>{
  assert.equal(manifest.version,'0.3.0');
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.action.default_popup,undefined);
  assert.equal(manifest.options_page,undefined);
  assert.deepEqual(manifest.content_scripts[0].js,['content-v3.js']);
  assert.deepEqual(manifest.content_scripts[0].css,['modal-v3.css']);
  assert.equal(manifest.background.service_worker,'background-v3.js');
  assert.ok(manifest.permissions.includes('userScripts'));
});
test('catalog remains minimal: name, version and controls',()=>{
  const c=read('../content-v3.js');
  assert.match(c,/mrm-catalog-name/);
  assert.match(c,/mrm-version/);
  assert.match(c,/Baixar e ativar|Instalar/);
  assert.match(c,/Desativar/);
  assert.match(c,/Remover/);
  assert.match(c,/role','dialog'/);
  assert.match(c,/aria-modal/);
  assert.match(c,/prefers-reduced-motion/);
  assert.match(c,/\.animate\(/);
  assert.match(c,/originButton/);
  assert.doesNotMatch(c,/window\.open|openOptionsPage|createElement\(['"]iframe['"]\)/);
});
test('active routes and disabled icons match Moodle URLs',()=>{
  assert.equal(routeOf('https://ead.fieg.com.br/course/view.php?id=44'),'course');
  assert.equal(routeOf('https://ead.fieg.com.br/course/index.php?categoryid=6433'),'category');
  assert.equal(routeOf('https://ead.senai.br/mod/assign/view.php?action=grading&id=80'),'grading');
  assert.equal(routeOf('https://not-moodle.example/course/view.php?id=44'),'other');
  assert.equal(routeOf('https://ead.fieg.com.br/course/view.php?id=0'),'other');
  assert.match(read('../content-v3.js'),/button\.disabled=!m\.enabled/);
});
test('catalog rejects untrusted and duplicate code URLs',()=>{
  const m=catalog.modules[0];
  assert.equal(validDescriptor({...m,scriptUrl:'https://example.com/fake.js'}),false);
  assert.equal(validDescriptor({...m,sha256:'wrong'}),false);
  assert.equal(validCatalog({...catalog,modules:[m,m]}),false);
});
