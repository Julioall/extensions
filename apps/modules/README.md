# Modules — extensão mestre (M1)

Instale **Modules** em chrome://extensions > Modo do desenvolvedor > Carregar sem compactação > pasta apps/modules.

O menu principal é a extensão do Chrome (popup ao clicar no ícone). O menu radial é injetado no canto inferior direito apenas em ead.senai.br e ead.fieg.com.br. Quatro ações com distância 89px; a ação correspondente fica cinza quando a rota está errada ou a UI original não está disponível.

**Importante para coexistência:** após a instalação do mestre, atualizar manifests de Corrections e Dates para remover as entradas que injetam \`radial.js\` e \`radial.css\`. O mestre procura os botões originais dos módulos — estes ainda são responsáveis pelas funções; não há execução de scripts obtidos via GitHub. Caso mantenha módulos legados não migrados, o host usa o mesmo ID do menu anterior para reduzir duplicação, mas esta não é a solução permanente.

O catálogo obtido do GitHub é tratado como dado não confiável. Caso a rede falhe, usa \`catalog.json\` embarcado. Ações de download exigem URL allowlisted de uma GitHub Release e SHA-256 conhecido no catálogo. Releases ainda não publicadas ficam inativas.

Ver [plano completo](../../docs/IMPLEMENTATION_PLAN.md).


## Protótipo v0.2.0 — um único Chrome extension

O **Modules** é a única extensão instalada. Use `chrome://extensions` para habilitar **Permitir scripts do usuário** em Modules (Chrome 138+).

Abra o gerenciador clicando no ícone da extensão ou no menu radial, clique **Baixar e ativar** para Corrections ou Dates, e retorne à página do Moodle. O botão de cada módulo aparece automaticamente quando o registro é concluído. Quando estiver em rota inválida, aparece cinza. **Desativar** ou **Remover** não altera os outros módulos.

- Código remoto: `registry/packages/corrections-0.2.0.js`, `dates-0.2.0.js`.
- Manifesto: `registry/catalog-v2.json`, SHA-256 verificado antes do registro em `chrome.userScripts`.
- Sem `eval`, injeção de script no mundo MAIN, extensão extra ou ZIP de módulo instalado no Chrome.
- O registro é realizado no mundo isolado USER_SCRIPT por módulo, sem acesso direto às APIs privilegiadas do host.
- Versão **de demonstração**: Corrections somente enumera links de atividades, cursos e avaliação; Dates enumera atividades e links para edição manual. Os recursos legados completos **não** estão migrados ainda.
- As versões estáveis anteriores de Corrections e Dates continuam disponíveis separadamente para operação até a migração concluída.

Consulte [SPIKE #8](https://github.com/Julioall/extensions/issues/8) e `docs/IMPLEMENTATION_PLAN.md`.
