# Scanner de Leads

Extensão de navegador para testar a captação e a integração de leads; o nome remete ao scanner automotivo de diagnóstico. Alvo inicial: Chrome e Microsoft Edge, com Manifest V3. Pipeline v3, WXT, React, TypeScript estrito, Tailwind CSS, Base UI, Lucide, Motion e tailwind-merge. As mudanças de cada entrega ficam em CHANGELOG.md.

## O que a extensão faz

- Na página de um site, lista os formulários de lead reconhecidos e, depois da confirmação do usuário, preenche o escolhido com dados de teste identificáveis e dispara o envio.
- Guarda no navegador um histórico dos envios, para comparar com o lead que chega ao painel.
- Com o painel administrativo aberto, verifica o envio dos leads mais recentes às integrações, só para leitura.
- Verifica a comunicação entre o popup e o background, com carregamento, sucesso, falha e nova tentativa. As mensagens e respostas são validadas.

## Envio de leads de teste

O popup lista os formulários de lead reconhecidos na aba ativa. Enviar teste abre, no próprio item, uma confirmação com o formulário, o endereço do site e o aviso do ambiente; só um formulário fica em confirmação por vez. Confirmar envio preenche o formulário com dados de teste novos e dispara o envio na página; Cancelar ou Esc fecha a confirmação sem tocar na página e devolve o foco ao botão. A confirmação recebe o foco ao abrir; enquanto um envio está em andamento, os demais botões ficam desabilitados e um segundo clique não dispara outro envio.

A confirmação diferencia o ambiente pelo endereço da aba no momento da lista:

| Ambiente        | Quando                                                                                                                          | Aviso                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site de testes  | https em um host terminado em .preview-v2.autodromo.com.br, na constante TEST_SITE_HOST_SUFFIXES de src/lib/site-environment.ts | O lead vai para o painel do ambiente de testes.                                                                                                               |
| Site de cliente | Qualquer outro endereço, inclusive http, localhost e endereço não identificado                                                  | Aviso em destaque: o envio cria um lead real, que a concessionária recebe como contato de verdade; o botão de confirmar fica com o visual de ação destrutiva. |

Quando o formulário tem um seletor mapeado, o popup mostra as opções reais dele na página e o envio usa a opção escolhida; Nenhuma, o padrão, deixa o seletor como a página o apresenta. O popup mostra o resultado do envio ou o erro: página sem acesso, nenhum formulário reconhecido, campo da definição ausente, campo obrigatório que a definição não preenche, consentimento de marketing exigido pela página, valor recusado pela página ou opção escolhida que não está mais na página. Junto do resultado, avisa quais campos visíveis e editáveis do formulário ficaram vazios por não estarem na definição; o aviso não impede o envio.

Cada envio tem um identificador LT-AAAAMMDD-HHMMSS-NNN, com data e hora locais e uma sequência que nunca reinicia, nem quando o histórico é limpo. Todos os valores derivam do identificador por uma função pura, em src/lib/lead-data.ts, então ele basta para reconstruir o lead esperado:

- nome: Teste seguido do identificador;
- e-mail: o identificador em minúsculas em example.com, domínio reservado que não recebe mensagens;
- telefone: celular com 11 dígitos e DDD 20, que não existe no Brasil, para não tocar para ninguém;
- CPF: com dígitos verificadores válidos, porque os formulários os conferem;
- mensagem: Lead de teste seguido do identificador.

As caixas de preferência de contato mapeadas são marcadas. As caixas de consentimento de marketing nunca são marcadas pela extensão: marketingConsent[] no formulário de seção e dataPermissions na oferta e no modal de contato, listadas em consentSelectors de cada definição. Elas ficam como a página as apresenta e aparecem no aviso de campos não preenchidos. Se a página exigir uma delas, o envio é bloqueado antes do clique em enviar, com a mensagem de que a extensão não marca consentimento por política. O CPF é fictício, mas, por ter dígitos válidos, pode coincidir com o de uma pessoa real.

A lista traz os formulários que estão na página quando o popup abre ou quando a lista é atualizada. Formulário que só existe depois de uma ação na página, como o de um modal, precisa estar aberto antes; a extensão não o abre.

## Histórico de envios

O histórico guarda, de cada envio, o identificador, o formulário, o endereço da página, o horário e os valores que ficaram nos campos; de cada seletor, o rótulo e o valor da opção que ficou selecionada. São só os dados fictícios gerados pela extensão e a URL da página; nenhum dado de lead real nem da sessão do painel. Ele fica no armazenamento local da extensão, sobrevive ao fechamento do popup, à navegação e à atualização da extensão na mesma pasta; remover a extensão apaga os dados.

A retenção vale ao gravar e ao ler: ficam os 100 envios mais recentes, com até 30 dias, nas constantes HISTORY_MAX_RECORDS e HISTORY_RETENTION_DAYS de src/lib/submission-history.ts; o que passa disso e os registros em formato inválido são apagados do armazenamento. Os registros gravados por versões anteriores continuam válidos, porque o formato do registro não mudou; os com mais de 30 dias saem na primeira leitura.

Limpar histórico abre uma confirmação com a quantidade de envios; Apagar histórico apaga todos, e Cancelar ou Esc desiste. O botão fica desabilitado com o histórico vazio. Limpar não apaga os leads nos sites nem no painel e não reinicia a sequência dos identificadores.

## Verificação das integrações no painel

Com o painel administrativo aberto e logado na aba ativa, em https://admin.autodromo.com.br, o popup mostra a verificação das integrações no lugar da lista de formulários; o histórico de envios continua. Ao clicar em Verificar integrações, ou pressionar Enter na busca, a extensão consulta os leads mais recentes da conta aberta, identificada pelo endereço #/contas/{conta}/leads, e o histórico de integrações de cada contato desses leads. A quantidade é 5, 10 ou 20, com 10 de partida, e vai no parâmetro limit da API; a extensão não pede outras páginas, então não alcança leads mais antigos que os devolvidos. Com texto na busca, a lista vem do parâmetro search da API, o mesmo da busca da lista de leads do painel, limitada à quantidade escolhida; o resultado avisa que é de uma busca. A busca é feita pela API, não entre os leads já mostrados, e o texto só segue codificado na consulta à API. Quantidade e busca não são gravadas; durante a consulta, o botão, a quantidade e a busca ficam travados, e outro clique ou Enter não dispara uma segunda consulta.

O resultado mostra a hora da consulta e se ela foi concluída, ficou incompleta ou falhou; a contagem de leads por status; e, para cada lead, o status de cada integração, com o motivo devolvido pela API no erro e o motivo da extensão no não confirmado e no não consultado. O lead cujo nome ou e-mail traz um identificador de envio aparece destacado, com a informação de constar ou não no histórico de envios desta extensão.

A verificação é somente leitura: a extensão não reenvia leads nem altera registros do painel. Nomes, e-mails e telefones dos leads aparecem no popup enquanto ele está aberto e não são gravados. As respostas da API não são contrato público: a extensão valida a forma antes de usar, lê só os campos necessários e mostra o que recebe como texto.

### Como os status são classificados

| Status         | Quando                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OK             | O evento conclusivo mais recente atribuído ao lead é SUCCESS e não há INFO depois dele.                                                                                                                           |
| Erro           | O conclusivo mais recente é uma falha: ERROR ou qualquer tipo que não seja INFO nem SUCCESS, que o painel mostra como Não enviado.                                                                                |
| Pendente       | Há INFO depois do último conclusivo, ou só INFO: processamento sem conclusão. INFO nunca conclui, e um SUCCESS anterior não confirma a tentativa mais nova.                                                       |
| Não confirmado | Há eventos, mas não há evidência suficiente para ligá-los ao lead ou à tentativa: tentativas posteriores que podem ser de outro lead do mesmo contato, sucesso e falha no mesmo instante ou leads criados juntos. |
| Sem evento     | Nenhum evento do contato no período do lead.                                                                                                                                                                      |
| Não consultado | O histórico não foi lido: falha da API, resposta inválida ou incompleta, ou lead sem contato.                                                                                                                     |

O status do lead é o pior entre as integrações, nesta ordem: Erro, Não confirmado, Pendente, Não consultado, OK e Sem evento. Na dúvida, o resultado fica inconclusivo; a regra existe para não dar OK sem evidência.

O painel não calcula esse status; a regra é da extensão, em src/lib/integration-status.ts. O histórico do painel é por contato e o evento não diz a que lead pertence, então a atribuição é uma inferência sobre o comportamento observado da API, não um contrato:

- Tentativa automática: em cada integração, a primeira tentativa que acontece inteira nos 60 s depois da criação do lead, isto é, os eventos até o primeiro conclusivo, inclusive os do mesmo instante dele, todos nesses 60 s. Ela termina antes, na criação do próximo lead do mesmo contato entre os carregados ou 2 s antes da data que contact.updatedAt indica para um lead mais novo fora da lista. Eventos com título Reenvio manual - nunca fazem parte dela. Nas respostas observadas, INFO e conclusão da tentativa automática saem em menos de 1 s depois do lead; os 60 s são uma margem hipotética, na constante AUTOMATIC_ATTEMPT_WINDOW_MS.
- Datas do contato: observou-se que contact.createdAt coincide com a criação do primeiro lead do contato e contact.updatedAt com a do lead mais recente, com poucos milissegundos de diferença. A extensão aceita até 2 s, na constante CONTACT_DATE_TOLERANCE_MS, e só usa essas datas quando o contact.id confere com o contactId do lead.
- Evidência de lead único: contact.createdAt e contact.updatedAt coincidem com a criação do lead, ele é o único lead do contato na lista, a consulta não é uma busca e a API não informou mais leads do que devolveu. Só com essa evidência todos os eventos da integração depois do lead contam como dele, valendo o conclusivo mais recente.
- Tentativas posteriores: os demais eventos da integração a partir da criação do lead, como tentativas que começam ou terminam depois dos 60 s, tentativas seguintes e reenvios com ou sem o prefixo, exceto a tentativa automática de um lead mais novo carregado. Sem a evidência de lead único, se existem e mudam o resultado da automática, ou se são as únicas, a integração fica Não confirmado, com o motivo; se não mudam, vale a automática. Uma tentativa automática só com INFO seguida de qualquer outro evento da mesma integração fica Não confirmado, nunca OK.
- A ordem é a do createdAt dos eventos, não a da resposta; eventos com o mesmo id contam uma vez; SUCCESS e falha da mesma integração no mesmo instante, como conclusivos mais recentes, deixam a integração Não confirmado; leads do mesmo contato criados no mesmo instante ficam com as integrações Não confirmado. O título Reenvio manual - seguido do nome conta como a mesma integração.

### Erros, novas tentativas e consulta incompleta

Erros da API têm mensagem própria e nunca repassam o corpo da resposta: sessão expirada (401), acesso negado (403), excesso de consultas (429), erro HTTP com o código, tempo limite de 15 s por requisição, falha de rede, resposta que não é JSON, estrutura inesperada, resposta interrompida e histórico paginado, quando a API indica mais eventos do que devolveu. 401 e 403 interrompem a verificação inteira e cancelam as consultas em andamento; numa falha da lista de leads, a verificação falha com a mensagem; a falha do histórico de um contato deixa os leads dele como Não consultado, com a mensagem, sem derrubar os demais. Todas as requisições são GET; 429, 5xx, falha de rede e resposta interrompida têm até 2 novas tentativas, com espera de 0,5 s e 1 s ou o Retry-After, quando maior. Se o Retry-After passar de 5 s, não há nova tentativa. O navegador só entrega o Retry-After à extensão se a API o expuser por CORS, em Access-Control-Expose-Headers; sem isso vale a espera fixa. Tempo limite não é repetido. Até 3 contatos são consultados ao mesmo tempo.

A consulta fica incompleta quando algum lead fica Não consultado ou quando a API informa, em pagination.total, mais leads do que devolveu dentro da quantidade pedida. O popup avisa no resultado, e o relatório, na situação.

### Relatório de diagnóstico

Copiar relatório copia para a área de transferência um texto em português montado no popup a partir do resultado já classificado: data e hora da consulta, escopo (quantidade e busca), leads devolvidos, situação, contagem por status e, por lead, o identificador (o id da conversão), o nome, a criação, o status com o motivo e cada integração com o status e a mensagem de erro. E-mail e telefone dos leads ficam de fora; nos textos livres, que são o nome, o termo da busca, as mensagens e os nomes das integrações, e-mails, tokens e cada telefone, CPF ou sequência de 10 a 14 dígitos, com ou sem máscara, inclusive seguidos de dois-pontos ou vários em sequência, viram [e-mail omitido], [token omitido] e [número omitido]. Sessão, cookies e cabeçalhos nunca chegam ao popup, então também não chegam ao relatório.

### Limitações do diagnóstico

A verificação não pagina a lista de leads nem o histórico de integrações, não sabe quais integrações eram esperadas para um lead sem evento e depende das datas observadas no contato e nos eventos; se a API mudar esse comportamento, a atribuição tende a Não confirmado, não a OK.

## Autenticação e permissões

A extensão declara as permissões activeTab, scripting e storage, em wxt.config.ts. Ela só acessa a aba ativa depois que o usuário clica no ícone, não declara permissões de host, não registra content scripts fixos e não pede nem guarda credenciais; a única sessão que usa é a do painel já aberto.

Para consultar as integrações, a extensão lê a sessão do painel. No clique, uma primeira injeção grava a consulta (quantidade e busca) no mundo isolado da aba, só se a origem for a do painel; em seguida, o script de leitura é injetado no mesmo mundo isolado, apaga a consulta, confere que a origem é exatamente a do painel e valida a consulta antes de ler qualquer cookie. Dos cookies de sessão do Amplify, lê o token de acesso e o token de identidade, de onde vem o e-mail do usuário enviado no cabeçalho x-actor-email; o nome do usuário não é enviado; os demais cookies, inclusive o token de renovação, são ignorados. O token de acesso fica só na memória desse script durante a verificação e só é enviado a https://crmv3.autodromo.com.br, em requisições GET, sem cookies e sem seguir redirecionamento. Ele não é gravado, não chega ao popup nem ao background e não aparece em log nem em mensagem de erro. A extensão não renova a sessão: token ausente, expirado ou recusado pela API pede para recarregar o painel ou entrar de novo.

O envio de formulários não usa sessão nenhuma: o script injetado na página só preenche os campos e clica no botão de envio do próprio formulário.

## Arquitetura

src/entrypoints/popup contém a entrada da interface; src/entrypoints/background.ts registra o listener do background; src/entrypoints/lead-forms.ts e src/entrypoints/lead-integrations.ts são os scripts injetados sob demanda na aba ativa, o segundo só no painel. Componentes ficam em src/components/<nome>/index.tsx; src/components/confirmation é a confirmação na própria interface, usada no envio e na limpeza do histórico. src/lib/extension-messaging.ts define e valida a troca de mensagens com o background. src/assets/globals.css contém o tema e a tipografia global, com fontes do sistema.

No fluxo de envio, src/lib/lead-data.ts gera o identificador e os dados; src/lib/form-definitions reúne as definições; src/lib/form-filler.ts reconhece, preenche e envia na página; src/lib/page-command.ts valida os comandos e as respostas trocados com a página; src/lib/page-forms.ts acessa a aba ativa a partir do popup; src/lib/site-environment.ts classifica o site como de testes ou de cliente; src/lib/submission-history.ts lê, grava, limita e limpa o histórico.

Na verificação das integrações, src/lib/panel-leads.ts reconhece o painel na aba ativa e injeta o script a partir do popup; src/lib/panel-reader.ts roda na página, consulta a API e valida as respostas; src/lib/panel-session.ts reconhece o endereço do painel, a conta e a sessão; src/lib/panel-query.ts valida a consulta, com quantidade e busca, entregue ao script; src/lib/integration-status.ts atribui e classifica os eventos e valida o resultado devolvido ao popup; src/lib/integration-report.ts monta o relatório de diagnóstico.

WXT gera o manifesto a partir de wxt.config.ts e das entradas. Os diretórios .wxt e .output são gerados, ignorados pelo Git e não devem ser editados. Autoimports estão desativados: use imports explícitos. Use @/ para src/ e @tests/ para tests/, definidos pelo WXT e propagados para o TypeScript e os testes. A configuração ESLint usa o alias nativo #eslint/imports de package.json.

O ícone da extensão é um volante: src/assets/icon.svg é a fonte vetorial, com as cores do tema, usada também no cabeçalho do popup, porque o Lucide não tem volante. Os PNG de public/icon, nos tamanhos 16, 32, 48 e 128, são gerados a partir dela e o WXT os declara sozinho no manifesto.

A pipeline está em AGENTS.md, CLAUDE.md e pipeline/. Os agentes por nível ficam em .claude/agents e .codex/agents; a memória automática permanece desativada. No Codex, a configuração local depende de o projeto ser confiável na configuração pessoal do usuário. Não há configurações pessoais ou credenciais neste projeto.

O ESLint reúne regras recomendadas de JavaScript, TypeScript, React e hooks, a ordenação alfabética do Perfectionist e o bloqueio de importações internas relativas. A versão 9 preserva a compatibilidade declarada do eslint-plugin-react; está fora de suporte e pode emitir aviso de depreciação. O Prettier ordena as classes Tailwind a partir do CSS global. Tailwind usa a integração oficial com Vite. Controles usam Base UI, ícones usam Lucide e animações futuras podem usar Motion respeitando movimento reduzido.

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

O histórico de envios é mantido na atualização enquanto a pasta for a mesma, dentro da retenção descrita acima. Remover a extensão do navegador apaga o histórico.

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

Execute npm run build. A extensão descompactada fica em .output/chrome-mv3. Abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, selecione Carregar sem compactação e escolha essa pasta. Abra a página com o formulário, abra o popup pelo botão da extensão, clique em Enviar teste no formulário desejado e confirme. Para conferir as integrações, abra a lista de leads da conta no painel, abra o popup e clique em Verificar integrações. Verificar extensão confere a comunicação com o background.

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

O pré-commit executa lint e formato; commit-msg valida Conventional Commits. Hooks usam os pacotes locais e, no Windows, o shell do Git for Windows. Uma falha bloqueia o commit.

## Testes

Vitest usa a integração oficial WxtVitest, Testing Library, user-event e jest-dom em jsdom. Testes unitários ficam junto do código e cobrem estados da interface, carregamento, nova tentativa, validação/falhas das mensagens, geração dos dados, definições, preenchimento de campos, caixas de texto e seletores controlados pelo React, consentimento nunca marcado e bloqueio do consentimento exigido, aviso de campos sem preenchimento, a confirmação do envio com o ambiente do site, cancelamento e foco, o histórico com retenção, limite e limpeza e, na verificação das integrações, classificação e atribuição dos eventos, leitura da sessão, chamadas à API com erros e novas tentativas, o relatório de diagnóstico e a seção do popup.

Playwright carrega o build Manifest V3 em contexto persistente temporário do Chromium, verifica o popup com o background real e exercita o envio de ponta a ponta: aciona o ícone da extensão pelo protocolo de depuração, o que abre o popup real e concede activeTab como o clique do usuário, confirma e envia formulários de tests/fixtures/lead-forms.html, servida localmente, inclusive com a opção de seletor escolhida no popup, e confere que o consentimento fica desmarcado. Também cobre o cancelamento pelo botão e pelo Esc sem envio, o aviso de site de cliente, o aviso de site de testes, com a fixture servida por rota interceptada num host .preview-v2.autodromo.com.br, e a limpeza do histórico com a sequência mantida. Para a verificação das integrações, o Playwright intercepta as rotas e serve tests/fixtures/panel-leads.html no endereço do painel e respostas simuladas da API, com cookies e dados fictícios de tests/fixtures/panel.ts; os testes conferem o resultado no popup, a consulta incompleta, o relatório copiado, a busca com a quantidade escolhida, a nova tentativa que respeita o Retry-After, que só há requisições GET à API, que o token não chega ao popup, ao relatório nem ao armazenamento da extensão e que o script roda isolado do código da página.

Os testes nunca enviam formulários em sites reais nem alcançam o painel ou a API reais: nos testes que abrem páginas, o navegador só resolve o endereço local. Relatórios estão em playwright-report e artefatos em test-results; npm exec playwright show-report abre o último relatório.

## Como adicionar um formulário

Cada formulário suportado tem uma definição em src/lib/form-definitions: como reconhecê-lo na página, quais campos preencher, quais caixas são consentimento de marketing e qual controle dispara o envio. O motor de preenchimento e o popup não mudam. As definições atuais vêm dos sites Autódromo: o formulário de oferta, o formulário de seção, que cobre também a variação das páginas de veículo, com seletor de unidade e caixa de mensagem, e o formulário do modal de contato, aberto pelo botão flutuante de WhatsApp.

1. Abra a página no site de testes e inspecione o formulário no DevTools. Escolha atributos estáveis da marcação para reconhecê-lo, nunca classes geradas.
2. Crie um arquivo de definição, a partir de src/lib/form-definitions/autodromo-offer.ts, e registre-o em src/lib/form-definitions/index.ts. Um campo é um texto (input ou textarea), uma caixa de marcação ou um seletor (select), cujo seletor CSS inclui a tag; o seletor leva o rótulo que o popup mostra, e as opções são lidas da página. Campo que nem toda variação tem é optional e é preenchido quando existe na página; variação do mesmo formulário estende a definição existente com campos opcionais.
3. Liste em consentSelectors as caixas de consentimento de marketing e não as coloque em fields. Caixas de preferência de contato podem ser campos.
4. Valor novo de teste entra em LeadData, em src/lib/lead-data.ts, derivado do identificador; nunca é gerado na definição.
5. Reproduza o formulário em tests/fixtures/lead-forms.html, com o comportamento da página que importa (máscara, validação, campos controlados), e acrescente os casos em src/lib/form-definitions/index.test.ts e, se for um fluxo novo, em tests/e2e/extension.spec.ts.
6. Confira o reconhecimento e o preenchimento no site de testes. Um envio de teste em um site real cria um lead de verdade no painel desse site.

## Como depurar falhas

No envio:

- O popup se inspeciona pelo menu de contexto do ícone da extensão (Inspecionar pop-up). O script de preenchimento roda na aba da página, então os campos preenchidos, as máscaras e as mensagens de validação aparecem no DevTools dessa aba.
- Nenhum formulário reconhecido: a página mudou os atributos que a definição usa para reconhecê-la, ou o formulário ainda não está aberto. Compare a marcação com o matches da definição.
- Campo da definição não encontrado, valor recusado ou caixa que não aceitou a marcação: a página mudou o campo ou a máscara e a validação rejeitaram o valor de teste. Compare o valor que ficou no campo com o de LeadData.
- Campo ou consentimento exigido: a página marca como obrigatório um campo que a definição não preenche; com consentimento, o bloqueio é deliberado.
- Envio disparado, mas lead ausente no painel: confira no histórico o identificador e os valores e procure o lead pelo identificador na busca da verificação das integrações. A extensão clica no botão de envio e não acompanha a resposta do site; reCAPTCHA e validações do servidor podem recusar o envio depois do clique.

Na verificação das integrações, copie o relatório: ele traz o id de cada lead e o motivo de cada Não confirmado e Não consultado, para comparar com o histórico do contato no painel. As requisições à API aparecem na aba Network do DevTools da aba do painel, porque o script roda nela. Um comportamento novo da API observado vira um caso em src/lib/integration-status.test.ts ou src/lib/panel-reader.test.ts, com dados fictícios.

Um defeito reproduzido vira um caso de teste com fixture local antes da correção. Nunca use o painel real, credenciais reais ou envios reais nos testes.

## Como manter e atualizar a extensão

- Dependências: confira com npm outdated, atualize com npm install e rode todas as checagens (build, format:check, lint, typecheck, npm test e npm run test:e2e). O WXT usa o web-ext para abrir o navegador de desenvolvimento, e npm run dev e o e2e usam o Chromium do Playwright: depois de atualizar um deles, execute npm exec playwright install chromium e confira npm run dev e o e2e. Não execute npm audit fix --force.
- Ícone: ao mudar o SVG, execute node scripts/generate-icons.mjs, que renderiza os PNG com o Chromium do Playwright, e versione o resultado.
- Formulários e sites: quando um site muda a marcação, ajuste a definição e a fixture juntas, como em Como adicionar um formulário. Hosts de testes novos entram em TEST_SITE_HOST_SUFFIXES.
- Painel e API: a classificação depende do comportamento observado da API; mudança observada entra primeiro como teste, depois na regra e no README.
- Nova versão para a equipe: registre as mudanças em CHANGELOG.md, ajuste version em package.json, gere o pacote com npm run zip e distribua o .zip pelo canal interno; quem usa segue os passos de atualização da instalação a partir do .zip.

## Cuidados com dados reais e distribuição interna

- Prefira o site de testes. Em site de cliente, o envio cria um lead real, que a concessionária recebe; a confirmação avisa, mas não impede. Os leads de teste se reconhecem pelo nome, que começa com Teste LT-.
- Os dados enviados são fictícios e identificáveis: e-mail em example.com e telefone com DDD inexistente. O CPF tem dígitos válidos e pode coincidir com o de uma pessoa real; não o use fora do teste.
- O histórico só guarda os dados fictícios gerados e a URL da página. Limpe-o antes de entregar o navegador a outra pessoa.
- A verificação mostra nomes, e-mails e telefones reais de leads enquanto o popup está aberto. Não compartilhe capturas de tela do popup; para relatar um problema, use Copiar relatório, que omite contato e sessão.
- Nunca registre em documentação, issue, teste ou mensagem tokens, cookies, cabeçalhos de sessão ou dados pessoais reais. Os testes usam só dados fictícios.
- A extensão é de distribuição interna: não publique na Chrome Web Store, não repasse o .zip para fora da equipe e não a instale em computador compartilhado. O pacote não contém credenciais nem configurações pessoais.

## Dependências e auditoria

Dependências e versões estão em package.json e package-lock.json; npm ci instala exatamente o que está no lock. As dependências de produção são React, React DOM, Base UI, Lucide, Motion e tailwind-merge; as demais são ferramentas de desenvolvimento, build e teste e não entram no pacote da extensão.

O npm audit aponta seis ocorrências (três altas e três críticas), todas na cadeia de desenvolvimento de web-ext: shell-quote, usado pelo runner de Firefox, e node-forge, usado pelo suporte a Android. A dependência mais recente ainda inclui essas versões; npm audit --omit=dev não aponta vulnerabilidades. Não execute npm audit fix --force: as sugestões atuais regridem WXT/web-ext para versões incompatíveis com esta base.

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
