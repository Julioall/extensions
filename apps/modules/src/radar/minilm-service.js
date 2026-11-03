import { pipeline, env } from '../vendor/transformers.min.js';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const gpu = Boolean(globalThis.navigator?.gpu);
let activePromise = null;
let activeDevice = '';

// Os arquivos ONNX são obtidos no primeiro uso via Hugging Face e ficam em cache local.
// O código JS e o runtime WASM vêm de arquivos empacotados na extensão, nunca de CDN.
try {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('src/vendor/');
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
} catch (_) { /* Falha explicitada na primeira tentativa de inferência. */ }

async function createExtractor() {
  const options = gpu ? [{ device: 'webgpu', dtype: 'q4' }, { device: 'wasm', dtype: 'q8' }] : [{ device: 'wasm', dtype: 'q8' }];
  let lastError;
  for (const opts of options) {
    try {
      const extractor = await pipeline('feature-extraction', MODEL, opts);
      activeDevice = opts.device;
      return extractor;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Não foi possível carregar o MiniLM.');
}
function extractor() {
  if (!activePromise) activePromise = createExtractor().catch(err => { activePromise = null; throw err; });
  return activePromise;
}
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}
const normalize = t => String(t || '').replace(/\s+/g, ' ').trim();

export async function rankCandidates({ assignment, targetText, candidates }) {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 4) throw new Error('Quantidade inválida de candidatos.');
  if (candidates.some(c => !/^\d{1,30}$/.test(String(c.id)))) throw new Error('Identificador de módulo inválido.');
  const textCandidates = candidates.filter(c => normalize(c.excerpt).length >= 45);
  if (textCandidates.length < 2) return { status: 'sem_evidencia_textual', id: null };
  // Evita decidir somente pela semelhança de 'SAP 01' em dois nomes de arquivos.
  // São incluídos o enunciado legível e (quando houver) a descrição da própria tarefa.
  const query = `Atividade avaliativa: ${normalize(assignment).slice(0, 180)}. Instruções na entrega: ${normalize(targetText).slice(0, 1800)}`;
  const texts = [query, ...textCandidates.map(c => `Documento de atividade: ${normalize(c.name).slice(0, 180)}. Instruções: ${normalize(c.excerpt).slice(0, 1800)}`)];
  const model = await extractor();
  const tensor = await model(texts, { pooling: 'mean', normalize: true });
  const vectors = tensor.tolist();
  const queryVec = vectors[0];
  const results = textCandidates.map((c, i) => ({ id: String(c.id), score: dot(queryVec, vectors[i + 1]) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = results;
  const gap = best.score - second.score;
  // O MiniLM é apenas evidência de desempate: nunca confie em gap reduzido.
  const accepted = best.score >= 0.35 && gap >= 0.09;
  return { status: accepted ? 'classificado' : 'inconclusivo', id: accepted ? best.id : null,
    score: Number(best.score.toFixed(4)), gap: Number(gap.toFixed(4)), device: activeDevice };
}
