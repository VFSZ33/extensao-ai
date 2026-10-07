# Padrões e decisões

> Os exemplares a seguir e as decisões que outras tarefas precisam repetir igual. Os agentes mantêm este arquivo como parte das entregas; o humano vê as mudanças no diff e pode vetá-las ao aceitar. Não é norma: dá para desviar quando a tarefa justifica, e então a entrada é atualizada.

Entra aqui:

- a primeira instância de algo que vai se repetir e em que divergir quebraria a consistência;
- uma decisão que outras tarefas precisam repetir igual;
- qual de duas formas existentes no código é a atual.

Não entra: o que o código já mostra sem ambiguidade, o que uma norma ou uma checagem já garante, uma escolha local.

Formato, uma linha por entrada:

```markdown
- Formulário com validação: `src/conta/perfil-form.tsx`. Schema junto do formulário; mensagens vêm de `src/i18n/`.
- Links de arquivos públicos: `/arquivos/<slug>`; o slug não muda quando o arquivo é substituído.
```

<!-- As entradas do projeto entram abaixo, agrupadas por área quando forem várias. -->

- Bibliotecas: as dependências de `package.json` resolvem, sozinhas ou combinadas, as necessidades que cobrem, conforme a documentação oficial vinculada no `README.md`; não escrever solução própria para elas.
- Configuração própria do ESLint por assunto: `eslint/imports/index.mjs`. Cada grupo exporta uma configuração e é composto em `eslint.config.mjs`; usar como exemplar para novos grupos.
- Tipografia global: `src/assets/globals.css`. Estilos semânticos na camada `base`; variações de contexto, quando necessárias, na camada `components`.

- Primitivos Base UI: `src/components/button/index.tsx`. Preservar props, ref e composição da biblioteca; combinar classes com `tailwind-merge`, incluindo callbacks de estado. Em ações assíncronas, manter foco e nome acessível explícito durante o carregamento.
- Testes de componentes: `src/components/button/index.test.tsx`. Consultar pelo papel e nome acessível e interagir como o usuário.
- Estratégia de testes: unitários para comportamento isolado; e2e para fluxos reais da aplicação ou riscos que exigem navegador. A disponibilidade da ferramenta, sozinha, não justifica criar uma suíte.

- Entradas da extensão: `src/entrypoints/`; nomes exigidos pelo WXT ficam restritos às entradas, com componentes React em `src/components/`.
- Comunicação popup/background: `src/lib/extension-messaging.ts`; validar mensagens e respostas antes de usá-las e manter erro visível na interface.
