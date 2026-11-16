# Changelog

As mudanças de cada entrega do Scanner de Leads, da mais recente para a mais antiga. A versão em package.json só muda quando um pacote novo é distribuído.

## Não lançado

### Fila pelo redirecionamento atrasado para a página de obrigado

- Correção: quando o site redirecionava para a página de obrigado segundos depois de o formulário parecer pronto (o envio do lead demora pelo reCAPTCHA ou pelo anexo), a fila enviava a próxima unidade no documento que ainda ia sair da aba, e esse envio se perdia, ou aceitava esse documento como o formulário reaberto e parava com "A página mudou de endereço depois do envio anterior".
- Com o formulário ainda no documento do envio anterior, a fila não envia nele: depois do primeiro envio, observa a aba por até 5 s e, sem mudança de endereço, segue sem essa espera nos envios seguintes; depois de um redirecionamento, espera até 15 s o próximo e para com o motivo se ele não vier. Se a página continua mudando, volta ao endereço do formulário até 3 vezes por envio. Cancelar fila interrompe essas esperas.

### Fila pelo redirecionamento para a página de obrigado

- Na fila de várias unidades, quando o site leva a aba a outra página do mesmo site depois do envio (a página de obrigado com redirecionamento configurado), a extensão leva a mesma aba de volta ao endereço exato do formulário, com a query, espera até 15 s o carregamento, encontra o mesmo formulário e segue para a próxima unidade; recarga e mudança só da âncora seguem o mesmo caminho. O envio individual não muda.
- Depois que o site termina o envio, a fila espera 1 s antes de conferir o formulário, para ver o redirecionamento que o site começa nesse momento antes do próximo envio.
- A fila para, mostra as pendentes e diz o motivo quando a página vai para outro site, a aba é fechada ou deixa de ser a ativa, a página não carrega no prazo, o formulário não volta ou volta em outra posição ou repetido, ou a extensão perde o acesso à página; neste caso, a mensagem orienta a liberar o acesso ao site no painel lateral.
- Todo comando da extensão na página tem prazo de 30 s e termina quando a aba muda de endereço ou é fechada, e o cancelamento da fila interrompe as esperas; sem isso, com o cache de voltar e avançar do Chrome, a fila travava no documento congelado depois do redirecionamento.
- Os comandos da extensão numa aba vão um de cada vez, inclusive entre o popup e o painel lateral, para que a leitura da lista feita pelo painel lateral depois da navegação não se misture com um envio da fila.

### Fila pela tela de sucesso

- Na fila de várias unidades, quando o site troca o formulário enviado pela tela de sucesso com Voltar para o formulário, a extensão clica nesse botão, procurado só na área onde o formulário estava, espera até 5 s o mesmo formulário voltar e segue para a próxima unidade; o envio individual não muda.
- Antes do envio seguinte, a fila espera até 15 s o site terminar o envio anterior (formulário com o botão de envio desabilitado), em vez de falhar com o botão desabilitado enquanto o site ainda pede o reCAPTCHA e envia o lead.
- O mesmo formulário depois de remontado é reconhecido pela definição, posição, rótulo e pelas marcas da definição (campos ocultos como siteId, accountId e channel no formulário de seção), não pelo elemento.
- Sem o fim do envio anterior no prazo, sem o botão, com mais de um botão ou formulário, sem o formulário no prazo, com outro formulário ou com mudança de endereço, documento ou aba, a fila para, mostra as pendentes e diz o motivo.

### Formulário com anexo

- Novo tipo de campo arquivo nas definições: a extensão anexa um PDF de teste gerado na hora, com o texto Lead de teste e o identificador do envio, no arquivo lead-de-teste-{identificador}.pdf, depois de conferir que o accept do campo aceita PDF.
- Quando o site envia o anexo ao escolhê-lo, a extensão espera o campo que recebe a chave do upload por até 10 s antes de enviar; sem ela, não envia e mostra o erro.
- O formulário de seção reconhece a variação com anexo obrigatório do site de testes e marca as caixas preferencia_contato[]; o histórico grava o nome do arquivo anexado, e os registros antigos continuam válidos.

### Envio para várias unidades

- No formulário com seletor de unidade (marcado com unit: true na definição), Enviar para várias unidades troca o seletor por caixas com as opções válidas da página e Todas; uma única confirmação mostra o site, o formulário, o aviso do ambiente e as unidades escolhidas.
- A fila envia um lead por unidade, um de cada vez e com 2 s entre eles, cada um com identificador, dados, registro no histórico e acompanhamento no painel próprios; o envio individual continua como antes.
- Antes de cada envio, a fila confere que a aba continua a ativa, no mesmo endereço e documento, com o formulário e a unidade na página; se a página mudou ou um envio falhou, para e mostra as unidades pendentes, que Atualizar lista deixa marcadas.
- Progresso visível (Enviando 2 de 5), resultado por unidade, bloqueio de outros envios durante a fila e Cancelar fila, que para depois do envio em andamento.
- O histórico grava e mostra a unidade de cada envio e tem Filtrar por unidade, com Todas por padrão e Sem unidade para os registros antigos, que continuam válidos.

### Painel lateral, atualização automática e foco no lead

- Painel lateral do Chrome com a mesma interface do popup, aberto pelo botão Abrir no painel lateral do popup; o clique no ícone continua abrindo o popup e a fixação do painel fica com os controles do navegador.
- No painel lateral, a interface acompanha a aba ativa e a navegação, mostra os formulários, a verificação das integrações ou o pedido de acesso, e guarda o estado de cada seção ao trocar de aba; o resultado da verificação sai quando a aba do painel muda de conta.
- Acesso por site em tempo de execução: Permitir acesso a este site pede ao navegador só a origem https da aba ativa, inclusive a do painel, e a resposta fica guardada pelo navegador; recusado, o painel lateral avisa e o popup continua funcionando só com activeTab.
- Novas permissões: sidePanel, tabs, para ler o endereço da aba ativa e pedir a origem certa, e a permissão de host opcional `https://*/*`, sem nenhum site concedido na instalação.
- Opção Atualizar automaticamente, ativada por padrão e gravada no armazenamento local só quando muda.
- Depois de um envio, o registro do histórico mostra o status do lead e de cada integração, consultado pelo identificador do envio na aba do painel aberta numa conta, sem trazê-la para frente nem recarregá-la; a consulta se repete a cada 15 s enquanto o lead não aparece ou está Pendente ou Sem evento, por até 5 min. Sem aba do painel ou sem acesso, o registro explica como conferir.
- O resultado da verificação das integrações é atualizado a cada 30 s com a mesma busca e quantidade, sem perder o que está na tela, e pausa fora de vista; falha na atualização mantém o resultado anterior com aviso.
- Uma consulta por vez ao painel, também entre o popup e o painel lateral: o pedido novo espera o anterior, e um resultado automático que chega depois de um clique é descartado.
- Localizar no painel em cada lead da verificação, em destaque nos com Erro: troca só o hash da aba do painel para a lista da conta com leadId e search, confere o detalhe aberto pelo e-mail do lead, rola até a linha identificada pelo leadId ou pelo e-mail com a data da conversão e a contorna por 3 s; sem identificação única, abre só o detalhe e diz isso, e no prazo de 10 s avisa que não localizou, sem gravar nada no painel.

### Verificação das integrações no painel

- Quantidade de leads consultados escolhida no popup (5, 10 ou 20, com 10 de partida) e busca opcional pela API do painel, com Enter para consultar; quantidade e busca não são gravadas, e os campos ficam travados durante a consulta.
- Novo status Não confirmado, para eventos que não podem ser ligados com segurança ao lead ou à tentativa, e motivo visível nos status Não confirmado e Não consultado.
- Atribuição dos eventos refeita sobre o comportamento observado da API: tentativa automática como a primeira tentativa de cada integração feita inteira nos 60 s depois da criação do lead; os demais eventos, como tentativas seguintes, tardias e reenvios com ou sem prefixo, só contam com evidência de lead único (datas do contato coincidindo com o lead, com tolerância de 2 s, sem busca e sem leads faltando na lista) e, sem ela, deixam a integração Não confirmado quando mudam o resultado ou são os únicos; empate de sucesso e falha no mesmo instante e leads criados juntos tratados como inconclusivos, eventos duplicados contados uma vez e ordem pelo createdAt.
- Status do lead pelo pior status entre as integrações, na ordem Erro, Não confirmado, Pendente, Não consultado, OK e Sem evento; INFO depois de um SUCCESS nunca deixa a integração OK.
- Resultado com hora da consulta e situação concluída, incompleta ou com falha; a consulta fica incompleta quando um lead não é consultado ou a API indica mais leads do que devolveu.
- Copiar relatório: texto de diagnóstico em português, sem e-mail, telefone, CPF, tokens nem dados da sessão; cada número de 10 a 14 dígitos, com ou sem máscara, é omitido separadamente, inclusive seguido de dois-pontos e em JSON.
- Erros da API com mensagem própria para cada caso, sem repassar o corpo da resposta; tempo limite de 15 s por requisição; até 2 novas tentativas em 429, 5xx, falha de rede e resposta interrompida, respeitando o Retry-After até 5 s; 401 e 403 interrompem a verificação; até 3 contatos consultados ao mesmo tempo.
- A consulta escolhida chega ao script do painel numa injeção anterior, só na origem do painel, e é apagada e validada antes de qualquer leitura de cookie.

### Segurança dos envios

- Confirmação na própria interface antes de cada envio, com o formulário, o endereço do site e o ambiente; Esc ou Cancelar desistem sem tocar na página, e só um formulário fica em confirmação por vez.
- Site de testes (hosts .preview-v2.autodromo.com.br em https) diferenciado de site de cliente, que recebe aviso em destaque de que o envio cria um lead real recebido pela concessionária.
- As caixas de consentimento (marketingConsent[] no formulário de seção, dataPermissions na oferta e no modal de contato) continuam marcadas em todo envio, como as de preferência de contato, porque os sites exigem a autorização para enviar: o formulário de seção recusa o envio sem ela por validação própria, mesmo sem marcá-la como obrigatória.
- Telefone de teste com DDD 20, que não existe no Brasil, no formato de celular; o CPF continua com dígitos verificadores válidos e todos os valores continuam derivados do identificador.

### Histórico de envios

- Ação Limpar histórico, com confirmação na interface e desabilitada com o histórico vazio; a sequência dos identificadores não recomeça.
- Retenção dos 100 envios mais recentes, com até 30 dias, aplicada ao gravar e ao ler; os registros já gravados continuam válidos.

### Documentação

- README reorganizado: arquitetura, instalação, build, testes, autenticação, classificação dos status e limitações, como adicionar formulários, como depurar, manutenção, cuidados com dados reais, distribuição interna e resultado do npm audit.
- Este changelog.

## 0.1.0

- Primeira versão: envio de leads de teste pelos formulários reconhecidos na aba ativa, com seletor, caixa de texto e formulário do modal de contato; histórico local dos envios; verificação das integrações dos 10 leads mais recentes no painel, só para leitura, com a sessão lida em memória; ícone de volante e instalação a partir do .zip.
