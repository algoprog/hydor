# Uso, limites e custos

Claude Code, Codex e Grok Build funcionam com planos que têm limites de uso, o Antigravity CLI funciona com o seu plano Google AI (o próprio terminal dele mostra o que resta), e cada chamada de modelo tem um preço. Este tópico mostra onde ver quanto você já usou de cada plano e quando ele é renovado, o que acontece ao atingir um limite (e como fazer as sessões continuarem sozinhas), o que os agentes fizeram ao longo do tempo e como o app estima os custos, incluindo preços que você mesmo define.

![Uso: quanto você já usou de cada plano e quando ele é renovado](images/usage.webp)

## Abrir a página Uso

Abra **Uso** na barra de ícones (no celular, abra primeiro a barra lateral). Uma barra fina sob o ícone de Uso mostra, de relance, quanto resta em todas as suas assinaturas pagas do Claude Code, do Codex e do Grok Build, cada uma contada pelo limite do qual está mais perto; se você só tem assinaturas gratuitas, o app conta essas, e se não tem nenhuma, a barra não aparece. Ela fica vermelha quando não resta nada. Passe o mouse sobre ela para ver o que resta em cada assinatura. O Antigravity CLI não conta nessa barra: o app não lê a cota dele.

A [página Uso](/usage) tem três abas:

- **Limites** (`/usage`): quanto resta de cada plano e quando ele é renovado.
- **Atividade** (`/stats`): linhas alteradas, tokens e sessões ao longo do tempo.
- **Arena** (`/arena`): quais modelos se saem melhor nas suas próprias tarefas.

O app lê o seu uso quando você abre a página e a cada cinco minutos enquanto o app está aberto; na aba Limites, **Atualizar** lê de novo agora. O uso do Grok Build é lido do agente dele com alguns minutos de intervalo, e **Atualizar** também o lê na hora.

## Ler os limites de um plano

A aba **Limites** tem um cartão para o Claude Code, um para o Codex, um para o Grok Build e um para o Antigravity CLI (depois que você os adicionar em [Configurações → Agentes → Mais agentes](/settings?s=agents)), e um para cada conta que você adicionou em [Configurações → Agentes → Contas](/settings?s=accounts). Em telas largas, ficam dois por linha; no celular, um embaixo do outro.

Cada cartão mostra o e-mail e o plano da conta, há quanto tempo os números foram lidos e uma linha por limite (um período de tempo com um teto de uso):

- Claude Code: **Current session (5 h)**, **Weekly · all models** e limites semanais para um só modelo, como **Weekly · Sonnet only**.
- Codex: **5-hour window**, **Semanal** ou janelas de outras durações. Quando o Codex tem vários limites, cada linha começa com o nome do limite.
- Grok Build: **Semanal**, com a data de renovação. O cartão também informa o plano (SuperGrok, SuperGrok Plus ou SuperGrok Heavy). O login próprio do Grok tem seu cartão, e cada conta Grok que você adicionou tem o dela.
- Antigravity CLI: sem linhas. Depois de adicioná-lo, o cartão **Antigravity CLI** mostra o e-mail e o plano e diz "Antigravity CLI shows how much of your plan is left with /usage in its own terminal." O app não lê a cota dele, porque a orientação do Google impede chamadas feitas em segundo plano. Os planos Google AI Pro e Ultra são renovados a cada cinco horas até um limite semanal; Free e Plus têm um limite semanal.

Cada linha mostra a porcentagem usada, uma barra, a porcentagem restante e quando ocorre a renovação ("resets in 2 h 15 min"; passe o mouse para ver o horário exato). Um sinal de aviso aparece a partir de 90%.

Dependendo do plano, o cartão também mostra:

- **Uso extra** (Claude): se o uso pago além dos limites do plano está ativado e quanto do limite mensal já foi gasto.
- **Créditos** (Codex, Grok Build): seu saldo de créditos, ou "Unlimited".
- **Pague conforme o uso** (Grok Build): quando o plano tem essa opção, quanto você gastou nela neste mês em relação ao teto ("$12.00 of $50.00 this month").
- **Renovações de limite**: renovações que você pode usar agora (veja [Usar uma renovação de limite](#use-a-limit-reset)).
- **Esta semana por superfície** (Claude): como o uso desta semana se divide entre os lugares onde você usa o Claude.
- **Tokens por dia** (Codex): um gráfico dos últimos 30 dias, com seu total de todo o período. Um token é um pedaço de palavra; os modelos contam o que leem e escrevem em tokens.

Quando algo está errado, o cartão avisa:

- "Not signed in" com **Entrar em Configurações** (para o Grok Build: "Sign in to see Grok's plan usage.");
- em um plano gerenciado por uma equipe, o cartão do Grok Build diz "Usage limits are managed by your team.", pois ele não tem limites próprios para mostrar;
- "No usage limits reported for this plan";
- um erro com **Verifique o login em Configurações**;
- "Showing the last known numbers: …" quando a última leitura falhou.

## O que acontece ao atingir um limite

Quando o uso de um plano se esgota, a vez do agente é interrompida. No Grok Build, isso significa o limite semanal, o limite de créditos ou o teto de gastos do Pague conforme o uso; um limite de taxa curto (uma rajada de requisições) não conta e passa sozinho. Um aviso diz de quem é o limite atingido, qual é e quando ele é renovado: "You've hit the Claude Code usage limit" (ou Codex, Grok Build ou Antigravity CLI) com uma conta desse agente, "All your Claude Code accounts have hit their usage limit" quando você tem várias e nenhuma tem mais uso disponível, ou a conta pelo nome ("Work has hit its usage limit") quando outra ainda tem. Ele aparece:

- na página inicial, acima da caixa de mensagem, para o agente (e a conta) que você escolheu;
- em uma sessão, acima da caixa de mensagem;
- no cartão desse plano na página Uso.

O aviso oferece o que você pode fazer:

- **Retomar na renovação** (em uma sessão, enquanto **Retomar após limites de uso** está desativado): a sessão continua sozinha um minuto depois da renovação do limite, com a mensagem "Continue where you left off." O aviso então diz "This session continues by itself when it resets", com **Cancelar**.
- **Usar uma renovação**, quando a conta tem uma renovação de limite que você pode usar agora ("2 resets available").

Quando o uso volta, mas uma sessão ainda vai continuar, o aviso diz "Continues by itself in …", com **Cancelar**.

O Antigravity CLI é diferente. Quando a cota dele se esgota ("Individual quota reached… Resets in 2h39m52s"), a vez é interrompida, e o aviso diz que ele atingiu o limite de uso e quando é renovado, com a frase "O Antigravity CLI não continua sozinho (os termos do Google para os planos dele permitem apenas turnos iniciados por você), então envie uma mensagem quando o limite for renovado." Ele não tem o botão **Retomar na renovação**, e **Retomar após limites de uso** não se aplica a ele. O aviso também informa quando os créditos Google AI ficam muito baixos ("AI credits").

## Continuar sessões automaticamente após um limite

Para que toda sessão que atinge um limite continue sozinha, abra [Configurações → App → Geral](/settings?s=general&find=Resume%20after%20usage%20limits) e ative **Retomar após limites de uso** (quando uma vez do agente é interrompida porque o uso de um plano acabou, a sessão continua sozinha um minuto depois da renovação do limite). Ela vem desativada. Funciona mesmo sem nenhum navegador aberto. Nunca se aplica a uma sessão do Antigravity CLI: os termos do Google para os planos dele só permitem vezes iniciadas por você, então envie uma mensagem depois que o limite for renovado. Com a opção ativada, a sessão não mostra aviso quando um limite a interrompe: uma linha acima da caixa de mensagem diz de quem é o limite atingido (como o aviso faz), qual limite e "Continues by itself in …", com **Usar uma renovação** quando a conta tem uma, e **Cancelar**.

Como funciona o tempo, com a opção ativada ou com **Retomar na renovação**:

- A sessão está prevista para um minuto depois da renovação do limite, conforme o último informe do provedor. O app lê o uso de tempos em tempos enquanto uma sessão espera, com mais frequência perto da renovação, e muda o horário se o provedor mudar a renovação.
- Se o limite for liberado antes (você usou uma renovação ou entrou com outra conta), a sessão continua na hora. Se ela foi continuada antes do tempo nos últimos 15 minutos e atingiu o limite de novo, espera pela renovação.
- Só é continuada uma vez que o limite realmente interrompeu, não uma que terminou justo quando o uso do plano chegou a 100%. Uma continuação planejada é descartada quando a sessão segue sem ela: você envia uma mensagem ou clica em **Parar**, ou uma vez passa normalmente. Uma vez que o agente inicia sozinho enquanto espera (quando uma tarefa em segundo plano ou um subagente dele para no mesmo limite) não a descarta. Uma sessão que você parou com **Parar** nunca é continuada sozinha, mesmo que o erro do limite tenha vindo primeiro, até você enviar uma mensagem a ela.
- **Cancelar** no aviso interrompe uma continuação planejada.

Com mais de uma conta para o agente (Claude Code, Codex ou Grok Build), [**Trocar de conta no limite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) continua a sessão com outra conta na hora, em vez de esperar, e só espera quando todas as contas estão no limite (veja [Agentes, contas e modelos](/guide/agents-models#use-all-your-accounts-switch-at-a-limit)). Para o Claude Code, [**Usar crédito de API no limite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) pode continuá-la nesse caso, cobrando de uma chave de API da Anthropic que você salvou, em vez de esperar (veja [Usar crédito de API quando todas as contas estão no limite](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit)).

## Usar uma renovação de limite

Alguns planos dão renovações de limite: créditos de redefinição do Codex e concessões de redefinição do Claude (o Grok Build não tem). Usar uma zera os limites de uso do plano agora, em vez de esperar que sejam renovados.

Cada cartão as lista em **Renovações de limite**, com quantas você tem. Cada renovação mostra o nome (e quantos usos restam nela), "Expires in …" (em cor de aviso quando falta menos de um dia) ou "Does not expire", e observações como "Works once you hit a limit" ou "Not usable yet". Uma renovação que outro limite segura diz qual é e quando ele termina: "Blocked while your weekly limit is used up (usable in …)". Algumas renovações do Claude zeram só parte da sua cota, então não podem ser usadas enquanto o limite semanal está esgotado; passam a ser utilizáveis quando ele é renovado. Quando não há nenhuma: "No limit resets right now", com a data da próxima, se o plano informar. O app verifica as renovações de uma conta Claude a cada dez minutos, mais ou menos, porque a Anthropic recusa verificações mais frequentes, e mostra a última lista lida nesse intervalo, mesmo depois de reiniciar o app. Assim, uma renovação pode levar alguns minutos para aparecer como utilizável. Uma que você usa sai da lista na hora.

1. Clique em **Usar** ao lado de uma renovação, ou em **Usar uma renovação** em um aviso de limite (ele pega a primeira renovação da lista que funciona agora).
2. Leia a confirmação. Ela diz qual renovação será usada, quando ela expira e quantas restarão. Se você não está em um limite, ela avisa ("You are not at a limit right now").
3. Clique em **Usar renovação**.

O app informa como foi, por exemplo "Codex usage limits are reset.", "Claude is not at a usage limit right now, so nothing was reset.", "Resets are cooling down. Try again later." ou "That reset was already used." Quando dá certo, uma sessão que esperava pelo limite continua na hora.

As renovações do Claude exigem o Claude Code conectado com uma assinatura Claude (não com cobrança por API).

## Ver o que os agentes fizeram ao longo do tempo

A aba **Atividade** (`/stats`) conta o que os agentes fizeram, a partir das sessões que o app conhece neste computador.

No topo:

- **Diário**, **Semanal**, **Mensal** ou **Anual**: o período que os números contam, e uma barra por dia, semana, mês ou ano nos gráficos. A página lembra a sua escolha.
- **Todos**, ou um agente: **Claude**, **Codex**, **Custom** e qualquer outro agente que tenha feito algo aqui (Gemini CLI, OpenCode…).
- O chip de um modelo, quando você escolheu um só em **Por modelo** abaixo: a página passa a contar só esse modelo. Clique no chip (no **✕** dele) para ver todos os modelos de novo.
- **Gráficos** ou **Tabela**.

A linha ao lado deles informa o intervalo que os gráficos e a tabela cobrem (os últimos 30 dias, as últimas 26 semanas, os últimos 12 meses ou desde o início do seu histórico, ou todos os anos) e o seu fuso horário. Dias, semanas e meses seguem o seu fuso horário, e a semana começa na segunda-feira.

Abaixo deles fica o período até agora, **Hoje**, **Esta semana**, **Este mês** ou **Este ano**, com as datas. Os blocos mostram os totais dele:

- **Linhas adicionadas** e **Linhas removidas**
- **Tokens de entrada** (o que os modelos leram: novos e em cache) e **Tokens de saída** (o que escreveram)
- **Velocidade de saída**: tokens por segundo, enquanto as respostas eram escritas
- **Custo da API (est.)**: quanto os mesmos tokens custariam pela API
- **Prompts** (com o número de vezes), **Sessões**, **Comandos** (com o número de chamadas de ferramentas) e **Edições de arquivos**

A pequena seta em um bloco compara com o período anterior, até o mesmo ponto: numa quarta-feira às 15:00, esta semana com a semana passada de segunda até quarta às 15:00; hoje com ontem até a mesma hora. A linha ao lado do nome do período diz isso ("compared with last week up to the same day and hour"). Ela é neutra: mais não é melhor nem pior.

**Gráficos** mostra as linhas alteradas (adicionadas para cima, removidas para baixo), os tokens de entrada (novos e em cache), os tokens de saída, a velocidade de saída e pequenos gráficos de prompts, sessões, comandos e edições de arquivos, uma barra por dia, semana, mês ou ano no intervalo; a última barra é o período até agora. **Tabela** lista os mesmos números por período, do mais recente ao mais antigo, com o total de todo o intervalo.

Mais abaixo, nas duas visualizações, o período até agora de novo, como os blocos o contam:

- **Por agente**: cada agente pelo nome (Claude Code, Codex, Custom, Gemini CLI e os outros que fizeram algo), com sessões, prompts, linhas, entrada e saída.
- **Principais projetos**: as pastas com mais linhas alteradas.
- **Por modelo**: sessões, prompts, entrada, entrada em cache, saída e custo da API de cada modelo, tanto os do Custom (OpenRouter, Ollama, vLLM…) quanto os do Claude e do Codex. Clique em um modelo para ver a página inteira só com ele. Um modelo sem preço conhecido mostra **definir um preço**. Passe o mouse sobre um modelo para ver o preço por milhão de tokens e de onde ele vem ("your price" ou "public price table").

No celular, os blocos ficam dois por linha, e algumas colunas da tabela são omitidas.

A página inicial resume o dia em uma linha sob a caixa de mensagem quando os agentes já fizeram algo hoje: "Today · 7 sessions · 12 file edits · $0.84", omitindo a parte que for zero. O valor em dinheiro é o **Custo da API (est.)** do dia: em um plano (Claude Code, Codex) você paga a mensalidade do plano, como diz o texto ao passar o mouse. Passe o mouse sobre a linha para ver as linhas adicionadas e removidas, os tokens de entrada e saída e os prompts; clique nela para abrir Atividade.

## Como os custos são estimados

Os planos do Claude e do ChatGPT têm preço fixo, então o app mostra quanto o mesmo trabalho custaria nos preços da API (preços de pagamento por uso). Isso mostra o quanto você aproveita de um plano e quanto custaria um modelo pela API. A mesma estimativa aparece na linha de cada rodada concluída em uma sessão ("≈ $0.12", com suas partes em **Tempo e custo**) e na linha **Hoje** da página inicial; em um plano, os dois avisam isso quando você aponta o cursor para eles.

- Os preços vêm de uma tabela pública de preços (a do LiteLLM), que o app busca no máximo uma vez por dia e guarda para quando estiver off-line.
- Os preços que você mesmo definir têm prioridade sobre os da tabela.
- Os tokens de cada sessão são calculados pelo preço do modelo dela; uma sessão que trocou de modelo é calculada pelo último que usou.
- A entrada em cache (texto que o modelo já leu antes, servido do cache) é calculada pelo preço em cache, ou pelo preço de entrada quando não há um.
- Modelos sem preço conhecido (apenas o nome de uma família, como "opus", ou um modelo que a tabela não lista) não contam nada nos totais e mostram **definir um preço** em **Por modelo**.

Os modelos do OpenRouter usam preços buscados automaticamente no OpenRouter, incluindo os preços de entrada em cache. Você não precisa inseri-los. Se o OpenRouter não tiver um preço disponível, **Por modelo** mostra um traço em vez de pedir que você defina um.

Os limites de gastos usam os mesmos preços, mas adotam o valor do próprio agente quando ele informa um: o custo do Claude Code, ou o que o OpenRouter diz que cada chamada do Custom custou. Um modelo neste computador não custa nada nesse caso.

## Definir seu próprio preço para um modelo

1. Na aba **Atividade**, clique em **Preços dos modelos** no topo de **Por modelo**, ou em **definir um preço** ao lado de um modelo.
2. A caixa de diálogo **Preços dos modelos** lista os modelos em exibição e os que você já tiver precificado. Cada um tem **Entrada**, **Em cache** e **Saída**, em dólares por milhão de tokens. Os campos vazios usam o preço da tabela pública, mostrado em cinza.
3. Digite seus preços. Entrada e saída são obrigatórias; o preço em cache é opcional (sem ele, custa o preço de entrada).
4. Para precificar um modelo que não está na lista, digite o ID dele em **Outro ID de modelo** e clique em **Adicionar**.
5. Clique em **Salvar preços**.

O ícone de lixeira em uma linha (**Usar o preço da tabela**) apaga o seu preço para aquele modelo. Para contar um modelo deste computador como gratuito, informe 0 para entrada e saída.

## Toda sessão é mantida

O app mantém todas as sessões e seus números, independentemente do que o programa do próprio agente fizer. O Claude Code exclui suas conversas após 30 dias, a menos que seja instruído do contrário, então o app o instrui a mantê-las (em toda conta do Claude Code cujas configurações não definam por quanto tempo), e o app mantém um vínculo próprio com cada arquivo de conversa do Claude Code e do Codex: uma conversa que o programa do agente (ou qualquer pessoa) exclui volta, listada e podendo ser aberta como antes. O vínculo é o mesmo arquivo com um segundo nome, então não ocupa espaço extra em disco.

O que some é o que ninguém usa: sessões inativas por um ano são excluídas, a menos que você mude isso em [Configurações → Geral → Excluir sessões inativas](/settings?s=general&find=Delete%20inactive%20sessions) (veja [Excluir sessões inativas](/guide/app#delete-inactive-sessions)). Os números delas continuam em Atividade.

As conversas que o Claude Code excluiu antes disso, quando o app não as mantinha, não podem voltar; o histórico de Atividade começa onde o app as contou pela primeira vez.

## Limitar o que uma sessão gasta

Um limite de gastos interrompe uma sessão assim que ela gasta um valor definido nos preços da API, qualquer que seja o plano que você paga. Os subagentes que ela inicia também contam.

- Para uma nova sessão: na página inicial, **Opções** → **Limite de gastos**. Escolha $1, $5, $10 ou $25, ou digite um valor e clique em **Definir**. **Sem limite** remove o limite.
- Para uma sessão em andamento: o menu da sessão (⋯) → **Configurações da sessão** → **Limite de gastos**. A caixa de diálogo mostra quanto ela já gastou. Digite um limite (a partir de $0,01) e clique em **Definir o limite** ou **Variação**; **Remover o limite** o retira.

Enquanto um limite está definido, uma barra acima da caixa de mensagem mostra "$1.20 of $5.00", com **Variação**. Quando o limite é atingido, o agente para logo após a chamada ao modelo que o atingiu, uma nota sob a rodada diz "Stopped at the spending cap", e as novas mensagens ficam esperando até você aumentar o limite (**Aumentar o limite…**) ou removê-lo. Veja [Sessões](/guide/sessions) para saber mais.

## A aba Arena

A aba **Arena** (`/arena`) mostra quais modelos se saem melhor nas suas próprias tarefas. Na página inicial, **Opções** → **Arena** envia seu prompt também para mais um ou dois modelos; você fica com a melhor resposta. A aba classifica os modelos por uma pontuação (uma pontuação Elo, começando em 1000) sobre as disputas que você decidiu, com a frequência com que cada um foi escolhido e sua taxa de vitórias, e lista as disputas recentes, decididas ou ainda em aberto. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

## Posso zerar os números?

Não há um botão para limpar a Atividade. Excluir uma sessão você mesmo (o menu dela → **Excluir sessão**) também tira os números dela da Atividade; as sessões excluídas por inatividade mantêm os seus. Os limites da aba Limites são os dos seus próprios planos: eles são zerados no calendário do provedor, ou com uma [redefinição de limite](#use-a-limit-reset).

## Pergunte a um agente

- "Quanto do meu plano do Claude ainda resta esta semana, e quando ele é renovado?"
- "Quanto do meu plano do Grok ainda resta esta semana?"
- "Quanto do meu plano da Antigravity CLI ainda resta, e quando ele é renovado?"
- "Ative a retomada de sessões depois dos limites de uso."
- "Continue minha sessão 'Refatorar autenticação' quando o limite do Codex for renovado."
- "Quanto o trabalho do mês passado teria custado nos preços da API, por modelo?"
- "Como esta semana se compara com a semana passada até agora?"
- "Por que a linha Hoje da minha página inicial mostra $3,10 se estou em um plano?"
- "Conte meus modelos do Ollama como gratuitos nas estimativas de custo."
- "Quanto o Custom fez neste mês, e com quais modelos?"
- "Exclua as sessões após dois anos de inatividade, em vez de um."
- "Mostre meu uso e meus custos do OpenRouter sem eu precisar informar os preços dos modelos."
