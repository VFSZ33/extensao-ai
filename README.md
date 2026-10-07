# Lead Integration Tester

Base independente para uma extensão de navegador de teste de integração de leads. Alvo inicial: Chrome e Microsoft Edge, com Manifest V3. Pipeline v3, WXT, React, TypeScript estrito, Tailwind CSS, Base UI, Lucide, Motion e tailwind-merge.

## O que está pronto

O popup apresenta a base e permite verificar a comunicação com o background. A ação mostra carregamento, sucesso e falha, com nova tentativa. As mensagens e respostas são validadas. O estado existe apenas em memória e é reiniciado ao fechar o popup.

O fluxo de leads será desenvolvido por etapas: gerar dados controlados e identificáveis, únicos por execução; preencher e enviar o formulário da página; acessar o Workspace com credenciais reais; localizar o lead daquela execução nas respostas das requisições da listagem; mostrar integração confirmada, erro retornado pela API ou lead ainda não encontrado. Falhas da automação também deverão ser identificadas.

Esta base não acessa sites, não solicita credenciais, não armazena dados e não declara permissões de acesso a hosts. Content scripts, captura de respostas, login e geração de leads serão definidos quando as respectivas funcionalidades forem implementadas.

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

Execute npm run build. A extensão descompactada fica em .output/chrome-mv3. Abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, selecione Carregar sem compactação e escolha essa pasta. Abra o popup pelo botão da extensão e clique em Verificar extensão.

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

src/entrypoints/popup contém a entrada da interface; src/entrypoints/background.ts registra o listener do background. Componentes ficam em src/components/<nome>/index.tsx; src/lib/extension-messaging.ts define e valida a troca de mensagens. src/assets/globals.css contém o tema e a tipografia global, com fontes do sistema.

WXT gera o manifesto a partir de wxt.config.ts e das entradas. Os diretórios .wxt e .output são gerados, ignorados pelo Git e não devem ser editados. Autoimports estão desativados: use imports explícitos. Use @/ para src/ e @tests/ para tests/, definidos pelo WXT e propagados para o TypeScript e os testes. A configuração ESLint usa o alias nativo #eslint/imports de package.json.

A pipeline está em AGENTS.md, CLAUDE.md e pipeline/. Os agentes por nível ficam em .claude/agents e .codex/agents; a memória automática permanece desativada. No Codex, a configuração local depende de o projeto ser confiável na configuração pessoal do usuário. Não há configurações pessoais ou credenciais neste projeto.

O ESLint reúne regras recomendadas de JavaScript, TypeScript, React e hooks, a ordenação alfabética do Perfectionist e o bloqueio de importações internas relativas. A versão 9 preserva a compatibilidade declarada do eslint-plugin-react; está fora de suporte e pode emitir aviso de depreciação. O Prettier ordena as classes Tailwind a partir do CSS global. Tailwind usa a integração oficial com Vite. Controles usam Base UI, ícones usam Lucide e animações futuras podem usar Motion respeitando movimento reduzido.

O npm audit aponta seis ocorrências (três altas e três críticas) na cadeia de desenvolvimento de web-ext: shell-quote, usado pelo runner de Firefox, e node-forge, usado pelo suporte a Android. A dependência mais recente ainda inclui essas versões; npm audit --omit=dev não aponta vulnerabilidades de produção. Não execute npm audit fix --force: as sugestões atuais regridem WXT/web-ext para versões incompatíveis com esta base.

O pré-commit executa lint e formato; commit-msg valida Conventional Commits. Hooks usam os pacotes locais e, no Windows, o shell do Git for Windows. Uma falha bloqueia o commit.

Vitest usa a integração oficial WxtVitest, Testing Library, user-event e jest-dom em jsdom. Testes unitários ficam junto do código e cobrem estados da interface, carregamento, nova tentativa e validação/falhas das mensagens. Playwright carrega o build Manifest V3 em contexto persistente temporário do Chromium e verifica o popup com o background real. Relatórios estão em playwright-report e artefatos em test-results; npm exec playwright show-report abre o último relatório.

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
