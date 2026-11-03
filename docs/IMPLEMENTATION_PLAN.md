# Modules — plano de implementação

## Visão
**Modules** centraliza o menu radial, o catálogo e a descoberta de atualizações. **Corrections** e **Dates** mantêm código, versões, testes e releases independentes. Não substituir funções operacionais sem validação no Moodle real.

## Situação inicial (03/11/2026)
Repositório criado com LICENSE e README; arquivos legados Corrections v1.7.8 e Dates v1.3.8 ainda são entregues como ZIPs individuais. Os dois tinham cópias idênticas de `radial.js`/`radial.css`, além de dependências em botões internos.

## M1 — Base da extensão mestre (#2)
- Extensão MV3 `apps/modules/` com um menu radial no canto inferior direito (raio 89 px).
- Corrigir duplicidade removendo a injeção de menu dos dois módulos após migração de seus manifests.
- Atalhos: busca, download, importação contextual e datas; desabilitar em cinza fora de rota e quando a ação original não estiver disponível.
- Popup de gerenciamento, catálogo de módulos lido do GitHub como **dados**; fallback local quando offline.
- Não baixar/executar JavaScript remoto através de `eval`, script tag, dynamic import ou outros mecanismos não autorizados.

## M2 — Contrato e SDK (#3)
- Especificar `module.json`: identidade, versão, compatibilidade, rotas, capacidades, dependências e permissões.
- Trocar gradualmente a dependência em seletores de DOM por API explícita de mensagens com origem validada, sem conceder permissões irrestritas.
- Prefixos próprios por módulo e nenhuma variável global compartilhada.

## M3 — Migração de módulos (#4)
- Importar **o código fonte completo** de Corrections e Dates para `modules/<id>/` com caminhos internos próprios, sem menus duplicados.
- Preservar Corrections em `/course/view.php?id=`, `/course/index.php?categoryid=` (inclusive paginação/varredura em categoria) e `/mod/assign/view.php?action=grading`.
- Preservar Dates em `/course/view.php?id=` e operações `/course/modedit.php`.
- Testar correção de notas, arquivos CSV/XLSX, downloads, consulta e alteração de datas no Moodle real.

## M4 — Versões/publicação (#5)
- Cada módulo publica ZIP versionado como asset de GitHub Release após testes.
- `registry/catalog.json` terá URL de release imutável e hash SHA-256 para downloads. Sem asset publicado, o catálogo deve mostrar indisponível, sem inventar URLs.
- Modules baixa um ZIP **somente para a pasta de Downloads**; Chrome não permite instalar uma extensão arbitrária silenciosamente.
- Avaliar em spike separado `chrome.userScripts` para futuras funções que podem ser carregadas dentro da extensão mestre. Requer consentimento, validação de políticas e broker com privilégios limitados.

## M5 — Qualidade e rollback (#6)
- CI valida contratos, catálogo, manifesto MV3 e regressões por módulo.
- Testes de tela com Chrome, rotas reais FIEG/SENAI, modo offline, curso/categoria, estado dos botões e coexistência.
- Alteração de um módulo não incrementa versão do outro. Rollback pelo asset anterior/release anterior; integração com mestre compatível com N/N-1.

## Estratégia de entrega
1. Branch isolada e pull request (sem alterar `main` sem revisão).
2. Primeiro marco: mestre funcional + catálogo + menu, com as extensões antigas preservadas.
3. Segundo marco: módulos migrados sem cópia própria do radial, publicados como ZIPs independentes.
4. Terceiro marco: releases assinadas/verificadas e botão de download no gerenciador.
5. Somente depois experimentar instalação dinâmica via User Scripts, com revisão de segurança.

## Não objetivos desta primeira entrega
- Atualização silenciosa de extensões Chrome via GitHub.
- Executar código de release baixado sem consentimento.
- Desinstalar ou desabilitar extensões de terceiros automaticamente.
- Declarar E2E de Moodle real antes de realizar esses testes.
