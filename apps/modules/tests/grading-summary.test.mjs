import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const normalizeText=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
const context={IMN:{text:{normalizeText}},URL,Date};
context.globalThis=context;
vm.runInNewContext(readFileSync(resolve(base,'src/radar/moodle-pages.js'),'utf8'),context);
const pages=context.IMN.pages;

function summary(rows) {
  const nodes=rows.map(([key,value])=>({
    querySelector(sel) {
      if(sel==='th, td:first-child')return {textContent:key};
      if(sel==='td:last-child')return {textContent:value};
      return null;
    }
  }));
  return {querySelectorAll:selector=>selector.includes('.gradingsummarytable')?nodes:[]};
}
test('Projeto de Vida: assignments never become no evaluation from participants alone',()=>{
  const doc=summary([['Participantes','26'],['Enviado para avaliação','3']]);
  assert.equal(pages.parsePendingInfo(doc).kind,'unknown');
  assert.equal(pages.parsePendingCount(doc),null);
});
test('explicit grading counts (including zero and variants) remain confirmed',()=>{
  for(const [label,value,count] of [
    ['Precisa de avaliação','2',2],['Precisam de avaliação','4',4],
    ['Requer avaliação','7',7],['Envios aguardando avaliação','5',5],
    ['Requires grading','0',0],['Needs grading','1.234',1234]
  ]){
    const info=pages.parsePendingInfo(summary([['Participantes','30'],[label,value]]));
    if(count===null)assert.equal(info.kind,'unknown');
    else {assert.equal(info.kind,'count');assert.equal(info.count,count);}
  }
});
test('unavailable grading counters do not manufacture a zero or no-evaluation state',()=>{
  for(const doc of [summary([]),summary([['Participantes','15']]),summary([['Precisa de avaliação','—']])]){
    assert.equal(pages.parsePendingInfo(doc).kind,'unknown');
  }
});
