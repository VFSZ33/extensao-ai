# Scanner de Leads

Extensão de navegador para testar a captação e a integração de leads; o nome remete ao scanner automotivo de diagnóstico. Alvo inicial: Chrome e Microsoft Edge, com Manifest V3. Pipeline v3, WXT, React, TypeScript estrito, Tailwind CSS, Base UI, Lucide, Motion e tailwind-merge. As mudanças de cada entrega ficam em CHANGELOG.md.

## O que a extensão faz

- Na página de um site, lista os formulários de lead reconhecidos e, depois da confirmação do usuário, preenche o escolhido com dados de teste identificáveis e dispara o envio.
- Guarda no navegador um histórico dos envios, para comparar com o lead que chega ao painel, e acompanha no próprio registro o status do lead enviado, consultado no painel aberto em outra aba.
- Com o painel administrativo aberto, verifica o envio dos leads mais recentes às integrações, só para leitura, atualiza o resultado sozinha e localiza no painel o lead escolhido.
- Funciona no popup, pelo ícone da extensão, ou no painel lateral do navegador, que acompanha a aba ativa.
- Verifica a comunicação entre a interface e o background, com carregamento, sucesso, falha e nova tentativa. As mensagens e respostas são validadas.

## Popup e painel lateral

A interface é a mesma nos dois lugares. O clique no ícone da extensão abre o popup, que age na aba em que foi aberto e fecha ao perder o foco. Abrir no painel lateral, no topo do popup, abre a extensão no painel lateral do Chrome e fecha o popup; o painel fica aberto ao lado das páginas, com os controles do próprio navegador para fechar, trocar de lado ou reabrir pelo menu do painel lateral. A extensão não fixa o painel nem muda o comportamento do clique no ícone.

No painel lateral, a interface acompanha a aba ativa da janela: ao trocar de aba ou navegar, mostra os formulários da página, a verificação das integrações, se a aba é o painel, ou o pedido de acesso, se a extensão ainda não tem acesso ao site. Cada seção guarda o seu estado enquanto outra aba está à vista: a lista de formulários e o retorno do último envio daquela aba, e a busca, a quantidade e o resultado da verificação do painel. O resultado da verificação é descartado quando a aba do painel passa para outra conta; a busca e a quantidade continuam.

O painel lateral precisa de acesso a cada site em que age. Na primeira vez num site, inclusive no painel administrativo, ele mostra Permitir acesso a este site; o botão pede ao navegador acesso só à origem daquela aba (por exemplo, https://loja.exemplo.com.br), o navegador pergunta e guarda a resposta. Recusado, o painel lateral avisa e não age na aba; o popup continua funcionando nela. Na aba em que o popup foi aberto, o painel lateral aproveita o acesso temporário dado pelo clique no ícone enquanto a aba fica no mesmo site, sem pedir nada. Só há pedido para páginas https; em outras páginas web, como http ou endereços locais, o painel lateral avisa e o popup continua sendo o caminho.

## Envio de leads de teste

O popup lista os formulários de lead reconhecidos na aba ativa. Enviar teste abre, no próprio item, uma confirmação com o formulário, o endereço do site e o aviso do ambiente; só um formulário fica em confirmação por vez. Confirmar envio preenche o formulário com dados de teste novos e dispara o envio na página; Cancelar ou Esc fecha a confirmação sem tocar na página e devolve o foco ao botão. A confirmação recebe o foco ao abrir; enquanto um envio está em andamento, os demais botões ficam desabilitados e um segundo clique não dispara outro envio.

A confirmação diferencia o ambiente pelo endereço da aba no momento da lista:

| Ambiente        | Quando                                                                                                                          | Aviso                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site de testes  | https em um host terminado em .preview-v2.autodromo.com.br, na constante TEST_SITE_HOST_SUFFIXES de src/lib/site-environment.ts | O lead vai para o painel do ambiente de testes.                                                                                                               |
| Site de cliente | Qualquer outro endereço, inclusive http, localhost e endereço não identificado                                                  | Aviso em destaque: o envio cria um lead real, que a concessionária recebe como contato de verdade; o botão de confirmar fica com o visual de ação destrutiva. |

Quando o formulário tem um seletor mapeado, o popup mostra as opções reais dele na página e o envio usa a opção escolhida; Nenhuma, o padrão, deixa o seletor como a página o apresenta. O popup mostra o resultado do envio ou o erro: página sem acesso, nenhum formulário reconhecido, campo da definição ausente, campo obrigatório que a definição não preenche, valor recusado pela página, opção escolhida que não está mais na página, campo de arquivo que não aceita PDF, anexo recusado pela página ou anexo que o site não confirma no prazo. Junto do resultado, avisa quais campos visíveis e editáveis do formulário ficaram vazios por não estarem na definição; o aviso não impede o envio.

Cada envio tem um identificador LT-AAAAMMDD-HHMMSS-NNN, com data e hora locais e uma sequência que nunca reinicia, nem quando o histórico é limpo. Todos os valores derivam do identificador por uma função pura, em src/lib/lead-data.ts, então ele basta para reconstruir o lead esperado:

- nome: Teste seguido do identificador;
- e-mail: o identificador em minúsculas em example.com, domínio reservado que não recebe mensagens;
- telefone: celular com 11 dígitos e DDD 20, que não existe no Brasil, para não tocar para ninguém;
- CPF: com dígitos verificadores válidos, porque os formulários os conferem;
- mensagem: Lead de teste seguido do identificador;
- anexo: um PDF de uma página, com menos de 1 KB, gerado na hora (src/lib/test-pdf.ts), com o texto Lead de teste e o identificador, no arquivo lead-de-teste-{identificador}.pdf.

As caixas de preferência de contato e de consentimento mapeadas são marcadas em todo envio: o consentimento é marketingConsent[] no formulário de seção e dataPermissions na oferta e no modal de contato, porque os sites exigem essa autorização para enviar; a preferência de contato é contactPreference[] ou preferencia_contato[], conforme a variação do formulário de seção. O CPF é fictício, mas, por ter dígitos válidos, pode coincidir com o de uma pessoa real.

No campo de arquivo, a extensão anexa o PDF de teste como se o usuário o escolhesse, depois de conferir que o accept do campo aceita PDF. A variação do formulário de seção com anexo obrigatório envia o arquivo ao servidor do site assim que ele é escolhido e grava a chave devolvida no campo oculto attachment, que a validação do site exige; a extensão espera essa chave por até 10 s (ATTACHMENT_UPLOAD_TIMEOUT_MS, em src/lib/form-filler.ts) antes de clicar em enviar e, sem ela, não envia e mostra o erro. Por isso o upload do anexo acontece mesmo quando o envio não chega a ser disparado. O histórico grava o nome do arquivo anexado.

A lista traz os formulários que estão na página quando o popup abre ou quando a lista é atualizada. Formulário que só existe depois de uma ação na página, como o de um modal, precisa estar aberto antes; a extensão não o abre.

### Envio para várias unidades

Quando o formulário tem o seletor de unidade, marcado com unit: true na definição (hoje, o seletor Unidade do formulário de seção), e ele tem mais de uma opção válida, o item mostra Enviar para várias unidades. Ligado, o seletor de unidade vira uma lista de caixas com as opções válidas da página e Todas; os demais seletores continuam valendo para todos os envios. Enviar para N unidades abre uma única confirmação, com o formulário, o site, o aviso do ambiente e as unidades escolhidas; Confirmar N envios começa a fila.

A fila envia um lead por unidade, na ordem do seletor, um de cada vez: o próximo só começa depois que o anterior terminou, com sucesso ou falha registrados, e depois de 2 s (QUEUE_SEND_INTERVAL_MS, em src/lib/submission-queue.ts). Cada envio tem identificador, dados e registro próprios no histórico, com a unidade, e é acompanhado no painel como um envio individual. Antes de cada envio, inclusive o primeiro, a extensão confere que a aba continua a ativa, no mesmo endereço e no mesmo documento da lista, e que o formulário e a unidade continuam na página. Se não, a fila para antes do envio, sem enviar no lugar errado: troca de aba e formulário que some sem deixar a tela de sucesso contam como mudança, e, antes do primeiro envio, também navegação, recarga e mudança de hash; depois de um envio, a navegação dentro do mesmo site segue o retorno descrito abaixo. Antes de cada envio depois do primeiro, a fila espera até 15 s (SUBMISSION_SETTLE_TIMEOUT_MS, em src/lib/form-return.ts) o site terminar o envio anterior, enquanto o formulário continua na página com o botão de envio desabilitado, como nos sites Autódromo, que pedem o reCAPTCHA e enviam o lead depois do clique. Quando o site troca o formulário enviado por uma tela de sucesso com o botão Voltar para o formulário, a fila espera esse botão e clica nele, e espera até 5 s (FORM_RETURN_TIMEOUT_MS) o formulário voltar, antes de seguir. O botão é procurado só na área onde o formulário estava (o elemento que o continha, nunca a página inteira) pelo texto Voltar para o formulário, sem diferença de maiúsculas e espaços, em type=button; o formulário que volta precisa aparecer nessa área e ser o mesmo: mesma definição, posição, rótulo e marcas, os campos ocultos listados em marks na definição (no formulário de seção, siteId, accountId, channel e afins), e não o mesmo elemento. Sem o fim do envio anterior no prazo, sem o botão, com mais de um botão ou formulário candidato, sem o formulário no prazo, com outro formulário ou com mudança de endereço ou documento fora do retorno descrito abaixo, a fila para e a mensagem diz o motivo. A tela de sucesso não prova a integração: o resultado de cada envio continua sendo só o disparo, conferido no painel. Uma falha de envio também para a fila. A interface mostra o progresso (Enviando 2 de 5), o resultado de cada unidade e, ao parar, as unidades pendentes, sem envio; Atualizar lista já as deixa marcadas, se o formulário e as unidades continuarem na página. A unidade que falhou não volta marcada, porque o envio pode ter chegado ao site. Cancelar fila para a fila depois do envio em andamento, que não é interrompido. Enquanto a fila anda, os demais envios e a atualização da lista ficam bloqueados. No popup, a fila só anda enquanto ele está aberto; fechá-lo para a fila, e as unidades seguintes ficam sem envio. No painel lateral, ela para quando a aba do site deixa de ser a ativa.

Quando o site leva a aba a outra página da mesma origem depois do envio, como a página de obrigado dos sites Autódromo com redirecionamento configurado (o site troca o endereço da página inteira depois da resposta bem-sucedida do envio), a fila conta a navegação como o fim do envio anterior e volta ao endereço exato da busca dos formulários, com a query (por exemplo, ?filter[unit]=…): espera a navegação do site terminar, leva a mesma aba de volta a esse endereço, sem abrir aba nova, espera o carregamento completo por até 15 s (PAGE_LOAD_TIMEOUT_MS, em src/lib/page-forms.ts), injeta o script de novo e procura o mesmo formulário (mesma definição, posição, rótulo e marcas, e a mesma quantidade de formulários iguais a ele que havia na busca). Depois de mais 2 s, confere a página de novo e envia a próxima unidade. Recarga no mesmo endereço e mudança só da âncora seguem o mesmo caminho; com a aba já no endereço do formulário, a extensão não navega. Como o site reabilita o botão de envio no mesmo momento em que começa o redirecionamento, a fila espera 1 s (SUBMISSION_UNLOAD_GRACE_MS, em src/lib/form-return.ts) depois do fim do envio antes de conferir o formulário, para ver a navegação antes do próximo envio. O site também pode começar o redirecionamento segundos depois de o formulário parecer pronto. Por isso, quando o formulário continua no mesmo documento do envio anterior e a aba não saiu do endereço dele, a fila não envia a próxima unidade nesse documento: depois do primeiro envio, observa a aba por até 5 s (QUEUE_REDIRECT_WATCH_MS, em src/lib/submission-queue.ts), sem agir na página, e, se o endereço não mudar, conclui que o site não redireciona e segue, sem essa espera nos envios seguintes; depois de um redirecionamento, espera até 15 s (QUEUE_REDIRECT_TIMEOUT_MS) o próximo. O documento que fez o envio anterior só é aceito como formulário reaberto depois de a aba ter saído do endereço dele; se a página continua mudando, a fila volta ao endereço do formulário até 3 vezes por envio (QUEUE_REOPEN_LIMIT). Todo comando da extensão na página tem prazo de 30 s (PAGE_COMMAND_TIMEOUT_MS, em src/lib/page-forms.ts) e termina antes se a aba muda de endereço (fora a âncora) ou é fechada: com o cache de voltar e avançar do navegador, o documento que sai da aba fica congelado e não responde mais. O cancelamento da fila também interrompe as esperas na página e no carregamento. Uma página restaurada desse cache, sem carregar de novo, é aceita como as demais, se o formulário estiver nela. O redirecionamento não prova a integração: o resultado de cada envio continua sendo só o disparo. A fila para, mostra as pendentes e diz o motivo quando a página vai para outro site (outra origem), a aba é fechada ou deixa de ser a ativa, a página não termina de carregar no prazo, o site não redireciona no prazo depois de ter redirecionado nos envios anteriores, o formulário não volta, volta em outra posição ou repetido, ou a extensão não tem mais acesso à página; neste caso, a mensagem orienta a liberar o acesso ao site em Permitir acesso a este site, no painel lateral, porque o acesso temporário do clique no ícone pode acabar quando a aba muda de endereço.

No Chromium dos testes, o popup continuou aberto enquanto a aba navegava, e o acesso temporário do clique no ícone (activeTab) continuou valendo nas navegações dentro da mesma origem e acabou na navegação para outra origem; por isso, a fila com redirecionamento funciona também no popup. O caminho recomendado é o painel lateral, com o acesso ao site concedido: ele não fecha ao perder o foco e não depende do acesso temporário. No painel lateral, enquanto a aba está numa página sem acesso, a seção de formulários dá lugar ao pedido de acesso; a fila e o resultado dela continuam guardados e voltam a aparecer quando a aba volta a uma página do site com acesso.

## Histórico de envios

O histórico guarda, de cada envio, o identificador, o formulário, o endereço da página, o horário, a unidade, quando o formulário tem o seletor de unidade com uma opção selecionada, e os valores que ficaram nos campos; de cada seletor, o rótulo e o valor da opção que ficou selecionada. Com envios de unidades no histórico, Filtrar por unidade mostra só os de uma unidade ou só os sem unidade; Todas é o padrão, e o filtro não é gravado. São só os dados fictícios gerados pela extensão e a URL da página; nenhum dado de lead real nem da sessão do painel. Ele fica no armazenamento local da extensão, sobrevive ao fechamento do popup, à navegação e à atualização da extensão na mesma pasta; remover a extensão apaga os dados.

A retenção vale ao gravar e ao ler: ficam os 100 envios mais recentes, com até 30 dias, nas constantes HISTORY_MAX_RECORDS e HISTORY_RETENTION_DAYS de src/lib/submission-history.ts; o que passa disso e os registros em formato inválido são apagados do armazenamento. Os registros gravados por versões anteriores continuam válidos: a unidade é opcional no registro, e os antigos aparecem como Sem unidade no filtro; os com mais de 30 dias saem na primeira leitura.

Limpar histórico abre uma confirmação com a quantidade de envios; Apagar histórico apaga todos, e Cancelar ou Esc desiste. O botão fica desabilitado com o histórico vazio. Limpar não apaga os leads nos sites nem no painel e não reinicia a sequência dos identificadores.

## Atualização automática

A opção Atualizar automaticamente, em Preferências, vem ativada e fica no armazenamento local da extensão só depois que o usuário a muda; é uma preferência, sem dado de lead nem de sessão. Desativada, a extensão só consulta o painel no clique em Verificar integrações.

Depois de um envio bem-sucedido, a extensão procura uma aba do painel aberta na lista de leads de uma conta, a usada por último entre as que não estão descartadas, e consulta nela, sem trazê-la para frente nem recarregá-la, o lead pelo identificador do envio, com a mesma leitura da verificação das integrações (busca pela API, até 5 leads). O registro do envio no histórico passa a mostrar o status do lead no painel e de cada integração, com a hora da consulta. A consulta se repete a cada 15 s enquanto o lead não aparece ou está Pendente ou Sem evento, e para no primeiro resultado conclusivo, num erro da consulta ou 5 min depois do envio; as constantes ficam em src/lib/submission-tracking.ts. Sem aba do painel numa conta, ou sem acesso a ela, o acompanhamento para e o registro explica como conferir, sem erro: buscar o identificador em Integrações dos leads. O acompanhamento só existe enquanto o popup ou o painel lateral que fez o envio está aberto; no popup, ele termina quando o popup fecha. O status consultado não é gravado.

Na verificação das integrações, com a opção ativa, um resultado na tela é consultado de novo a cada 30 s, com a mesma busca e a mesma quantidade dele, na mesma aba. Os campos, os leads e o retorno de cada um continuam na tela durante a atualização; um aviso abaixo do resultado diz a hora da última conferência. Se nada mudou, só essa hora muda; se mudou, o resultado e a hora da consulta são trocados. Uma atualização que falha mantém o resultado anterior e avisa o motivo.

Nas duas atualizações, a consulta pausa enquanto o popup ou o painel lateral não está à vista, inclusive quando a aba ativa do painel lateral não é a do painel, e retoma ao voltar. Há uma consulta por vez ao painel, inclusive entre o popup e o painel lateral abertos ao mesmo tempo: um pedido novo, manual ou automático, espera o anterior terminar, e o resultado de uma atualização automática que termina depois de um clique em Verificar integrações é descartado. O token continua só na memória do script injetado na aba do painel, também nessa consulta em aba que não está à vista.

## Verificação das integrações no painel

Com o painel administrativo aberto e logado na aba ativa, em https://admin.autodromo.com.br, o popup e o painel lateral mostram a verificação das integrações no lugar da lista de formulários; o histórico de envios continua. Ao clicar em Verificar integrações, ou pressionar Enter na busca, a extensão consulta os leads mais recentes da conta aberta, identificada pelo endereço #/contas/{conta}/leads, e o histórico de integrações de cada contato desses leads. A quantidade é 5, 10 ou 20, com 10 de partida, e vai no parâmetro limit da API; a extensão não pede outras páginas, então não alcança leads mais antigos que os devolvidos. Com texto na busca, a lista vem do parâmetro search da API, o mesmo da busca da lista de leads do painel, limitada à quantidade escolhida; o resultado avisa que é de uma busca. A busca é feita pela API, não entre os leads já mostrados, e o texto só segue codificado na consulta à API. Quantidade e busca não são gravadas; durante a consulta, o botão, a quantidade e a busca ficam travados, e outro clique ou Enter não dispara uma segunda consulta.

O resultado mostra a hora da consulta e se ela foi concluída, ficou incompleta ou falhou; a contagem de leads por status; e, para cada lead, o status de cada integração, com o motivo devolvido pela API no erro e o motivo da extensão no não confirmado e no não consultado. O lead cujo nome ou e-mail traz um identificador de envio aparece destacado, com a informação de constar ou não no histórico de envios desta extensão.

A verificação é somente leitura: a extensão não reenvia leads nem altera registros do painel. Com a atualização automática ativa, o resultado mostrado é consultado de novo a cada 30 s, como descrito em Atualização automática. Nomes, e-mails e telefones dos leads aparecem na interface enquanto ela está aberta e não são gravados. As respostas da API não são contrato público: a extensão valida a forma antes de usar, lê só os campos necessários e mostra o que recebe como texto.

### Localizar o lead no painel

Cada lead da verificação tem Localizar no painel, em destaque nos leads com Erro. O botão age na aba do painel em que a verificação foi feita e só troca o hash do endereço: vai para a lista de leads da mesma conta, na primeira página, com leadId igual ao identificador do lead (o id da conversão) e search igual ao identificador de teste, ou ao e-mail, ou ao telefone, nessa ordem; os demais parâmetros da lista, como os filtros, ficam como estavam. Sem recarregar a página, o painel abre o detalhe daquele lead pelo leadId e filtra a lista pela busca.

Em seguida, a extensão espera até 10 s pelo resultado na página. Ela confere que o detalhe Detalhes da conversão abriu com aquele lead, pelo e-mail, ou, sem e-mail, pelo telefone ou pelo identificador de teste, e procura a linha da listagem fora do detalhe: a linha que contém o leadId ou, se nenhuma única o contém, a única que traz o e-mail com a data e a hora da conversão, no formato dd/mm/aaaa e hh:mm do horário local. O nome nunca basta. Achada a mesma linha em duas leituras seguidas, a extensão rola até ela e a contorna por 3 s, também se a lista for desenhada de novo nesse tempo, e restaura o estilo da linha depois. O resultado diz o que aconteceu: lead localizado; detalhe aberto, mas a linha não foi destacada porque não pôde ser identificada sem ambiguidade; detalhe aberto, mas o lead não foi localizado na listagem, por exemplo por um filtro aplicado; ou não foi possível localizar o lead na listagem, no fim do prazo. Nada é gravado no painel nem enviado à API: o script de foco só troca o hash, lê o texto da página e muda o estilo da linha por 3 s, e devolve à extensão só o resultado.

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

Localizar no painel depende da rota e dos parâmetros lidos no código público do painel (#/contas/{conta}/leads com leadId, search e page), do título Detalhes da conversão e da data da conversão em dd/mm/aaaa hh:mm na linha; nada disso foi conferido no painel real com login. Se o painel mudar, o resultado tende a não localizado ou a só o detalhe aberto, nunca a um destaque em outra linha.

## Autenticação e permissões

A extensão declara, em wxt.config.ts, as permissões activeTab, scripting, sidePanel, storage e tabs, e a permissão de host opcional `https://*/*`. Sem nenhum acesso a sites na instalação, ela não registra content scripts fixos e não pede nem guarda credenciais; a única sessão que usa é a do painel já aberto.

- activeTab: o popup acessa só a aba em que foi aberto, depois do clique no ícone, como antes; ele não depende de outra permissão de site.
- sidePanel: abre a mesma interface no painel lateral.
- tabs: dá à extensão o endereço e o título das abas, sem acesso ao conteúdo delas. O painel lateral precisa do endereço da aba ativa para saber se ela é o painel ou um site e para pedir acesso só à origem dela; sem tabs, o navegador só informa o endereço de abas a que a extensão já tem acesso. Por isso o navegador lista, nos detalhes da extensão, a permissão de ler o histórico de navegação.
- `https://*/*`, opcional: nenhum site é concedido na instalação. O painel lateral pede, no clique em Permitir acesso a este site, só a origem da aba ativa, e o navegador guarda cada resposta; o acesso a um site some quando a extensão é removida. A API do painel não precisa de permissão: as consultas saem da página do painel, com o CORS da própria API.

Para consultar as integrações, a extensão lê a sessão do painel. No clique, na atualização automática e no acompanhamento de um envio, uma primeira injeção grava a consulta (quantidade e busca) no mundo isolado da aba, só se a origem for a do painel; em seguida, o script de leitura é injetado no mesmo mundo isolado, apaga a consulta, confere que a origem é exatamente a do painel e valida a consulta antes de ler qualquer cookie. Dos cookies de sessão do Amplify, lê o token de acesso e o token de identidade, de onde vem o e-mail do usuário enviado no cabeçalho x-actor-email; o nome do usuário não é enviado; os demais cookies, inclusive o token de renovação, são ignorados. O token de acesso fica só na memória desse script durante a verificação, inclusive quando a aba do painel não está à vista, e só é enviado a https://crmv3.autodromo.com.br, em requisições GET, sem cookies e sem seguir redirecionamento. Ele não é gravado, não chega ao popup, ao painel lateral nem ao background e não aparece em log nem em mensagem de erro. A extensão não renova a sessão: token ausente, expirado ou recusado pela API pede para recarregar o painel ou entrar de novo.

O envio de formulários não usa sessão nenhuma: o script injetado na página só preenche os campos e clica no botão de envio do próprio formulário.

## Arquitetura

src/entrypoints/popup e src/entrypoints/sidepanel são as entradas da interface, com o mesmo componente, src/components/extension-popup, que recebe de cada entrada onde está (surface); o que muda entre as duas fica nesse componente e em src/hooks/use-page-targets, que acompanha a aba ativa e o acesso a ela no painel lateral. src/entrypoints/background.ts registra o listener do background; src/entrypoints/lead-forms.ts, src/entrypoints/lead-integrations.ts e src/entrypoints/lead-focus.ts são os scripts injetados sob demanda, o primeiro na página do site e os outros dois só no painel. Hooks ficam em src/hooks/<nome>/index.tsx. Componentes ficam em src/components/<nome>/index.tsx; src/components/confirmation é a confirmação na própria interface, usada no envio e na limpeza do histórico. src/lib/extension-messaging.ts define e valida a troca de mensagens com o background. src/assets/globals.css contém o tema e a tipografia global, com fontes do sistema.

No fluxo de envio, src/lib/lead-data.ts gera o identificador e os dados; src/lib/form-definitions reúne as definições; src/lib/form-filler.ts reconhece, preenche e envia na página; src/lib/page-command.ts valida os comandos e as respostas trocados com a página; src/lib/page-forms.ts acessa a aba ativa, ou a aba indicada pelo painel lateral, e leva a aba de volta ao endereço do formulário na fila; src/lib/site-environment.ts classifica o site como de testes ou de cliente; src/lib/submission-queue.ts envia a fila de unidades, conferindo a página antes de cada envio; src/lib/form-return.ts, na página, volta da tela de sucesso ao formulário para a fila; src/lib/submission-history.ts lê, grava, limita e limpa o histórico.

Na verificação das integrações, src/lib/panel-leads.ts reconhece o painel na aba ativa e injeta os scripts de leitura e de foco na aba do painel; src/lib/panel-reader.ts roda na página, consulta a API e valida as respostas; src/lib/panel-session.ts reconhece o endereço do painel, a conta e a sessão; src/lib/panel-query.ts valida a consulta, com quantidade e busca, entregue ao script; src/lib/integration-status.ts atribui e classifica os eventos e valida o resultado devolvido ao popup; src/lib/integration-report.ts monta o relatório de diagnóstico; src/lib/lead-focus.ts monta o pedido de foco e roda na página para localizar o lead.

src/lib/page-access.ts confere e pede o acesso por site; src/lib/exclusive-task.ts garante uma consulta por vez ao painel e um comando por vez em cada aba, com o bloqueio do navegador compartilhado entre o popup e o painel lateral; src/lib/preferences.ts guarda a opção de atualização automática; src/lib/auto-refresh.ts e src/lib/submission-tracking.ts definem os intervalos, o fim e a consulta do acompanhamento.

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

Execute npm run build. A extensão descompactada fica em .output/chrome-mv3. Abra chrome://extensions ou edge://extensions, ative o modo de desenvolvedor, selecione Carregar sem compactação e escolha essa pasta. Abra a página com o formulário, abra o popup pelo botão da extensão, clique em Enviar teste no formulário desejado e confirme. Para conferir as integrações, abra a lista de leads da conta no painel, abra o popup e clique em Verificar integrações. Para usar o painel lateral, clique em Abrir no painel lateral no popup; na primeira vez em cada site, clique em Permitir acesso a este site e aceite o pedido do navegador. Verificar extensão confere a comunicação com o background.

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

Vitest usa a integração oficial WxtVitest, Testing Library, user-event e jest-dom em jsdom. Testes unitários ficam junto do código e cobrem estados da interface, carregamento, nova tentativa, validação/falhas das mensagens, geração dos dados, definições, preenchimento de campos, caixas de texto e seletores controlados pelo React, caixas de preferência e de consentimento marcadas, aviso de campos sem preenchimento, a confirmação do envio com o ambiente do site, cancelamento e foco, o histórico com retenção, limite, limpeza, unidade e filtro por unidade, a fila de envios por unidade (ordem, identificadores distintos, retorno pela tela de sucesso e pelo endereço do formulário depois de redirecionamento, recarga ou âncora, parada por mudança da página, por outro site, por prazo de carregamento, por falta de acesso, por formulário ausente ou ambíguo, por falha ou por retorno sem botão, ambíguo, fora do prazo ou com outro formulário, cancelamento e unidades pendentes) e, na verificação das integrações, classificação e atribuição dos eventos, leitura da sessão, chamadas à API com erros e novas tentativas, o relatório de diagnóstico e a seção do popup. Também cobrem o acesso por origem, a consulta única entre pedidos, o agendamento e a parada da atualização automática e do acompanhamento dos envios, a pausa fora de vista, a preferência gravada, a montagem do endereço de foco e a localização do lead na página, o painel lateral acompanhando a aba ativa e o pedido de acesso, e o botão do popup que abre o painel lateral.

Playwright carrega o build Manifest V3 em contexto persistente temporário do Chromium, verifica o popup com o background real e exercita o envio de ponta a ponta: aciona o ícone da extensão pelo protocolo de depuração, o que abre o popup real e concede activeTab como o clique do usuário, confirma e envia formulários de tests/fixtures/lead-forms.html, servida localmente, inclusive com a opção de seletor escolhida no popup e com a fila de várias unidades, um lead por unidade, o filtro do histórico, a fila de 3 unidades que volta ao formulário pela tela de sucesso imitada na fixture (hash #tela-de-sucesso), também com anexo no painel lateral, a fila de 3 unidades, no popup e no painel lateral, que volta ao endereço do formulário depois do redirecionamento para tests/fixtures/obrigado.html (hash #redireciona-para-obrigado), sem abrir aba nova, também quando o redirecionamento chega segundos depois de o formulário parecer pronto e a fixture só registra o envio ao terminar (hash #redireciona-com-atraso), e a parada da fila quando o redirecionamento leva a outro site, com as pendentes marcadas depois de voltar à página (restaurada do cache de voltar e avançar) e liberar de novo o acesso; esses testes rodam com esse cache ligado, como no Chrome, e confere que as caixas de consentimento ficam marcadas. Também cobre o cancelamento pelo botão e pelo Esc sem envio, o aviso de site de cliente, o aviso de site de testes, com a fixture servida por rota interceptada num host .preview-v2.autodromo.com.br, e a limpeza do histórico com a sequência mantida. Para a verificação das integrações, o Playwright intercepta as rotas e serve tests/fixtures/panel-leads.html no endereço do painel e respostas simuladas da API, com cookies e dados fictícios de tests/fixtures/panel.ts; os testes conferem o resultado no popup, a consulta incompleta, o relatório copiado, a busca com a quantidade escolhida, a nova tentativa que respeita o Retry-After, que só há requisições GET à API, que o token não chega ao popup, ao relatório nem ao armazenamento da extensão e que o script roda isolado do código da página. A fixture do painel imita a lista e o detalhe do lead, lendo leadId, search e page do hash com carregamento atrasado, para conferir Localizar no painel: o hash montado, o detalhe aberto, o contorno da linha por 3 s, a linha certa entre duas do mesmo e-mail e o aviso quando a linha não aparece, sem nenhuma requisição à API. O painel lateral real é aberto pelo botão do popup; os testes conferem que ele acompanha a troca de aba, guarda o estado das seções, mostra o pedido de acesso numa aba sem permissão e, depois de um envio, mostra no histórico o status do lead consultado na aba do painel em segundo plano, sem recarregá-la. O pedido de permissão do navegador não pode ser respondido no Chromium sem interface, então o acesso nesses testes vem do activeTab, dado ao acionar o ícone em cada aba; a resposta ao pedido é coberta pelos testes unitários.

Os testes nunca enviam formulários em sites reais nem alcançam o painel ou a API reais: nos testes que abrem páginas, o navegador só resolve o endereço local. Relatórios estão em playwright-report e artefatos em test-results; npm exec playwright show-report abre o último relatório.

## Como adicionar um formulário

Cada formulário suportado tem uma definição em src/lib/form-definitions: como reconhecê-lo na página, quais campos preencher e qual controle dispara o envio. O motor de preenchimento e o popup não mudam. As definições atuais vêm dos sites Autódromo: o formulário de oferta, o formulário de seção, que cobre também a variação das páginas de veículo, com seletor de unidade e caixa de mensagem, e a variação com anexo obrigatório, e o formulário do modal de contato, aberto pelo botão flutuante de WhatsApp.

1. Abra a página no site de testes e inspecione o formulário no DevTools. Escolha atributos estáveis da marcação para reconhecê-lo, nunca classes geradas.
2. Crie um arquivo de definição, a partir de src/lib/form-definitions/autodromo-offer.ts, e registre-o em src/lib/form-definitions/index.ts. Um campo é um texto (input ou textarea), uma caixa de marcação, um arquivo (input type=file) ou um seletor (select), cujo seletor CSS inclui a tag; o arquivo recebe o PDF de teste e, quando o site faz o upload ao escolher o arquivo, leva em uploadedSelector o campo que o site preenche ao terminar, que a extensão espera antes de enviar; o seletor leva o rótulo que o popup mostra, e as opções são lidas da página; o seletor de unidade leva unit: true, que permite o envio para várias unidades e grava a unidade no histórico. Campo que nem toda variação tem é optional e é preenchido quando existe na página; variação do mesmo formulário estende a definição existente com campos opcionais. Em marks, a definição lista os nomes dos campos ocultos que identificam o formulário na página, como siteId e accountId, conferidos antes de cada envio da fila; não entram campos que o site muda sozinho, como origin_url.
3. Caixas de marcação, como as de preferência de contato e de consentimento, são campos e são sempre marcadas.
4. Valor novo de teste entra em LeadData, em src/lib/lead-data.ts, derivado do identificador; nunca é gerado na definição.
5. Reproduza o formulário em tests/fixtures/lead-forms.html (o de anexo, com o upload simulado, em tests/fixtures/attachment-form.html), com o comportamento da página que importa (máscara, validação, campos controlados), e acrescente os casos em src/lib/form-definitions/index.test.ts e, se for um fluxo novo, em tests/e2e/extension.spec.ts.
6. Confira o reconhecimento e o preenchimento no site de testes. Um envio de teste em um site real cria um lead de verdade no painel desse site.

## Como depurar falhas

No envio:

- O popup se inspeciona pelo menu de contexto do ícone da extensão (Inspecionar pop-up); o painel lateral, pelo menu de contexto dentro dele (Inspecionar). O script de preenchimento roda na aba da página, então os campos preenchidos, as máscaras e as mensagens de validação aparecem no DevTools dessa aba.
- Nenhum formulário reconhecido: a página mudou os atributos que a definição usa para reconhecê-la, ou o formulário ainda não está aberto. Compare a marcação com o matches da definição.
- Campo da definição não encontrado, valor recusado ou caixa que não aceitou a marcação: a página mudou o campo ou a máscara e a validação rejeitaram o valor de teste. Compare o valor que ficou no campo com o de LeadData.
- Campo exigido: a página marca como obrigatório um campo que a definição não preenche.
- Anexo não confirmado no prazo: o upload do site falhou ou demorou mais de 10 s; a aba Network do DevTools da página mostra a requisição de upload, e o campo da definição em uploadedSelector deve ser o que o site preenche ao terminar.
- Envio disparado, mas lead ausente no painel: confira no histórico o identificador e os valores e procure o lead pelo identificador na busca da verificação das integrações. A extensão clica no botão de envio e não acompanha a resposta do site; reCAPTCHA e validações do servidor podem recusar o envio depois do clique.

No painel lateral, uma aba sem acesso mostra Permitir acesso a este site; o navegador guarda o acesso concedido até a extensão ser removida. Um lead que Localizar no painel não acha pode estar fora dos filtros da lista; o detalhe aberto e a mensagem dizem até onde a extensão chegou.

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
- A verificação mostra nomes, e-mails e telefones reais de leads enquanto o popup ou o painel lateral está aberto, e o painel lateral fica aberto ao lado de outras páginas. Não compartilhe capturas de tela da extensão; para relatar um problema, use Copiar relatório, que omite contato e sessão.
- O acesso concedido a um site pelo painel lateral vale até a extensão ser removida. Conceda só nos sites em que vai testar.
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
