# Modules — extensão mestre (M1)

Instale **Modules** em chrome://extensions > Modo do desenvolvedor > Carregar sem compactação > pasta apps/modules.

O menu principal é a extensão do Chrome (popup ao clicar no ícone). O menu radial é injetado no canto inferior direito apenas em ead.senai.br e ead.fieg.com.br. Quatro ações com distância 89px; a ação correspondente fica cinza quando a rota está errada ou a UI original não está disponível.

**Importante para coexistência:** após a instalação do mestre, atualizar manifests de Corrections e Dates para remover as entradas que injetam \`radial.js\` e \`radial.css\`. O mestre procura os botões originais dos módulos — estes ainda são responsáveis pelas funções; não há execução de scripts obtidos via GitHub. Caso mantenha módulos legados não migrados, o host usa o mesmo ID do menu anterior para reduzir duplicação, mas esta não é a solução permanente.

O catálogo obtido do GitHub é tratado como dado não confiável. Caso a rede falhe, usa \`catalog.json\` embarcado. Ações de download exigem URL allowlisted de uma GitHub Release e SHA-256 conhecido no catálogo. Releases ainda não publicadas ficam inativas.

Ver [plano completo](../../docs/IMPLEMENTATION_PLAN.md).
