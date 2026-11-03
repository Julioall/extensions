export const CATALOG_URL = 'https://raw.githubusercontent.com/Julioall/extensions/main/registry/catalog.json';
const VERSION = /^\d+\.\d+\.\d+$/;
const HASH = /^[a-f0-9]{64}$/i;
const DOWNLOAD = /^https:\/\/github\.com\/Julioall\/extensions\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.zip$/;
export function validCatalog(value) {
  if (!value || value.schemaVersion!==1 || value.repository!=='Julioall/extensions'||!Array.isArray(value.modules)) return false;
  const ids=new Set();
  for (const module of value.modules) {
    if (!module || !/^[a-z][a-z0-9-]{1,39}$/.test(module.id||'') || ids.has(module.id)) return false;
    ids.add(module.id);
    if(typeof module.name!=='string' || module.name.length>80 || typeof module.description!=='string' || module.description.length>240) return false;
    if(!VERSION.test(module.version||'') || module.kind!=='extension') return false;
  }
  return true;
}
export function canDownload(module) {
  return module && module.releaseAvailable===true && DOWNLOAD.test(module.downloadUrl||'') && HASH.test(module.sha256||'') && VERSION.test(module.version||'');
}
export function releaseFileName(module) { return module.id+'-'+module.version+'.zip'; }
