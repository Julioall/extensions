/* Content script somente no formulário oficial de edição de atividade Moodle. */
(() => {
  'use strict';
  const u=new URL(location.href),moduleInUrl=Number(u.searchParams.get('update'));
  if(!Number.isSafeInteger(moduleInUrl)||moduleInUrl<=0)return;
  const form=[...document.forms].find(f=>f.querySelector('input[name="update"]')&&f.querySelector('[name="sesskey"]'));
  const fields=['allowsubmissionsfromdate','duedate','cutoffdate','gradingduedate','timeopen','timeclose'];
  function report(problem){chrome.runtime.sendMessage({type:'MOD_DATE_FORM_READY',moduleId:moduleInUrl,formProblem:problem}).catch(()=>{})}
  if(!form){report('Formulário de edição não encontrado');return}
  let formAction;try{formAction=new URL(form.action,location.href)}catch{report('Ação do formulário inválida');return}
  if(formAction.origin!==location.origin||formAction.pathname!=='/course/modedit.php'){
    report('O formulário encontrado não utiliza o endereço oficial de edição');return;
  }
  const moduleId=Number(form.querySelector('[name="update"]')?.value);
  if(moduleId!==moduleInUrl){report('Identificador do formulário diferente da URL');return}
  const q=selector=>form.querySelector(selector);
  const get=pre=>{
    const checkbox=q(`[name="${pre}[enabled]"]`);
    if(!checkbox)return null;
    const value=k=>q(`[name="${pre}[${k}]"]`)?.value;
    const y=value('year'),m=value('month'),d=value('day'),h=value('hour'),min=value('minute');
    return {enabled:checkbox.checked,date:y&&m&&d?`${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`:'',time:h!=null&&min!=null?`${h.padStart(2,'0')}:${min.padStart(2,'0')}`:''};
  };
  const dates=()=>Object.fromEntries(fields.map(x=>[x,get(x)]).filter(([,v])=>v));
  function errors(){return [...document.querySelectorAll('.alert-danger,.invalid-feedback,.error')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,5).join(' | ').slice(0,400)}
  function toggle(pre,enabled){
    const checkbox=q(`[name="${pre}[enabled]"]`);
    if(!checkbox)return {ok:false,reason:`Campo ${pre} ausente nesse tipo de atividade.`};
    checkbox.checked=enabled;
    checkbox.dispatchEvent(new Event('input',{bubbles:true}));
    checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true};
  }
  function write(pre,op){
    const result=toggle(pre,op.mode==='set');if(!result.ok)return result;
    if(op.mode==='disable')return {ok:true};
    const [year,month,day]=(op.date||'').split('-'),[hour,minute]=(op.time||'').split(':');
    for(const [unit,value] of Object.entries({day,month,year,hour,minute})){
      const select=q(`[name="${pre}[${unit}]"]`);
      if(!select)return {ok:false,reason:`Campo ${pre}[${unit}] não encontrado.`};
      const normalized=String(Number(value));
      if(![...select.options].some(o=>o.value===normalized))return {ok:false,reason:`Opção de ${pre}[${unit}] indisponível: ${value}.`};
      select.disabled=false;select.value=normalized;
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const now=get(pre);
    return now?.enabled&&now.date===op.date&&now.time===op.time?{ok:true}:{ok:false,reason:`Data ${pre} não permaneceu selecionada.`};
  }
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg?.type!=='MOD_DATE_FILL')return;
    const t=msg.task;
    if(!t||t.cmid!==moduleId){reply({ok:false,reason:'Módulo diferente do formulário aberto.'});return}
    const allowed=t.type==='quiz'?['timeopen','timeclose']:['allowsubmissionsfromdate','duedate','cutoffdate','gradingduedate'];
    for(const [key,op] of Object.entries(t.ops||{})){
      if(!allowed.includes(key)||!['set','disable'].includes(op?.mode)){reply({ok:false,reason:`Operação desconhecida: ${key}`});return}
      const r=write(key,op);if(!r.ok){reply(r);return}
    }
    const saved=dates();
    for(const [key,op] of Object.entries(t.ops||{})){
      if(op.mode==='disable'&&saved[key]?.enabled){reply({ok:false,reason:`Não foi possível desativar ${key}`});return}
      if(op.mode==='set'&&(!saved[key]?.enabled||saved[key].date!==op.date||saved[key].time!==op.time)){
        reply({ok:false,reason:`Valor de ${key} diferente do solicitado`});return;
      }
    }
    const submit=q('#id_submitbutton2')||q('input[name="submitbutton2"]')||q('#id_submitbutton');
    if(!submit){reply({ok:false,reason:'Botão Salvar do Moodle não encontrado'});return}
    if(!form.checkValidity()){
      form.reportValidity();reply({ok:false,reason:'O Moodle marcou campos obrigatórios não preenchidos; alterações não enviadas.'});return;
    }
    reply({ok:true});
    setTimeout(()=>{try{form.requestSubmit(submit)}catch(e){console.warn('Editor de Datas Moodle: falha ao solicitar salvamento',e)}},120);
  });
  chrome.runtime.sendMessage({type:'MOD_DATE_FORM_READY',moduleId,dates:dates(),formErrors:errors()}).catch(()=>{});
})();
