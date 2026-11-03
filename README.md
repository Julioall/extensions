# Modules — Moodle

Plataforma modular de extensões Chrome para Moodle (Manifest V3).

**Módulos:** Corrections (notas e pendências), Dates (datas). **Gerenciador:** Modules, com menu radial único.

- [Plano de implementação](docs/IMPLEMENTATION_PLAN.md)
- [Épico e etapas](https://github.com/Julioall/extensions/issues/1)
- [Extensão mestre](apps/modules/README.md)
- [Catálogo](registry/catalog.json)
- [Contrato do SDK](packages/module-sdk/CONTRACT.md)

## Primeira entrega em desenvolvimento
A branch `feat/modules-platform-foundation` contém a extensão mestre funcional (menu radial + gerente de catálogo). Os módulos legados ainda precisam ser migrados integralmente antes de versões novas serem disponibilizadas. O mestre **não instala nem executa JavaScript remoto**; downloads de ZIPs só poderão ser habilitados depois da publicação de GitHub Releases com SHA-256 verificado.

## Desenvolvimento
Em `chrome://extensions`, ative Modo do desenvolvedor, carregue `apps/modules` sem compactação, e clique no ícone Modules para abrir o catálogo.

Testes: `cd apps/modules && npm test`.

**Limitação atual:** Corrections e Dates ainda não têm releases no repositório, e a integração temporária depende dos controles DOM já existentes em suas extensões atuais.
