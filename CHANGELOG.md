# Changelog

As mudanças de cada entrega do Scanner de Leads, da mais recente para a mais antiga. A versão em package.json só muda quando um pacote novo é distribuído.

## Não lançado

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
