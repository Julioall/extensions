# Modules v0.5.2 — Corrections com busca controlada

Esta versão instala **somente o Modules** como extensão do Chrome. O catálogo aparece exclusivamente ao clicar no ícone da extensão na barra do navegador. Ele apresenta somente nome, versão e três botões de ícone (instalar, atualizar, remover). Não há atalho Modules no menu radial do Moodle.

O menu radial mantém os **quatro controles originais** (Corrections: buscar, baixar, importar; Dates: abrir o editor). Os cliques levam diretamente aos controles originais, sem modais artificiais sobre as telas dos módulos. Os scripts do Dates e os serviços de notas, importação e downloads permanecem sem alterações. Apenas os pontos de entrada e a busca de pendências do Corrections foram corrigidos.

## Instalação

1. Extraia o ZIP e abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**, clique **Carregar sem compactação** e selecione a pasta extraída.
3. Desative as instalações antigas separadas de Corrections e Dates, para evitar execução duplicada.
4. Clique no ícone **Modules** no Chrome e use o ícone **Instalar** na linha de cada módulo desejado.
5. **Recarregue a página do Moodle** após instalar/remover um módulo; o Chrome só aplica o registro/removal de content scripts a novos carregamentos de página.

## Funcionalidades preservadas

- Corrections v1.7.9: varredura manual de curso/categoria, pendências, ZIPs, importação CSV/XLSX em lote, importação na avaliação e seus modais originais.
- Dates v1.3.9: modal original de edição de datas, cronograma, tabela de atividades, processamento em iframe oculto e verificação dos salvamentos.
- Radial: quatro ações no canto direito, habilitadas ou cinzas conforme o contexto e os botões originais.

## O que o catálogo faz nesta versão

**Instalar** ativa um dos módulos **já embarcados neste pacote**, sem criar outra extensão Chrome. **Remover** impede novas injeções de suas telas/ações após recarregar a página. **Atualizar** só fica ativo quando uma versão posterior estiver embarcada em uma atualização do Modules.

**Ainda não há download ou atualização independente do código completo pelo GitHub nesta versão.** Essa parte exigirá um serviço privilegiado/arquitetura de distribuição segura que preserve os módulos originais. Nenhum código das extensões foi reescrito para simular essa funcionalidade.

## Testes

A construção compara hashes SHA-256 dos scripts e estilos que não foram modificados na correção com os ZIPs originais. Também verifica o manifesto Chrome, o mapeamento completo dos scripts por rota e os endpoints do catálogo. O teste operacional definitivo no Moodle real precisa ser realizado no Chrome do usuário.

## Corrections — busca manual e de baixa carga
- `/course/search.php`: reconhece resultados de pesquisa e os cursos exibidos nos cartões, com paginação limitada à mesma busca.
- Curso no formato Tiles: identifica tarefas na navegação lateral, mesmo sem datas visíveis, e consulta o resumo da atividade antes de marcar uma pendência.
- Categoria e resultados: o usuário inicia a busca pela lupa; no máximo **2 cursos em processamento**, um próximo curso inicia apenas depois que um termina; **1 atividade de cada curso por vez**.
- Limite de **2 consultas HTTP simultâneas**, inicialmente 1, com intervalo mínimo de **450ms** entre inícios e recuo em falhas transitórias.
- Qualquer falha na consulta aparece como `Não verificado` e não como zero.
- Nenhuma alteração no Dates ou nas telas de notas e importação.

## Correção de classificação de avaliações

O Corrections não trata a presença de participantes, sem um contador explícito de pendências, como prova de que o curso não tem avaliações. Quando houver tarefas, mas o Moodle não apresentar contador verificável, mostra **Não verificado** e preserva a informação sobre tarefas encontradas. Suporta variantes de rótulos de avaliação do Moodle. Mantém busca por categoria com até 2 cursos simultâneos e 1 atividade por curso. Os arquivos do Dates não foram alterados.
