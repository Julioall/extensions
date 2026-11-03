# Modules v0.4.0 — Compatibilidade com os módulos completos

Instale **somente a extensão Modules** no Chrome. Esta versão recupera o motor completo das versões anteriores de Corrections (1.7.8) e Dates (1.3.8) dentro da extensão mestre.

## Uso

1. Extraia o ZIP e abra `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação**.
2. Se você já tiver Corrections e Dates como extensões Chrome, desative essas versões para evitar execução duplicada.
3. Entre em uma página de curso ou categoria do Moodle SENAI/FIEG.
4. Abra o botão radial no canto inferior direito e clique em **Modules**. O catálogo só mostra **nome, versão e três ícones:** instalar, atualizar e remover. O ícone de atualização fica cinza quando não existe uma versão nova incluída.
5. Ative Corrections e Dates. O Corrections adiciona **buscar, baixar, importar**; o Dates adiciona **Ajustar datas**, com o painel completo e gravação conferida pelo Moodle.

## Comportamento preservado

- Corrections: busca de envios pendentes em cursos e categorias, downloads, importação CSV/XLSX em lote e importação da tela de avaliação.
- Dates: tabela completa, leitura automática de datas, preenchimento rápido, identificação do cronograma e gravação com verificação em iframe oculto.
- Ações aparecem somente nas rotas corretas; botões sem ação disponível ficam cinza.
- Corrections exibe seus botões de ação **dentro do próprio modal**; Dates mantém o painel original, com abertura animada a partir do botão radial.

## Limitação importante

A 0.4 é uma **versão de compatibilidade**, com os motores completos incorporados como arquivos locais e ativados individualmente via `chrome.scripting.registerContentScripts`. Não baixa ainda a lógica completa de cada módulo do GitHub para atualizá-la independentemente do mestre. O catálogo instalado/atualizado funciona, mas a distribuição independente exigirá uma camada segura adicional que transporte código ou serviços privilegiados de cada módulo. Não declare uma atualização remota quando não houver pacote novo.

**Validação:** testes de sintaxe e consistência de conteúdo originais; teste Chrome/Moodle real pendente neste ambiente por bloqueio de navegação do navegador de testes.