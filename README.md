# Modules — plataforma modular para o Moodle

**Modules** é uma única extensão Chrome que reúne Corrections e Dates em um menu radial no canto inferior direito das páginas Moodle.

## Versão de compatibilidade 0.4.0

As funcionalidades completas das versões **Corrections 1.7.8** e **Dates 1.3.8** foram incorporadas à extensão mestre e continuam separadamente ativáveis.

- **Corrections:** buscar atividades pendentes por curso/categoria, baixar envios, importar notas CSV/XLSX e importar notas na tela de avaliação.
- **Dates:** painel completo com tabela, cronograma, preenchimento e gravação de datas com conferência no Moodle.
- **Modules:** modal compacto com nome/versão e ícones de instalar, atualizar e remover. Ações indisponíveis ficam cinza. Os painéis operacionais abrem como modais animados.

**Limitação:** nesta versão os motores completos são empacotados junto ao Modules; ainda não são baixados do GitHub como código executável independente. Esse passo exige separar serviços privilegiados e runtime de cada módulo de forma segura.

### Instalar

Baixe o artefato `Modules-0.4.0` na execução do GitHub Actions deste branch/PR, extraia o ZIP e carregue a pasta em `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação**. Deixe desativadas as extensões antigas para evitar execução em duplicidade.

### Desenvolvimento

- [Plano](docs/IMPLEMENTATION_PLAN.md) · [Épico #1](https://github.com/Julioall/extensions/issues/1)
- [Migração completa #11](https://github.com/Julioall/extensions/issues/11)
- [Código da extensão](apps/modules/)
- Testes locais: `cd apps/modules && npm test`

Os testes automatizados protegem a preservação dos arquivos legados e o isolamento entre módulos. Testes finais em sessão real do Moodle permanecem necessários.
