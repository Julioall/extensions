# Modules v0.5.0 — preservar Corrections e Dates

Esta versão instala **somente o Modules** como extensão do Chrome. O catálogo aparece exclusivamente ao clicar no ícone da extensão na barra do navegador. Ele apresenta somente nome, versão e três botões de ícone (instalar, atualizar, remover). Não há atalho Modules no menu radial do Moodle.

O menu radial mantém os **quatro controles originais** (Corrections: buscar, baixar, importar; Dates: abrir o editor). Os cliques levam diretamente aos controles originais, sem modais artificiais sobre as telas dos módulos. O editor de Dates e os fluxos de notas e downloads continuam a usar o código JavaScript e CSS original, copiado **byte a byte** dos pacotes fornecidos.

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

A construção compara hashes SHA-256 de todos os scripts e estilos copiados com os dois ZIPs originais. Também verifica o manifesto Chrome, o mapeamento completo dos scripts por rota e os endpoints do catálogo. O teste operacional definitivo no Moodle real precisa ser realizado no Chrome do usuário.
