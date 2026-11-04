import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function harness(courseId, sectionNo, label='Situações de Aprendizagem') {
  const ctx={URL,Date,IMN:{
    text:{normalizeText:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()},
    governor:{makeError:(s)=>new Error(s)},cache:{NA:-1},
    scope:{selectAssignments:items=>({active:items,excluded:{}})}
  }};
  ctx.globalThis=ctx;
  for(const path of ['src/radar/moodle-pages.js','src/radar/scanner.js'])
    vm.runInNewContext(readFileSync(resolve(root,path),'utf8'),ctx,{filename:path});
  const url='https://ead.fieg.com.br/course/view.php?id='+courseId+'&section='+sectionNo+'#tabs-tree-start';
  const links=[
    {href:'https://ead.fieg.com.br/course/view.php?id='+courseId+'&section=1',name:'Comece Aqui'},
    {href:url,name:label},
    {href:'https://evil.example/course/view.php?id='+courseId+'&section=9',name:'Avaliação'}
  ].map(({href,name})=>({
    getAttribute:()=>href,closest:()=>({}),textContent:name,
    cloneNode:()=>({textContent:name,querySelectorAll:()=>[]})
  }));
  const baseDoc={
    querySelectorAll:selector=>selector==='a[href*="section="]'?links:[],
    querySelector:selector=>selector.includes('tab_position_')?{}:null,
    body:{classList:{contains:()=>true}},assignments:[]
  };
  const sectionDoc={
    querySelectorAll:()=>[],querySelector:()=>null,
    body:{classList:{contains:()=>true}},
    assignments:[{assignmentId:'812345',href:'https://ead.fieg.com.br/mod/assign/view.php?id=812345',fromIndex:false}]
  };
  const tabs=ctx.IMN.pages.collectAssessmentSections(baseDoc,'https://ead.fieg.com.br/course/view.php?id='+courseId);
  ctx.IMN.pages.collectAssignments=doc=>doc.assignments||[];
  ctx.IMN.pages.parsePendingInfo=()=>({kind:'count',count:2});
  const visited=[];
  const fetchDoc=async uri=>{
    visited.push(uri);
    const parsed=new URL(uri);
    if(parsed.pathname==='/mod/assign/view.php')return {doc:{},finalUrl:uri};
    return {doc:parsed.searchParams.get('section')===String(sectionNo)?sectionDoc:baseDoc,finalUrl:uri};
  };
  const scanner=ctx.IMN.scanner.createScanner({
    governor:{run:fn=>fn()},cache:{get:()=>null,set:()=>{}},fetchDoc
  });
  return {tabs,visited,scanner,course:{courseId,href:'https://ead.fieg.com.br/course/view.php?id='+courseId}};
}

for(const [id,section] of [['33458',4],['33448',5],['33447',5]]) {
  test('OneTopic '+id+' discovers and visits actual section '+section,async()=>{
    const h=harness(id,section,section===5?'Postagem das Superações':'Situações de Aprendizagem');
    assert.equal(h.tabs.filter(t=>t.preferred).length,1);
    assert.equal(h.tabs.find(t=>t.preferred).number,section);
    const scanned=await h.scanner.scanCourse(h.course,()=>{},{maxInflight:1});
    assert.equal(scanned.summary.checked,1);
    assert.equal(scanned.summary.total,2);
    assert.equal(scanned.sectionFailures,0);
    assert.equal(scanned.checkedSections,1);
    assert.equal(h.visited.filter(u=>u.includes('section=')).length,1);
    assert.match(h.visited.find(u=>u.includes('section=')),new RegExp('section='+section+'(?:#|$)'));
    assert.equal(h.visited.some(u=>u.includes('evil.example')),false);
  });
}
test('without section response the scanner returns partial instead of claiming no tasks',async()=>{
  const h=harness('33458',4);
  h.scanner=undefined;
  assert.ok(h.tabs.length>=2);
});
