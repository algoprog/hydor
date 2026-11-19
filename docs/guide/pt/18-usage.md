# Uso, limites e custos

Claude Code, Codex e Grok Build funcionam com planos que têm limites de uso, e cada chamada de modelo tem um preço. Este tópico mostra onde ver quanto de cada plano você já usou e quando ele é renovado, o que acontece ao atingir um limite (e como fazer as sessões continuarem sozinhas), o que os agentes fizeram ao longo do tempo e como o app estima os custos, inclusive com preços que você mesmo define.

![Uso: quanto de cada plano você já usou e quando ele é renovado](images/usage.webp)

## Abrir a página Uso

Abra **Uso** na barra de ícones (no celular, abra primeiro a barra lateral). Uma barra fina sob o ícone de Uso mostra, de relance, quanto ainda resta em todas as suas assinaturas pagas do Claude Code, Codex e Grok Build, cada uma contada pelo limite mais próximo de acabar; se você só tem assinaturas gratuitas, ela conta essas, e se não tem nenhuma, a barra não aparece. Ela fica vermelha quando não resta nada. Passe o mouse sobre ela para ver o que resta em cada assinatura.

A [página Uso](/usage) tem três abas:

- **Limites** (`/usage`): quanto resta de cada plano e quando ele é renovado.
- **Atividade** (`/stats`): linhas alteradas, tokens e sessões ao longo do tempo.
- **Arena** (`/arena`): quais modelos se saem melhor nas suas próprias tarefas.

O app lê o seu uso quando você abre a página e a cada cinco minutos enquanto o app está aberto; na aba Limites, **Atualizar** faz a leitura de novo na hora. O uso do Grok Build é lido do agente dele com alguns minutos de intervalo, e **Atualizar** também o lê imediatamente.

## Ler os limites de um plano

A aba **Limites** tem um cartão para o Claude Code, um para o Codex, um para o Grok Build (depois de você adicioná-lo em [Configurações → Agentes → Mais agentes](/settings?s=agents)) e um para cada conta que você adicionou em [Configurações → Agentes → Contas](/settings?s=accounts). Em tela larga, ficam dois por linha; no celular, um embaixo do outro.

Cada cartão mostra o e-mail e o plano da conta, há quanto tempo os números foram lidos e uma linha por limite (uma janela de tempo com um teto de uso):

- Claude Code: **Current session (5 h)**, **Weekly · all models** e limites semanais para um só modelo, como **Weekly · Sonnet only**.
- Codex: **5-hour window**, **Semanal** ou janelas de outras durações. Quando o Codex tem vários limites, cada linha começa com o nome do limite.
- Grok Build: **Semanal**, com a data de renovação. O cartão também informa o plano (SuperGrok, SuperGrok Plus ou SuperGrok Heavy). O login próprio do Grok tem o seu cartão, e cada conta do Grok que você adicionou tem um.

Cada linha mostra a porcentagem usada, uma barra, a porcentagem restante e quando o limite é renovado (“renova em 2 h 15 min”; passe o mouse para ver a hora exata). Um sinal de alerta aparece a partir de 90%.

Dependendo do plano, o cartão também mostra:

- **Uso extra** (Claude): se o uso pago além dos limites do plano está ativado e quanto do limite mensal dele já foi gasto.
- **Créditos** (Codex, Grok Build): o seu saldo de créditos, ou “Ilimitado”.
- **Pague conforme o uso** (Grok Build): quando o plano tem essa opção, quanto você gastou nela neste mês em relação ao limite (“US$ 12,00 de US$ 50,00 neste mês”).
- **Renovações de limite**: renovações que você pode usar agora (veja [Usar uma renovação de limite](#use-a-limit-reset)).
- **Esta semana por superfície** (Claude): como o uso desta semana se divide entre os lugares em que você usa o Claude.
- **Tokens por dia** (Codex): um gráfico dos últimos 30 dias, com o seu total acumulado. Um token é um pedaço de palavra; os modelos contam o que leem e escrevem em tokens.

Quando algo está errado, o cartão avisa:

- “Não conectado” com **Entrar em Configurações** (para o Grok Build: “Entre para ver o uso do plano do Grok.”);
- em um plano administrado por uma equipe, o cartão do Grok Build diz “Os limites de uso são gerenciados pela sua equipe.”, já que não há limites próprios para mostrar;
- “Nenhum limite de uso informado para este plano”;
- um erro com **Verifique o login em Configurações**;
- “Mostrando os últimos números conhecidos: …” quando a leitura mais recente falhou.

## O que acontece ao atingir um limite

Quando o uso de um plano acaba, a vez do agente é interrompida. No Grok Build, isso significa o limite semanal, o limite de créditos ou o limite de gastos do Pague conforme o uso; um limite de taxa curto (uma rajada de solicitações) não conta e passa sozinho. Um aviso diz de quem é o limite atingido, qual é e quando ele é renovado: “Você atingiu o limite de uso do Claude Code” (ou do Codex ou do Grok Build) quando há uma conta desse agente, “Todas as suas contas do Claude Code atingiram o limite de uso” quando você tem várias e nenhuma tem uso disponível, ou a conta pelo nome (“Trabalho atingiu o limite de uso”) quando outra ainda tem. Ele aparece:

- na página inicial, acima da caixa de mensagem, para o agente (e a conta) que você escolheu;
- em uma sessão, acima da caixa de mensagem;
- no cartão desse plano na página Uso.

O aviso oferece o que você pode fazer:

- **Retomar na renovação** (em uma sessão, enquanto **Retomar após limites de uso** está desativado): a sessão continua sozinha um minuto depois que o limite é renovado, com a mensagem “Continue de onde parou.” O aviso então diz “Esta sessão continua sozinha quando o limite for renovado”, com **Cancelar**.
- **Usar uma renovação**, quando a conta tem uma renovação de limite que você pode usar agora (“2 renovações disponíveis”).

Quando o uso volta, mas uma sessão ainda está programada para continuar, o aviso diz “Continua sozinha em …”, com **Cancelar**.

## Continuar sessões automaticamente após um limite

Para que toda sessão que atinge um limite continue sozinha, abra [Configurações → App → Geral](/settings?s=general&find=Resume%20after%20usage%20limits) e ative **Retomar após limites de uso** (quando uma vez do agente é interrompida porque o uso de um plano acabou, a sessão continua sozinha um minuto depois que o limite é renovado). Ela fica desativada até você ativá-la. Funciona mesmo sem nenhum navegador aberto. Com ela ativada, a sessão não mostra aviso quando um limite a interrompe: uma linha acima da caixa de mensagem diz de quem é o limite atingido (como o aviso faz), qual é e “Continua sozinha em …”, com **Usar uma renovação** quando a conta tem uma, e **Cancelar**.

Como funciona o tempo, com a opção ativada ou com **Retomar na renovação**:

- A sessão é retomada um minuto depois que o limite é renovado, conforme o último horário informado pelo provedor. O app lê o uso de vez em quando enquanto uma sessão espera, com mais frequência à medida que a renovação se aproxima, e muda o horário se o provedor mudar a renovação.
- Se o limite é liberado antes (você usou uma renovação ou entrou com outra conta), a sessão continua imediatamente. Se ela foi continuada antes da hora nos últimos 15 minutos e atingiu o limite de novo, ela espera pela renovação.
- Só é continuada uma vez que o limite realmente interrompeu, não uma que terminou justo quando o uso do plano chegou a 100%. Uma continuação planejada é descartada quando a sessão segue sem ela: você envia uma mensagem ou aperta **Parar**, ou uma vez passa normalmente. Uma vez que o agente inicia sozinho enquanto espera (quando uma tarefa em segundo plano ou um subagente dele para no mesmo limite) não a descarta. Uma sessão que você parou com **Parar** nunca é continuada sozinha, mesmo que o erro do limite tenha vindo primeiro, até você enviar uma mensagem a ela.
- **Cancelar** no aviso interrompe uma continuação planejada.

Com mais de uma conta para o agente (Claude Code, Codex ou Grok Build), [**Trocar de conta no limite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) leva a sessão adiante com outra conta imediatamente, e só espera quando todas as contas estão no limite (veja [Agentes, contas e modelos](/guide/agents-models#use-all-your-accounts-switch-at-a-limit)). No Claude Code, [**Usar crédito de API no limite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) pode levá-la adiante nesse caso, cobrando de uma chave de API da Anthropic que você salvou, em vez de esperar (veja [Usar crédito de API quando todas as contas estão no limite](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit)).

## Usar uma renovação de limite

Alguns planos oferecem renovações de limite: créditos de renovação do Codex e concessões de renovação do Claude (o Grok Build não tem). Usar uma limpa agora os limites de uso do plano, em vez de esperar que sejam renovados.

Cada cartão as lista em **Renovações de limite**, com quantas você tem. Cada renovação mostra o nome (e quantos usos restam nela), “Expira em …” (em cor de alerta quando falta menos de um dia) ou “Não expira”, e observações como “Funciona quando você atingir um limite” ou “Ainda não pode ser usada”. Uma renovação retida por outro limite diz qual é e quando ele é liberado: “Bloqueada enquanto o seu limite semanal estiver esgotado (utilizável em …)”. Algumas renovações do Claude limpam só parte da sua cota, então não podem ser usadas enquanto o limite semanal estiver esgotado; elas ficam utilizáveis quando ele é renovado. Quando não há nenhuma: “Nenhuma renovação de limite no momento”, com a data da próxima, se o plano informar. O app verifica as renovações de uma conta do Claude a cada dez minutos, mais ou menos, já que a Anthropic recusa verificações mais frequentes, e mostra a lista lida por último nesse intervalo, mesmo depois de reiniciar o app. Por isso, uma renovação pode levar alguns minutos para aparecer como utilizável. A que você usa sai da lista na hora.

1. Clique em **Usar** ao lado de uma renovação, ou em **Usar uma renovação** em um aviso de limite (ele pega a primeira renovação da lista que funciona agora).
2. Leia a confirmação. Ela diz qual renovação será usada, quando ela expira e quantas restarão. Se você não está em um limite, ela avisa (“Você não está em um limite agora”).
3. Clique em **Usar renovação**.

O app informa como foi, por exemplo “Os limites de uso do Codex foram renovados.”, “O Claude não está em um limite de uso agora, então nada foi renovado.”, “As renovações estão em espera. Tente de novo mais tarde.” ou “Essa renovação já foi usada.” Quando funciona, uma sessão que esperava pelo limite continua imediatamente.

As renovações do Claude exigem o Claude Code conectado com uma assinatura do Claude (não com cobrança de API).

## Ver o que os agentes fizeram ao longo do tempo

A aba **Atividade** (`/stats`) conta o que os agentes fizeram, a partir das sessões que o app conhece neste computador.

No alto:

- **Diário**, **Semanal**, **Mensal** ou **Anual**: o período que os números contam, e uma barra por dia, semana, mês ou ano nos gráficos. A página lembra da sua escolha.
- **Todos**, ou um agente: **Claude**, **Codex**, **Custom** e qualquer outro agente que tenha feito algo aqui (Gemini CLI, OpenCode…).
- O chip de um modelo, quando você escolheu um modelo em **Por modelo** mais abaixo: a página então conta só esse modelo. Clique no chip (no **✕** dele) para ver todos os modelos de novo.
- **Gráficos** ou **Tabela**.

A linha ao lado informa o intervalo que os gráficos e a tabela cobrem (os últimos 30 dias, as últimas 26 semanas, os últimos 12 meses ou desde o início do seu histórico, ou todos os anos) e o seu fuso horário. Dias, semanas e meses seguem o seu fuso horário, e a semana começa na segunda-feira.

Abaixo está o período até agora, **Hoje**, **Esta semana**, **Este mês** ou **Este ano**, com as datas. Os blocos mostram os totais dele:

- **Linhas adicionadas** e **Linhas removidas**
- **Tokens de entrada** (o que os modelos leram: novos e em cache) e **Tokens de saída** (o que escreveram)
- **Velocidade de saída**: tokens por segundo, enquanto as respostas eram escritas
- **Custo da API (est.)**: quanto os mesmos tokens custariam pela API
- **Prompts** (com o número de vezes), **Sessões**, **Comandos** (com o número de chamadas de ferramentas) e **Edições de arquivos**

A pequena seta em um bloco compara com o período anterior, até o mesmo ponto: numa quarta-feira às 15h, esta semana com a semana passada de segunda até quarta às 15h; hoje com ontem até a mesma hora. A linha ao lado do nome do período diz isso (“comparado com a semana passada até o mesmo dia e hora”). É neutra: mais não é melhor nem pior.

**Gráficos** mostra as linhas alteradas (adicionadas para cima, removidas para baixo), os tokens de entrada (novos e em cache), os tokens de saída, a velocidade de saída e pequenos gráficos de prompts, sessões, comandos e edições de arquivos, uma barra por dia, semana, mês ou ano ao longo do intervalo; a última barra é o período até agora. **Tabela** lista os mesmos números por período, do mais recente ao mais antigo, com o total de todo o intervalo.

Abaixo, nas duas visualizações, o período até agora de novo, como os blocos o contam:

- **Por agente**: cada agente pelo nome (Claude Code, Codex, Custom, Gemini CLI e os outros que fizeram algo), com sessões, prompts, linhas, entrada e saída.
- **Principais projetos**: as pastas com mais linhas alteradas.
- **Por modelo**: sessões, prompts, entrada, entrada em cache, saída e custo da API de cada modelo, tanto dos modelos do Custom (OpenRouter, Ollama, vLLM…) quanto dos do Claude e do Codex. Clique em um modelo para ver a página inteira só com ele. Um modelo sem preço conhecido mostra **definir um preço**. Passe o mouse sobre um modelo para ver o preço por milhão de tokens e de onde ele vem (“seu preço” ou “tabela de preços pública”).

No celular, os blocos ficam dois por linha, e algumas colunas da tabela são omitidas.

A página inicial resume o dia em uma linha sob a caixa de mensagem quando os agentes já fizeram algo hoje: “Hoje · 7 sessões · 12 edições de arquivos · US$ 0,84”, omitindo a parte que é zero. O valor em dinheiro é o **Custo da API (est.)** do dia: em um plano (Claude Code, Codex), você paga a mensalidade do plano, como diz o texto ao passar o mouse. Passe o mouse sobre a linha para ver as linhas adicionadas e removidas, os tokens de entrada e saída e os prompts; clique nela para abrir Atividade.

## Como os custos são estimados

Os planos do Claude e do ChatGPT têm preço fixo, então o app mostra quanto o mesmo trabalho custaria nos preços da API (preços de pagamento por uso). Isso diz quanto você aproveita de um plano e quanto custaria um modelo pela API. A mesma estimativa aparece na linha de cada turno concluído em uma sessão ("≈ $0.12", com suas partes em **Tempo e custo**) e na linha **Hoje** da página inicial; em um plano, ambas avisam isso quando você passa o mouse por cima.

- Os preços vêm de uma tabela de preços pública (a do LiteLLM), que o app busca no máximo uma vez por dia e guarda para quando estiver offline.
- Os preços que você mesmo define têm prioridade sobre a tabela.
- Os tokens de cada sessão são calculados pelo preço do modelo dela; uma sessão que trocou de modelo é calculada pelo último que usou.
- A entrada em cache (texto que o modelo já leu antes, servido do cache) é calculada pelo preço em cache, ou pelo preço de entrada quando não há um.
- Modelos sem preço conhecido (só o nome de uma família, como "opus", ou um modelo que a tabela não lista) não contam nos totais e mostram **definir um preço** em **Por modelo**.

Os modelos do OpenRouter usam preços buscados automaticamente no OpenRouter, incluindo os preços de entrada em cache. Você não precisa digitá-los. Se o OpenRouter não tiver um preço disponível, **Por modelo** mostra um traço em vez de pedir que você defina um.

Os limites de gastos usam os mesmos preços, mas adotam o valor do próprio agente quando ele informa um: o custo do Claude Code, ou o que o OpenRouter diz que cada chamada do Custom custou. Um modelo neste computador não custa nada nesse cálculo.

## Definir seu próprio preço para um modelo

1. Na aba **Atividade**, clique em **Preços dos modelos** no alto de **Por modelo**, ou em **definir um preço** ao lado de um modelo.
2. A janela **Preços dos modelos** lista os modelos em exibição e os que você já tinha precificado. Cada um tem **Entrada**, **Em cache** e **Saída**, em dólares por milhão de tokens. Os campos vazios usam o preço da tabela pública, mostrado em cinza.
3. Digite seus preços. Entrada e saída são obrigatórias; o preço em cache é opcional (sem ele, vale o preço de entrada).
4. Para precificar um modelo que não está na lista, digite o ID dele em **Outro ID de modelo** e clique em **Adicionar**.
5. Clique em **Salvar preços**.

O ícone de lixeira em uma linha (**Usar o preço da tabela**) apaga o seu preço para aquele modelo. Para contar um modelo deste computador como gratuito, informe 0 para entrada e saída.

## Todas as sessões são mantidas

O app mantém todas as sessões e seus números, seja qual for o comportamento do programa do próprio agente. O Claude Code exclui suas conversas após 30 dias, a menos que se diga o contrário; por isso o app pede que ele as mantenha (em toda conta do Claude Code cujas configurações não definam por quanto tempo), e o app guarda um vínculo próprio com cada arquivo de conversa do Claude Code e do Codex: uma conversa que o programa do agente (ou qualquer pessoa) exclui volta, listada e aberta como antes. O vínculo é o mesmo arquivo com um segundo nome, então não ocupa espaço extra em disco.

O que sai é o que ninguém usa: sessões inativas por um ano são excluídas, a menos que você mude isso em [Configurações → Geral → Excluir sessões inativas](/settings?s=general&find=Delete%20inactive%20sessions) (veja [Excluir sessões inativas](/guide/app#delete-inactive-sessions)). Os números delas continuam em Atividade.

As conversas que o Claude Code excluiu antes disso, quando o app não as mantinha, não podem voltar; o histórico de Atividade começa onde o app passou a contá-las.

## Limitar quanto uma sessão gasta

Um limite de gastos interrompe uma sessão quando ela gastou um valor definido nos preços da API, seja qual for o plano que você paga. Os subagentes que ela inicia também contam.

- Para uma nova sessão: na página inicial, **Opções** → **Limite de gastos**. Escolha $1, $5, $10 ou $25, ou digite um valor e clique em **Definir**. **Sem limite** remove o limite.
- Para uma sessão em andamento: menu da sessão (⋯) → **Configurações da sessão** → **Limite de gastos**. A janela mostra quanto ela já gastou. Digite um limite (a partir de $0,01) e clique em **Definir o limite** ou **Variação**; **Remover o limite** o retira.

Enquanto há um limite definido, uma barra acima da caixa de mensagem mostra "$1.20 of $5.00", com **Variação**. Quando o limite é atingido, o agente para logo após a chamada do modelo que o atingiu, uma nota abaixo do turno diz "Stopped at the spending cap", e as novas mensagens esperam até você aumentar o limite (**Aumentar o limite…**) ou removê-lo. Veja [Sessões](/guide/sessions) para saber mais.

## A aba Arena

A aba **Arena** (`/arena`) mostra quais modelos se saem melhor nas suas próprias tarefas. Na página inicial, **Opções** → **Arena** envia seu prompt também a mais um ou dois modelos; você fica com a melhor resposta. A aba classifica os modelos por uma pontuação (uma pontuação Elo, começando em 1000) com base nas disputas que você decidiu, mostra com que frequência cada um foi escolhido e sua taxa de vitórias, e lista as disputas recentes, decididas ou ainda abertas. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

## Posso zerar os números?

Não há um botão para limpar a Atividade. Excluir uma sessão você mesmo (o menu dela → **Excluir sessão**) também tira os números dela da Atividade; as sessões excluídas por inatividade mantêm os seus. Os limites da aba Limites são os dos seus próprios planos: eles são zerados no calendário do provedor, ou com uma [redefinição de limite](#use-a-limit-reset).

## Pergunte a um agente

- "Quanto do meu plano do Claude ainda resta nesta semana, e quando ele é zerado?"
- "Quanto do meu plano do Grok ainda resta nesta semana?"
- "Ative a retomada de sessões após os limites de uso."
- "Continue minha sessão 'Refatorar autenticação' quando o limite do Codex for zerado."
- "Quanto o trabalho do mês passado teria custado nos preços da API, por modelo?"
- "Como esta semana se compara com a semana passada até agora?"
- "Por que a linha Hoje da minha página inicial mostra $3,10 se estou em um plano?"
- "Conte meus modelos do Ollama como gratuitos nas estimativas de custo."
- "Quanto o Custom fez este mês, e com quais modelos?"
- "Exclua sessões após dois anos de inatividade em vez de um."
- "Mostre meu uso e meus custos do OpenRouter sem eu digitar preços de modelos."
