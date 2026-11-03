// Modelo de arquivo e prompt para correção assistida. Texto puro, sem DOM.
(function (root) {
  'use strict';

  const TEMPLATE_CSV = [
    'nome;nota;feedback;situacao',
    'Nome Completo do Aluno;45;Feedback objetivo e individualizado para o aluno.;Corrigido',
    'Outro Aluno;;Não foi possível avaliar o conteúdo do arquivo enviado.;Erro no arquivo'
  ].join('\n');

  const CORRECTION_PROMPT = [
    'Corrija as atividades dos alunos e gere um ARQUIVO CSV para download e importação no Moodle.',
    '',
    'Retorne somente o conteúdo do CSV, sem Markdown e sem texto adicional.',
    'Use ponto e vírgula como separador.',
    'Cabeçalho: nome;nota;feedback;situacao',
    'A coluna nome é obrigatória (ou a coluna id, com o número do aluno no Moodle, quando houver homônimos).',
    'Inclua ao menos uma destas colunas: nota, feedback ou situacao.',
    '',
    'Regras:',
    '- Preserve o nome do aluno EXATAMENTE como aparece na listagem do Moodle. Nomes parecidos não serão aceitos.',
    '- Não invente alunos ausentes na lista de envios.',
    '- nota: somente o número (por exemplo 45 ou 7,5), entre 0 e a nota máxima da atividade. Sem "/50", sem texto, sem "%".',
    '- Se não for adequado lançar nota, deixe a coluna nota vazia.',
    '- feedback: curto, claro, acolhedor e individualizado. Sem ponto e vírgula e sem quebras de linha.',
    '- Avalie somente com base nas evidências presentes na entrega e nas orientações fornecidas.',
    '',
    'A coluna situacao deve usar uma destas tags quando fizer sentido:',
    '- Corrigido: a atividade foi avaliada normalmente.',
    '- Erro no arquivo: o arquivo está vazio, corrompido ou inacessível.',
    '- Sem conteúdo relevante: o material enviado não atende ao que foi pedido.',
    '- Revisão necessária: a atividade precisa de ajustes importantes.',
    '- Sem envio válido: não há entrega adequada para avaliar.'
  ].join('\n');

  root.IMN.templates = { TEMPLATE_CSV, CORRECTION_PROMPT };
})(globalThis);
