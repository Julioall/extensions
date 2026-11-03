/* Consulta e gravação de datas dentro de iframe oculto da aba atual.
 * Não abre abas ou janelas, preserva a sessão Moodle e verifica cada gravação. */
'use strict';
const KEY='modDateJobV13';
const ALARM='modDateJobTimeoutV13';
const HOSTS=new Set(['https://ead.fieg.com.br','https://ead.senai.br']);
const FIELDS={assign:['allowsubmissionsfromdate','duedate','cutoffdate','gradingduedate'],quiz:['timeopen','timeclose']};
let chain=Promise.resolve();
function exclusive(fn){const p=chain.then(fn);chain=p.catch(()=>{});return p}
async function load(){return (await chrome.storage.local.get(KEY))[KEY]||null}
async function save(job){job.updatedAt=Date.now();await chrome.storage.local.set({[KEY]:job});return job}
function activityUrl(job,task){return `${job.origin}/course/modedit.php?update=${task.cmid}&return=1`}
function dateOK(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return +m[1]>=2000&&+m[1]<=2100&&d.getUTCFullYear()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCDate()===+m[3]}
function timeOK(x){const m=/^(\d\d):(\d\d)$/.exec(x||'');return !!m&&+m[1]<24&&+m[2]<60}
function running(job){return job?.status==='running'&&HOSTS.has(job.origin)}
function parentSenderOK(job,sender){
  return !!sender.tab&&sender.tab.id===job.tabId&&sender.frameId===0
    &&sender.tab.url?.startsWith(job.origin+'/course/view.php');
}
function formSenderOK(job,sender,task){
  if(!sender.tab||sender.tab.id!==job.tabId||!(sender.frameId>0))return false;
  try{const u=new URL(sender.url);return u.origin===job.origin&&u.pathname==='/course/modedit.php'
    &&Number(u.searchParams.get('update'))===task.cmid}
  catch{return false}
}
function basicTask(t,cid){return Number.isSafeInteger(t.cmid)&&t.cmid>0&&t.courseId===cid&&['assign','quiz'].includes(t.type)&&typeof t.title==='string'}
function checkTasks(tasks,cid,mode){
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>500)throw Error('Selecione de 1 a 500 módulos por lote.');
  const used=new Set(),out=[];
  for(const t of tasks){
    if(!basicTask(t,cid)||used.has(t.cmid))throw Error('Módulo inválido ou duplicado.');
    used.add(t.cmid);
    const safe={cmid:t.cmid,courseId:cid,type:t.type,title:t.title.slice(0,180)};
    if(mode==='apply'){
      const ops={};
      for(const [field,o] of Object.entries(t.ops||{})){
        if(!FIELDS[t.type].includes(field)||!['set','disable'].includes(o?.mode))throw Error(`Campo de data não permitido: ${field}`);
        if(o.mode==='set'&&(!dateOK(o.date)||!timeOK(o.time)))throw Error(`Data ou hora inválida: ${t.title} / ${field}`);
        ops[field]=o.mode==='disable'?{mode:'disable'}:{mode:'set',date:o.date,time:o.time};
      }
      if(!Object.keys(ops).length)throw Error('O lote contém módulo sem campos selecionados.');
      const ordered=FIELDS[t.type].filter(k=>k!=='gradingduedate').map(x=>ops[x]).filter(x=>x?.mode==='set');
      for(let i=1;i<ordered.length;i++)if(ordered[i-1].date+'T'+ordered[i-1].time>ordered[i].date+'T'+ordered[i].time)throw Error(`Datas em ordem inválida: ${t.title}`);
      safe.ops=ops;
    }
    out.push(safe);
  }
  return out;
}
function matchFields(actual,task){
  if(!actual||actual.moduleId!==task.cmid||!actual.dates)return false;
  return Object.entries(task.ops).every(([key,op])=>{
    const v=actual.dates[key];
    return op.mode==='disable'?!v?.enabled:!!v?.enabled&&v.date===op.date&&v.time===op.time;
  });
}
async function notifyMain(job,command,payload={}){
  const response=await chrome.tabs.sendMessage(job.tabId,{type:command,courseId:job.courseId,...payload},{frameId:0});
  if(!response?.ok)throw Error(response?.error||'A página do curso não respondeu');
}
async function finish(job,status='done'){
  job.status=status;job.phase='finished';await save(job);
  await chrome.alarms.clear(ALARM);
  try{await notifyMain(job,'MOD_DATE_CLOSE_FRAME')}catch(_){/* aba fechada */}
}
async function openTask(job){
  await notifyMain(job,'MOD_DATE_NAVIGATE',{url:activityUrl(job,job.tasks[job.cursor])});
}
async function next(job,ok,reason,snapshot){
  const t=job.tasks[job.cursor];if(!t)return finish(job);
  const result={cmid:t.cmid,title:t.title,type:t.type,ok:!!ok,detail:String(reason||'').slice(0,850)};
  if(snapshot?.dates&&snapshot.moduleId===t.cmid)result.dates=snapshot.dates;
  job.results.push(result);job.cursor++;
  if(job.cursor>=job.tasks.length)return finish(job);
  job.phase='opening';job.formFrameId=null;await save(job);
  try{await openTask(job)}
  catch(e){job.results.push({cmid:job.tasks[job.cursor].cmid,ok:false,detail:'Não foi possível abrir atividade oculta: '+e.message});await finish(job,'paused')}
}
async function formReady(message,sender){return exclusive(async()=>{
  const job=await load();if(!running(job))return {ok:false,reason:'no-active-job'};
  const task=job.tasks[job.cursor];
  if(!task||task.cmid!==message.moduleId||!formSenderOK(job,sender,task))return {ok:false,reason:'module-mismatch'};
  if(job.mode==='scan'){
    await next(job,!message.formProblem,message.formProblem||'Datas consultadas',message);
    return {ok:true};
  }
  if(message.formProblem){await next(job,false,'Formulário indisponível: '+message.formProblem);return {ok:false,reason:message.formProblem}}
  if(job.phase==='opening'){
    if(matchFields(message,task)){await next(job,true,'As datas já estavam iguais; sem gravação');return {ok:true,skipped:true}}
    job.phase='submitting';job.formFrameId=sender.frameId;await save(job);
    try{
      const response=await chrome.tabs.sendMessage(job.tabId,{type:'MOD_DATE_FILL',task},{frameId:sender.frameId});
      if(!response?.ok){await next(job,false,response?.reason||'O formulário recusou a alteração');return {ok:false,reason:response?.reason||'form-error'}}
      return {ok:true};
    }catch(e){await next(job,false,'Falha ao preencher formulário oculto: '+e.message);return {ok:false,reason:e.message}}
  }
  if(job.phase==='verifying'){
    const ok=matchFields(message,task);
    await next(job,ok,ok?'Salvo e conferido após reabrir a atividade':'Conferência divergente (somente os campos solicitados foram comparados)');
    return {ok:true};
  }
  if(job.phase==='submitting'){
    await next(job,false,'Moodle permaneceu na edição: '+(message.formErrors||'salvamento não confirmado'));
    return {ok:false,reason:'not-confirmed'};
  }
  return {ok:false,reason:'unexpected-phase'};
})}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg?.type==='MOD_DATE_START'){
    exclusive(async()=>{
      if(!sender.tab||sender.frameId!==0||!HOSTS.has(msg.origin)||!sender.tab.url?.startsWith(msg.origin+'/course/view.php'))throw Error('Abra a ferramenta na página de um curso Moodle.');
      const cid=Number(msg.courseId),mode=msg.mode;
      if(!Number.isSafeInteger(cid)||cid<=0||!['scan','apply'].includes(mode))throw Error('Curso ou operação inválidos.');
      const active=await load();if(running(active))throw Error('Já existe uma consulta ou gravação em andamento. Aguarde ou cancele.');
      const tasks=checkTasks(msg.tasks,cid,mode);
      const job={status:'running',mode,origin:msg.origin,courseId:cid,tasks,results:[],cursor:0,phase:'opening',tabId:sender.tab.id,formFrameId:null,updatedAt:Date.now(),startedAt:Date.now()};
      await save(job);await chrome.alarms.create(ALARM,{periodInMinutes:1});
      try{await openTask(job)}catch(e){await finish(job,'paused');throw Error('Falha ao carregar iframe oculto: '+e.message)}
      return {ok:true,job};
    }).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='MOD_DATE_FORM_READY'){
    formReady(msg,sender).then(reply).catch(e=>reply({ok:false,reason:e.message}));return true;
  }
  if(msg?.type==='MOD_DATE_IFRAME_NAV'){
    exclusive(async()=>{
      const job=await load();
      if(!running(job)||!parentSenderOK(job,sender)||job.courseId!==msg.courseId||job.origin!==msg.origin||job.mode!=='apply'||job.phase!=='submitting')return {ok:false};
      let dest;try{dest=new URL(msg.url)}catch{return {ok:false}};
      if(dest.origin!==job.origin){await next(job,false,'Redirecionamento inesperado; gravação não confirmada');return {ok:false}}
      if(dest.pathname==='/course/modedit.php')return {ok:true}; // campos inválidos: o formulário informa o erro
      job.phase='verifying';await save(job);
      try{await openTask(job);return {ok:true}}
      catch(e){await next(job,false,'Falha ao conferir a gravação: '+e.message);return {ok:false}}
    }).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='MOD_DATE_CANCEL'){
    exclusive(async()=>{
      const job=await load();if(running(job)&&parentSenderOK(job,sender)&&job.courseId===msg.courseId&&job.origin===msg.origin){await finish(job,'canceled');return {ok:true}}
      return {ok:false};
    }).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
  }
});
chrome.tabs.onRemoved.addListener(tabId=>{
  exclusive(async()=>{const job=await load();if(running(job)&&job.tabId===tabId){job.status='paused';job.phase='finished';await save(job);await chrome.alarms.clear(ALARM)}}).catch(()=>{});
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name!==ALARM)return;
  exclusive(async()=>{
    const job=await load();if(!running(job)){await chrome.alarms.clear(ALARM);return}
    if(Date.now()-job.updatedAt>=120000)await next(job,false,'Limite de 2 minutos excedido ao consultar, salvar ou conferir formulário oculto');
  }).catch(()=>{});
});
