# Modules SDK — contrato v1 (proposta)

Cada módulo possui `module.json` (schemaVersion 1) com id estável em minúsculas, versão SemVer, capacidades e rotas explicitadas.

**M1 temporário:** a extensão mestre encontra botões já existentes no DOM dos módulos legados. Este adaptador usa *apenas* seletores fixos locais. Não há execução de comandos remotos.

**M2 definitivo:** os módulos expõem `moduleId`, `action`, `availability` e `version` por canal de mensagens autenticado, sem depender de seletores DOM. Cada handler valida o remetente, o esquema da mensagem, a rota e a permissão. Nenhum módulo poderá instruir o host a avaliar uma string JavaScript.

Contrato de ações inicialmente planejado:
- `corrections.scanPending` — curso ou categoria.
- `corrections.downloadPending` — após existência de resultados.
- `corrections.importGrades` — curso/categoria em lote; avaliação contextual.
- `dates.openEditor` — página de um curso.

Os módulos mantêm armazenamento sob prefixos por ID e testes próprios. Alterações incompatíveis exigem aumento de major version do SDK e rollout controlado.
