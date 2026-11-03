# Modules — extensões modulares para o Moodle

**Modules** é uma única extensão Chrome que gerencia módulos baixados individualmente do GitHub, sem instalar outra extensão para cada funcionalidade.

- Mestre: `apps/modules/`
- Catálogo de módulos: `registry/catalog-v3.json`
- Fontes versionadas: `registry/packages/`
- Contrato de integração: `packages/module-sdk/CONTRACT.md`
- Plano: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

## Interface

As ações aparecem no menu radial do canto inferior direito. Cada botão que necessita de conteúdo **se transforma visualmente num modal**, sem abrir telas separadas. O catálogo mostra somente nome, versão e botões **Instalar / Atualizar / Ativar / Desativar / Remover**.

## Testar

Carregue `apps/modules` em `chrome://extensions` com Modo do desenvolvedor, habilite **Permitir scripts do usuário** nos Detalhes do Modules e abra o Moodle FIEG/SENAI. Abra o catálogo pelo radial ou pelo ícone da barra do Chrome.

As fontes atuais de Corrections e Dates oferecem navegação básica por cursos e atividades. A migração das operações completas de importação de notas e ajuste em lote **ainda está pendente**; consulte [issue #4](https://github.com/Julioall/extensions/issues/4).

**Desenvolvimento em PR:** [Modules — plataforma](https://github.com/Julioall/extensions/pull/7) e [padrão visual](https://github.com/Julioall/extensions/issues/9).
