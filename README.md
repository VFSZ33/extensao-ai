# Scanner de Leads

Extensão de navegador para testar a captação e a integração de leads; o nome remete ao scanner automotivo de diagnóstico. Alvo inicial: Chrome e Microsoft Edge, com Manifest V3. Pipeline v3, WXT, React, TypeScript estrito, Tailwind CSS, Base UI, Lucide, Motion e tailwind-merge.

## O que está pronto

O popup lista os formulários de lead reconhecidos na aba ativa e, a cada clique em Enviar teste, preenche o formulário escolhido com dados de teste novos e dispara o envio na página. Quando o formulário tem um seletor mapeado, o popup mostra as opções reais dele na página e o envio usa a opção escolhida; Nenhuma, o padrão, deixa o seletor como a página o apresenta. Mostra o resultado do envio ou o erro: página sem acesso, nenhum formulário reconhecido, campo da definição ausente, campo obrigatório que a definição não preenche, valor recusado pela página ou opção escolhida que não está mais na página. Junto do resultado, avisa quais campos visíveis e editáveis do formulário ficaram vazios por não estarem na definição; o aviso não impede o envio.

Cada envio tem um identificador LT-AAAAMMDD-HHMMSS-NNN, com data e hora locais e uma sequência que nunca reinicia. Todos os valores derivam do identificador, então ele basta para reconstruir o lead esperado: nome Teste seguido do identificador, e-mail com o identificador em minúsculas em example.com, CPF com dígitos verificadores válidos e celular com DDD 11. A caixa de mensagem recebe Lead de teste seguido do identificador. As caixas de preferência de contato e de consentimento mapeadas são marcadas. Os dados são fictícios, mas o CPF e o telefone gerados podem coincidir com os de pessoas reais.

O histórico guarda identificador, formulário, página, horário e os valores que ficaram nos campos; de cada seletor, o rótulo e o valor da opção que ficou selecionada. Ele fica no armazenamento local da extensão, sobrevive ao fechamento do popup e à navegação, e não há ação para apagá-lo; remover a extensão apaga os dados.

O popup também permite verificar a comunicação com o background, com carregamento, sucesso, falha e nova tentativa. As mensagens e respostas são validadas.

A extensão declara as permissões activeTab, scripting e storage. Ela só acessa a aba ativa depois que o usuário clica no ícone, não declara permissões de host, não registra content scripts fixos e não pede nem guarda credenciais; a única sessão que usa é a do painel já aberto, como descrito abaixo.

## Verificação das integrações no painel

Com o painel administrativo aberto e logado na aba ativa, em https://admin.autodromo.com.br, o popup mostra a verificação das integrações no lugar da lista de formulários; o histórico de envios continua. Ao clicar em Verificar integrações, a extensão consulta os 10 leads mais recentes da conta aberta, identificada pelo endereço #/contas/{conta}/leads, e o histórico de integrações de cada contato desses leads. Para cada lead, mostra cada integração como OK, Erro, com o motivo devolvido pela API, ou Pendente. No topo fica a contagem de leads por status. O lead cujo nome ou e-mail traz um identificador de envio aparece destacado, com a informação de constar ou não no histórico de envios desta extensão.

O painel não calcula esse status; a regra é da extensão. O histórico do painel é por contato e não liga o evento a um lead, então a extensão atribui a cada lead os eventos do contato criados a partir da criação do lead e antes do próximo lead do mesmo contato entre os listados. Em cada integração vale o evento conclusivo mais recente: SUCCESS é OK; qualquer outro tipo que não seja INFO é Erro; havendo só INFO, Pendente. O título Reenvio manual - seguido do nome conta como a mesma integração. O lead fica com Erro se alguma integração falhou; senão, Pendente se alguma está pendente; senão, OK. Lead sem evento no intervalo aparece como Sem evento, e lead cujo histórico não pôde ser lido, como Não consultado, sem derrubar os demais.

Para consultar, a extensão lê a sessão do painel. No clique, um script é injetado na aba, em mundo isolado do código da página. Ele confere que a origem é exatamente a do painel antes de ler qualquer cookie; dos cookies de sessão do Amplify, lê o token de acesso e o token de identidade, de onde vem o e-mail do usuário enviado no cabeçalho x-actor-email; o nome do usuário não é enviado; os demais cookies, inclusive o token de renovação, são ignorados. O token de acesso fica só na memória desse script durante a verificação e só é enviado a https://crmv3.autodromo.com.br, em requisições GET, sem cookies e sem seguir redirecionamento. Ele não é gravado, não chega ao popup nem ao background e não aparece em log. A extensão não renova a sessão: token ausente, expirado ou recusado pela API pede para recarregar o painel ou entrar de novo. Acesso negado, falha de rede e endereço sem conta têm mensagem própria.

A verificação é somente leitura: a extensão não reenvia leads nem altera registros do painel. Nomes, e-mails e telefones dos leads aparecem no popup enquanto ele está aberto e não são gravados. As respostas da API não são contrato público: a extensão valida a forma antes de usar, lê só os campos necessários e mostra o que recebe como texto.

Limites desta etapa: a verificação cobre os 10 leads mais recentes da conta, não procura leads mais antigos e não sabe quais integrações eram esperadas para um lead sem evento.

## Formulários suportados

Cada formulário suportado tem uma definição em src/lib/form-definitions: como reconhecê-lo na página, quais campos preencher e qual controle dispara o envio. Suportar um formulário novo é criar um arquivo de definição e registrá-lo em src/lib/form-definitions/index.ts; o motor de preenchimento e o popup não mudam. O reconhecimento usa atributos estáveis da marcação, nunca classes geradas.

Um campo da definição é um texto (input ou textarea), uma caixa de marcação ou um seletor (select). Acrescentar qualquer um deles a um formulário é editar a definição; o seletor leva o rótulo que o popup mostra, e as opções são lidas da página.

As definições atuais vêm dos sites Autódromo: o formulário de oferta, o formulário de seção, que cobre também a variação das páginas de veículo, com seletor de unidade e caixa de mensagem, e o formulário do modal de contato, aberto pelo botão flutuante de WhatsApp. Campos marcados como opcionais na definição são preenchidos quando existem na página.

A lista traz os formulários que estão na página quando o popup abre ou quando a lista é atualizada. Formulário que só existe depois de uma ação na página, como o de um modal, precisa estar aberto antes; a extensão não o abre.

Um envio de teste em um site real cria um lead de verdade no painel desse site.

## Instalação para uso, a partir do .zip

Para quem recebeu o pacote .zip da extensão e só vai usá-la; não é preciso instalar mais nada. Vale para Chrome e Edge.

A extensão é de uso interno. Ela lê a sessão do painel administrativo aberto no navegador para consultar as integrações; não repasse o pacote para fora da equipe nem a instale em computador compartilhado.

1. Crie uma pasta definitiva para a extensão, por exemplo Documentos\scanner-de-leads. O navegador lê a extensão dessa pasta toda vez que abre: se ela for movida, renomeada ou apagada, a extensão para de funcionar. Não use a pasta Downloads nem uma pasta temporária.
2. Descompacte o .zip dentro dessa pasta: clique nele com o botão direito, escolha Extrair tudo e indique a pasta. O arquivo manifest.json precisa ficar diretamente nela, e não dentro de uma subpasta.
3. Abra o navegador, digite chrome://extensions na barra de endereço (no Edge, edge://extensions) e pressione Enter.
4. Ative o Modo do desenvolvedor, no canto superior direito da página (no Edge, na lateral esquerda).
5. Clique em Carregar sem compactação e selecione a pasta do passo 1.
6. Scanner de Leads aparece na lista. Para deixar o ícone do volante sempre visível, clique no ícone de quebra-cabeça da barra do navegador e fixe a extensão.

Ao abrir, o navegador pode avisar que há extensões em modo de desenvolvedor; é esperado, mantenha a extensão ativada.

Para atualizar ao receber um .zip novo:

1. Apague tudo o que está dentro da pasta da extensão, mantendo a pasta.
2. Descompacte o .zip novo nessa mesma pasta.
3. Em chrome://extensions, clique no botão de recarregar, a seta circular, no cartão do Scanner de Leads.

O histórico de envios é mantido na atualização enquanto a pasta for a mesma. Remover a extensão do navegador apaga o histórico.

## Instalação para desenvolvimento

Use Node.js 24 LTS e npm 11. Extraia a pasta em um local definitivo e abra o terminal dentro dela. O arquivo compactado não inclui histórico Git, dependências instaladas nem artefatos de build.

```sh
git init -b master
npm ci
npm exec playwright install chromium
npm run dev
```

O script prepare instala os hooks do Husky e gera os tipos do WXT. Se instalar as dependências antes de iniciar o Git, execute npm run prepare depois de git init. Não é necessário criar um commit para iniciar o projeto.

npm run dev inicia o WXT com atualização automática e abre o Chromium oficial instalado pelo Playwright com a extensão carregada em um perfil separado. Use o botão de extensões do navegador para abrir o popup. O navegador de desenvolvimento é Chromium porque Chrome e Edge recentes restringem o carregamento de extensões por flags. O build de produção continua compatível com instalação manual nos dois navegadores.

## Build e instalação manual

Execute npm run build. A extensão descompactada fica em .output/chrome-mv3. Abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, selecione Carregar sem compactação e escolha essa pasta. Abra a página com o formulário, abra o popup pelo botão da extensão e clique em Enviar teste no formulário desejado. Para conferir as integrações, abra a lista de leads da conta no painel, abra o popup e clique em Verificar integrações. Verificar extensão confere a comunicação com o background.

npm run zip gera o pacote instalável da extensão em .output. Esse pacote é diferente do arquivo de código-fonte entregue: ele contém o build, e não o projeto para desenvolvimento.

## Comandos

| Comando                                | Finalidade                                                   |
| -------------------------------------- | ------------------------------------------------------------ |
| npm run build                          | Gerar o build de produção da extensão.                       |
| npm run commitlint -- --edit <arquivo> | Validar uma mensagem de commit.                              |
| npm run dev                            | Iniciar o desenvolvimento e abrir o Chromium com a extensão. |
| npm run format                         | Formatar os arquivos autorais.                               |
| npm run format:check                   | Conferir o formato.                                          |
| npm run lint                           | Conferir ESLint e ordenação alfabética.                      |
| npm run lint:fix                       | Aplicar correções automáticas do ESLint.                     |
| npm run prepare                        | Ativar hooks Git e preparar tipos do WXT.                    |
| npm test                               | Executar testes unitários.                                   |
| npm run test:e2e                       | Gerar build e testar a extensão instalada no Chromium.       |
| npm run test:watch                     | Executar testes unitários em modo interativo.                |
| npm run typecheck                      | Gerar tipos do WXT e conferir o TypeScript.                  |
| npm run zip                            | Gerar o pacote instalável da extensão.                       |

## Estrutura e referências

src/entrypoints/popup contém a entrada da interface; src/entrypoints/background.ts registra o listener do background; src/entrypoints/lead-forms.ts e src/entrypoints/lead-integrations.ts são os scripts injetados sob demanda na aba ativa, o segundo só no painel. Componentes ficam em src/components/<nome>/index.tsx; src/lib/extension-messaging.ts define e valida a troca de mensagens com o background. src/assets/globals.css contém o tema e a tipografia global, com fontes do sistema.

O ícone da extensão é um volante: src/assets/icon.svg é a fonte vetorial, com as cores do tema, usada também no cabeçalho do popup, porque o Lucide não tem volante. Os PNG de public/icon, nos tamanhos 16, 32, 48 e 128, são gerados a partir dela e o WXT os declara sozinho no manifesto. Ao mudar o SVG, execute node scripts/generate-icons.mjs, que renderiza os PNG com o Chromium do Playwright, e versione o resultado.

No fluxo de envio, src/lib/lead-data.ts gera o identificador e os dados; src/lib/form-definitions reúne as definições; src/lib/form-filler.ts reconhece, preenche e envia na página; src/lib/page-command.ts valida os comandos e as respostas trocados com a página; src/lib/page-forms.ts acessa a aba ativa a partir do popup; src/lib/submission-history.ts lê e grava o histórico.

Na verificação das integrações, src/lib/panel-leads.ts reconhece o painel na aba ativa e injeta o script a partir do popup; src/lib/panel-reader.ts roda na página, consulta a API e valida as respostas; src/lib/panel-session.ts reconhece o endereço do painel, a conta e a sessão; src/lib/integration-status.ts classifica os eventos e valida o resultado devolvido ao popup.

WXT gera o manifesto a partir de wxt.config.ts e das entradas. Os diretórios .wxt e .output são gerados, ignorados pelo Git e não devem ser editados. Autoimports estão desativados: use imports explícitos. Use @/ para src/ e @tests/ para tests/, definidos pelo WXT e propagados para o TypeScript e os testes. A configuração ESLint usa o alias nativo #eslint/imports de package.json.

A pipeline está em AGENTS.md, CLAUDE.md e pipeline/. Os agentes por nível ficam em .claude/agents e .codex/agents; a memória automática permanece desativada. No Codex, a configuração local depende de o projeto ser confiável na configuração pessoal do usuário. Não há configurações pessoais ou credenciais neste projeto.

O ESLint reúne regras recomendadas de JavaScript, TypeScript, React e hooks, a ordenação alfabética do Perfectionist e o bloqueio de importações internas relativas. A versão 9 preserva a compatibilidade declarada do eslint-plugin-react; está fora de suporte e pode emitir aviso de depreciação. O Prettier ordena as classes Tailwind a partir do CSS global. Tailwind usa a integração oficial com Vite. Controles usam Base UI, ícones usam Lucide e animações futuras podem usar Motion respeitando movimento reduzido.

O npm audit aponta seis ocorrências (três altas e três críticas) na cadeia de desenvolvimento de web-ext: shell-quote, usado pelo runner de Firefox, e node-forge, usado pelo suporte a Android. A dependência mais recente ainda inclui essas versões; npm audit --omit=dev não aponta vulnerabilidades de produção. Não execute npm audit fix --force: as sugestões atuais regridem WXT/web-ext para versões incompatíveis com esta base.

O pré-commit executa lint e formato; commit-msg valida Conventional Commits. Hooks usam os pacotes locais e, no Windows, o shell do Git for Windows. Uma falha bloqueia o commit.

Vitest usa a integração oficial WxtVitest, Testing Library, user-event e jest-dom em jsdom. Testes unitários ficam junto do código e cobrem estados da interface, carregamento, nova tentativa, validação/falhas das mensagens, geração dos dados, definições, preenchimento de campos, caixas de texto e seletores controlados pelo React, aviso de campos sem preenchimento, histórico e, na verificação das integrações, classificação dos eventos, leitura da sessão, chamadas à API e a seção do popup. Playwright carrega o build Manifest V3 em contexto persistente temporário do Chromium, verifica o popup com o background real e exercita o envio de ponta a ponta: aciona o ícone da extensão pelo protocolo de depuração, o que abre o popup real e concede activeTab como o clique do usuário, e envia formulários de tests/fixtures/lead-forms.html, servida localmente, inclusive com a opção de seletor escolhida no popup. Para a verificação das integrações, o Playwright intercepta as rotas e serve tests/fixtures/panel-leads.html no endereço do painel e respostas simuladas da API, com cookies e dados fictícios de tests/fixtures/panel.ts; o teste confere o resultado no popup, que só há requisições GET à API, que o token não chega ao popup nem ao armazenamento da extensão e que o script roda isolado do código da página. Os testes nunca enviam formulários em sites reais nem alcançam o painel ou a API reais: nos testes que abrem páginas, o navegador só resolve o endereço local. Relatórios estão em playwright-report e artefatos em test-results; npm exec playwright show-report abre o último relatório.

## Documentação oficial

- [Base UI: composição](https://base-ui.com/react/handbook/composition).
- [Base UI: instalação](https://base-ui.com/react/overview/quick-start).
- [Chrome: arquitetura de extensões](https://developer.chrome.com/docs/extensions/mv3/architecture-overview).
- [Chrome: ciclo de vida do service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- [Commitlint: configuração](https://commitlint.js.org/reference/configuration.html).
- [ESLint: configuração](https://eslint.org/docs/latest/use/configure/configuration-files).
- [ESLint: suporte de versões](https://eslint.org/version-support/).
- [Husky: configuração](https://typicode.github.io/husky/how-to.html).
- [Lucide: React](https://lucide.dev/guide/packages/lucide-react).
- [Motion: acessibilidade](https://motion.dev/docs/react-accessibility).
- [Motion: instalação](https://motion.dev/docs/react-installation).
- [Perfectionist: ordenação alfabética](https://perfectionist.dev/configs/recommended-alphabetical).
- [Playwright: extensões](https://playwright.dev/docs/chrome-extensions).
- [Playwright: instalação](https://playwright.dev/docs/intro).
- [Prettier: plugin Tailwind](https://github.com/tailwindlabs/prettier-plugin-tailwindcss).
- [React](https://react.dev/).
- [Tailwind: integração Vite](https://tailwindcss.com/docs/installation/using-vite).
- [tailwind-merge](https://github.com/dcastil/tailwind-merge).
- [Testing Library: React](https://testing-library.com/docs/react-testing-library/intro/).
- [TypeScript](https://www.typescriptlang.org/tsconfig/).
- [typescript-eslint](https://typescript-eslint.io/getting-started/).
- [Vitest](https://vitest.dev/guide/).
- [WXT: entradas](https://wxt.dev/guide/essentials/entrypoints.html).
- [WXT: módulos React](https://wxt.dev/guide/essentials/frontend-frameworks.html).
- [WXT: abertura do navegador](https://wxt.dev/guide/essentials/config/browser-startup.html).
- [WXT: TypeScript](https://wxt.dev/guide/essentials/config/typescript.html).
- [WXT: testes unitários](https://wxt.dev/guide/essentials/unit-testing.html).
