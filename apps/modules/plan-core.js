/* Reconhecimento heurístico do cronograma. Não consulta o servidor. */
(() => {
  'use strict';
  function normalize(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function identity(text) {
    const n = normalize(text).replace(/^enviar\s*/, '');
    let m = n.match(/atividade\s+extra\s*0*(\d+)(?!\d)/);
    if (m) return 'extra:' + Number(m[1]);
    m = n.match(/\bsap\s*0*(\d+)(?!\d)/);
    if (m) return 'sap:' + Number(m[1]);
    m = n.match(/questionario\s*0*(\d+)(?!\d)/);
    if (m) return 'quiz:' + Number(m[1]);
    if (/avaliacao\s+final/.test(n)) return 'final';
    return '';
  }
  function validDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
    if (!m) return false;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    if (y<2000||y>2100) return false;
    const dt=new Date(Date.UTC(y,mo-1,d));
    return dt.getUTCFullYear()===y && dt.getUTCMonth()+1===mo && dt.getUTCDate()===d;
  }
  function validTime(time) {
    const m=/^(\d{2}):(\d{2})$/.exec(String(time||''));
    return !!m && Number(m[1])<=23 && Number(m[2])<=59;
  }
  function dateFromBR(value) {return parseDateTime(value)?.date || null;}
  function parseDateTime(value) {
    const raw=String(value||'');
    let match=raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
    let date='';
    if (match) date=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
    else {
      match=raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (match) date=`${match[1]}-${match[2]}-${match[3]}`;
    }
    if (!validDate(date)) return null;
    const remainder=raw.replace(match[0],' ');
    const hm=remainder.match(/\b([01]?\d|2[0-3])\s*(?::|h)\s*([0-5]\d)\b/i) || remainder.match(/\b([01]?\d|2[0-3])\s*h\b/i);
    const time=hm ? `${String(Number(hm[1])).padStart(2,'0')}:${hm[2]||'00'}`:null;
    return {date,time};
  }
  function displayDate(iso) {
    const [y,m,d]=String(iso||'').split('-');
    return y&&m&&d?`${d}/${m}/${y}`:'—';
  }
  const startPatterns=[
    [/\b(inicio|inicial|comeco|comeca|comecar|inicio das|iniciam)\b/,10],
    [/\b(abertura|abre|abrir)\b/,10],
    [/\b(liberacao|liberada|liberado|liberar|disponibilizacao|disponivel|disponibilidade)\b/,9],
    [/\b(a partir de|a partir|desde)\b/,8],
    [/\b(data de inicio|data inicial|primeiro dia)\b/,10]
  ];
  const endPatterns=[
    [/\b(termino|fim|final|finalizacao|encerra|encerramento|fechamento|fecha)\b/,10],
    [/\b(limite|data limite|prazo final|vencimento|vencer)\b/,10],
    [/\b(entregar ate|entrega ate|ate quando|data de entrega|prazo (de|para) entrega|prazo para envio|data da entrega|entregas ate)\b/,8],
    [/\b(conclusao|termina)\b/,8]
  ];
  function scoreHeader(raw, role) {
    const n=normalize(raw);
    if (!n || /\b(horario|carga horaria|duracao|ch|nota|pontuacao|situacao|status|valor|dia da semana)\b/.test(n)) return 0;
    if (role==='title') {
      if (/^(atividade|atividades|tarefa|tarefas|nome da atividade|descricao da atividade|acao prevista|acao|etapa|avaliacao|item|titulo)$/.test(n)) return 12;
      return /\b(atividade|tarefa|avaliacao)\b/.test(n) && !/\bdata\b/.test(n) ? 7 : 0;
    }
    const pats=role==='start'?startPatterns:endPatterns;
    let score=0;
    for(const [re,value] of pats) if(re.test(n))score=Math.max(score,value);
    // Cabeçalhos genéricos não definem sentido temporal com segurança.
    if (role==='start' && /^(data|dia|periodo|prazo)$/.test(n))return 0;
    if (role==='end' && /^(data|dia|periodo)$/.test(n))return 0;
    if (score && /\b(data|dia|periodo|envio|entrega)\b/.test(n))score++;
    // "Início e término" numa mesma coluna não pode ser associado a um único sentido.
    const other=role==='start'?endPatterns:startPatterns;
    if (other.some(([re])=>re.test(n))) return 0;
    return score;
  }
  function columnChoice(headers,role,blocked=[]) {
    const candidates=headers.map((header,index)=>({index,score:scoreHeader(header,role),label:String(header||'').trim()}))
      .filter(x=>x.score>=7&&!blocked.includes(x.index)).sort((a,b)=>b.score-a.score);
    if (!candidates.length) return {error:`Coluna de ${role==='title'?'atividade':role==='start'?'abertura':'fechamento'} não identificada`};
    if (candidates.length>1 && candidates[0].score===candidates[1].score) return {error:`Colunas ambíguas para ${role==='title'?'atividade':role==='start'?'abertura':'fechamento'}: ${candidates.filter(x=>x.score===candidates[0].score).map(x=>x.label).join(', ')}`};
    return candidates[0];
  }
  function detectColumns(headers) {
    const title=columnChoice(headers,'title');
    const start=columnChoice(headers,'start',title.index!==undefined?[title.index]:[]);
    const end=columnChoice(headers,'end',[title.index,start.index].filter(x=>x!==undefined));
    const errors=[title.error,start.error,end.error].filter(Boolean);
    return {ok:errors.length===0,errors,title,start,end,headers};
  }
  function evaluateTable(headers, rows) {
    const columns=detectColumns(headers);
    const entries=new Map();let invalidRows=0;
    if (!columns.ok) return {columns,entries,invalidRows,score:0,valid:0};
    for (const cells of rows) {
      if(cells.length<=Math.max(columns.title.index,columns.start.index,columns.end.index))continue;
      const title=String(cells[columns.title.index]||'').trim();
      const key=identity(title);
      if(!key)continue;
      const start=parseDateTime(cells[columns.start.index]);
      const end=parseDateTime(cells[columns.end.index]);
      if(!start||!end||(start.date+(start.time||'00:00'))>(end.date+(end.time||'23:59'))) {invalidRows++;continue;}
      const row={title,key,start:start.date,end:end.date,startTime:start.time||'00:00',endTime:end.time||'23:59'};
      if(entries.has(key)) entries.set(key,{...entries.get(key),ambiguous:true});
      else entries.set(key,row);
    }
    const valid=[...entries.values()].filter(x=>!x.ambiguous).length;
    return {columns,entries,invalidRows,valid,score:valid*100+columns.title.score+columns.start.score+columns.end.score};
  }
  const lib=Object.freeze({normalize,identity,validDate,validTime,dateFromBR,parseDateTime,displayDate,scoreHeader,detectColumns,evaluateTable});
  globalThis.CronPlan=lib;
  if (typeof module==='object'&&module.exports)module.exports=lib;
})();
