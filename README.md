# Modules — Moodle

**Modules** é a única extensão Chrome necessária. Corrections v1.7.9 e Dates v1.3.9 são distribuídos como os scripts CSS/JS originais, copiados integralmente dos pacotes de referência.

O catálogo abre **somente pelo ícone do Modules na barra do Chrome**. Popup mínimo: nome, versão, ícones para instalar, atualizar e remover. Não há botão de catálogo no menu radial do Moodle.

O radial mantém os **quatro atalhos originais**: Corrections (buscar, baixar, importar) e Dates (abrir editor). Nenhum fluxo ou painel original é redesenhado. A extensão mestre registra os content scripts conforme os manifests originais; recarregue a página Moodle após instalar/remover.

O botão atualizar só está habilitado se uma versão nova já estiver incorporada ao Modules. **Atualização/download independente de código completo pelo GitHub ainda não está implementado.**

Código: `apps/modules/` · Testes de integridade: `apps/modules/tests/compatibility.test.mjs` · [Épico #1](https://github.com/Julioall/extensions/issues/1) · [Correção #11](https://github.com/Julioall/extensions/issues/11)

Para instalar a versão de desenvolvimento, use o ZIP produzido no workflow GitHub Actions. Extraia-o e use **Carregar sem compactação** em `chrome://extensions`, desativando as instalações antigas separadas.
