import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {validCatalog,canDownload,releaseFileName} from '../catalog-lib.js';
const here=dirname(fileURLToPath(import.meta.url));
const local=JSON.parse(readFileSync(resolve(here,'../catalog.json'),'utf8'));
const source=JSON.parse(readFileSync(resolve(here,'../../../registry/catalog.json'),'utf8'));
const manifest=JSON.parse(readFileSync(resolve(here,'../manifest.json'),'utf8'));
test('local and remote registry contracts are equal',()=>{
  assert.deepEqual(local,source);
  assert.equal(validCatalog(local),true);
  assert.deepEqual(local.modules.map(m=>m.id),['corrections','dates']);
});
test('no downloadable entry without a published release and SHA-256',()=>{
  for(const m of local.modules)assert.equal(canDownload(m),false);
  const m={...local.modules[0],releaseAvailable:true,sha256:'f'.repeat(64),downloadUrl:'https://github.com/Julioall/extensions/releases/download/corrections-v1.7.8/corrections-1.7.8.zip'};
  assert.equal(canDownload(m),true);
  assert.equal(canDownload({...m,sha256:'invalid'}),false);
  assert.equal(canDownload({...m,downloadUrl:'https://evil.example/releases/download/x.zip'}),false);
  assert.equal(releaseFileName(m),'corrections-1.7.8.zip');
});
test('catalog rejects duplicate IDs and untrusted structure',()=>{
  const duplicate={...local,modules:[local.modules[0],local.modules[0]]};
  assert.equal(validCatalog(duplicate),false);
  assert.equal(validCatalog({...local,repository:'other/repo'}),false);
});
test('master manifest is a standalone MV3 content script host',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.name,'Modules — Moodle');
  assert.equal(manifest.version,'0.1.0');
  assert.equal(manifest.content_scripts.length,1);
  assert.equal(manifest.content_scripts[0].run_at,'document_start');
  assert.deepEqual(manifest.content_scripts[0].js,['content.js']);
  assert.ok(!manifest.permissions.includes('management'));
  assert.ok(!manifest.permissions.includes('userScripts'));
});
test('menu is single host, compact and context sensitive',()=>{
  const code=readFileSync(resolve(here,'../content.js'),'utf8');
  assert.match(code,/moodle-tools-radial/);
  assert.match(code,/Math\.cos\(angle\)\*89/);
  assert.match(code,/module:'corrections'/);
  assert.match(code,/module:'dates'/);
  assert.match(code,/\/course\/index\.php/);
  assert.match(code,/\/mod\/assign\/view\.php/);
  assert.match(code,/\.disabled/);
  assert.doesNotMatch(code,/\beval\s*\(/);
});
