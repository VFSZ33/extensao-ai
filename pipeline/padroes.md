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
- Primitivo Base UI composto: `src/components/select/index.tsx`. Um componente monta as partes da biblioteca (rótulo, gatilho, portal, lista) e recebe os itens por props; as props restantes vão para o gatilho.
- Confirmação na interface: `src/components/confirmation/index.tsx`, aberta no ponto da ação, sem `confirm()` do navegador nem modal. Recebe o foco ao abrir; Cancelar e Esc desistem, e quem a abre devolve o foco ao gatilho (`src/components/extension-popup/page-forms/index.tsx`); ação irreversível ou com efeito real fora da extensão usa `confirmVariant="destructive"`.
- Campo de texto: `src/components/text-field/index.tsx`. `Field` do Base UI com rótulo próprio e o visual do gatilho do seletor; as props restantes vão para o controle.
- Testes de componentes: `src/components/button/index.test.tsx`. Consultar pelo papel e nome acessível e interagir como o usuário.
- Estratégia de testes: unitários para comportamento isolado; e2e para fluxos reais da aplicação ou riscos que exigem navegador. A disponibilidade da ferramenta, sozinha, não justifica criar uma suíte.

- Entradas da extensão: `src/entrypoints/`; nomes exigidos pelo WXT ficam restritos às entradas, com componentes React em `src/components/` e hooks em `src/hooks/<nome>/index.tsx`.
- Popup e painel lateral: `src/components/extension-popup/index.tsx`, montado pelas duas entradas com `surface`; o que muda entre elas fica nele e em `src/hooks/use-page-targets/index.tsx`, que acompanha a aba ativa e o acesso a ela. Seção que age numa aba recebe `target` opcional: sem ele, age na aba ativa (popup); com ele, na aba acompanhada, e o estado ligado à aba é derivado de uma chave do alvo, sem `setState` síncrono em efeito. No painel lateral, a seção fora de vista fica montada e oculta, para guardar o estado.
- Comunicação popup/background: `src/lib/extension-messaging.ts`; validar mensagens e respostas antes de usá-las e manter erro visível na interface.
- Acesso à página: `src/lib/page-forms.ts` injeta `src/entrypoints/lead-forms.ts` na aba ativa, sob demanda, e recebe o retorno do script; comando e resposta são validados em `src/lib/page-command.ts`. Sem content script fixo nem listener na página; permissão de host só a opcional, por origem.
- Acesso por site: `src/lib/page-access.ts`. Pedir só a origem https da aba, com `permissions.request` como primeira chamada do clique, para valer o gesto do usuário; conferir o acesso por `permissions.contains` e, sem ele, por uma injeção vazia, que aceita o activeTab da aba.
- Persistência: `src/lib/submission-history.ts`. Itens de `wxt/utils/storage` na área local, validados na leitura; registro inválido é descartado, não corrigido. Dado novo no registro entra de forma que os registros já gravados continuem válidos. Limite e retenção em constantes exportadas, aplicados ao gravar e ao ler. Preferência: `src/lib/preferences.ts`, com o padrão numa constante e nada gravado até o usuário mudar.
- Rolagem do popup: `scrollbar-gutter: stable` no `html`, em `src/assets/globals.css`. Sem a calha reservada, o popup entra em laço de redimensionamento quando o conteúdo passa da altura máxima que o navegador dá a ele.
- Seções do popup: `src/components/extension-popup/page-forms/index.tsx`. Subcomponente com título próprio (`popup-section-title`) e retorno numa região `aria-live` da seção; `role="status"` e `role="alert"` ficam com a verificação da extensão.
- Status com ícone: `src/components/extension-popup/lead-integrations/status-label/index.tsx`. Ícone `lucide-react` com cor do tema e o rótulo sempre em texto; a cor nunca é o único sinal.
- Ação com parâmetros no popup: `src/components/extension-popup/lead-integrations/index.tsx`. `Form` do Base UI com botão `submit`, para Enter funcionar; uma ref impede a segunda execução enquanto a primeira não termina, e os campos ficam travados (`readOnly` no texto, para não perder o foco) até o fim.
- Interruptor: `src/components/switch/index.tsx`. `Switch` do Base UI dentro de `label`, com as props restantes no controle.
- Caixa de marcação: `src/components/checkbox/index.tsx`, como o interruptor. Escolha de várias opções com `CheckboxGroup` do Base UI, `allValues` e um item pai Todas: `src/components/extension-popup/page-forms/unit-picker/index.tsx`.
- Atualização periódica: `src/components/extension-popup/lead-integrations/index.tsx`. Timer num efeito que depende da hora da última conferência, consulta em `useEffectEvent`, contador de geração para descartar resultado vencido e pausa com `src/hooks/use-document-visible/index.tsx`; o que está na tela continua durante a atualização, e resultado igual não muda a região `aria-live`.
- Cópia para a área de transferência: `src/components/extension-popup/lead-integrations/report-copy/index.tsx`. `navigator.clipboard.writeText` no clique, com retorno de sucesso ou falha numa região `aria-live` própria; o texto vem de função pura em `src/lib/` e não leva dado de contato nem de sessão.

- Definição de formulário: `src/lib/form-definitions/autodromo-offer.ts`. Um arquivo por formulário, registrado em `src/lib/form-definitions/index.ts`; reconhecer por atributos estáveis, nunca por classes geradas; campo que nem toda variação tem é `optional`; variação do mesmo formulário estende a definição existente com campos opcionais. Caixas de marcação, inclusive as de consentimento, são campos de `fields` e são sempre marcadas. Os tipos de campo são texto (input ou textarea), caixa de marcação e seletor, cujo seletor CSS inclui a tag (`select[name="unit"]`) para não casar com a variação em que o campo é oculto. O motor (`src/lib/form-filler.ts`) e o popup não mudam para suportar um formulário ou um campo novo desses tipos.
- Escolha feita no popup para o envio: seletores em `src/lib/page-command.ts` (`selects` do formulário reconhecido, `selections` do comando). As opções são lidas da página na detecção e conferidas de novo no envio; sem escolha, o campo fica como a página o apresenta. O papel de um seletor (hoje só `unit: true`, o de unidade) é marcado na definição e chega ao popup em `FormSelect`, nunca deduzido do rótulo.
- Várias ações seguidas na página: `src/lib/submission-queue.ts`. Uma por vez, cada uma completa (com registro próprio) antes da próxima; antes de cada uma, inclusive a primeira, `findUnchangedForm` de `src/lib/page-forms.ts` confere a aba ativa, o endereço, o documento da detecção e o formulário, e a fila para sem agir quando algo mudou ou uma ação falhou, deixando as restantes como pendentes; cancelamento por `AbortSignal`, só entre ações.
- Dados de teste: `src/lib/lead-data.ts`. Todo valor preenchido deriva do identificador do envio por função pura; dado novo entra em `LeadData`, nunca é gerado na definição ou no motor.
- Ambiente do site: `src/lib/site-environment.ts`. Site de testes só em https e host com sufixo de `TEST_SITE_HOST_SUFFIXES`; qualquer outro endereço é site de cliente.
- E2E do fluxo na página: `tests/e2e/extension.spec.ts` (`openActionPopup`). Acionar o ícone pelo CDP para abrir o popup real com `activeTab`; páginas vêm de `tests/fixtures/`, servidas localmente. A suíte nunca envia formulário em site real; conferência manual em site real só em ambiente de testes indicado pelo humano.

- Leitura do painel: `src/lib/panel-leads.ts` injeta `src/entrypoints/lead-integrations.ts` na aba do painel, sob demanda (clique, atualização automática ou acompanhamento de envio), em mundo isolado e por `runExclusive` de `src/lib/exclusive-task.ts`, que deixa uma consulta por vez também entre popup e painel lateral; `src/lib/panel-reader.ts` roda na página. A consulta escolhida no popup vai numa injeção anterior, gravada no mundo isolado só na origem do painel, e o script a apaga e valida (`src/lib/panel-query.ts`) antes de ler cookies. A origem exata é conferida antes de ler qualquer cookie; o token fica em memória e só segue para a API do painel, em GET (`PanelRequest` não admite outro método), sem cookies e sem seguir redirecionamento. O script devolve só o resultado classificado, montado campo a campo, e erros com mensagem fixa; nada da sessão é gravado, registrado em log ou devolvido.
- Ação na interface do painel: `src/lib/lead-focus.ts`, injetado por `src/entrypoints/lead-focus.ts` com o pedido validado. Só troca o hash e muda estilo por tempo limitado, restaurado depois; identifica pelo identificador do lead ou por dados juntos, nunca só pelo nome; espera com prazo; devolve só um resultado enumerado, sem texto da página.
- Resposta de API externa: `src/lib/panel-reader.ts`. Validar a forma antes de usar e ler só os campos necessários; identificador que entra em URL é conferido pelo formato. Resposta inválida vira erro visível ou item não consultado com o motivo, nunca dado corrigido. Nova tentativa só em GET, limitada e com espera, respeitando `Retry-After` até um teto; o tempo limite e as recusas de sessão ou acesso não se repetem.
- Status de integração: `src/lib/integration-status.ts`. A regra é da extensão, não do painel, e está descrita no `README.md`; mudar a regra muda os dois e os testes.
- E2E do painel: `tests/e2e/extension.spec.ts` (`mockPanel`). Painel e API simulados por `context.route`, com cookies e dados fictícios de `tests/fixtures/panel.ts`; a resposta simulada fixa `access-control-allow-origin` na origem do painel, como a API real, e o navegador só resolve o endereço local (`--host-resolver-rules`). A página do painel (`tests/fixtures/panel-leads.html`) recebe os leads da rota e imita a lista e o detalhe pelo hash, com atraso.
- E2E do painel lateral: `tests/e2e/extension.spec.ts` (`openSidePanel`). Abrir pelo botão do popup e achar a página com `findExtensionPage`; o pedido de permissão do navegador não pode ser respondido no Chromium sem interface, então o acesso vem do activeTab de cada aba, acionando o ícone nela, e a resposta ao pedido fica nos unitários.
- Testes com timers falsos: `src/components/extension-popup/lead-integrations/index.test.tsx` (Atualização automática e foco no lead). Com `setTimeout` falso, usar `fireEvent`, consultas síncronas e `act(() => vi.advanceTimersByTimeAsync(...))`; os utilitários assíncronos da Testing Library e o user-event esperam um `setTimeout` real e travam.
