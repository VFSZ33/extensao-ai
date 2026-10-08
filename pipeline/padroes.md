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
- Acesso à página: `src/lib/page-forms.ts` injeta `src/entrypoints/lead-forms.ts` na aba ativa, sob demanda, e recebe o retorno do script; comando e resposta são validados em `src/lib/page-command.ts`. Sem content script fixo, listener na página ou permissão de host.
- Persistência: `src/lib/submission-history.ts`. Itens de `wxt/utils/storage` na área local, validados na leitura; registro inválido é descartado, não corrigido.
- Rolagem do popup: `scrollbar-gutter: stable` no `html`, em `src/assets/globals.css`. Sem a calha reservada, o popup entra em laço de redimensionamento quando o conteúdo passa da altura máxima que o navegador dá a ele.
- Seções do popup: `src/components/extension-popup/page-forms/index.tsx`. Subcomponente com título próprio (`popup-section-title`) e retorno numa região `aria-live` da seção; `role="status"` e `role="alert"` ficam com a verificação da extensão.

- Definição de formulário: `src/lib/form-definitions/autodromo-offer.ts`. Um arquivo por formulário, registrado em `src/lib/form-definitions/index.ts`; reconhecer por atributos estáveis, nunca por classes geradas; campo que nem toda variação tem é `optional`. O motor (`src/lib/form-filler.ts`) e o popup não mudam para suportar um formulário novo.
- Dados de teste: `src/lib/lead-data.ts`. Todo valor preenchido deriva do identificador do envio por função pura; dado novo entra em `LeadData`, nunca é gerado na definição ou no motor.
- E2E do fluxo na página: `tests/e2e/extension.spec.ts` (`openActionPopup`). Acionar o ícone pelo CDP para abrir o popup real com `activeTab`; páginas vêm de `tests/fixtures/`, servidas localmente. A suíte nunca envia formulário em site real; conferência manual em site real só em ambiente de testes indicado pelo humano.
