export const REMOTE_CATALOG = 'https://raw.githubusercontent.com/Julioall/extensions/feat/modules-platform-foundation/registry/catalog-v2.json';
const HASH=/^[a-f0-9]{64}$/i;
const VERSION=/^\d+\.\d+\.\d+$/;
const ID=/^[a-z][a-z0-9-]{1,39}$/;
export const MOODLE_MATCHES=['https://ead.fieg.com.br/*','https://ead.senai.br/*'];
const ALLOWED_ROUTES=new Set(['course','category','grading']);
const ICONS=new Set(['file-check','calendar-days','puzzle']);
export function validDescriptor(m) {
  if (!m || !ID.test(m.id||'') || !VERSION.test(m.version||'') || m.kind!=='userScript') return false;
  if(typeof m.name!=='string'||!m.name.trim()||m.name.length>80) return false;
  if(typeof m.description!=='string'||m.description.length>280) return false;
  if(!HASH.test(m.sha256||'') || !Number.isSafeInteger(m.maxBytes) || m.maxBytes<1 || m.maxBytes>262144) return false;
  if(!Array.isArray(m.routes)||m.routes.length===0||!m.routes.every(r=>ALLOWED_ROUTES.has(r)))return false;
  if(!ICONS.has(m.icon))return false;
  try {
    const u=new URL(m.scriptUrl);
    if(u.protocol!=='https:'||u.hostname!=='raw.githubusercontent.com'||u.port||u.username||u.password||u.search||u.hash) return false;
    const match=u.pathname.match(/^\/Julioall\/extensions\/([a-f0-9]{40})\/registry\/packages\/([a-z0-9-]+)-(\d+\.\d+\.\d+)\.js$/);
    if(!match || match[2]!==m.id||match[3]!==m.version)return false;
  } catch {return false;}
  return true;
}
export function validCatalog(cat) {
  if(!cat || cat.schemaVersion!==2 || cat.repository!=='Julioall/extensions'||!Array.isArray(cat.modules))return false;
  const ids=new Set();
  for(const m of cat.modules){if(!validDescriptor(m)||ids.has(m.id))return false;ids.add(m.id);}
  return true;
}
export function routeOf(url) {
  try {const u=new URL(url); const id=x=>/^[1-9]\d*$/.test(u.searchParams.get(x)||'');
    if(u.protocol!=='https:'||!['ead.fieg.com.br','ead.senai.br'].includes(u.hostname))return 'other';
    if(u.pathname==='/course/view.php'&&id('id'))return 'course';
    if(u.pathname==='/course/index.php'&&id('categoryid'))return 'category';
    if(u.pathname==='/mod/assign/view.php'&&u.searchParams.get('action')==='grading')return 'grading';
  }catch{}
  return 'other';
}
export function iconName(m){return m?.icon==='calendar-days'?'calendar':m?.icon==='file-check'?'file-check':'puzzle';}
