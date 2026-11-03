# Modules v0.3.0

**Instale apenas esta extensão no Chrome.** Ela mostra um menu radial no canto inferior direito do Moodle e baixa os módulos selecionados do GitHub como scripts com SHA-256 conferido.

## Instalação

1. Extraia `Modules-0.3.0.zip` numa pasta.
2. Abra `chrome://extensions`, ative Modo do desenvolvedor e use **Carregar sem compactação** nessa pasta.
3. Abra os **Detalhes** do Modules e habilite **Permitir scripts do usuário**.
4. Entre em uma página do Moodle SENAI/FIEG, abra o botão radial e clique em **Modules**.
5. No modal, clique **Instalar**. Após a ativação o ícone do módulo aparecerá no menu radial.

O clique no ícone de um módulo abre **o mesmo modal**, com transformação animada a partir do botão. Fora das rotas compatíveis, o botão fica cinza.

O catálogo mostra apenas **nome, versão e ações**. Não abre página de opções, novas abas de extensão ou popups de diagnóstico. O ícone da barra do Chrome abre o catálogo dentro da página Moodle atual.

## Limites atuais

Esta é a primeira implementação do contrato de interface modal. Corrections permite navegar pelos cursos e atividades identificados na página; Dates oferece a lista de atividades com acesso ao formulário oficial do Moodle. **Não substitui** ainda a busca integral de pendências, a importação/baixa de notas nem a edição automática em lote presentes nas versões antigas. Essas operações dependem da migração dos serviços protegidos para o host Modules.

O catálogo é obtido de `registry/catalog-v3.json`. Falhas de rede usam o catálogo incorporado; downloads de scripts exigem URLs pinadas em commits e hash SHA-256 válido. Os módulos podem ser desativados ou removidos individualmente.

## Desenvolvimento

- [Épico](https://github.com/Julioall/extensions/issues/1)
- [Novo padrão de interface modal](https://github.com/Julioall/extensions/issues/9)
- Testes automatizados de regressão: `cd apps/modules && npm test`.

A validação final ainda requer Chrome real, com a permissão User Scripts habilitada.
