# Projeto

> Como este projeto se conecta à pipeline. Arquivo protegido: só muda com aprovação do humano.
> Aponte para os arquivos onde a verdade está; não copie o conteúdo deles.

## Estado do projeto

- Extensão Manifest V3 para Chrome e Edge, com WXT, React, TypeScript e npm. Dependências e versões: `package.json` e `package-lock.json`.
- Base funcional; o fluxo de teste e integração de leads ainda será implementado. Objetivo e limites desta entrega: `README.md`.
- Origem da pipeline: [Pipeline v3](https://github.com/EduNunesGithub/ai-first-pipeline), commit `f80d84485f42fb647ed4c8172daaa7e3031eccbc`; arquivos genéricos preservados da base Page Builder.
- Git: branch principal `master`. O pacote de código não inclui histórico Git; inicialização descrita em `README.md`.

## Convenções

- Documentação e descrição dos commits: português do Brasil, em Conventional Commits.
- Identificadores no código: inglês.
- Nomes de arquivos e pastas do produto: kebab-case, respeitando nomes exigidos pelas ferramentas.
- Textos da interface: português do Brasil.

## Fontes de referência

- Stack e ferramentas: documentação oficial vinculada no `README.md`.
- Dependências, requisitos de execução e comandos: `package.json`; resolução reproduzível: `package-lock.json`.
- Estrutura, manifesto e build: `wxt.config.ts`; entradas da extensão em `src/entrypoints/`.
- Tipos e aliases: `tsconfig.json` e configuração gerada pelo WXT; aliases nativos do Node.js: `imports` em `package.json`.
- Lint e ordenação: `eslint.config.mjs` e `eslint/`; formato: `.prettierrc.json` e `.prettierignore`.
- Tailwind, tema e tipografia global: `src/assets/globals.css`; integração de build em `wxt.config.ts`.
- Primitivos e portais: documentação oficial Base UI vinculada no `README.md`.
- Testes: `vitest.config.mts`, `tests/setup.ts` e `playwright.config.ts`; instalação do navegador e execução em `README.md`.
- Hooks Git: `.husky/pre-commit` e `.husky/commit-msg`; convenção das mensagens: `commitlint.config.mjs`.

## Checagens

Rodadas por quem aceita o trabalho, sobre o estado final, em toda entrega.

| Checagem | Comando ou estado |
| --- | --- |
| Build | `npm run build`. |
| Commit | Havendo commits novos, `npm run commitlint -- --from HEAD~1 --to HEAD --verbose`; o hook `commit-msg` valida cada nova mensagem. Uma base sem commits não tem intervalo a conferir. |
| Diff e whitespace | `git status --short --untracked-files=all` e `git diff --check`; incluir arquivos novos na leitura. Antes de rastreados, `git diff --no-index --check -- NUL <arquivo>` no Windows. |
| Formato | `npm run format:check`. |
| Lint | `npm run lint`. |
| Testes unitários | `npm test`, com Vitest, APIs de extensão simuladas e Testing Library. |
| Testes e2e | `npm run test:e2e`, com build e Chromium persistente carregando a extensão. |
| Tipos | `npm run typecheck`, incluindo preparação dos tipos WXT e `tsc --noEmit`. |

Na conferência de arquivo novo com `--no-index --check`, status 1 pode indicar apenas diferença de `NUL`; erros de whitespace aparecem na saída e devem ser corrigidos.

Marcadores de supressão: `eslint-disable`, `eslint-enable`, `eslint-env`, `prettier-ignore`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `ignoreBuildErrors`. Arquivos gerados pelo WXT não são código autoral e não são editados manualmente.

## Rodar e observar o produto

- Instalação reproduzível, inicialização Git, desenvolvimento e carregamento manual: `README.md`.
- Observar o popup real da extensão e exercitar a verificação da comunicação com o background; conferir sucesso e falha.
- A suíte e2e usa Chromium do Playwright, com perfil isolado. Não usar o perfil pessoal nem credenciais reais nos testes da base.
- Esta base não requer credenciais, acesso a sites ou dados persistidos. Os detalhes de acesso ao Workspace pertencem às etapas futuras.
- `.wxt/`, `.output/`, relatórios e resultados são gerados, ignorados e não fazem parte do código entregue.

## Arquivos protegidos

Só mudam quando a tarefa exige, e toda mudança é declarada na entrega.

- `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`.
- `pipeline/`, exceto `pipeline/padroes.md`.
- Configuração das checagens e dos arquivos verificados: `.gitattributes`, `.gitignore`, `.prettierignore`, `.prettierrc.json`, `commitlint.config.mjs`, `eslint.config.mjs`, `eslint/`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.mts`, `playwright.config.ts`.
- Comandos, dependências e hooks: `.husky/commit-msg`, `.husky/pre-commit`, `package-lock.json`, `package.json`.
- Integração contínua: ainda inexistente; registrar quando criada.

Os caminhos existentes estão nas regras `ask` de `.claude/settings.json`.

## Ferramentas de agente

- `.claude/agents/` e `.codex/agents/`: níveis `t0` a `t3` e `revisor`, preservados da pipeline validada.
- `.claude/settings.json` e `.codex/config.toml`: memória automática desativada.
- O projeto extraído precisa ser marcado como confiável pelo usuário no Codex para carregar sua configuração local. Nenhuma confiança, credencial ou configuração global da máquina de origem acompanha o pacote.
- A disponibilidade dos modelos depende da conta do usuário; indisponibilidade real deve ser declarada, sem substituição silenciosa.
