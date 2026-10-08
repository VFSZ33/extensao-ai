# Lead Integration Tester

Base independente para uma extensão de navegador de teste de integração de leads. Alvo inicial: Chrome e Microsoft Edge, com Manifest V3. Pipeline v3, WXT, React, TypeScript estrito, Tailwind CSS, Base UI, Lucide, Motion e tailwind-merge.

## O que está pronto

O popup lista os formulários de lead reconhecidos na aba ativa e, a cada clique em Enviar teste, preenche o formulário escolhido com dados de teste novos e dispara o envio na página. Mostra o resultado do envio ou o erro: página sem acesso, nenhum formulário reconhecido, campo da definição ausente, campo obrigatório que a definição não preenche ou valor recusado pela página. Confirmar que o lead chegou ao painel ainda não faz parte da extensão.

Cada envio tem um identificador LT-AAAAMMDD-HHMMSS-NNN, com data e hora locais e uma sequência que nunca reinicia. Todos os valores derivam do identificador, então ele basta para reconstruir o lead esperado: nome Teste seguido do identificador, e-mail com o identificador em minúsculas em example.com, CPF com dígitos verificadores válidos e celular com DDD 11. As caixas de preferência de contato e de consentimento mapeadas são marcadas. Os dados são fictícios, mas o CPF e o telefone gerados podem coincidir com os de pessoas reais.

O histórico guarda identificador, formulário, página, horário e os valores que ficaram nos campos. Ele fica no armazenamento local da extensão, sobrevive ao fechamento do popup e à navegação, e não há ação para apagá-lo; remover a extensão apaga os dados.

O popup também permite verificar a comunicação com o background, com carregamento, sucesso, falha e nova tentativa. As mensagens e respostas são validadas.

A extensão declara as permissões activeTab, scripting e storage. Ela só acessa a aba ativa depois que o usuário clica no ícone, não declara permissões de host, não registra content scripts fixos e não solicita credenciais.

As próximas etapas do fluxo de leads: acessar o Workspace com credenciais reais; localizar o lead de cada envio nas respostas das requisições da listagem; mostrar integração confirmada, erro retornado pela API ou lead ainda não encontrado.

## Formulários suportados

Cada formulário suportado tem uma definição em src/lib/form-definitions: como reconhecê-lo na página, quais campos preencher e qual controle dispara o envio. Suportar um formulário novo é criar um arquivo de definição e registrá-lo em src/lib/form-definitions/index.ts; o motor de preenchimento e o popup não mudam. O reconhecimento usa atributos estáveis da marcação, nunca classes geradas.

As definições atuais vêm da página inicial dos sites Autódromo: o formulário de oferta e o formulário de seção. Campos marcados como opcionais na definição são preenchidos quando existem na página.

Um envio de teste em um site real cria um lead de verdade no painel desse site.

## Instalação

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

Execute npm run build. A extensão descompactada fica em .output/chrome-mv3. Abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, selecione Carregar sem compactação e escolha essa pasta. Abra a página com o formulário, abra o popup pelo botão da extensão e clique em Enviar teste no formulário desejado. Verificar extensão confere a comunicação com o background.

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

src/entrypoints/popup contém a entrada da interface; src/entrypoints/background.ts registra o listener do background; src/entrypoints/lead-forms.ts é o script injetado sob demanda na aba ativa. Componentes ficam em src/components/<nome>/index.tsx; src/lib/extension-messaging.ts define e valida a troca de mensagens com o background. src/assets/globals.css contém o tema e a tipografia global, com fontes do sistema.

No fluxo de envio, src/lib/lead-data.ts gera o identificador e os dados; src/lib/form-definitions reúne as definições; src/lib/form-filler.ts reconhece, preenche e envia na página; src/lib/page-command.ts valida os comandos e as respostas trocados com a página; src/lib/page-forms.ts acessa a aba ativa a partir do popup; src/lib/submission-history.ts lê e grava o histórico.

WXT gera o manifesto a partir de wxt.config.ts e das entradas. Os diretórios .wxt e .output são gerados, ignorados pelo Git e não devem ser editados. Autoimports estão desativados: use imports explícitos. Use @/ para src/ e @tests/ para tests/, definidos pelo WXT e propagados para o TypeScript e os testes. A configuração ESLint usa o alias nativo #eslint/imports de package.json.

A pipeline está em AGENTS.md, CLAUDE.md e pipeline/. Os agentes por nível ficam em .claude/agents e .codex/agents; a memória automática permanece desativada. No Codex, a configuração local depende de o projeto ser confiável na configuração pessoal do usuário. Não há configurações pessoais ou credenciais neste projeto.

O ESLint reúne regras recomendadas de JavaScript, TypeScript, React e hooks, a ordenação alfabética do Perfectionist e o bloqueio de importações internas relativas. A versão 9 preserva a compatibilidade declarada do eslint-plugin-react; está fora de suporte e pode emitir aviso de depreciação. O Prettier ordena as classes Tailwind a partir do CSS global. Tailwind usa a integração oficial com Vite. Controles usam Base UI, ícones usam Lucide e animações futuras podem usar Motion respeitando movimento reduzido.

O npm audit aponta seis ocorrências (três altas e três críticas) na cadeia de desenvolvimento de web-ext: shell-quote, usado pelo runner de Firefox, e node-forge, usado pelo suporte a Android. A dependência mais recente ainda inclui essas versões; npm audit --omit=dev não aponta vulnerabilidades de produção. Não execute npm audit fix --force: as sugestões atuais regridem WXT/web-ext para versões incompatíveis com esta base.

O pré-commit executa lint e formato; commit-msg valida Conventional Commits. Hooks usam os pacotes locais e, no Windows, o shell do Git for Windows. Uma falha bloqueia o commit.

Vitest usa a integração oficial WxtVitest, Testing Library, user-event e jest-dom em jsdom. Testes unitários ficam junto do código e cobrem estados da interface, carregamento, nova tentativa, validação/falhas das mensagens, geração dos dados, definições, preenchimento de campos controlados pelo React e histórico. Playwright carrega o build Manifest V3 em contexto persistente temporário do Chromium, verifica o popup com o background real e exercita o envio de ponta a ponta: aciona o ícone da extensão pelo protocolo de depuração, o que abre o popup real e concede activeTab como o clique do usuário, e envia formulários de tests/fixtures/lead-forms.html, servida localmente. Os testes nunca enviam formulários em sites reais. Relatórios estão em playwright-report e artefatos em test-results; npm exec playwright show-report abre o último relatório.

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
