# Checkpoint — branch `feat/scanner-confiavel`

Estado em 20/10/2026. Branch criada a partir de `master` (`4e75525`, sincronizada com `origin/master`). Todas as mudanças abaixo estão **não commitadas** no working tree.

## Objetivo atual

Tornar o Scanner de Leads uma ferramenta interna confiável e segura para o Suporte e CS da AutoForce:

- o diagnóstico de integrações não pode dar falso positivo;
- os erros da API são tratados;
- os envios de teste são mais seguros;
- o histórico local é controlado;
- a documentação explica arquitetura, uso, manutenção e limitações.

## Implementado nesta branch

### Verificação de integrações no painel

- **Estados:** OK, Erro, Pendente, Sem evento, Não consultado e o novo **Não confirmado**, cada um com o motivo.
- **Status do lead:** o pior entre as integrações, na ordem Erro > Não confirmado > Pendente > Não consultado > OK > Sem evento.
- **Atribuição conservadora de eventos a leads.** A API não liga o evento ao lead.
  - A tentativa automática de cada integração é a primeira tentativa feita inteira nos 60 s depois da criação do lead, cortada no próximo lead do mesmo contato. Um título "Reenvio manual -" nunca entra nela.
  - Todos os eventos posteriores só contam para o lead com evidência de lead único: datas do contato iguais às do lead, um único lead do contato na lista, sem busca e lista completa.
  - Sem essa evidência, se os eventos posteriores mudam o resultado ou são os únicos, a integração fica Não confirmado, com o motivo.
  - Eventos com o mesmo id contam uma vez; sucesso e falha no mesmo instante ficam Não confirmado.
- **Erros da API:** 401 e 403 interrompem a consulta. 429, 5xx e falha de rede têm até 2 novas tentativas, só leitura, respeitando `Retry-After` até 5 s. Tempo limite, JSON inválido, estrutura inesperada e resposta incompleta têm mensagem própria. A falha de um contato não interrompe os demais e a consulta é marcada como incompleta.
- **Quantidade e busca:** escolha de 5, 10 ou 20 leads; busca pelo parâmetro `search` da API.
- **Relatório copiável:** sem e-mail, telefone, CPF, token ou cabeçalhos. Cada número de 10 a 14 dígitos, com ou sem máscara, é omitido individualmente, inclusive em JSON, seguido de ":" ou em sequência.
- **Interface:** hora da consulta, indicação de consulta concluída, incompleta ou com falha, e bloqueio de clique duplo.

### Envios de teste e histórico

- **Telefone:** celular com DDD 20, que não existe no Brasil, ainda derivado do identificador. O CPF continua com dígitos verificadores válidos.
- **Consentimento:** as três caixas conhecidas (`marketingConsent[]` e `dataPermissions`) são marcadas em todo envio, por decisão do humano, porque os sites exigem a autorização para enviar.
- **Confirmação:** na própria interface antes de cada envio, com o site e o formulário, e aviso mais forte fora do site de testes (`*.preview-v2.autodromo.com.br`).
- **Histórico local:** no máximo 100 envios e retenção de 30 dias; botão "Limpar histórico" com confirmação; a sequência dos identificadores é mantida.

### Documentação

- `README.md` reorganizado: arquitetura, instalação, build, testes, autenticação, classificação e limitações, novos formulários, depuração, manutenção, cuidados com dados e distribuição.
- `CHANGELOG.md` novo.
- `pipeline/padroes.md` com os exemplares novos.

## Arquivos

- **Novos:** `CHANGELOG.md`, `src/components/confirmation/`, `src/components/text-field/`, `src/components/extension-popup/lead-integrations/report-copy/`, `src/lib/integration-report.ts`, `src/lib/panel-query.ts`, `src/lib/site-environment.ts` e os testes de cada um.
- **Modificados, principais:** `src/lib/integration-status.ts`, `src/lib/panel-reader.ts`, `src/lib/panel-leads.ts`, `src/lib/form-filler.ts`, `src/lib/form-definition.ts`, `src/lib/form-definitions/*`, `src/lib/lead-data.ts`, `src/lib/submission-history.ts`, `src/entrypoints/lead-integrations.ts`, os componentes de `src/components/extension-popup/`, `tests/e2e/extension.spec.ts`, `tests/fixtures/`, `README.md`, `pipeline/padroes.md`.
- **Arquivo protegido alterado:** `vitest.config.mts`, só com `maxWorkers: "33%"`. Com 11 processos em paralelo numa máquina de 4 núcleos rápidos, os testes de componente ficavam até 5 vezes mais lentos e estouravam o tempo limite. Com 33% a suíte passa e fica mais rápida. Nenhum tempo limite foi aumentado.
- As permissões da extensão continuam `activeTab`, `scripting` e `storage`.
- No total são 33 arquivos modificados, com cerca de 3.900 linhas acrescentadas e 500 removidas, mais os novos.

## Testes executados (resultado real, última rodada sobre o estado atual)

- `npm run format:check`: passou.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm test`: 21 arquivos, 416 testes, todos passando.
- `npm run test:e2e` (inclui `npm run build`): 10 testes, todos passando.
- `git diff --check`: sem erros. Nenhum marcador de supressão.
- `npm audit`: 6 ocorrências (3 altas, 3 críticas), todas na cadeia de desenvolvimento do `web-ext`. `npm audit --omit=dev` não encontra nenhuma. A correção sugerida rebaixa o `web-ext` para versão incompatível e não foi aplicada.

## Pendências e problemas conhecidos

1. **Revisão independente:** foram duas rodadas.
   - A primeira apontou três problemas; a segunda os confirmou como corrigidos e achou variações próximas, também corrigidas, com um teste para cada uma.
   - Essas últimas correções, que trocaram os remendos por uma regra única, não passaram por uma terceira revisão: o processo prevê no máximo duas rodadas.
2. **Nada foi verificado contra o painel ou a API reais.** Está pendente confirmar:
   - o que o `search` busca de fato;
   - se o histórico de integração tem paginação;
   - se a API expõe `Retry-After` por CORS;
   - se a janela de 10 min basta para a fila de envio;
   - se `contact.updatedAt` muda em edições do contato.
3. **Nenhum formulário foi enviado nesta branch.** Está pendente confirmar:
   - se os formulários e as integrações aceitam o DDD 20 (a máscara do site de testes aceitou).
4. **Testes instáveis corrigidos:** o teste do Select estourava o tempo na suíte completa (resolvido limitando os processos em paralelo), e um teste do seletor de formulários tinha uma corrida (o nome acessível do Base UI chega um render depois; resolvido esperando o elemento). O teste e2e de limpeza do histórico falhou uma vez em rodada anterior e passou ao repetir.
5. **Navegador:** a consulta usa `AbortSignal.any`, que exige Chrome ou Edge 116 ou mais novo.

## Próximo passo recomendado

1. Fazer a homologação manual:
   - no painel real: verificação com 5, 10 e 20 leads, busca por um identificador `LT-…` e cópia do relatório;
   - no site de testes: um envio confirmado, para validar o DDD 20 e o consentimento desmarcado.
2. Com a homologação aprovada, commit nesta branch e decisão sobre o merge na `master`.
